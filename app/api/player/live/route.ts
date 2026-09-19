import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { resolveSequence } from "@/lib/resolve";

/** What the /player route polls (PRD §8, §11.3 `GET /api/sequences/:id/resolve`). */
export async function GET() {
  const live = await db.query.sequences.findFirst({ where: eq(schema.sequences.isLive, true) });
  if (!live) return NextResponse.json({ sequence: null, items: [] });

  const items = await resolveSequence(live.id);
  return NextResponse.json({ sequence: { id: live.id, name: live.name }, items });
}
