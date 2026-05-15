import { NextRequest } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { icps } from "@/lib/db/schema";
import { icpInputSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.select().from(icps).orderBy(desc(icps.createdAt));
  return Response.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = icpInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const [row] = await db.insert(icps).values(parsed.data).returning();
  return Response.json(row, { status: 201 });
}
