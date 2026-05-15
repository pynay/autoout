import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, icps, people } from "@/lib/db/schema";
import { enrichDiscoveredPeople, findEnrichedEmailAddress } from "@/lib/hunter";
import { discoverPeopleAtCompany } from "@/lib/agents/people-discovery";
import { filterByTitles, rankPeople } from "@/lib/agents/people-ranking";
import { createSseStream } from "@/lib/sse";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/companies/[id]/discover-people">,
) {
  const { id } = await ctx.params;
  const [company] = await db.select().from(companies).where(eq(companies.id, id));
  if (!company) return Response.json({ error: "not found" }, { status: 404 });

  const [icp] = await db.select().from(icps).where(eq(icps.id, company.icpId));
  if (!icp) return Response.json({ error: "parent ICP missing" }, { status: 500 });

  return createSseStream(async (send) => {
    send("progress", { message: "Discovering people with Claude web search…" });
    const discovered = await discoverPeopleAtCompany(icp, company, send);
    send("progress", { message: `Found ${discovered.length} people, finding emails with Hunter…` });
    const employees = await enrichDiscoveredPeople(discovered, {
      companyName: company.name,
      companyDomain: company.domain,
    });
    send("progress", { message: `Checked ${employees.length} people for emails, filtering…` });

    const filtered = filterByTitles(employees, icp.targetTitles);
    const candidates = filtered.length > 0 ? filtered : employees.slice(0, 30);

    send("progress", { message: `Ranking ${candidates.length} candidates…` });
    const ranked = await rankPeople(icp, company.name, candidates);
    if (ranked.length === 0) {
      send("done", { personIds: [], count: 0 });
      return;
    }

    // Replace prior people for this company to keep things clean on re-run
    await db.delete(people).where(eq(people.companyId, company.id));

    const inserted = await db
      .insert(people)
      .values(
        ranked.map((p) => ({
          companyId: company.id,
          fullName: p.fullName,
          title: p.title ?? null,
          linkedinUrl: p.linkedinUrl ?? null,
          location: p.location ?? null,
          emailAddress: findEnrichedEmailAddress(employees, p),
          score: p.score,
          scoreReason: p.scoreReason,
        })),
      )
      .returning({ id: people.id });

    await db
      .update(companies)
      .set({ status: "enriched" })
      .where(eq(companies.id, company.id));

    send("done", { personIds: inserted.map((r) => r.id), count: inserted.length });
  });
}
