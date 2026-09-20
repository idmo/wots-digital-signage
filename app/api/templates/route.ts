import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { isLayoutId, isDataSourceKind } from "@/lib/templates";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dataSourceType = searchParams.get("dataSourceType") ?? undefined;

  const templates = await db.query.templates.findMany({
    where: dataSourceType ? eq(schema.templates.dataSourceType, dataSourceType) : undefined,
    orderBy: [desc(schema.templates.createdAt)],
  });

  return NextResponse.json(templates);
}

/**
 * Creates a reusable drag-and-drop template (lib/templates.ts) for the
 * Block Library's built-in WordPress renderer.
 * { name, dataSourceType: "wordpress_events" | "wordpress_bulletin_board" | "wordpress_featured_readers",
 *   layout: "stack" | "split_left" | "split_right", regions: Record<string, string[]> }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, dataSourceType, layout, regions } = body;

  if (!name || !dataSourceType) {
    return NextResponse.json({ error: "name and dataSourceType are required" }, { status: 400 });
  }
  if (!isDataSourceKind(dataSourceType)) {
    return NextResponse.json({ error: "invalid dataSourceType" }, { status: 400 });
  }
  if (layout !== undefined && !isLayoutId(layout)) {
    return NextResponse.json({ error: "invalid layout" }, { status: 400 });
  }

  const [template] = await db
    .insert(schema.templates)
    .values({
      name,
      dataSourceType,
      layout: layout ?? "stack",
      regions: JSON.stringify(regions ?? {}),
    })
    .returning();

  return NextResponse.json(template, { status: 201 });
}
