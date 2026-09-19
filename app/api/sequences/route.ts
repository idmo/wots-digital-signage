import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { asc, count, eq } from "drizzle-orm";

export async function GET() {
  const rows = await db
    .select({
      id: schema.sequences.id,
      name: schema.sequences.name,
      isLive: schema.sequences.isLive,
      createdAt: schema.sequences.createdAt,
      updatedAt: schema.sequences.updatedAt,
      blockCount: count(schema.sequenceBlocks.id),
    })
    .from(schema.sequences)
    .leftJoin(schema.sequenceBlocks, eq(schema.sequenceBlocks.sequenceId, schema.sequences.id))
    .groupBy(schema.sequences.id)
    .orderBy(asc(schema.sequences.createdAt));

  const sequences = rows.map((s) => ({ ...s, _count: { blocks: s.blockCount } }));
  return NextResponse.json(sequences);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const [sequence] = await db.insert(schema.sequences).values({ name: body.name }).returning();
  return NextResponse.json(sequence, { status: 201 });
}
