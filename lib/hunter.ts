if (!process.env.HUNTER_API_KEY) {
  console.warn("[hunter] HUNTER_API_KEY is not set - Hunter calls will fail.");
}

const HUNTER_EMAIL_FINDER_URL = "https://api.hunter.io/v2/email-finder";

export type LinkedinEmployee = {
  fullName: string;
  title: string | null;
  linkedinUrl: string | null;
  location: string | null;
};

export type DiscoveredPerson = LinkedinEmployee;

export type EnrichedPerson = LinkedinEmployee & {
  emailAddress: string | null;
  emailConfidence: number | null;
};

type HunterEmailFinderResponse = {
  data?: {
    email?: unknown;
    score?: unknown;
  } | null;
};

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const trimmed = domain.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.replace(/^www\./i, "");
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] || null;
  }
}

function withHunterEmail(
  person: DiscoveredPerson,
  hunterData: HunterEmailFinderResponse["data"],
): EnrichedPerson {
  return {
    ...person,
    emailAddress: asString(hunterData?.email),
    emailConfidence: asNumber(hunterData?.score),
  };
}

async function enrichOnePerson(
  person: DiscoveredPerson,
  context: { companyName: string; companyDomain?: string | null },
): Promise<EnrichedPerson> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    throw new Error("HUNTER_API_KEY is not set. Add it to .env.local and retry.");
  }

  const url = new URL(HUNTER_EMAIL_FINDER_URL);
  const domain = normalizeDomain(context.companyDomain);
  if (domain) {
    url.searchParams.set("domain", domain);
  } else {
    url.searchParams.set("company", context.companyName);
  }
  url.searchParams.set("full_name", person.fullName);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url);

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(
      `Hunter email finder failed (${response.status} ${response.statusText})${responseBody ? `: ${responseBody}` : ""}`,
    );
  }

  const data = (await response.json()) as HunterEmailFinderResponse;
  return withHunterEmail(person, data.data ?? null);
}

export async function enrichDiscoveredPeople(
  people: DiscoveredPerson[],
  context: { companyName: string; companyDomain?: string | null },
): Promise<EnrichedPerson[]> {
  const enriched: EnrichedPerson[] = [];
  const seen = new Set<string>();

  for (const person of people) {
    const fullName = person.fullName.trim();
    if (!fullName) continue;
    const key = `${fullName.toLowerCase()}|${person.linkedinUrl ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const normalizedPerson = { ...person, fullName };
    try {
      enriched.push(await enrichOnePerson(normalizedPerson, context));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[hunter] Email enrichment failed for ${fullName}: ${message}`);
      enriched.push(withHunterEmail(normalizedPerson, null));
    }
  }

  return enriched;
}
