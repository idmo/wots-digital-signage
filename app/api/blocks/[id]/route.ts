import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/blocks/[id]">) {
  const { id } = await ctx.params;
  const block = await db.query.blocks.findFirst({
    where: eq(schema.blocks.id, id),
    with: {
      category: true,
      staticImage: { with: { imageAsset: true } },
      video: { with: { videoAsset: true } },
      dynamic: { with: { dataSource: true, backgroundImage: true, template: true } },
    },
  });
  if (!block) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(block);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/blocks/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json();
  const {
    name,
    categoryId,
    fitMode,
    startDate,
    endDate,
    durationSeconds,
    status,
    note,
    dataSourceId,
    displayMode,
    maxItems,
    perItemDuration,
    listLabel,
    featuredMonthYear,
    backgroundImageAssetId,
    divBackgroundColor,
    divBackgroundOpacity,
    titleColor,
    bodyColor,
    metaColor,
    templateId,
    contentAnimation,
    blockTransition,
  } = body;

  const existing = await db.query.blocks.findFirst({ where: eq(schema.blocks.id, id) });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db
    .update(schema.blocks)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(fitMode !== undefined ? { fitMode } : {}),
      ...(startDate !== undefined
        ? { startDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString() }
        : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate).toISOString() : null } : {}),
      ...(durationSeconds !== undefined
        ? { durationSeconds: durationSeconds === null || durationSeconds === "" ? null : Number(durationSeconds) }
        : {}),
      ...(status !== undefined ? { status } : {}),
      ...(note !== undefined ? { note: note === "" ? null : note } : {}),
      ...(contentAnimation !== undefined ? { contentAnimation: contentAnimation || null } : {}),
      ...(blockTransition !== undefined ? { blockTransition: blockTransition || null } : {}),
    })
    .where(eq(schema.blocks.id, id));

  if (existing.type === "dynamic_template") {
    await db
      .update(schema.dynamicBlocks)
      .set({
        ...(templateId !== undefined ? { templateId: templateId || null } : {}),
        ...(dataSourceId !== undefined ? { dataSourceId } : {}),
        ...(displayMode !== undefined ? { displayMode } : {}),
        ...(maxItems !== undefined ? { maxItems: Number(maxItems) } : {}),
        ...(perItemDuration !== undefined ? { perItemDuration: Number(perItemDuration) } : {}),
        ...(listLabel !== undefined ? { listLabel: listLabel || null } : {}),
        ...(featuredMonthYear !== undefined ? { featuredMonthYear: featuredMonthYear || null } : {}),
        ...(backgroundImageAssetId !== undefined
          ? { backgroundImageAssetId: backgroundImageAssetId || null }
          : {}),
        ...(divBackgroundColor !== undefined ? { divBackgroundColor: divBackgroundColor || "#000000" } : {}),
        ...(divBackgroundOpacity !== undefined ? { divBackgroundOpacity: Number(divBackgroundOpacity) } : {}),
        ...(titleColor !== undefined ? { titleColor: titleColor || "#ffffff" } : {}),
        ...(bodyColor !== undefined ? { bodyColor: bodyColor || "#ffffff" } : {}),
        ...(metaColor !== undefined ? { metaColor: metaColor || "#ffffff" } : {}),
      })
      .where(eq(schema.dynamicBlocks.blockId, id));
  }

  const block = await db.query.blocks.findFirst({
    where: eq(schema.blocks.id, id),
    with: {
      category: true,
      staticImage: { with: { imageAsset: true } },
      video: { with: { videoAsset: true } },
      dynamic: { with: { dataSource: true, backgroundImage: true, template: true } },
    },
  });

  return NextResponse.json(block);
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/blocks/[id]">) {
  const { id } = await ctx.params;
  await db.delete(schema.blocks).where(eq(schema.blocks.id, id));
  return NextResponse.json({ ok: true });
}
