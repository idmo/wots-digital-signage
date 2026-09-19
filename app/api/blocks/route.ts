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
    },
  });

  return NextResponse.json(blocks);
}

/**
 * Creates a block. Body shape (Phase 1 — static_image | video):
 * { name, categoryId, type, fitMode?, startDate?, endDate?,
 *   durationSeconds?, textHeavy?, assetId }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, categoryId, type, fitMode, startDate, endDate, durationSeconds, textHeavy, assetId } = body;

  if (!name || !categoryId || !type || !assetId) {
    return NextResponse.json(
      { error: "name, categoryId, type, and assetId are required" },
      { status: 400 }
    );
  }

  const asset = await db.query.assets.findFirst({ where: eq(schema.assets.id, assetId) });
  if (!asset) {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }

  // NOTE: better-sqlite3 transactions run synchronously — no `await` inside
  // this callback (drizzle's better-sqlite3 driver throws if the callback
  // returns a promise). Use `.get()`/`.run()` execution methods instead.
  const blockId = db.transaction((tx) => {
    const block = tx
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
      .returning()
      .get();

    if (type === "static_image") {
      tx.insert(schema.staticImageBlocks)
        .values({
          blockId: block.id,
          imageAssetId: assetId,
          textHeavy: !!textHeavy,
        })
        .run();
    } else if (type === "video") {
      tx.insert(schema.videoBlocks)
        .values({
          blockId: block.id,
          videoAssetId: assetId,
          durationSeconds: asset.durationSeconds ?? 10,
        })
        .run();
    }

    return block.id;
  });

  const block = await db.query.blocks.findFirst({
    where: eq(schema.blocks.id, blockId),
    with: {
      category: true,
      staticImage: { with: { imageAsset: true } },
      video: { with: { videoAsset: true } },
    },
  });

  return NextResponse.json(block, { status: 201 });
}
