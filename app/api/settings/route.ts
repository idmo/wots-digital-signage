import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const CONTENT_ANIMATIONS = ["none", "fade", "slide", "zoom"];
const BLOCK_TRANSITIONS = ["cut", "crossfade", "slide", "zoom"];

const DEFAULTS = {
  id: "global",
  contentAnimation: "fade",
  contentAnimationDurationMs: 500,
  blockTransition: "crossfade",
  blockTransitionDurationMs: 800,
};

/**
 * The single app-wide `settings` row — the default content animation (for
 * a dynamic block's inner panel) and block transition (between blocks in a
 * sequence), each block can individually override (see PUT /api/blocks/:id).
 */
export async function GET() {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.id, "global") });
  if (row) return NextResponse.json(row);

  // Defensive fallback — migration 0007 seeds this row, but don't 500 the
  // Settings page if it's somehow missing.
  const [created] = await db.insert(schema.settings).values(DEFAULTS).returning();
  return NextResponse.json(created);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { contentAnimation, contentAnimationDurationMs, blockTransition, blockTransitionDurationMs } = body;

  if (contentAnimation !== undefined && !CONTENT_ANIMATIONS.includes(contentAnimation)) {
    return NextResponse.json({ error: `contentAnimation must be one of ${CONTENT_ANIMATIONS.join(", ")}` }, { status: 400 });
  }
  if (blockTransition !== undefined && !BLOCK_TRANSITIONS.includes(blockTransition)) {
    return NextResponse.json({ error: `blockTransition must be one of ${BLOCK_TRANSITIONS.join(", ")}` }, { status: 400 });
  }

  const existing = await db.query.settings.findFirst({ where: eq(schema.settings.id, "global") });
  const patch = {
    ...(contentAnimation !== undefined ? { contentAnimation } : {}),
    ...(contentAnimationDurationMs !== undefined ? { contentAnimationDurationMs: Number(contentAnimationDurationMs) } : {}),
    ...(blockTransition !== undefined ? { blockTransition } : {}),
    ...(blockTransitionDurationMs !== undefined ? { blockTransitionDurationMs: Number(blockTransitionDurationMs) } : {}),
  };

  if (!existing) {
    const [created] = await db.insert(schema.settings).values({ ...DEFAULTS, ...patch }).returning();
    return NextResponse.json(created);
  }

  const [updated] = await db
    .update(schema.settings)
    .set(patch)
    .where(eq(schema.settings.id, "global"))
    .returning();
  return NextResponse.json(updated);
}
