import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { fetchWordPressEvents } from "@/lib/wordpress";

/**
 * Manual/scheduled sync trigger (PRD §11.3). The worker service calls
 * this same logic on a cron schedule (§6.8) — this route handles the
 * "Sync Now" button in the admin UI and n8n's targeted-upsert calls.
 *
 * Phase 1 implements wordpress_events end-to-end (logs fetched count).
 * Full dynamic-block rendering from synced items is a Phase 2 item,
 * once the template engine (§3.6) and Pods/custom-REST sources (§6.2–§6.4)
 * are built.
 */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/data-sources/[id]/sync">) {
  const { id } = await ctx.params;
  const source = await db.query.dataSources.findFirst({ where: eq(schema.dataSources.id, id) });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    let itemsFetched = 0;

    if (source.type === "wordpress_events") {
      const config = JSON.parse(source.config || "{}");
      const baseUrl = config.base_url || process.env.WORDPRESS_BASE_URL;
      if (!baseUrl) throw new Error("data source config missing base_url");
      const events = await fetchWordPressEvents(baseUrl);
      itemsFetched = events.length;
      // TODO (Phase 2): upsert Event dynamic blocks/template data from `events`.
    } else {
      throw new Error(`sync not yet implemented for type ${source.type}`);
    }

    // NOTE: better-sqlite3 transactions run synchronously — no `await` inside this callback.
    db.transaction((tx) => {
      tx.update(schema.dataSources)
        .set({ lastSyncedAt: new Date().toISOString() })
        .where(eq(schema.dataSources.id, id))
        .run();
      tx.insert(schema.syncLogs)
        .values({ dataSourceId: id, status: "success", itemsFetched, trigger: "manual" })
        .run();
    });

    return NextResponse.json({ ok: true, itemsFetched });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.insert(schema.syncLogs).values({
      dataSourceId: id,
      status: "error",
      errorMessage,
      trigger: "manual",
    });
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 502 });
  }
}
