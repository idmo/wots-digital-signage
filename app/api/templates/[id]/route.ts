import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { isLayoutId } from "@/lib/templates";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/templates/[id]">) {
  const { id } = await ctx.params;
  const template = await db.query.templates.findFirst({ where: eq(schema.templates.id, id) });
  if (!template) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/templates/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json();
  const { name, layout, regions } = body;

  const existing = await db.query.templates.findFirst({ where: eq(schema.templates.id, id) });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (layout !== undefined && !isLayoutId(layout)) {
    return NextResponse.json({ error: "invalid layout" }, { status: 400 });
  }

  const [template] = await db
    .update(schema.templates)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(layout !== undefined ? { layout } : {}),
      ...(regions !== undefined ? { regions: JSON.stringify(regions) } : {}),
    })
    .where(eq(schema.templates.id, id))
    .returning();

  return NextResponse.json(template);
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/templates/[id]">) {
  const { id } = await ctx.params;
  // Any dynamic_blocks row using this template falls back to the built-in
  // renderer automatically (templateId is a nullable FK with no cascade).
  await db
    .update(schema.dynamicBlocks)
    .set({ templateId: null })
    .where(eq(schema.dynamicBlocks.templateId, id));
  await db.delete(schema.templates).where(eq(schema.templates.id, id));
  return NextResponse.json({ ok: true });
}
