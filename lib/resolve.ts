import { db } from "@/db";
import { isBlockEligible } from "./scheduling";
import { fetchWordPressEvents, bestEventImageUrl, formatEventWhen, type WpEvent } from "./wordpress";
import {
  fetchBulletinBoardItems,
  isBulletinBoardItemApproved,
  isBulletinBoardItemEligible,
  bulletinBoardImageUrl,
  type WpBulletinBoardItem,
} from "./wordpress";
import { fetchFeaturedReaders, type WpFeaturedReaderEntry } from "./wordpress";
import { generateQrDataUrl } from "./qr";
import { isLayoutId, type ElementValue, type LayoutId, type TemplateRegions } from "./templates";

export type FormattedEvent = {
  id: number;
  title: string;
  excerpt: string;
  weekday: string;
  date: string;
  timeRange: string;
  // The event's own WordPress featured image, shown as a banner above the
  // text/QR row (distinct from the block-level background image).
  imageUrl: string | null;
  // QR linking to the event's own page on WordPress, when it has one.
  qrCodeDataUrl: string | null;
  // Same data, reshaped into the named/typed elements the drag-and-drop
  // template builder (lib/templates.ts) offers for wordpress_events. Always
  // computed (cheap) so a block can be switched to a custom template
  // without re-fetching.
  elements: Record<string, ElementValue>;
};

export type FormattedBulletinItem = {
  id: number;
  orgName: string;
  body: string;
  imageUrl: string | null;
  qrCodeDataUrl: string | null;
  elements: Record<string, ElementValue>;
};

export type FormattedFeaturedReader = {
  id: number;
  readerId: number;
  readerName: string;
  readerPhotoUrl: string | null;
  bookTitle: string;
  bookAuthor: string | null;
  bookCoverUrl: string | null;
  blurbHtml: string;
  qrCodeDataUrl: string | null;
  elements: Record<string, ElementValue>;
};

// The "list of lists" grouping for Featured Readers' list display mode: one
// group per reader (in case more than one is featured this period), each
// holding that reader's own recommendation(s). Consecutive entries in a
// carousel's flat `readers` array share this same grouping/ordering — see
// groupEntriesByReader below — so a carousel naturally plays through one
// reader's recommendations before moving to the next reader.
export type FormattedFeaturedReaderGroup = {
  readerId: number;
  readerName: string;
  readerPhotoUrl: string | null;
  recommendations: FormattedFeaturedReader[];
};

// A block's chosen drag-and-drop layout (lib/templates.ts), resolved and
// ready for the player's TemplateSlide renderer. Only applies to carousel
// mode — list mode keeps the built-in compact multi-item renderer.
export type ResolvedTemplate = {
  layout: LayoutId;
  regions: TemplateRegions;
};

// Shared "built-in renderer" panel settings for a WordPress-sourced dynamic
// block (Events or Bulletin Board) — set once per block. See DynamicPanel
// in app/player. metaColor is only used by the Events renderer's
// weekday/date/time line.
export type DynamicPanelStyle = {
  backgroundImageUrl: string | null;
  divBackgroundColor: string;
  divBackgroundOpacity: number;
  titleColor: string;
  bodyColor: string;
  metaColor: string;
};

export type ResolvedItem = {
  sequenceBlockId: string;
  blockId: string;
  name: string;
  category: { id: string; name: string; color: string };
  type: "static_image" | "video" | "wordpress_events" | "bulletin_board" | "featured_readers";
  fitMode: string;
  durationSeconds: number;
  // Rendering payload — shape depends on block type.
  staticImage?: { url: string };
  video?: { url: string };
  // For wordpress_events: in "carousel" mode, `durationSeconds` is the
  // per-event duration and the player runs its own internal carousel over
  // `events` before advancing to the next item in the sequence. In "list"
  // mode, `durationSeconds` is how long the whole list is shown before
  // advancing (like a static block).
  wordpressEvents?: { mode: "carousel" | "list"; listLabel: string | null; events: FormattedEvent[]; template: ResolvedTemplate | null } & DynamicPanelStyle;
  // For bulletin_board: same carousel/list semantics as wordpressEvents
  // above, but over Community Bulletin Board postings.
  bulletinBoard?: { mode: "carousel" | "list"; listLabel: string | null; items: FormattedBulletinItem[]; template: ResolvedTemplate | null } & DynamicPanelStyle;
  // For featured_readers: same carousel/list semantics again, over this
  // month's (or a pinned month's) Feature Period recommendations.
  featuredReaders?: {
    mode: "carousel" | "list";
    listLabel: string | null;
    // Flat, one-slide-per-recommendation — grouped so a given reader's
    // recommendations are consecutive — used by carousel mode.
    readers: FormattedFeaturedReader[];
    // The same data nested by reader — "a list of featured readers, each
    // with a list of their recommendations" — used by list mode.
    readerGroups: FormattedFeaturedReaderGroup[];
    template: ResolvedTemplate | null;
  } & DynamicPanelStyle;
};

// Common named HTML entities WordPress content actually uses. Anything else
// numeric (&#8217; / &#x2019; etc.) is decoded generically below rather than
// needing its own line here.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
};

/** Decodes HTML entities (named + numeric/hex) in a single pass so text like
 * titles and excerpts — which come from WordPress as encoded HTML — render
 * their real characters (e.g. "Books &amp; Bites" -> "Books & Bites"). */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`;
}

// Rendering raw WordPress HTML (content_html elements) via
// dangerouslySetInnerHTML is only safe because it's Brian's own site's
// trusted content (and Bulletin Board postings are already gated on
// `approved`) — strip <script>/<style> tags as a defensive minimum anyway.
function sanitizeHtmlFragment(html: string): string {
  return html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
}

async function formatEvent(event: WpEvent, blockName: string): Promise<FormattedEvent> {
  const { weekday, date, timeRange } = formatEventWhen(event);
  // The Events Calendar leaves `excerpt` empty unless the organizer sets a
  // manual excerpt — most events on this site don't, so fall back to the
  // (much longer, HTML) description, stripped and trimmed to a display length.
  const excerptSource = event.excerpt && event.excerpt.trim() ? event.excerpt : event.description ?? "";
  const eventUrl = event.url?.trim();
  const title = decodeEntities(event.title);
  const imageUrl = bestEventImageUrl(event);
  const qrCodeDataUrl = eventUrl ? await generateQrDataUrl(eventUrl) : null;
  const dateTime = `${weekday}, ${date} · ${timeRange}`;

  return {
    id: event.id,
    // Titles come from WordPress as encoded HTML too (e.g. "Books &amp; Bites").
    title,
    excerpt: truncate(stripHtml(excerptSource), 280),
    weekday,
    date,
    timeRange,
    imageUrl,
    qrCodeDataUrl,
    elements: {
      block_name: { type: "text", value: blockName },
      featured_image: { type: "image", value: imageUrl },
      title: { type: "text", value: title },
      date_time: { type: "text", value: dateTime },
      excerpt: { type: "text", value: truncate(stripHtml(excerptSource), 280) },
      content_html: { type: "html", value: sanitizeHtmlFragment(excerptSource) },
      qr_code: { type: "qr", value: qrCodeDataUrl },
    },
  };
}

async function formatBulletinItem(item: WpBulletinBoardItem, blockName: string): Promise<FormattedBulletinItem> {
  const website = item.website?.trim();
  const orgName = decodeEntities(stripHtml(item.title?.rendered ?? ""));
  const imageUrl = bulletinBoardImageUrl(item);
  const qrCodeDataUrl = website ? await generateQrDataUrl(website) : null;
  const organization = item.organization?.trim() ? decodeEntities(item.organization.trim()) : null;

  return {
    id: item.id,
    orgName,
    body: truncate(stripHtml(item.content?.rendered ?? ""), 600),
    imageUrl,
    qrCodeDataUrl,
    elements: {
      block_name: { type: "text", value: blockName },
      featured_image: { type: "image", value: imageUrl },
      title: { type: "text", value: orgName },
      organization: { type: "text", value: organization },
      content_html: { type: "html", value: sanitizeHtmlFragment(item.content?.rendered ?? "") },
      qr_code: { type: "qr", value: qrCodeDataUrl },
    },
  };
}

async function formatFeaturedReader(entry: WpFeaturedReaderEntry, blockName: string): Promise<FormattedFeaturedReader> {
  const readerName = decodeEntities(entry.reader?.name ?? "");
  const bookTitle = decodeEntities(entry.book?.title ?? "");
  const bookAuthor = entry.book?.author?.trim() ? decodeEntities(entry.book.author.trim()) : null;
  const productUrl = entry.book?.product_url?.trim();
  const qrCodeDataUrl = productUrl ? await generateQrDataUrl(productUrl) : null;
  const blurbHtml = sanitizeHtmlFragment(entry.blurb ?? "");

  return {
    id: entry.id,
    readerId: entry.reader?.id ?? 0,
    readerName,
    readerPhotoUrl: entry.reader?.photo_url ?? null,
    bookTitle,
    bookAuthor,
    bookCoverUrl: entry.book?.cover_url ?? null,
    blurbHtml,
    qrCodeDataUrl,
    elements: {
      block_name: { type: "text", value: blockName },
      book_cover: { type: "image", value: entry.book?.cover_url ?? null },
      book_title: { type: "text", value: bookTitle },
      book_author: { type: "text", value: bookAuthor },
      reader_name: { type: "text", value: readerName },
      reader_photo: { type: "image", value: entry.reader?.photo_url ?? null },
      blurb_html: { type: "html", value: blurbHtml },
      qr_code: { type: "qr", value: qrCodeDataUrl },
    },
  };
}

/** Reorders raw Featured Reader entries so every recommendation from the
 * same reader is consecutive — first-seen reader order is preserved, and so
 * is each reader's own recommendation order. Applied before `maxItems` is
 * sliced so a reader's recommendations aren't split across the cutoff by an
 * unrelated reader's post landing in between. */
function groupEntriesByReader(entries: WpFeaturedReaderEntry[]): WpFeaturedReaderEntry[] {
  const readerOrder: number[] = [];
  const byReader = new Map<number, WpFeaturedReaderEntry[]>();
  for (const entry of entries) {
    const readerId = entry.reader?.id ?? 0;
    if (!byReader.has(readerId)) {
      byReader.set(readerId, []);
      readerOrder.push(readerId);
    }
    byReader.get(readerId)!.push(entry);
  }
  return readerOrder.flatMap((readerId) => byReader.get(readerId)!);
}

/** Nests an already reader-grouped, formatted list (see groupEntriesByReader)
 * into the "list of lists" shape list mode renders: one entry per reader,
 * each carrying that reader's recommendation(s). */
function groupFormattedReaders(readers: FormattedFeaturedReader[]): FormattedFeaturedReaderGroup[] {
  const groups: FormattedFeaturedReaderGroup[] = [];
  for (const reader of readers) {
    const last = groups[groups.length - 1];
    if (last && last.readerId === reader.readerId) {
      last.recommendations.push(reader);
    } else {
      groups.push({
        readerId: reader.readerId,
        readerName: reader.readerName,
        readerPhotoUrl: reader.readerPhotoUrl,
        recommendations: [reader],
      });
    }
  }
  return groups;
}

/** Parses a dynamic block's assigned template (if any) into the shape the
 * player renders. Falls back to null (built-in renderer) on any malformed
 * data rather than breaking the block's whole render. */
function resolveTemplate(
  dynamicTemplate: { layout: string; regions: string } | null | undefined
): ResolvedTemplate | null {
  if (!dynamicTemplate) return null;
  if (!isLayoutId(dynamicTemplate.layout)) return null;
  try {
    const regions = JSON.parse(dynamicTemplate.regions) as TemplateRegions;
    if (!regions || typeof regions !== "object") return null;
    return { layout: dynamicTemplate.layout, regions };
  } catch {
    return null;
  }
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
              dynamic: { with: { dataSource: true, backgroundImage: true, template: true } },
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
        const events = await Promise.all(
          rawEvents.slice(0, block.dynamic.maxItems).map((e) => formatEvent(e, block.name))
        );
        if (events.length === 0) continue;

        const mode = block.dynamic.displayMode === "list" ? "list" : "carousel";
        items.push({
          sequenceBlockId: sb.id,
          blockId: block.id,
          name: block.name,
          category: block.category,
          type: "wordpress_events",
          fitMode: block.fitMode,
          durationSeconds: block.dynamic.perItemDuration,
          wordpressEvents: {
            mode,
            listLabel: block.dynamic.listLabel,
            events,
            template: resolveTemplate(block.dynamic.template),
            backgroundImageUrl: block.dynamic.backgroundImage?.filePath ?? null,
            divBackgroundColor: block.dynamic.divBackgroundColor,
            divBackgroundOpacity: block.dynamic.divBackgroundOpacity,
            titleColor: block.dynamic.titleColor,
            bodyColor: block.dynamic.bodyColor,
            metaColor: block.dynamic.metaColor,
          },
        });
      } catch {
        // Data source unreachable — skip this block for this cycle rather
        // than breaking the whole sequence (PRD §8 reliability).
        continue;
      }
    } else if (
      block.type === "dynamic_template" &&
      block.dynamic &&
      block.dynamic.dataSource.type === "wordpress_bulletin_board"
    ) {
      try {
        let baseUrl: string | undefined;
        try {
          baseUrl = JSON.parse(block.dynamic.dataSource.config)?.base_url;
        } catch {
          // fall through to env default below
        }
        baseUrl = baseUrl || process.env.WORDPRESS_BASE_URL;
        if (!baseUrl) continue;

        const rawItems = await fetchBulletinBoardItems(baseUrl, block.dynamic.maxItems * 3);
        const eligible = rawItems
          .filter((i) => isBulletinBoardItemApproved(i))
          .filter((i) => isBulletinBoardItemEligible(i, now))
          .slice(0, block.dynamic.maxItems);
        if (eligible.length === 0) continue;

        const formatted = await Promise.all(eligible.map((it) => formatBulletinItem(it, block.name)));

        const mode = block.dynamic.displayMode === "list" ? "list" : "carousel";
        items.push({
          sequenceBlockId: sb.id,
          blockId: block.id,
          name: block.name,
          category: block.category,
          type: "bulletin_board",
          fitMode: block.fitMode,
          durationSeconds: block.dynamic.perItemDuration,
          bulletinBoard: {
            mode,
            listLabel: block.dynamic.listLabel,
            items: formatted,
            template: resolveTemplate(block.dynamic.template),
            backgroundImageUrl: block.dynamic.backgroundImage?.filePath ?? null,
            divBackgroundColor: block.dynamic.divBackgroundColor,
            divBackgroundOpacity: block.dynamic.divBackgroundOpacity,
            titleColor: block.dynamic.titleColor,
            bodyColor: block.dynamic.bodyColor,
            metaColor: block.dynamic.metaColor,
          },
        });
      } catch {
        continue;
      }
    } else if (
      block.type === "dynamic_template" &&
      block.dynamic &&
      block.dynamic.dataSource.type === "wordpress_featured_readers"
    ) {
      try {
        let baseUrl: string | undefined;
        try {
          baseUrl = JSON.parse(block.dynamic.dataSource.config)?.base_url;
        } catch {
          // fall through to env default below
        }
        baseUrl = baseUrl || process.env.WORDPRESS_BASE_URL;
        if (!baseUrl) continue;

        // A blank featuredMonthYear auto-resolves to "whatever month it is
        // right now" (server-side, by WordPress); a pinned value like
        // "September 2025" is matched — loosely, see the endpoint's
        // signage_parse_month_year — against each Reader's own "Featured
        // Month and Year" field.
        const period = block.dynamic.featuredMonthYear?.trim() || "current";
        const rawEntries = await fetchFeaturedReaders(baseUrl, period);
        const entries = groupEntriesByReader(rawEntries).slice(0, block.dynamic.maxItems);
        if (entries.length === 0) continue;

        const readers = await Promise.all(entries.map((e) => formatFeaturedReader(e, block.name)));
        const readerGroups = groupFormattedReaders(readers);

        const mode = block.dynamic.displayMode === "list" ? "list" : "carousel";
        items.push({
          sequenceBlockId: sb.id,
          blockId: block.id,
          name: block.name,
          category: block.category,
          type: "featured_readers",
          fitMode: block.fitMode,
          durationSeconds: block.dynamic.perItemDuration,
          featuredReaders: {
            mode,
            listLabel: block.dynamic.listLabel,
            readers,
            readerGroups,
            template: resolveTemplate(block.dynamic.template),
            backgroundImageUrl: block.dynamic.backgroundImage?.filePath ?? null,
            divBackgroundColor: block.dynamic.divBackgroundColor,
            divBackgroundOpacity: block.dynamic.divBackgroundOpacity,
            titleColor: block.dynamic.titleColor,
            bodyColor: block.dynamic.bodyColor,
            metaColor: block.dynamic.metaColor,
          },
        });
      } catch {
        continue;
      }
    }
  }

  return items;
}
