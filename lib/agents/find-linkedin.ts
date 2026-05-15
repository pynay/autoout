import { anthropic, MODEL } from "@/lib/anthropic";

const submitTool = {
  name: "submit_linkedin_url",
  description: "Submit the LinkedIn company page URL.",
  input_schema: {
    type: "object" as const,
    properties: {
      linkedinUrl: {
        type: ["string", "null"],
        description: "The LinkedIn company page URL, or null if you can't find it.",
      },
    },
    required: ["linkedinUrl"],
  },
};

export async function findCompanyLinkedinUrl(
  companyName: string,
  domain: string | null,
): Promise<string | null> {
  const prompt = `Find the official LinkedIn company page for "${companyName}"${
    domain ? ` (website: ${domain})` : ""
  }. Use web_search. Return the canonical LinkedIn URL like "https://www.linkedin.com/company/...".`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      "You find the official LinkedIn company page URL. Use web_search if needed. Always end by calling submit_linkedin_url.",
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 2,
      } as never,
      submitTool as never,
    ],
    messages: [{ role: "user", content: prompt }],
  });

  const submitBlock = response.content.find(
    (b) => b.type === "tool_use" && b.name === "submit_linkedin_url",
  );
  if (!submitBlock || submitBlock.type !== "tool_use") return null;
  const input = submitBlock.input as { linkedinUrl?: string | null };
  return input.linkedinUrl ?? null;
}
