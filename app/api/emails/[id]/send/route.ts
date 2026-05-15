import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emails } from "@/lib/db/schema";
import { resend, EMAIL_FROM } from "@/lib/resend";

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
