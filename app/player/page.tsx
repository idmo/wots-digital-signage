"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedItem } from "@/lib/resolve";
import { TEMPLATE_LAYOUTS } from "@/lib/templates";

const RESOLVE_POLL_MS = 5 * 60 * 1000; // PRD §5 — re-resolve every 5 minutes

const FIT_CLASS: Record<string, string> = {
  cover: "object-cover",
  contain: "object-contain",
  contain_blurred: "object-contain",
};

export default function PlayerPage() {
  const [items, setItems] = useState<ResolvedItem[]>([]);
  const [index, setIndex] = useState(0);
  const [eventIndex, setEventIndex] = useState(0);
  const [sequenceName, setSequenceName] = useState<string | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/player/live", { cache: "no-store" });
      const data = await res.json();
      setSequenceName(data.sequence?.name ?? null);
      setItems(data.items ?? []);
    } catch {
      // Network hiccup — keep showing whatever's already loaded (PRD §8 reliability).
    }
  }, []);

  // Initial load + periodic re-resolve.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data load
    fetchLive();
    const poll = setInterval(fetchLive, RESOLVE_POLL_MS);
    return () => clearInterval(poll);
  }, [fetchLive]);

  // Keep index in range if the resolved list shrinks.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clamping to a shrunk list, not deriving fresh state
    if (index >= items.length) setIndex(0);
  }, [items, index]);

  const current = items[index];

  // Reset the internal event-carousel position whenever we land on a new
  // wordpress_events block (or leave one).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting sub-carousel position on block change
    setEventIndex(0);
  }, [index]);

  const isEventsCarousel = current?.type === "wordpress_events" && current.wordpressEvents?.mode === "carousel";
  const isBulletinCarousel = current?.type === "bulletin_board" && current.bulletinBoard?.mode === "carousel";
  const isFeaturedReadersCarousel =
    current?.type === "featured_readers" && current.featuredReaders?.mode === "carousel";

  // Single timer owner for advancing playback — video, an events carousel,
  // a bulletin board carousel, and everything else (static blocks, list-mode
  // events/bulletin blocks) each need a different advance rule, but they all
  // share one `advanceTimer` ref, so all that logic has to live in ONE
  // effect. Splitting it across multiple effects on the same ref is a bug:
  // each effect unconditionally clears the ref on every run (its own cleanup
  // *and* its "does this apply to me" guard both clear first), so whichever
  // effect runs last on a given render cancels the timer an earlier effect
  // just set, even when the later effect has nothing to do.
  useEffect(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (!current || current.type === "video") return;

    if (isEventsCarousel && current.wordpressEvents) {
      const events = current.wordpressEvents.events;
      advanceTimer.current = setTimeout(() => {
        if (eventIndex + 1 >= events.length) {
          setIndex((i) => (items.length ? (i + 1) % items.length : 0));
        } else {
          setEventIndex((i) => i + 1);
        }
      }, current.durationSeconds * 1000);
    } else if (isBulletinCarousel && current.bulletinBoard) {
      const board = current.bulletinBoard.items;
      advanceTimer.current = setTimeout(() => {
        if (eventIndex + 1 >= board.length) {
          setIndex((i) => (items.length ? (i + 1) % items.length : 0));
        } else {
          setEventIndex((i) => i + 1);
        }
      }, current.durationSeconds * 1000);
    } else if (isFeaturedReadersCarousel && current.featuredReaders) {
      const readers = current.featuredReaders.readers;
      advanceTimer.current = setTimeout(() => {
        if (eventIndex + 1 >= readers.length) {
          setIndex((i) => (items.length ? (i + 1) % items.length : 0));
        } else {
          setEventIndex((i) => i + 1);
        }
      }, current.durationSeconds * 1000);
    } else {
      // Static block, or a "list" mode events/bulletin/featured-readers
      // block — no internal cycling, just advance to the next sequence item
      // after its duration.
      advanceTimer.current = setTimeout(() => {
        setIndex((i) => (items.length ? (i + 1) % items.length : 0));
      }, current.durationSeconds * 1000);
    }

    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [current, isEventsCarousel, isBulletinCarousel, isFeaturedReadersCarousel, eventIndex, items.length]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        {!current && (
          <p className="text-white/60 text-xl">
            {sequenceName ? "No eligible content in this sequence right now." : "No live sequence is set."}
          </p>
        )}

        {current?.type === "static_image" && current.staticImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.sequenceBlockId}
            src={current.staticImage.url}
            alt={current.name}
            className={`h-full w-full ${FIT_CLASS[current.fitMode] ?? "object-cover"}`}
          />
        )}

        {current?.type === "video" && current.video && (
          <video
            key={current.sequenceBlockId}
            src={current.video.url}
            className={`h-full w-full ${FIT_CLASS[current.fitMode] ?? "object-cover"}`}
            autoPlay
            muted
            playsInline
            onEnded={() => setIndex((i) => (items.length ? (i + 1) % items.length : 0))}
          />
        )}

        {current?.type === "wordpress_events" && current.wordpressEvents?.mode === "carousel" && (
          <EventsCarouselSlide
            event={current.wordpressEvents.events[eventIndex]}
            panel={current.wordpressEvents}
            template={current.wordpressEvents.template}
          />
        )}

        {current?.type === "wordpress_events" && current.wordpressEvents?.mode === "list" && (
          <EventsListSlide
            label={current.wordpressEvents.listLabel}
            events={current.wordpressEvents.events}
            panel={current.wordpressEvents}
          />
        )}

        {current?.type === "bulletin_board" && current.bulletinBoard?.mode === "carousel" && (
          <BulletinBoardSlide
            item={current.bulletinBoard.items[eventIndex]}
            panel={current.bulletinBoard}
            template={current.bulletinBoard.template}
          />
        )}

        {current?.type === "bulletin_board" && current.bulletinBoard?.mode === "list" && (
          <BulletinBoardListSlide
            label={current.bulletinBoard.listLabel}
            items={current.bulletinBoard.items}
            panel={current.bulletinBoard}
          />
        )}

        {current?.type === "featured_readers" && current.featuredReaders?.mode === "carousel" && (
          <FeaturedReaderSlide
            reader={current.featuredReaders.readers[eventIndex]}
            panel={current.featuredReaders}
            template={current.featuredReaders.template}
          />
        )}

        {current?.type === "featured_readers" && current.featuredReaders?.mode === "list" && (
          <FeaturedReaderListSlide
            label={current.featuredReaders.listLabel}
            readers={current.featuredReaders.readers}
            panel={current.featuredReaders}
          />
        )}
      </div>
    </div>
  );
}

type DynamicPanelStyle = import("@/lib/resolve").DynamicPanelStyle;

/** #rrggbb (or #rgb) + a 0-100 opacity percentage -> an rgba() string. */
function hexToRgba(hex: string, opacityPercent: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const int = parseInt(full, 16);
  const r = Number.isNaN(int) ? 0 : (int >> 16) & 255;
  const g = Number.isNaN(int) ? 0 : (int >> 8) & 255;
  const b = Number.isNaN(int) ? 0 : int & 255;
  const a = Math.min(100, Math.max(0, opacityPercent)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Shared frame for the built-in WordPress renderers (Events, Bulletin
 * Board): a full-bleed background image (uploaded once per block — a
 * WordPress featured image is usually too busy/inconsistent for signage)
 * behind a padded, tinted panel that's vertically centered on the stage.
 * `children` is whatever that block's carousel/list content looks like.
 */
function DynamicPanel({
  style,
  wide,
  children,
}: {
  style: DynamicPanelStyle;
  /** List slides run taller (they show several items) than a single-item carousel card. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
      {style.backgroundImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={style.backgroundImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div
        className={`relative w-[85%] max-w-[1700px] rounded-2xl px-16 py-12 text-white overflow-hidden ${
          wide ? "max-h-[80%] flex flex-col" : ""
        }`}
        style={{ backgroundColor: hexToRgba(style.divBackgroundColor, style.divBackgroundOpacity) }}
      >
        {children}
      </div>
    </div>
  );
}

/** The text-3/4 + QR-1/4 split used by both single-item carousel slides. QR
 * codes need real contrast to scan, so it always sits on its own white
 * card regardless of the panel's tint. */
function QrColumn({ qrCodeDataUrl, caption }: { qrCodeDataUrl: string; caption: string }) {
  return (
    <div className="w-1/4 flex flex-col items-center justify-center gap-3 shrink-0">
      <div className="bg-white p-3 rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrCodeDataUrl} alt={caption} className="w-full h-auto block" />
      </div>
      <span className="text-lg text-white/80 text-center">{caption}</span>
    </div>
  );
}

/** The item's own WordPress featured image — a banner spanning the full
 * panel width, above the text/QR row (distinct from the block-level
 * background image behind the whole panel). */
function FeaturedImageBanner({ imageUrl, alt }: { imageUrl: string; alt: string }) {
  return (
    <div className="w-full aspect-video rounded-xl overflow-hidden mb-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={alt} className="w-full h-full object-cover" />
    </div>
  );
}

type ResolvedTemplate = import("@/lib/resolve").ResolvedTemplate;
type ElementValue = import("@/lib/templates").ElementValue;

/**
 * Renders a block's drag-and-drop custom template (admin/templates) for one
 * item: a CSS Grid matching the chosen layout, with each region's assigned
 * content elements stacked in order. Sits inside the same DynamicPanel used
 * by the built-in slides, so background image / panel color+opacity still
 * apply — the template only controls what goes where inside the panel.
 */
function TemplateSlide({
  template,
  elements,
  panel,
}: {
  template: ResolvedTemplate;
  elements: Record<string, ElementValue>;
  panel: DynamicPanelStyle;
}) {
  const layoutDef = TEMPLATE_LAYOUTS[template.layout];
  return (
    <div
      className="grid gap-8 w-full"
      style={{
        // Explicit height (rather than h-full) since the panel around this
        // only caps its own height with max-h — a percentage height here
        // would otherwise have nothing definite to resolve against.
        height: "62vh",
        gridTemplateAreas: layoutDef.gridTemplateAreas,
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
      }}
    >
      {layoutDef.regions.map((regionId) => (
        <div
          key={regionId}
          style={{ gridArea: regionId }}
          className="min-w-0 min-h-0 flex flex-col justify-center gap-3 overflow-hidden"
        >
          {(template.regions[regionId] ?? []).map((key, i) => (
            <ElementRenderer key={`${regionId}-${key}-${i}`} elementKey={key} value={elements[key]} panel={panel} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ElementRenderer({
  elementKey,
  value,
  panel,
}: {
  elementKey: string;
  value: ElementValue | undefined;
  panel: DynamicPanelStyle;
}) {
  if (!value || value.value == null || value.value === "") return null;

  if (value.type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value.value} alt="" className="w-full h-full min-h-0 object-cover rounded-xl flex-1" />
    );
  }

  if (value.type === "qr") {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="bg-white p-3 rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.value} alt="QR code" className="w-full h-auto max-h-[40vh] block" />
        </div>
      </div>
    );
  }

  if (value.type === "html") {
    return (
      <div
        className="text-2xl leading-snug overflow-auto [&_p]:mb-3 [&_a]:underline"
        style={{ color: panel.bodyColor }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: value.value }}
      />
    );
  }

  // text — size/color by convention: title elements read large & titleColor,
  // date/org "meta" elements read medium & metaColor, everything else body.
  const isTitle = elementKey === "title";
  const isMeta = elementKey === "date_time" || elementKey === "organization";
  return (
    <p
      className={isTitle ? "text-[3.5rem] font-bold leading-tight" : isMeta ? "text-[2rem] font-medium" : "text-2xl leading-snug"}
      style={{ color: isTitle ? panel.titleColor : isMeta ? panel.metaColor : panel.bodyColor }}
    >
      {value.value}
    </p>
  );
}

function EventsCarouselSlide({
  event,
  panel,
  template,
}: {
  event: import("@/lib/resolve").FormattedEvent;
  panel: DynamicPanelStyle;
  template: ResolvedTemplate | null;
}) {
  if (!event) return null;
  if (template) {
    return (
      <DynamicPanel style={panel} wide>
        <TemplateSlide template={template} elements={event.elements} panel={panel} />
      </DynamicPanel>
    );
  }
  return (
    <DynamicPanel style={panel}>
      <div key={event.id}>
        {event.imageUrl && <FeaturedImageBanner imageUrl={event.imageUrl} alt={event.title} />}
        <div className="flex items-center gap-10">
          <div className={event.qrCodeDataUrl ? "w-3/4" : "w-full"}>
            <h1 className="text-[4rem] font-bold leading-tight mb-4" style={{ color: panel.titleColor }}>
              {event.title}
            </h1>
            <div className="text-[2.5rem] font-medium mb-3" style={{ color: panel.metaColor }}>
              {event.weekday}, {event.date} · {event.timeRange}
            </div>
            {event.excerpt && (
              <p className="text-[2rem] leading-snug" style={{ color: panel.bodyColor }}>
                {event.excerpt}
              </p>
            )}
          </div>
          {event.qrCodeDataUrl && <QrColumn qrCodeDataUrl={event.qrCodeDataUrl} caption="Scan for event details" />}
        </div>
      </div>
    </DynamicPanel>
  );
}

function BulletinBoardSlide({
  item,
  panel,
  template,
}: {
  item: import("@/lib/resolve").FormattedBulletinItem;
  panel: DynamicPanelStyle;
  template: ResolvedTemplate | null;
}) {
  if (!item) return null;
  if (template) {
    return (
      <DynamicPanel style={panel} wide>
        <TemplateSlide template={template} elements={item.elements} panel={panel} />
      </DynamicPanel>
    );
  }
  return (
    <DynamicPanel style={panel}>
      <div key={item.id}>
        {item.imageUrl && <FeaturedImageBanner imageUrl={item.imageUrl} alt={item.orgName} />}
        <div className="flex items-center gap-10">
          <div className={item.qrCodeDataUrl ? "w-3/4" : "w-full"}>
            <h1 className="text-[4rem] font-bold leading-tight mb-4" style={{ color: panel.titleColor }}>
              {item.orgName}
            </h1>
            <p className="text-[2.25rem] leading-snug whitespace-pre-line" style={{ color: panel.bodyColor }}>
              {item.body}
            </p>
          </div>
          {item.qrCodeDataUrl && <QrColumn qrCodeDataUrl={item.qrCodeDataUrl} caption="Scan to learn more" />}
        </div>
      </div>
    </DynamicPanel>
  );
}

function EventsListSlide({
  label,
  events,
  panel,
}: {
  label: string | null;
  events: import("@/lib/resolve").FormattedEvent[];
  panel: DynamicPanelStyle;
}) {
  return (
    <DynamicPanel style={panel} wide>
      {label && (
        <h1 className="text-5xl font-bold mb-8 shrink-0" style={{ color: panel.titleColor }}>
          {label}
        </h1>
      )}
      <div className="flex-1 flex flex-col justify-center gap-5 min-h-0 overflow-hidden">
        {events.map((event) => (
          <div key={event.id} className="flex items-baseline gap-8 border-b border-white/30 pb-4">
            <div className="text-xl w-72 shrink-0" style={{ color: panel.metaColor }}>
              {event.weekday}, {event.date} · {event.timeRange}
            </div>
            <div className="text-3xl font-semibold truncate" style={{ color: panel.titleColor }}>
              {event.title}
            </div>
          </div>
        ))}
        {events.length === 0 && <p className="text-xl text-white/70">No upcoming events.</p>}
      </div>
    </DynamicPanel>
  );
}

function BulletinBoardListSlide({
  label,
  items,
  panel,
}: {
  label: string | null;
  items: import("@/lib/resolve").FormattedBulletinItem[];
  panel: DynamicPanelStyle;
}) {
  return (
    <DynamicPanel style={panel} wide>
      {label && (
        <h1 className="text-5xl font-bold mb-8 shrink-0" style={{ color: panel.titleColor }}>
          {label}
        </h1>
      )}
      <div className="flex-1 flex flex-col justify-center gap-6 min-h-0 overflow-hidden">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-8 border-b border-white/30 pb-4">
            <div className="text-2xl font-semibold w-72 shrink-0" style={{ color: panel.titleColor }}>
              {item.orgName}
            </div>
            <div className="text-xl line-clamp-2" style={{ color: panel.bodyColor }}>
              {item.body}
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-xl text-white/70">No current postings.</p>}
      </div>
    </DynamicPanel>
  );
}

/** Small circular photo + name byline crediting the reader who recommended
 * the book — shown above the blurb so the book (not the reader) still
 * leads the slide. */
function ReaderByline({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt={name} className="w-12 h-12 rounded-full object-cover shrink-0" />
      )}
      <span className="text-xl text-white/80">Recommended by {name}</span>
    </div>
  );
}

function FeaturedReaderSlide({
  reader,
  panel,
  template,
}: {
  reader: import("@/lib/resolve").FormattedFeaturedReader;
  panel: DynamicPanelStyle;
  template: ResolvedTemplate | null;
}) {
  if (!reader) return null;
  if (template) {
    return (
      <DynamicPanel style={panel} wide>
        <TemplateSlide template={template} elements={reader.elements} panel={panel} />
      </DynamicPanel>
    );
  }
  return (
    <DynamicPanel style={panel}>
      <div key={reader.id}>
        {reader.bookCoverUrl && <FeaturedImageBanner imageUrl={reader.bookCoverUrl} alt={reader.bookTitle} />}
        <div className="flex items-center gap-10">
          <div className={reader.qrCodeDataUrl ? "w-3/4" : "w-full"}>
            <h1 className="text-[4rem] font-bold leading-tight mb-2" style={{ color: panel.titleColor }}>
              {reader.bookTitle}
            </h1>
            {reader.bookAuthor && (
              <div className="text-[2rem] font-medium mb-4" style={{ color: panel.metaColor }}>
                {reader.bookAuthor}
              </div>
            )}
            <ReaderByline name={reader.readerName} photoUrl={reader.readerPhotoUrl} />
            {reader.blurbHtml && (
              <div
                className="text-[1.75rem] leading-snug [&_p]:mb-3"
                style={{ color: panel.bodyColor }}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: reader.blurbHtml }}
              />
            )}
          </div>
          {reader.qrCodeDataUrl && <QrColumn qrCodeDataUrl={reader.qrCodeDataUrl} caption="Scan to shop this book" />}
        </div>
      </div>
    </DynamicPanel>
  );
}

function FeaturedReaderListSlide({
  label,
  readers,
  panel,
}: {
  label: string | null;
  readers: import("@/lib/resolve").FormattedFeaturedReader[];
  panel: DynamicPanelStyle;
}) {
  return (
    <DynamicPanel style={panel} wide>
      {label && (
        <h1 className="text-5xl font-bold mb-8 shrink-0" style={{ color: panel.titleColor }}>
          {label}
        </h1>
      )}
      <div className="flex-1 flex flex-col justify-center gap-5 min-h-0 overflow-hidden">
        {readers.map((reader) => (
          <div key={reader.id} className="flex items-baseline gap-8 border-b border-white/30 pb-4">
            <div className="text-xl w-72 shrink-0" style={{ color: panel.metaColor }}>
              {reader.readerName}
            </div>
            <div className="text-3xl font-semibold truncate" style={{ color: panel.titleColor }}>
              {reader.bookTitle}
              {reader.bookAuthor && <span className="font-normal"> — {reader.bookAuthor}</span>}
            </div>
          </div>
        ))}
        {readers.length === 0 && <p className="text-xl text-white/70">No Featured Readers this month.</p>}
      </div>
    </DynamicPanel>
  );
}
