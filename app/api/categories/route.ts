import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { asc } from "drizzle-orm";

export async function GET() {
  const categories = await db.select().from(schema.categories).orderBy(asc(schema.categories.name));
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }
  try {
    const [category] = await db
      .insert(schema.categories)
      .values({
        name: body.name,
        defaultDurationSeconds: body.defaultDurationSeconds ?? 10,
        color: body.color ?? "#4f46e5",
      })
      .returning();
    return NextResponse.json(category, { status: 201 });
  } catch (err) {
    // Postgres unique-violation code, or a "unique" mention anywhere in the
    // error chain (drizzle wraps the pg error in `cause`).
    const cause = err instanceof Error ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
    const isUniqueViolation =
      cause?.code === "23505" ||
      /unique/i.test(err instanceof Error ? err.message : "") ||
      /unique/i.test(cause?.message ?? "");
    const message = isUniqueViolation
      ? `A category named "${body.name}" already exists.`
      : err instanceof Error
      ? err.message
      : "Failed to create category";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
