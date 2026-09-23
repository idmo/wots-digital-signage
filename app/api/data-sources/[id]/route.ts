import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/data-sources/[id]">) {
  const { id } = await ctx.params;
  const source = await db.query.dataSources.findFirst({
    where: eq(schema.dataSources.id, id),
    with: { syncLogs: { orderBy: (syncLogs, { desc }) => [desc(syncLogs.runAt)], limit: 1 } },
  });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(source);
}

/**
 * Edits a data source's internal label and/or its config (currently just
 * `base_url` — the WordPress site to pull from). Blocks/workers re-read
 * `config` fresh on every sync, so this takes effect on the next sync —
 * no re-linking of existing dynamic blocks needed.
 */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/data-sources/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json();
  const { name, baseUrl } = body;

  const existing = await db.query.dataSources.findFirst({ where: eq(schema.dataSources.id, id) });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (name !== undefined && !String(name).trim()) {
    return NextResponse.json({ error: "name can't be empty" }, { status: 400 });
  }

  let config: string | undefined;
  if (baseUrl !== undefined) {
    const current = JSON.parse(existing.config || "{}");
    config = JSON.stringify({ ...current, base_url: baseUrl.trim() || undefined });
  }

  const [source] = await db
    .update(schema.dataSources)
    .set({
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(config !== undefined ? { config } : {}),
    })
    .where(eq(schema.dataSources.id, id))
    .returning();

  return NextResponse.json(source);
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/data-sources/[id]">) {
  const { id } = await ctx.params;

  const existing = await db.query.dataSources.findFirst({ where: eq(schema.dataSources.id, id) });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // dynamicBlocks.dataSourceId is a required (non-nullable) FK — unlike a
  // block's template, a dynamic block can't fall back to "no data source".
  // So unlike template deletion, we block outright rather than null it out,
  // and tell the user which blocks to reassign or delete first.
  const blocksInUse = await db.query.dynamicBlocks.findMany({
    where: eq(schema.dynamicBlocks.dataSourceId, id),
    with: { block: { columns: { name: true } } },
  });
  if (blocksInUse.length > 0) {
    const names = blocksInUse.map((b) => b.block?.name).filter(Boolean).join(", ");
    return NextResponse.json(
      {
        error: `Can't delete — still used by ${blocksInUse.length} block(s): ${names}. Change or delete ${
          blocksInUse.length === 1 ? "that block" : "those blocks"
        } first.`,
      },
      { status: 409 }
    );
  }

  await db.delete(schema.dataSources).where(eq(schema.dataSources.id, id));
  return NextResponse.json({ ok: true });
}
