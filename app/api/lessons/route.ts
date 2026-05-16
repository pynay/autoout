import { NextRequest } from "next/server";
import { eq, isNull, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { styleLessons } from "@/lib/db/schema";

export const runtime = "nodejs";

/** GET /api/lessons?icpId=xxx — list lessons (pass icpId to filter, omit for global) */
export async function GET(req: NextRequest) {
  const icpId = req.nextUrl.searchParams.get("icpId");

  const rows = await db
    .select()
    .from(styleLessons)
    .where(icpId ? eq(styleLessons.icpId, icpId) : isNull(styleLessons.icpId))
    .orderBy(desc(styleLessons.lastUsedAt));

  return Response.json(rows);
}

/** POST /api/lessons — manually create a lesson */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { lesson, icpId } = body as { lesson?: string; icpId?: string | null };

  if (!lesson || typeof lesson !== "string" || lesson.trim().length === 0) {
    return Response.json({ error: "lesson is required" }, { status: 400 });
  }

  const [row] = await db
    .insert(styleLessons)
    .values({
      icpId: icpId ?? null,
      emailId: null,
      lesson: lesson.trim(),
    })
    .returning();

  return Response.json(row, { status: 201 });
}
