import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * n8n push-update receiver (PRD §6.8). Stays a normal Next.js Route
 * Handler — unlike the polling sync, this is purely event-driven and
 * doesn't need the worker's long-running process.
 *
 * Expected header: x-signage-secret: <SIGNAGE_WEBHOOK_SECRET>
 * Body: { dataSourceId: string, postId?: string | number, postType?: string }
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-signage-secret");
  if (!secret || secret !== process.env.SIGNAGE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { dataSourceId } = body;
  if (!dataSourceId) {
    return NextResponse.json({ error: "dataSourceId is required" }, { status: 400 });
  }

  const source = await db.query.dataSources.findFirst({ where: eq(schema.dataSources.id, dataSourceId) });
  if (!source) return NextResponse.json({ error: "data source not found" }, { status: 404 });

  // Delegate to the same sync route so polling and webhook-push share
  // one code path (targeted upsert per §6.8 tip 3 lands here once the
  // Phase 2 template/dynamic-block pipeline exists).
  const syncUrl = new URL(`/api/data-sources/${dataSourceId}/sync`, request.url);
  const syncRes = await fetch(syncUrl, { method: "POST" });
  const result = await syncRes.json();

  return NextResponse.json(result, { status: syncRes.status });
}
