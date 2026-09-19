import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/sequences/[id]">) {
  const { id } = await ctx.params;
  const sequence = await db.query.sequences.findFirst({
    where: eq(schema.sequences.id, id),
    with: {
      blocks: {
        orderBy: (sequenceBlocks, { asc }) => [asc(sequenceBlocks.position)],
        with: { block: { with: { category: true } } },
      },
    },
  });
  if (!sequence) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(sequence);
}

/** Body: { name?, blockIds?: string[] } — blockIds replaces sequence membership, appended in given order. */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/sequences/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json();

  // NOTE: better-sqlite3 transactions run synchronously — no `await` inside
  // this callback. Use `.run()` execution methods instead.
  db.transaction((tx) => {
    if (body.name !== undefined) {
      tx.update(schema.sequences).set({ name: body.name }).where(eq(schema.sequences.id, id)).run();
    }

    if (Array.isArray(body.blockIds)) {
      tx.delete(schema.sequenceBlocks).where(eq(schema.sequenceBlocks.sequenceId, id)).run();
      body.blockIds.forEach((blockId: string, index: number) => {
        tx.insert(schema.sequenceBlocks)
          .values({ sequenceId: id, blockId, position: index })
          .run();
      });
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

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/sequences/[id]">) {
  const { id } = await ctx.params;
  await db.delete(schema.sequences).where(eq(schema.sequences.id, id));
  return NextResponse.json({ ok: true });
}
