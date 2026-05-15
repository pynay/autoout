import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emails, people, companies } from "@/lib/db/schema";
import { judgeEmail } from "@/lib/agents/email-judge";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/emails/[id]/judge">,
) {
  const { id } = await ctx.params;
  const [email] = await db.select().from(emails).where(eq(emails.id, id));
  if (!email) return Response.json({ error: "not found" }, { status: 404 });

  const [person] = await db.select().from(people).where(eq(people.id, email.personId));
  if (!person) return Response.json({ error: "person missing" }, { status: 500 });

  const [company] = await db.select().from(companies).where(eq(companies.id, person.companyId));
  if (!company) return Response.json({ error: "company missing" }, { status: 500 });

  const judgment = await judgeEmail(email.subject, email.body, person, company);

  const [row] = await db
    .update(emails)
    .set({ judgeResult: judgment, updatedAt: new Date() })
    .where(eq(emails.id, id))
    .returning();

  return Response.json(row);
}
