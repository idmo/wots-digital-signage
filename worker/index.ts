/**
 * Standalone polling worker (PRD §11.1, §11.2). Separate long-running
 * process from the Next.js "web" app, sharing the same Drizzle
 * client/DB — handles the two things a request/response framework
 * isn't suited for:
 *   1. Polling WordPress/Pods/custom-REST data sources (§6.8)
 *   2. Sweeping expired blocks (§4)
 *
 * The n8n webhook receiver deliberately does NOT live here — it's
 * event-driven and stays a normal Next.js API route (app/api/webhooks/n8n).
 */
import cron from "node-cron";
import { and, eq, lt } from "drizzle-orm";
import { db, schema } from "../db";

const WEB_BASE_URL = process.env.WEB_BASE_URL || "http://web:3000";
const POLL_CRON = process.env.SYNC_POLL_CRON || "*/30 * * * *"; // every 30 min, PRD §6.8
const SWEEP_CRON = process.env.EXPIRE_SWEEP_CRON || "*/5 * * * *"; // every 5 min, PRD §4/§5

async function pollDataSources() {
  const sources = await db.select().from(schema.dataSources);
  for (const source of sources) {
    try {
      const res = await fetch(`${WEB_BASE_URL}/api/data-sources/${source.id}/sync`, { method: "POST" });
      const body = await res.json();
      console.log(`[worker] synced ${source.name} (${source.type}):`, body);
    } catch (err) {
      console.error(`[worker] sync failed for ${source.name}:`, err);
    }
  }
}

async function sweepExpiredBlocks() {
  const now = new Date().toISOString();
  const result = await db
    .update(schema.blocks)
    .set({ status: "expired" })
    .where(and(lt(schema.blocks.endDate, now), eq(schema.blocks.status, "active")))
    .returning({ id: schema.blocks.id });
  if (result.length > 0) {
    console.log(`[worker] marked ${result.length} block(s) expired`);
  }
}

console.log(`[worker] starting — poll: "${POLL_CRON}", sweep: "${SWEEP_CRON}"`);

cron.schedule(POLL_CRON, () => {
  pollDataSources().catch((err) => console.error("[worker] pollDataSources error:", err));
});

cron.schedule(SWEEP_CRON, () => {
  sweepExpiredBlocks().catch((err) => console.error("[worker] sweepExpiredBlocks error:", err));
});

// Run once immediately on startup so a freshly-deployed stack isn't
// stale for a full cron interval.
pollDataSources().catch((err) => console.error("[worker] initial pollDataSources error:", err));
sweepExpiredBlocks().catch((err) => console.error("[worker] initial sweepExpiredBlocks error:", err));
