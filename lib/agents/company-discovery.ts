import { anthropic, MODEL } from "@/lib/anthropic";
import type { Icp } from "@/lib/db/schema";
import type { DiscoveredCompany } from "@/lib/types";
import type { SseSender } from "@/lib/sse";

const MAX_COMPANIES = 15;
const MAX_WEB_SEARCHES = 8;
const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `You are a B2B sales research analyst. Given an Ideal Customer Profile (ICP), find real companies that match.

Process:
1. Use web_search aggressively to discover companies that fit the ICP. Try multiple search angles (recent fundraises, "best X companies", industry directories, LinkedIn, Crunchbase, etc).
2. Filter to companies that genuinely match the criteria — be honest, not exhaustive.
3. When you have a strong shortlist, call the submit_companies tool with the final list. Aim for 8–15 companies.

Quality rules:
- Only include real, currently-operating companies. No fictional or defunct ones.
- Prefer mid-market / SMB unless the ICP says otherwise.
- Include the company's primary domain (e.g. "stripe.com"), not a marketing landing page.
- The matchReason field must cite a concrete fact about the company that ties to the ICP, not generic praise.
- Do NOT pad the list. Quality over quantity.

You MUST end by calling submit_companies.`;

const submitCompaniesTool = {
  name: "submit_companies",
  description: "Submit the final, filtered list of companies matching the ICP.",
  input_schema: {
    type: "object" as const,
    properties: {
      companies: {
        type: "array",
        description: "The shortlist of companies, 8–15 items.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Company name." },
            domain: {
              type: ["string", "null"],
              description: "Primary domain like 'stripe.com'.",
            },
            linkedinUrl: {
              type: ["string", "null"],
              description: "LinkedIn company page URL if known.",
            },
            industry: { type: ["string", "null"] },
            employeeRange: {
              type: ["string", "null"],
              description: "e.g. '11-50', '51-200'.",
            },
            geo: {
              type: ["string", "null"],
              description: "Primary HQ location.",
            },
            description: {
              type: ["string", "null"],
              description: "One-sentence summary of what the company does.",
            },
            sourceUrl: {
              type: ["string", "null"],
              description: "Where you found this — Crunchbase, LinkedIn, news article, etc.",
            },
            matchReason: {
              type: "string",
              description:
                "One-sentence reason citing a specific fact tying this company to the ICP.",
            },
          },
          required: ["name", "matchReason"],
        },
      },
    },
    required: ["companies"],
  },
};

function buildPrompt(icp: Icp): string {
  const parts: string[] = [`Find companies matching this ICP:`];
  parts.push(`Name: ${icp.name}`);
  if (icp.industries.length) parts.push(`Industries: ${icp.industries.join(", ")}`);
  if (icp.minEmployees != null || icp.maxEmployees != null) {
    parts.push(
      `Employee count: ${icp.minEmployees ?? "?"}–${icp.maxEmployees ?? "?"}`,
    );
  }
  if (icp.geos.length) parts.push(`Geographies: ${icp.geos.join(", ")}`);
  if (icp.techKeywords.length)
    parts.push(`Tech / keywords: ${icp.techKeywords.join(", ")}`);
  if (icp.buyerPersona) parts.push(`Buyer persona: ${icp.buyerPersona}`);
  if (icp.extraContext) parts.push(`Extra context: ${icp.extraContext}`);
  parts.push(
    `\nReturn up to ${MAX_COMPANIES} real companies via the submit_companies tool.`,
  );
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

async function runDiscoveryAttempt(
  icp: Icp,
  send: SseSender,
): Promise<DiscoveredCompany[]> {
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
      submitCompaniesTool as never,
    ],
    messages: [{ role: "user", content: buildPrompt(icp) }],
  });

  let webSearchCount = 0;
  let pendingQuery = "";

  for await (const event of stream) {
    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block.type === "server_tool_use" && block.name === "web_search") {
        webSearchCount++;
        pendingQuery = "";
        send("progress", { message: `Web search ${webSearchCount}…` });
      } else if (block.type === "tool_use" && block.name === "submit_companies") {
        send("progress", { message: "Compiling shortlist…" });
      }
    } else if (event.type === "content_block_delta") {
      const delta = event.delta;
      if (delta.type === "input_json_delta") {
        pendingQuery += delta.partial_json;
        // try to extract a "query" from partial JSON for nicer progress text
        const match = pendingQuery.match(/"query"\s*:\s*"([^"]{1,80})/);
        if (match) {
          send("search", { query: match[1] });
        }
      }
    }
  }

  const final = await stream.finalMessage();
  const submitBlock = final.content.find(
    (b) => b.type === "tool_use" && b.name === "submit_companies",
  );

  if (!submitBlock || submitBlock.type !== "tool_use") {
    throw new Error(
      "Claude finished without calling submit_companies. Try again or adjust the ICP.",
    );
  }

  const input = submitBlock.input as { companies?: unknown };
  if (!input || !Array.isArray(input.companies)) {
    throw new Error("submit_companies returned an invalid payload.");
  }

  return (input.companies as DiscoveredCompany[])
    .filter((c) => c && typeof c.name === "string" && c.name.trim().length > 0)
    .slice(0, MAX_COMPANIES);
}

export async function discoverCompanies(
  icp: Icp,
  send: SseSender,
): Promise<DiscoveredCompany[]> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    send("progress", {
      message:
        attempt === 1
          ? "Asking Claude to research companies…"
          : `Retrying Claude research (${attempt}/${MAX_ATTEMPTS})…`,
    });

    try {
      return await runDiscoveryAttempt(icp, send);
    } catch (err) {
      if (!isOverloadedError(err) || attempt === MAX_ATTEMPTS) {
        throw err;
      }
      await wait(1500 * attempt);
    }
  }

  return [];
}
