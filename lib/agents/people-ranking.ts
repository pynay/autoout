import { anthropic, MODEL } from "@/lib/anthropic";
import type { Icp } from "@/lib/db/schema";
import type { LinkedinEmployee } from "@/lib/apollo";
import type { RankedPerson } from "@/lib/types";

const MAX_RANKED = 5;

export function filterByTitles(
  employees: LinkedinEmployee[],
  targetTitles: string[],
): LinkedinEmployee[] {
  if (targetTitles.length === 0) return employees;
  const needles = targetTitles.map((t) => t.toLowerCase().trim()).filter(Boolean);
  return employees.filter((e) => {
    if (!e.title) return false;
    const t = e.title.toLowerCase();
    return needles.some((n) => t.includes(n));
  });
}

const SYSTEM_PROMPT = `You are a B2B sales analyst. Given a list of employees at a company and a buyer persona, rank the top candidates to reach out to.

Rules:
- Higher score (0-100) = better fit. Use the full range.
- The scoreReason should cite specific evidence from the title (or persona) — not generic praise.
- Prefer decision-makers and budget holders over individual contributors, unless the persona explicitly targets ICs.
- Return up to ${MAX_RANKED} people, fewer if the candidate pool is weak.
- You MUST call the submit_ranked_people tool with the final ranking.`;

const submitTool = {
  name: "submit_ranked_people",
  description: "Submit the ranked list of best people to reach out to.",
  input_schema: {
    type: "object" as const,
    properties: {
      people: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            title: { type: ["string", "null"] },
            linkedinUrl: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            score: {
              type: "integer",
              minimum: 0,
              maximum: 100,
              description: "Fit score from 0-100.",
            },
            scoreReason: { type: "string" },
          },
          required: ["fullName", "score", "scoreReason"],
        },
      },
    },
    required: ["people"],
  },
};

export async function rankPeople(
  icp: Icp,
  companyName: string,
  candidates: LinkedinEmployee[],
): Promise<RankedPerson[]> {
  if (candidates.length === 0) return [];

  const userMessage = `Company: ${companyName}

Buyer persona (from ICP "${icp.name}"):
${icp.buyerPersona || "(no specific persona — pick the most senior person likely to own the budget for this kind of purchase)"}

Target titles: ${icp.targetTitles.length ? icp.targetTitles.join(", ") : "(none specified)"}

Candidates (already pre-filtered):
${candidates
  .map((c, i) => `${i + 1}. ${c.fullName} — ${c.title ?? "(no title)"}${c.location ? ` — ${c.location}` : ""}`)
  .join("\n")}

Rank the top ${MAX_RANKED} via submit_ranked_people.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [submitTool as never],
    tool_choice: { type: "tool", name: "submit_ranked_people" } as never,
    messages: [{ role: "user", content: userMessage }],
  });

  const submitBlock = response.content.find(
    (b) => b.type === "tool_use" && b.name === "submit_ranked_people",
  );
  if (!submitBlock || submitBlock.type !== "tool_use") {
    throw new Error("Claude did not submit a ranking.");
  }
  const input = submitBlock.input as { people?: unknown };
  if (!input || !Array.isArray(input.people)) {
    throw new Error("Ranking returned invalid payload.");
  }
  return (input.people as RankedPerson[])
    .filter((p) => p && typeof p.fullName === "string" && p.fullName.trim())
    .slice(0, MAX_RANKED);
}
