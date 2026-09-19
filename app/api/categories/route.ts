import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { asc } from "drizzle-orm";

export async function GET() {
  const categories = await db.select().from(schema.categories).orderBy(asc(schema.categories.name));
  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const [category] = await db
    .insert(schema.categories)
    .values({
      name: body.name,
      defaultDurationSeconds: body.defaultDurationSeconds ?? 10,
      color: body.color ?? "#4f46e5",
    })
    .returning();
  return NextResponse.json(category, { status: 201 });
}
