import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/** Marks this sequence as the single "live" one (PRD §5 — only one live sequence in v1). */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/sequences/[id]/activate">) {
  const { id } = await ctx.params;

  await db.transaction(async (tx) => {
    await tx.update(schema.sequences).set({ isLive: false }).where(eq(schema.sequences.isLive, true));
    await tx.update(schema.sequences).set({ isLive: true }).where(eq(schema.sequences.id, id));
  });

  return NextResponse.json({ ok: true });
}
