import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emails, people, companies } from "@/lib/db/schema";
import { draftEmailUpdateSchema } from "@/lib/validators";
import { extractAndStoreLessons } from "@/lib/agents/email-learner";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/emails/[id]">) {
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = draftEmailUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db.select().from(emails).where(eq(emails.id, id));
  if (!existing) return Response.json({ error: "not found" }, { status: 404 });

  const [row] = await db
    .update(emails)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(emails.id, id))
    .returning();

  // Learn from edits on save (fire-and-forget)
  if (
    existing.originalSubject &&
    existing.originalBody &&
    (
      (parsed.data.subject && parsed.data.subject !== existing.originalSubject) ||
      (parsed.data.body && parsed.data.body !== existing.originalBody)
    )
  ) {
    learnFromEdits(
      existing.id,
      existing.personId,
      existing.originalSubject,
      existing.originalBody,
      parsed.data.subject ?? existing.subject,
      parsed.data.body ?? existing.body,
    ).catch((err) => console.error("[email-learner] learn-on-save failed:", err));
  }

  return Response.json(row);
}

async function learnFromEdits(
  emailId: string,
  personId: string,
  originalSubject: string,
  originalBody: string,
  editedSubject: string,
  editedBody: string,
) {
  const [person] = await db.select().from(people).where(eq(people.id, personId));
  if (!person) return;
  const [company] = await db.select().from(companies).where(eq(companies.id, person.companyId));
  if (!company) return;

  await extractAndStoreLessons(
    company.icpId,
    emailId,
    originalSubject,
    originalBody,
    editedSubject,
    editedBody,
  );
}
