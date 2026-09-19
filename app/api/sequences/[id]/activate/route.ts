import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/** Marks this sequence as the single "live" one (PRD §5 — only one live sequence in v1). */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/sequences/[id]/activate">) {
  const { id } = await ctx.params;

  // NOTE: better-sqlite3 transactions run synchronously — no `await` inside this callback.
  db.transaction((tx) => {
    tx.update(schema.sequences).set({ isLive: false }).where(eq(schema.sequences.isLive, true)).run();
    tx.update(schema.sequences).set({ isLive: true }).where(eq(schema.sequences.id, id)).run();
  });

  return NextResponse.json({ ok: true });
}
