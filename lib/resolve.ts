import { db } from "@/db";
import { isBlockEligible } from "./scheduling";

export type ResolvedItem = {
  sequenceBlockId: string;
  blockId: string;
  name: string;
  category: { id: string; name: string; color: string };
  type: "static_image" | "video" | "dynamic_template";
  fitMode: string;
  durationSeconds: number;
  // Rendering payload — shape depends on block type.
  staticImage?: { url: string };
  video?: { url: string };
};

/**
 * Resolves a sequence into an ordered play-list of currently-eligible
 * blocks (PRD §5). Dynamic/multi-item expansion is a Phase 2 concern
 * (once WordPress-backed dynamic blocks exist) — Phase 1 covers
 * static_image and video blocks only.
 */
export async function resolveSequence(sequenceId: string): Promise<ResolvedItem[]> {
  const sequence = await db.query.sequences.findFirst({
    where: (sequences, { eq }) => eq(sequences.id, sequenceId),
    with: {
      blocks: {
        orderBy: (sequenceBlocks, { asc }) => [asc(sequenceBlocks.position)],
        with: {
          block: {
            with: {
              category: true,
              staticImage: { with: { imageAsset: true } },
              video: { with: { videoAsset: true } },
            },
          },
        },
      },
    },
  });

  if (!sequence) return [];

  const now = new Date();
  const items: ResolvedItem[] = [];

  for (const sb of sequence.blocks) {
    const block = sb.block;
    if (!isBlockEligible(block, now)) continue;
    if (block.status === "archived" || block.status === "draft") continue;

    if (block.type === "static_image" && block.staticImage) {
      items.push({
        sequenceBlockId: sb.id,
        blockId: block.id,
        name: block.name,
        category: block.category,
        type: "static_image",
        fitMode: block.fitMode,
        durationSeconds: block.durationSeconds ?? block.category.defaultDurationSeconds,
        staticImage: { url: block.staticImage.imageAsset.filePath },
      });
    } else if (block.type === "video" && block.video) {
      items.push({
        sequenceBlockId: sb.id,
        blockId: block.id,
        name: block.name,
        category: block.category,
        type: "video",
        fitMode: block.fitMode,
        durationSeconds: block.video.durationSeconds,
        video: { url: block.video.videoAsset.filePath },
      });
    }
    // dynamic_template expansion lands in Phase 2 alongside the
    // WordPress data-source sync (PRD §6, §3.4).
  }

  return items;
}
