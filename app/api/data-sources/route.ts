import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { asc } from "drizzle-orm";

export async function GET() {
  const sources = await db.query.dataSources.findMany({
    orderBy: [asc(schema.dataSources.createdAt)],
    with: { syncLogs: { orderBy: (syncLogs, { desc }) => [desc(syncLogs.runAt)], limit: 1 } },
  });
  return NextResponse.json(sources);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const [source] = await db
    .insert(schema.dataSources)
    .values({
      name: body.name,
      type: body.type,
      config: JSON.stringify(body.config ?? {}),
    })
    .returning();
  return NextResponse.json(source, { status: 201 });
}
