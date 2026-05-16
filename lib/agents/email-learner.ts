import { anthropic, MODEL } from "@/lib/anthropic";
import { eq, or, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { styleLessons } from "@/lib/db/schema";

export type EditLesson = {
  lessons: string[];
};

const SYSTEM_PROMPT = `You analyze how a user edited an AI-generated cold email draft before sending it.
Your job is to extract reusable style preferences and writing lessons from the diff.

Focus on PATTERNS, not one-off fixes:
- Tone shifts (e.g. "user prefers casual over formal", "user removes exclamation marks")
- Structural preferences (e.g. "user prefers shorter paragraphs", "user moves CTA to first line")
- Word choice patterns (e.g. "user avoids buzzwords like 'leverage'", "user prefers 'chat' over 'schedule a call'")
- Content preferences (e.g. "user removes company flattery", "user adds more specific pain points")

Do NOT extract:
- Recipient-specific facts (names, companies, titles)
- One-time corrections that won't generalize

Each lesson should be a concise, actionable instruction (one sentence) that can be injected into a future email generation prompt.

If the edits are trivial (just fixing typos or minor rewording with no pattern), return an empty lessons array.

You MUST call submit_lessons with your findings.`;

const submitTool = {
  name: "submit_lessons",
  description: "Submit the extracted style lessons.",
  input_schema: {
    type: "object" as const,
    properties: {
      lessons: {
        type: "array",
        items: { type: "string" },
        description:
          "List of reusable style lessons extracted from the user's edits. Empty array if edits are trivial.",
      },
    },
    required: ["lessons"],
  },
};

const DEDUP_SYSTEM = `You are given a NEW style lesson and a list of EXISTING lessons.
Determine if the new lesson is a duplicate or near-duplicate of any existing lesson.

A lesson is a duplicate if:
- It says the same thing in different words
- It's a more specific version of an existing general rule (keep the more specific one)
- It's a more general version of an existing specific rule (keep the more specific one)

You MUST call submit_decision with your findings.`;

const dedupTool = {
  name: "submit_decision",
  description: "Submit deduplication decision.",
  input_schema: {
    type: "object" as const,
    properties: {
      isDuplicate: {
        type: "boolean",
        description: "True if the new lesson is a duplicate of an existing one.",
      },
      duplicateOfId: {
        type: "string",
        description: "ID of the existing lesson this duplicates, if isDuplicate is true.",
      },
      mergedLesson: {
        type: "string",
        description:
          "If duplicate, a merged version that combines the best of both. If not duplicate, empty string.",
      },
    },
    required: ["isDuplicate"],
  },
};

type DedupResult = {
  isDuplicate: boolean;
  duplicateOfId?: string;
  mergedLesson?: string;
};

async function checkDuplicate(
  newLesson: string,
  existing: { id: string; lesson: string }[],
): Promise<DedupResult> {
  if (existing.length === 0) return { isDuplicate: false };

  const existingList = existing
    .map((e, i) => `${i + 1}. [ID: ${e.id}] ${e.lesson}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: DEDUP_SYSTEM,
    tools: [dedupTool as never],
    tool_choice: { type: "tool", name: "submit_decision" } as never,
    messages: [
      {
        role: "user",
        content: `NEW LESSON:\n${newLesson}\n\nEXISTING LESSONS:\n${existingList}\n\nIs the new lesson a duplicate?`,
      },
    ],
  });

  const block = response.content.find(
    (b) => b.type === "tool_use" && b.name === "submit_decision",
  );
  if (!block || block.type !== "tool_use") return { isDuplicate: false };
  const input = block.input as DedupResult;
  return {
    isDuplicate: !!input.isDuplicate,
    duplicateOfId: typeof input.duplicateOfId === "string" ? input.duplicateOfId : undefined,
    mergedLesson: typeof input.mergedLesson === "string" ? input.mergedLesson : undefined,
  };
}

export async function extractLessons(
  originalSubject: string,
  originalBody: string,
  editedSubject: string,
  editedBody: string,
): Promise<string[]> {
  const userMessage = `Here is the AI-generated draft and the user's edited version that they actually sent.

ORIGINAL DRAFT:
Subject: ${originalSubject}

${originalBody}

USER'S EDITED VERSION:
Subject: ${editedSubject}

${editedBody}

Extract reusable style lessons from the differences. Submit your findings.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [submitTool as never],
    tool_choice: { type: "tool", name: "submit_lessons" } as never,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content.find(
    (b) => b.type === "tool_use" && b.name === "submit_lessons",
  );
  if (!block || block.type !== "tool_use") {
    return [];
  }
  const input = block.input as { lessons?: unknown };
  if (!Array.isArray(input.lessons)) return [];
  return input.lessons.filter((l): l is string => typeof l === "string");
}

/**
 * Extract lessons and deduplicate against existing ones before inserting.
 * Returns the IDs of all newly inserted or updated lessons.
 */
export async function extractAndStoreLessons(
  icpId: string | null,
  emailId: string | null,
  originalSubject: string,
  originalBody: string,
  editedSubject: string,
  editedBody: string,
): Promise<string[]> {
  const lessons = await extractLessons(originalSubject, originalBody, editedSubject, editedBody);
  if (lessons.length === 0) return [];

  // Fetch existing lessons for this ICP + global for dedup comparison
  const existing = await db
    .select({ id: styleLessons.id, lesson: styleLessons.lesson })
    .from(styleLessons)
    .where(
      icpId
        ? or(eq(styleLessons.icpId, icpId), isNull(styleLessons.icpId))
        : isNull(styleLessons.icpId),
    );

  const insertedIds: string[] = [];

  for (const lesson of lessons) {
    const result = await checkDuplicate(lesson, existing);

    if (result.isDuplicate && result.duplicateOfId) {
      // Update the existing lesson with the merged version and bump its count
      const merged = result.mergedLesson?.trim() || lesson;
      await db
        .update(styleLessons)
        .set({
          lesson: merged,
          usageCount: 1, // reset — it's being "re-learned"
          lastUsedAt: new Date(),
        })
        .where(eq(styleLessons.id, result.duplicateOfId));
      insertedIds.push(result.duplicateOfId);
      // Update our local list so subsequent lessons can dedup against the merged version
      const idx = existing.findIndex((e) => e.id === result.duplicateOfId);
      if (idx !== -1) existing[idx].lesson = merged;
    } else {
      // Insert new lesson
      const [row] = await db
        .insert(styleLessons)
        .values({
          icpId,
          emailId,
          lesson,
        })
        .returning({ id: styleLessons.id });
      insertedIds.push(row.id);
      existing.push({ id: row.id, lesson });
    }
  }

  return insertedIds;
}
