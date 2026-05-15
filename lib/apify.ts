import { ApifyClient } from "apify-client";

if (!process.env.APIFY_TOKEN) {
  console.warn("[apify] APIFY_TOKEN is not set — Apify calls will fail.");
}

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

const COMPANY_EMPLOYEES_ACTOR = "harvestapi/linkedin-company-employees";

export type LinkedinEmployee = {
  fullName: string;
  title: string | null;
  linkedinUrl: string | null;
  location: string | null;
};

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function pickName(item: Record<string, unknown>): string {
  const candidates: unknown[] = [
    item.fullName,
    item.name,
    [item.firstName, item.lastName].filter(Boolean).join(" "),
    (item.name as Record<string, unknown> | undefined)?.first &&
      [
        (item.name as Record<string, unknown> | undefined)?.first,
        (item.name as Record<string, unknown> | undefined)?.last,
      ]
        .filter(Boolean)
        .join(" "),
  ];
  for (const c of candidates) {
    const s = asString(c);
    if (s) return s;
  }
  return "";
}

function pickTitle(item: Record<string, unknown>): string | null {
  return (
    asString(item.title) ??
    asString(item.position) ??
    asString(item.headline) ??
    asString((item.currentPosition as Record<string, unknown> | undefined)?.title) ??
    null
  );
}

function pickLinkedin(item: Record<string, unknown>): string | null {
  return (
    asString(item.linkedinUrl) ??
    asString(item.profileUrl) ??
    asString(item.url) ??
    asString(item.publicProfileUrl) ??
    null
  );
}

function pickLocation(item: Record<string, unknown>): string | null {
  return (
    asString(item.location) ??
    asString((item.location as Record<string, unknown> | undefined)?.linkedinText) ??
    asString(item.locationName) ??
    null
  );
}

export async function fetchCompanyEmployees(
  linkedinCompanyUrl: string,
  maxItems = 50,
): Promise<LinkedinEmployee[]> {
  const run = await client.actor(COMPANY_EMPLOYEES_ACTOR).call({
    companies: [linkedinCompanyUrl],
    maxItems,
    profileScraperMode: "Short ($4 per 1k)",
  });
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return items
    .map((item) => {
      const raw = item as Record<string, unknown>;
      return {
        fullName: pickName(raw),
        title: pickTitle(raw),
        linkedinUrl: pickLinkedin(raw),
        location: pickLocation(raw),
      };
    })
    .filter((e) => e.fullName.length > 0);
}
