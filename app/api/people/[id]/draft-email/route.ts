import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { people, companies, icps, emails } from "@/lib/db/schema";
import { draftEmail } from "@/lib/agents/email-drafter";
import { judgeEmail } from "@/lib/agents/email-judge";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/people/[id]/draft-email">,
) {
  const { id } = await ctx.params;
  const [person] = await db.select().from(people).where(eq(people.id, id));
  if (!person) return Response.json({ error: "not found" }, { status: 404 });

  const [company] = await db.select().from(companies).where(eq(companies.id, person.companyId));
  if (!company) return Response.json({ error: "company missing" }, { status: 500 });

  const [icp] = await db.select().from(icps).where(eq(icps.id, company.icpId));
  if (!icp) return Response.json({ error: "icp missing" }, { status: 500 });

  const draft = await draftEmail(icp, company, person);
  const judgment = await judgeEmail(draft.subject, draft.body, person, company);

  const [row] = await db
    .insert(emails)
    .values({
      personId: person.id,
      subject: draft.subject,
      body: draft.body,
      status: "draft",
      judgeResult: judgment,
    })
    .returning();

  return Response.json(row, { status: 201 });
}
