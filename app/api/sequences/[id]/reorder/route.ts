import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/** Body: { sequenceBlockIds: string[] } — the new order of SequenceBlock rows (drag-and-drop result). */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/sequences/[id]/reorder">) {
  const { id } = await ctx.params;
  const body = await request.json();
  const ids: string[] = body.sequenceBlockIds ?? [];

  // NOTE: better-sqlite3 transactions run synchronously — no `await` inside this callback.
  db.transaction((tx) => {
    ids.forEach((sequenceBlockId, index) => {
      tx.update(schema.sequenceBlocks)
        .set({ position: index })
        .where(eq(schema.sequenceBlocks.id, sequenceBlockId))
        .run();
    });
  });

  const sequence = await db.query.sequences.findFirst({
    where: eq(schema.sequences.id, id),
    with: {
      blocks: {
        orderBy: (sequenceBlocks, { asc }) => [asc(sequenceBlocks.position)],
        with: { block: true },
      },
    },
  });
  return NextResponse.json(sequence);
}
