import { anthropic, MODEL } from "@/lib/anthropic";
import type { Icp } from "@/lib/db/schema";
import type { DiscoveredPerson } from "@/lib/hunter";
import type { SseSender } from "@/lib/sse";

const MAX_PEOPLE = 25;
const MAX_WEB_SEARCHES = 8;
const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `You are a B2B sales research analyst. Given a company and buyer persona, find real people who likely match the buyer persona.

Process:
1. Use web_search aggressively to discover named employees at the company. Try LinkedIn, company leadership pages, news, podcasts, conference talks, and role-specific searches.
2. Prefer people whose current company appears to match the target company.
3. Capture the person's LinkedIn profile URL when available, but do not invent it.
4. When you have a strong shortlist, call the submit_people tool with the final list. Aim for 10–25 people.

Quality rules:
- Only include real named people. No generic roles like "VP Sales" without a name.
- Prefer titles relevant to the buyer persona and target titles.
- The title should be the current title if known.
- Do NOT pad the list. Quality over quantity.

You MUST end by calling submit_people.`;

const submitPeopleTool = {
  name: "submit_people",
  description: "Submit discovered people who may match the buyer persona.",
  input_schema: {
    type: "object" as const,
    properties: {
      people: {
        type: "array",
        description: "The shortlist of discovered people.",
        items: {
          type: "object",
          properties: {
            fullName: { type: "string", description: "Person's full name." },
            title: { type: ["string", "null"], description: "Current title if known." },
            linkedinUrl: {
              type: ["string", "null"],
              description: "Person's LinkedIn profile URL if found.",
            },
            location: { type: ["string", "null"], description: "Location if known." },
          },
          required: ["fullName"],
        },
      },
    },
    required: ["people"],
  },
};

function buildPrompt(icp: Icp, company: { name: string; domain: string | null }): string {
  const parts: string[] = [`Find people at this company: ${company.name}`];
  if (company.domain) parts.push(`Company domain: ${company.domain}`);
  if (icp.buyerPersona) parts.push(`Buyer persona: ${icp.buyerPersona}`);
  if (icp.targetTitles.length) parts.push(`Target titles: ${icp.targetTitles.join(", ")}`);
  if (icp.extraContext) parts.push(`Extra context: ${icp.extraContext}`);
  parts.push(`\nReturn up to ${MAX_PEOPLE} real people via the submit_people tool.`);
  return parts.join("\n");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOverloadedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const error = err as {
    type?: unknown;
    message?: unknown;
    error?: { type?: unknown; message?: unknown };
  };
  return (
    error.type === "overloaded_error" ||
    error.error?.type === "overloaded_error" ||
    error.message === "Overloaded" ||
    error.error?.message === "Overloaded"
  );
}

function normalizePerson(input: unknown): DiscoveredPerson | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const fullName = typeof raw.fullName === "string" ? raw.fullName.trim() : "";
  if (!fullName) return null;
  return {
    fullName,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null,
    linkedinUrl:
      typeof raw.linkedinUrl === "string" && raw.linkedinUrl.trim() ? raw.linkedinUrl.trim() : null,
    location: typeof raw.location === "string" && raw.location.trim() ? raw.location.trim() : null,
  };
}

async function runDiscoveryAttempt(
  icp: Icp,
  company: { name: string; domain: string | null },
  send: SseSender,
): Promise<DiscoveredPerson[]> {
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: MAX_WEB_SEARCHES,
      } as never,
      submitPeopleTool as never,
    ],
    messages: [{ role: "user", content: buildPrompt(icp, company) }],
  });

  let webSearchCount = 0;
  let pendingQuery = "";

  for await (const event of stream) {
    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block.type === "server_tool_use" && block.name === "web_search") {
        pendingQuery = "";
      }
    }

    if (event.type === "content_block_delta") {
      const delta = event.delta;
      if (delta.type === "input_json_delta") {
        pendingQuery += delta.partial_json;
      }
    }

    if (event.type === "content_block_stop" && pendingQuery) {
      webSearchCount += 1;
      const match = pendingQuery.match(/"query"\s*:\s*"([^"]+)/);
      send("progress", {
        message: `Searching people (${webSearchCount}/${MAX_WEB_SEARCHES})${match ? `: ${match[1]}` : "…"}`,
      });
      pendingQuery = "";
    }
  }

  const final = await stream.finalMessage();
  const submitBlock = final.content.find((b) => b.type === "tool_use" && b.name === "submit_people");
  if (!submitBlock || submitBlock.type !== "tool_use") {
    throw new Error("Claude did not submit people.");
  }

  const input = submitBlock.input as { people?: unknown };
  if (!input || !Array.isArray(input.people)) {
    throw new Error("People discovery returned invalid payload.");
  }

  const seen = new Set<string>();
  return input.people
    .map(normalizePerson)
    .filter((person): person is DiscoveredPerson => Boolean(person))
    .filter((person) => {
      const key = `${person.fullName.toLowerCase()}|${person.linkedinUrl ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PEOPLE);
}

export async function discoverPeopleAtCompany(
  icp: Icp,
  company: { name: string; domain: string | null },
  send: SseSender,
): Promise<DiscoveredPerson[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await runDiscoveryAttempt(icp, company, send);
    } catch (err) {
      lastErr = err;
      if (!isOverloadedError(err) || attempt === MAX_ATTEMPTS) break;
      const delay = 1000 * attempt;
      send("progress", { message: `Claude overloaded; retrying people discovery in ${delay / 1000}s…` });
      await wait(delay);
    }
  }
  throw lastErr;
}
