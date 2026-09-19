import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/** Body: { sequenceBlockIds: string[] } — the new order of SequenceBlock rows (drag-and-drop result). */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/sequences/[id]/reorder">) {
  const { id } = await ctx.params;
  const body = await request.json();
  const ids: string[] = body.sequenceBlockIds ?? [];

  await db.transaction(async (tx) => {
    for (const [index, sequenceBlockId] of ids.entries()) {
      await tx
        .update(schema.sequenceBlocks)
        .set({ position: index })
        .where(eq(schema.sequenceBlocks.id, sequenceBlockId));
    }
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
