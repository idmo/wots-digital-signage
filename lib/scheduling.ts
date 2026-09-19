import type { schema } from "@/db";

type BlockRow = typeof schema.blocks.$inferSelect;

/**
 * A block is eligible for playback when today falls within its
 * [startDate, endDate] window. No endDate = evergreen (PRD §4).
 */
export function isBlockEligible(
  block: Pick<BlockRow, "startDate" | "endDate">,
  now = new Date()
): boolean {
  if (block.startDate && new Date(block.startDate) > now) return false;
  if (block.endDate && new Date(block.endDate) < now) return false;
  return true;
}

/** Computed status per PRD §3.2 — combines schedule with the stored status flag for archiving. */
export function computeStatus(
  block: Pick<BlockRow, "startDate" | "endDate" | "status">,
  now = new Date()
): "draft" | "active" | "expired" | "archived" {
  if (block.status === "archived" || block.status === "draft") return block.status;
  if (block.endDate && new Date(block.endDate) < now) return "expired";
  if (block.startDate && new Date(block.startDate) > now) return "draft";
  return "active";
}
