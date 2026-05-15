import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { icps, companies } from "@/lib/db/schema";
import { discoverCompanies } from "@/lib/agents/company-discovery";
import { createSseStream } from "@/lib/sse";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/icps/[id]/discover-companies">) {
  const { id } = await ctx.params;
  const [icp] = await db.select().from(icps).where(eq(icps.id, id));
  if (!icp) return Response.json({ error: "not found" }, { status: 404 });

  return createSseStream(async (send) => {
    const discovered = await discoverCompanies(icp, send);
    if (discovered.length === 0) {
      send("done", { companyIds: [], count: 0 });
      return;
    }
    send("progress", { message: `Saving ${discovered.length} companies…` });
    const inserted = await db
      .insert(companies)
      .values(
        discovered.map((c) => ({
          icpId: id,
          name: c.name,
          domain: c.domain ?? null,
          linkedinUrl: c.linkedinUrl ?? null,
          industry: c.industry ?? null,
          employeeRange: c.employeeRange ?? null,
          geo: c.geo ?? null,
          description: c.description ?? null,
          sourceUrl: c.sourceUrl ?? null,
          matchReason: c.matchReason ?? null,
        })),
      )
      .returning({ id: companies.id });
    send("done", { companyIds: inserted.map((r) => r.id), count: inserted.length });
  });
}
