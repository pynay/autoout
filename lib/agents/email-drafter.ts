import { anthropic, MODEL } from "@/lib/anthropic";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { styleLessons } from "@/lib/db/schema";
import type { Icp, Company, Person } from "@/lib/db/schema";
import type { EmailDraft, EmailJudgment } from "@/lib/types";

const SYSTEM_PROMPT = `You write cold outbound emails that don't read like cold outbound emails.

Rules:
- Subject ≤ 60 characters. No clickbait, no all-caps, no emoji.
- Body 80–120 words. Plain text, no signoff line (the sender will add it themselves).
- Open with one sentence tying a specific fact about THIS company to the persona's likely problem. No "I hope this finds you well", no "I came across your company".
- One paragraph (2-4 sentences) explaining why this is relevant to the recipient's role. No buzzwords. No "we help companies like yours".
- One clear, low-friction CTA — a 15-minute call, a question they can reply to, or a relevant link. Pick one.
- Reference the buyer persona's pain, not features. Concrete > abstract.
- You MUST call submit_draft with the final draft.`;

const submitTool = {
  name: "submit_draft",
  description: "Submit the final email draft.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: {
        type: "string",
        description: "Email subject line, max 60 chars.",
        maxLength: 80,
      },
      body: {
        type: "string",
        description: "Email body, 80-120 words, plain text.",
      },
    },
    required: ["subject", "body"],
  },
};

/** Build the context block shared by initial drafts and revisions. */
function recipientContext(icp: Icp, company: Company, person: Person): string {
  return `RECIPIENT
- Name: ${person.fullName}
- Title: ${person.title ?? "(unknown)"}
- Company: ${company.name}${company.domain ? ` (${company.domain})` : ""}
- Industry: ${company.industry ?? "(unknown)"}
- Company description: ${company.description ?? "(none)"}
- Why this company fits the ICP: ${company.matchReason ?? "(none)"}
- Why this person specifically: ${person.scoreReason ?? "(none)"}

ICP / BUYER PERSONA
${icp.buyerPersona || "(none specified)"}

EXTRA CONTEXT ABOUT THE SENDER / OFFER
${icp.extraContext || "(none specified)"}`;
}

/** Format a judgment into human-readable feedback for the revision prompt. */
function formatJudgmentFeedback(j: EmailJudgment): string {
  const lines = [
    `Overall: ${j.overall.score}/10 — ${j.overall.feedback}`,
    `Personalization: ${j.personalization.score}/10 — ${j.personalization.feedback}`,
    `Clarity: ${j.clarity.score}/10 — ${j.clarity.feedback}`,
    `CTA: ${j.cta.score}/10 — ${j.cta.feedback}`,
    `Tone: ${j.tone.score}/10 — ${j.tone.feedback}`,
    `Word count: ${j.wordCount} words`,
  ];
  return lines.join("\n");
}

/** Fetch the most recent style lessons for an ICP (max 20 to keep prompt concise). */
async function fetchLessons(icpId: string): Promise<string[]> {
  const rows = await db
    .select({ lesson: styleLessons.lesson })
    .from(styleLessons)
    .where(eq(styleLessons.icpId, icpId))
    .orderBy(desc(styleLessons.createdAt))
    .limit(20);
  return rows.map((r) => r.lesson);
}

function buildSystemPrompt(lessons: string[]): string {
  if (lessons.length === 0) return SYSTEM_PROMPT;
  const lessonsBlock = lessons.map((l, i) => `${i + 1}. ${l}`).join("\n");
  return `${SYSTEM_PROMPT}

STYLE PREFERENCES (learned from the user's previous edits — follow these closely):
${lessonsBlock}`;
}

async function callDrafter(messages: { role: "user" | "assistant"; content: string }[], lessons: string[] = []): Promise<EmailDraft> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(lessons),
    tools: [submitTool as never],
    tool_choice: { type: "tool", name: "submit_draft" } as never,
    messages,
  });

  const submitBlock = response.content.find(
    (b) => b.type === "tool_use" && b.name === "submit_draft",
  );
  if (!submitBlock || submitBlock.type !== "tool_use") {
    throw new Error("Claude did not submit a draft.");
  }
  const input = submitBlock.input as { subject?: unknown; body?: unknown };
  if (typeof input.subject !== "string" || typeof input.body !== "string") {
    throw new Error("Draft payload was malformed.");
  }
  return { subject: input.subject.trim(), body: input.body.trim() };
}

/** Create the first draft (no prior feedback). */
export async function draftEmail(
  icp: Icp,
  company: Company,
  person: Person,
): Promise<EmailDraft> {
  const lessons = await fetchLessons(icp.id);
  const userMessage = `Write a cold email.\n\n${recipientContext(icp, company, person)}\n\nSubmit the draft.`;
  return callDrafter([{ role: "user", content: userMessage }], lessons);
}

/** Revise an existing draft using judge feedback. */
export async function reviseDraft(
  icp: Icp,
  company: Company,
  person: Person,
  previousDraft: EmailDraft,
  judgment: EmailJudgment,
): Promise<EmailDraft> {
  const ctx = recipientContext(icp, company, person);

  const lessons = await fetchLessons(icp.id);

  // Build a multi-turn conversation so the model has full context
  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: `Write a cold email.\n\n${ctx}\n\nSubmit the draft.` },
    {
      role: "assistant",
      content: `Here was my previous draft:\n\nSubject: ${previousDraft.subject}\n\n${previousDraft.body}`,
    },
    {
      role: "user",
      content: `A quality judge scored your draft and found issues. Fix every piece of feedback below and submit an improved draft.\n\nJUDGE FEEDBACK:\n${formatJudgmentFeedback(judgment)}\n\nRevise the email to address ALL feedback. Submit the improved draft.`,
    },
  ];

  return callDrafter(messages, lessons);
}
