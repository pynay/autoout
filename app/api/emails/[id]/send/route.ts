import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emails, people, companies, styleLessons } from "@/lib/db/schema";
import { resend, EMAIL_FROM } from "@/lib/resend";
import { extractLessons } from "@/lib/agents/email-learner";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/emails/[id]/send">,
) {
  const { id } = await ctx.params;
  const [email] = await db.select().from(emails).where(eq(emails.id, id));
  if (!email) return Response.json({ error: "not found" }, { status: 404 });
  if (email.status === "sent") {
    return Response.json({ error: "already sent" }, { status: 409 });
  }
  if (!email.toAddress) {
    return Response.json({ error: "toAddress is required" }, { status: 400 });
  }

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: email.toAddress,
      subject: email.subject,
      text: email.body,
    });
    if (result.error) {
      throw new Error(result.error.message ?? "Resend rejected the send");
    }
    const [row] = await db
      .update(emails)
      .set({
        status: "sent",
        sentAt: new Date(),
        resendId: result.data?.id ?? null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(emails.id, id))
      .returning();

    // Learn from user edits (fire-and-forget — don't block the send response)
    if (
      email.originalSubject &&
      email.originalBody &&
      (email.subject !== email.originalSubject || email.body !== email.originalBody)
    ) {
      learnFromEdits(email.id, email.personId, email.originalSubject, email.originalBody, email.subject, email.body).catch(
        (err) => console.error("[email-learner] failed:", err),
      );
    }

    return Response.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(emails)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(eq(emails.id, id));
    return Response.json({ error: message }, { status: 500 });
  }
}

async function learnFromEdits(
  emailId: string,
  personId: string,
  originalSubject: string,
  originalBody: string,
  editedSubject: string,
  editedBody: string,
) {
  // Look up the ICP for this email's person → company → icp chain
  const [person] = await db.select().from(people).where(eq(people.id, personId));
  if (!person) return;
  const [company] = await db.select().from(companies).where(eq(companies.id, person.companyId));
  if (!company) return;

  const lessons = await extractLessons(originalSubject, originalBody, editedSubject, editedBody);
  if (lessons.length === 0) return;

  await db.insert(styleLessons).values(
    lessons.map((lesson) => ({
      icpId: company.icpId,
      emailId,
      lesson,
    })),
  );
}
