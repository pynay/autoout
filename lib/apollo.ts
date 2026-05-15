if (!process.env.APOLLO_API_KEY) {
  console.warn("[apollo] APOLLO_API_KEY is not set — Apollo calls will fail.");
}

const APOLLO_PEOPLE_MATCH_URL = "https://api.apollo.io/api/v1/people/match";

export type LinkedinEmployee = {
  fullName: string;
  title: string | null;
  linkedinUrl: string | null;
  location: string | null;
};

export type DiscoveredPerson = LinkedinEmployee;

type ApolloPerson = {
  name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  title?: unknown;
  linkedin_url?: unknown;
  linkedinUrl?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
};

type ApolloPeopleMatchResponse = {
  person?: ApolloPerson | null;
  contact?: ApolloPerson | null;
};

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function pickName(person: ApolloPerson): string {
  return (
    asString(person.name) ??
    [asString(person.first_name), asString(person.last_name)].filter(Boolean).join(" ")
  );
}

function pickLocation(person: ApolloPerson): string | null {
  const parts = [asString(person.city), asString(person.state), asString(person.country)].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(", ") : null;
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

function mergePerson(discovered: DiscoveredPerson, apolloPerson: ApolloPerson | null): LinkedinEmployee {
  if (!apolloPerson) return discovered;
  const fullName = pickName(apolloPerson);
  return {
    fullName: fullName || discovered.fullName,
    title: asString(apolloPerson.title) ?? discovered.title,
    linkedinUrl:
      asString(apolloPerson.linkedin_url) ?? asString(apolloPerson.linkedinUrl) ?? discovered.linkedinUrl,
    location: pickLocation(apolloPerson) ?? discovered.location,
  };
}

async function enrichOnePerson(
  person: DiscoveredPerson,
  context: { companyName: string; companyDomain?: string | null },
): Promise<LinkedinEmployee> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error("APOLLO_API_KEY is not set. Add it to .env.local and retry.");
  }

  const body: Record<string, unknown> = {
    name: person.fullName,
    linkedin_url: person.linkedinUrl,
    organization_name: context.companyName,
    domain: normalizeDomain(context.companyDomain),
    reveal_personal_emails: false,
    reveal_phone_number: false,
  };

  for (const [key, value] of Object.entries(body)) {
    if (value == null || value === "") delete body[key];
  }

  const response = await fetch(APOLLO_PEOPLE_MATCH_URL, {
    method: "POST",
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(
      `Apollo people match failed (${response.status} ${response.statusText})${responseBody ? `: ${responseBody}` : ""}`,
    );
  }

  const data = (await response.json()) as ApolloPeopleMatchResponse;
  return mergePerson(person, data.person ?? data.contact ?? null);
}

export async function enrichDiscoveredPeople(
  people: DiscoveredPerson[],
  context: { companyName: string; companyDomain?: string | null },
): Promise<LinkedinEmployee[]> {
  const enriched: LinkedinEmployee[] = [];
  const seen = new Set<string>();

  for (const person of people) {
    const fullName = person.fullName.trim();
    if (!fullName) continue;
    const key = `${fullName.toLowerCase()}|${person.linkedinUrl ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    enriched.push(await enrichOnePerson({ ...person, fullName }, context));
  }

  return enriched;
}
