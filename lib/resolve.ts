import { db } from "@/db";
import { isBlockEligible } from "./scheduling";
import { fetchWordPressEvents, bestEventImageUrl, formatEventWhen, type WpEvent } from "./wordpress";

export type FormattedEvent = {
  id: number;
  title: string;
  excerpt: string;
  weekday: string;
  date: string;
  timeRange: string;
  imageUrl: string | null;
};

export type ResolvedItem = {
  sequenceBlockId: string;
  blockId: string;
  name: string;
  category: { id: string; name: string; color: string };
  type: "static_image" | "video" | "wordpress_events";
  fitMode: string;
  durationSeconds: number;
  // Rendering payload — shape depends on block type.
  staticImage?: { url: string };
  video?: { url: string };
  // For wordpress_events, `durationSeconds` is the per-event duration —
  // the player runs its own internal carousel over `events` before
  // advancing to the next item in the sequence.
  wordpressEvents?: { listLabel: string | null; events: FormattedEvent[] };
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&#039;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`;
}

function formatEvent(event: WpEvent): FormattedEvent {
  const { weekday, date, timeRange } = formatEventWhen(event);
  // The Events Calendar leaves `excerpt` empty unless the organizer sets a
  // manual excerpt — most events on this site don't, so fall back to the
  // (much longer, HTML) description, stripped and trimmed to a display length.
  const excerptSource = event.excerpt && event.excerpt.trim() ? event.excerpt : event.description ?? "";
  return {
    id: event.id,
    title: event.title,
    excerpt: truncate(stripHtml(excerptSource), 280),
    weekday,
    date,
    timeRange,
    imageUrl: bestEventImageUrl(event),
  };
}

/**
 * Resolves a sequence into an ordered play-list of currently-eligible
 * blocks (PRD §5). `dynamic_template` blocks backed by a `wordpress_events`
 * data source are live-fetched here at resolve time and rendered by the
 * built-in Events Carousel renderer on `/player` (PRD §3.4/§6.8, first
 * slice — the general user-authored template engine of §3.6 is still
 * unbuilt).
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
              dynamic: { with: { dataSource: true } },
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
    } else if (block.type === "dynamic_template" && block.dynamic && block.dynamic.dataSource.type === "wordpress_events") {
      try {
        let baseUrl: string | undefined;
        try {
          baseUrl = JSON.parse(block.dynamic.dataSource.config)?.base_url;
        } catch {
          // fall through to env default below
        }
        baseUrl = baseUrl || process.env.WORDPRESS_BASE_URL;
        if (!baseUrl) continue;

        const rawEvents = await fetchWordPressEvents(baseUrl, block.dynamic.maxItems);
        const events = rawEvents.slice(0, block.dynamic.maxItems).map(formatEvent);
        if (events.length === 0) continue;

        items.push({
          sequenceBlockId: sb.id,
          blockId: block.id,
          name: block.name,
          category: block.category,
          type: "wordpress_events",
          fitMode: block.fitMode,
          durationSeconds: block.dynamic.perItemDuration,
          wordpressEvents: { listLabel: block.dynamic.listLabel, events },
        });
      } catch {
        // Data source unreachable — skip this block for this cycle rather
        // than breaking the whole sequence (PRD §8 reliability).
        continue;
      }
    }
  }

  return items;
}
