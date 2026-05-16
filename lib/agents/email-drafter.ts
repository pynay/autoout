import { anthropic, MODEL } from "@/lib/anthropic";
import { eq, desc, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { styleLessons } from "@/lib/db/schema";
import type { Icp, Company, Person } from "@/lib/db/schema";
import type { EmailDraft, EmailJudgment } from "@/lib/types";

const SYSTEM_PROMPT = `You write cold emails that get replies because they sound like a real person wrote them — not a sales tool.

PHILOSOPHY:
- Every sentence must pass the "would I delete this?" test. If it's filler, cut it.
- The reader should think "this person actually looked at what we do" within the first line.
- You're starting a conversation, not closing a deal. The email's only job is to get a reply.

OPENER (1 sentence):
- Lead with a specific observation about THEIR company — something you'd only know if you actually looked. A recent hire, a product launch, a tech choice, a public metric, a market move.
- Connect it to a problem THEY likely have because of it. Not your solution — their problem.
- Never: "I hope this finds you well", "I came across your company", "I noticed that you", "I'm reaching out because", "My name is".

BODY (2-3 sentences):
- Bridge from their problem to ONE concrete thing that's relevant. Be specific — a number, a timeframe, a comparison.
- Write like you're texting a professional contact, not drafting a press release. Short sentences. No jargon. No "leverage", "synergy", "streamline", "empower", "cutting-edge", "innovative".
- If you can swap in any other company's name and the email still works, it's too generic. Start over.

CTA (1 sentence):
- Ask ONE low-effort question they can reply to in under 30 seconds. A yes/no, a "does this resonate?", a "worth a 10-min chat?"
- Never stack multiple asks. Never link-dump.

FORMAT:
- Subject ≤ 60 characters. Lowercase is fine. Should read like a subject line from a colleague, not a newsletter.
- Body: 60-100 words. Shorter is almost always better.
- Plain text only. No signoff (the sender adds their own).
- No exclamation marks. No emoji. No bold claims you can't back up.

You MUST call submit_draft with the final draft.`;

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
        description: "Email body, 60-100 words, plain text.",
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

/** Fetch lessons for an ICP (ICP-specific + global), ranked by usage recency and frequency. Max 20. */
async function fetchLessons(icpId: string): Promise<string[]> {
  const rows = await db
    .select({ id: styleLessons.id, lesson: styleLessons.lesson })
    .from(styleLessons)
    .where(or(eq(styleLessons.icpId, icpId), isNull(styleLessons.icpId)))
    .orderBy(
      desc(styleLessons.lastUsedAt),
      desc(styleLessons.usageCount),
    )
    .limit(20);

  // Bump lastUsedAt for the lessons we're about to use
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    await db
      .update(styleLessons)
      .set({ lastUsedAt: new Date(), usageCount: sql`${styleLessons.usageCount} + 1` })
      .where(sql`${styleLessons.id} = ANY(${ids})`);
  }

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
