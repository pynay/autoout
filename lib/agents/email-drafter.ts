import { anthropic, MODEL } from "@/lib/anthropic";
import type { Icp, Company, Person } from "@/lib/db/schema";
import type { EmailDraft } from "@/lib/types";

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

export async function draftEmail(
  icp: Icp,
  company: Company,
  person: Person,
): Promise<EmailDraft> {
  const userMessage = `Write a cold email.

RECIPIENT
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
${icp.extraContext || "(none specified)"}

Submit the draft.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [submitTool as never],
    tool_choice: { type: "tool", name: "submit_draft" } as never,
    messages: [{ role: "user", content: userMessage }],
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
