import { anthropic, MODEL } from "@/lib/anthropic";

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
