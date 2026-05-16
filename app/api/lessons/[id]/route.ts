import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { styleLessons } from "@/lib/db/schema";

export const runtime = "nodejs";

/** DELETE /api/lessons/[id] — remove a lesson */
export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/lessons/[id]">,
) {
  const { id } = await ctx.params;
  const [row] = await db
    .delete(styleLessons)
    .where(eq(styleLessons.id, id))
    .returning();

  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ success: true });
}

/** PATCH /api/lessons/[id] — update a lesson's text */
export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/lessons/[id]">,
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { lesson } = body as { lesson?: string };

  if (!lesson || typeof lesson !== "string" || lesson.trim().length === 0) {
    return Response.json({ error: "lesson is required" }, { status: 400 });
  }

  const [row] = await db
    .update(styleLessons)
    .set({ lesson: lesson.trim() })
    .where(eq(styleLessons.id, id))
    .returning();

  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}
