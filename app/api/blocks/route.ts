import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId") ?? undefined;
  const type = searchParams.get("type") ?? undefined;

  const conditions = [];
  if (categoryId) conditions.push(eq(schema.blocks.categoryId, categoryId));
  if (type) conditions.push(eq(schema.blocks.type, type));

  const blocks = await db.query.blocks.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(schema.blocks.createdAt)],
    with: {
      category: true,
      staticImage: { with: { imageAsset: true } },
      video: { with: { videoAsset: true } },
      dynamic: { with: { dataSource: true } },
    },
  });

  return NextResponse.json(blocks);
}

/**
 * Creates a block.
 * static_image | video: { name, categoryId, type, fitMode?, startDate?,
 *   endDate?, durationSeconds?, textHeavy?, assetId }
 * dynamic_template (built-in WordPress Events Carousel — PRD §3.4/§6.8):
 *   { name, categoryId, type: "dynamic_template", dataSourceId,
 *     displayMode?, maxItems?, perItemDuration?, listLabel?, startDate?, endDate? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    name,
    categoryId,
    type,
    fitMode,
    startDate,
    endDate,
    durationSeconds,
    textHeavy,
    assetId,
    dataSourceId,
    displayMode,
    maxItems,
    perItemDuration,
    listLabel,
  } = body;

  if (!name || !categoryId || !type) {
    return NextResponse.json({ error: "name, categoryId, and type are required" }, { status: 400 });
  }
  if ((type === "static_image" || type === "video") && !assetId) {
    return NextResponse.json({ error: "assetId is required for this block type" }, { status: 400 });
  }
  if (type === "dynamic_template" && !dataSourceId) {
    return NextResponse.json({ error: "dataSourceId is required for a dynamic block" }, { status: 400 });
  }

  const asset =
    type === "static_image" || type === "video"
      ? await db.query.assets.findFirst({ where: eq(schema.assets.id, assetId) })
      : null;
  if ((type === "static_image" || type === "video") && !asset) {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }

  const blockId = await db.transaction(async (tx) => {
    const [block] = await tx
      .insert(schema.blocks)
      .values({
        name,
        categoryId,
        type,
        fitMode: fitMode ?? "cover",
        startDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : null,
        status: "active",
        durationSeconds: type === "static_image" ? durationSeconds ?? (textHeavy ? 18 : 10) : null,
      })
      .returning();

    if (type === "static_image") {
      await tx.insert(schema.staticImageBlocks).values({
        blockId: block.id,
        imageAssetId: assetId,
        textHeavy: !!textHeavy,
      });
    } else if (type === "video") {
      await tx.insert(schema.videoBlocks).values({
        blockId: block.id,
        videoAssetId: assetId,
        durationSeconds: asset!.durationSeconds ?? 10,
      });
    } else if (type === "dynamic_template") {
      await tx.insert(schema.dynamicBlocks).values({
        blockId: block.id,
        templateId: null,
        dataSourceId,
        displayMode: displayMode ?? "carousel",
        maxItems: maxItems ?? 20,
        perItemDuration: perItemDuration ?? 10,
        listLabel: listLabel || null,
      });
    }

    return block.id;
  });

  const block = await db.query.blocks.findFirst({
    where: eq(schema.blocks.id, blockId),
    with: {
      category: true,
      staticImage: { with: { imageAsset: true } },
      video: { with: { videoAsset: true } },
      dynamic: { with: { dataSource: true } },
    },
  });

  return NextResponse.json(block, { status: 201 });
}
