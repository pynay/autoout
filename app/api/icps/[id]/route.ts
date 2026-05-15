import { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { icps, companies, people, emails } from "@/lib/db/schema";
import { icpUpdateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/icps/[id]">) {
  const { id } = await ctx.params;
  const [icp] = await db.select().from(icps).where(eq(icps.id, id));
  if (!icp) return Response.json({ error: "not found" }, { status: 404 });

  const companiesList = await db
    .select()
    .from(companies)
    .where(eq(companies.icpId, id));

  const companyIds = companiesList.map((c) => c.id);
  const peopleList = companyIds.length
    ? await db.select().from(people).where(inArray(people.companyId, companyIds))
    : [];

  const personIds = peopleList.map((p) => p.id);
  const emailsList = personIds.length
    ? await db.select().from(emails).where(inArray(emails.personId, personIds))
    : [];

  return Response.json({
    icp,
    companies: companiesList,
    people: peopleList,
    emails: emailsList,
  });
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/icps/[id]">) {
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = icpUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const [row] = await db
    .update(icps)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(icps.id, id))
    .returning();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/icps/[id]">) {
  const { id } = await ctx.params;
  await db.delete(icps).where(eq(icps.id, id));
  return new Response(null, { status: 204 });
}
