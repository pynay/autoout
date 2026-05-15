import { anthropic, MODEL } from "@/lib/anthropic";
import type { Company, Person } from "@/lib/db/schema";
import type { EmailJudgment } from "@/lib/types";

const SYSTEM_PROMPT = `You are a cold-email quality judge. You evaluate drafts on five dimensions and return structured scores.

Score each dimension 0–10:

1. **Personalization** — Does the email cite a specific, verifiable fact about the recipient or their company? Generic praise ("your innovative company") scores ≤ 3. A concrete detail tied to their role or situation scores 7+.

2. **Clarity** — Is the value proposition obvious within the first two sentences of the body? Could the reader explain what this is about after a 5-second skim?

3. **CTA quality** — Is there exactly one call-to-action? Is it low-friction (a question, a short call, a link)? Multiple CTAs or vague asks ("let me know your thoughts") score low.

4. **Tone** — Does it read like a real human wrote it? Deductions for: corporate buzzwords, sycophancy, exclamation marks, "I hope this finds you well", anything that pattern-matches to spam.

5. **Word count** — Count the body words. 80–120 is a 10. Each 10 words outside that range loses 2 points. Below 50 or above 160 is a 0.

For each dimension, provide a score and one sentence of specific feedback explaining the score.

Also provide an overall score (weighted average: personalization 30%, clarity 20%, CTA 20%, tone 20%, word count 10%) and one sentence of overall feedback.

You MUST call submit_judgment with the result.`;

const judgmentTool = {
  name: "submit_judgment",
  description: "Submit the email quality judgment.",
  input_schema: {
    type: "object" as const,
    properties: {
      personalization: {
        type: "object" as const,
        properties: {
          score: { type: "number" as const },
          feedback: { type: "string" as const },
        },
        required: ["score", "feedback"],
      },
      clarity: {
        type: "object" as const,
        properties: {
          score: { type: "number" as const },
          feedback: { type: "string" as const },
        },
        required: ["score", "feedback"],
      },
      cta: {
        type: "object" as const,
        properties: {
          score: { type: "number" as const },
          feedback: { type: "string" as const },
        },
        required: ["score", "feedback"],
      },
      tone: {
        type: "object" as const,
        properties: {
          score: { type: "number" as const },
          feedback: { type: "string" as const },
        },
        required: ["score", "feedback"],
      },
      wordCount: { type: "number" as const },
      overall: {
        type: "object" as const,
        properties: {
          score: { type: "number" as const },
          feedback: { type: "string" as const },
        },
        required: ["score", "feedback"],
      },
    },
    required: ["personalization", "clarity", "cta", "tone", "wordCount", "overall"],
  },
};

export async function judgeEmail(
  subject: string,
  body: string,
  person: Person,
  company: Company,
): Promise<EmailJudgment> {
  const userMessage = `Judge this cold email draft.

RECIPIENT CONTEXT (use this to evaluate personalization accuracy):
- Name: ${person.fullName}
- Title: ${person.title ?? "(unknown)"}
- Company: ${company.name}
- Industry: ${company.industry ?? "(unknown)"}
- Company description: ${company.description ?? "(none)"}

EMAIL DRAFT:
Subject: ${subject}

${body}

Submit your judgment.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [judgmentTool as never],
    tool_choice: { type: "tool", name: "submit_judgment" } as never,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content.find(
    (b) => b.type === "tool_use" && b.name === "submit_judgment",
  );
  if (!block || block.type !== "tool_use") {
    throw new Error("Claude did not submit a judgment.");
  }

  const input = block.input as Record<string, unknown>;
  return {
    personalization: input.personalization as EmailJudgment["personalization"],
    clarity: input.clarity as EmailJudgment["clarity"],
    cta: input.cta as EmailJudgment["cta"],
    tone: input.tone as EmailJudgment["tone"],
    wordCount: input.wordCount as number,
    overall: input.overall as EmailJudgment["overall"],
  };
}
