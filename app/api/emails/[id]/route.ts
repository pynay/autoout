import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emails } from "@/lib/db/schema";
import { draftEmailUpdateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/emails/[id]">) {
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = draftEmailUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const [row] = await db
    .update(emails)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(emails.id, id))
    .returning();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}
