"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BlockTransition, ContentAnimation, ResolvedItem } from "@/lib/resolve";
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

  // Renders whichever slide `item` calls for at its `subIndex` (the
  // internal carousel position for events/bulletin-board/featured-readers
  // blocks in carousel mode — ignored otherwise). Pulled out of the JSX
  // return so the block-transition stage below (which needs to freeze a
  // *snapshot* of the previous block's last-rendered frame) can call it too.
  const renderSlide = (item: ResolvedItem, subIndex: number): React.ReactNode => {
    if (item.type === "static_image" && item.staticImage) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={item.sequenceBlockId}
          src={item.staticImage.url}
          alt={item.name}
          className={`h-full w-full ${FIT_CLASS[item.fitMode] ?? "object-cover"}`}
        />
      );
    }

    if (item.type === "video" && item.video) {
      return (
        <video
          key={item.sequenceBlockId}
          src={item.video.url}
          className={`h-full w-full ${FIT_CLASS[item.fitMode] ?? "object-cover"}`}
          autoPlay
          muted
          playsInline
          onEnded={() => setIndex((i) => (items.length ? (i + 1) % items.length : 0))}
        />
      );
    }

    if (item.type === "wordpress_events" && item.wordpressEvents?.mode === "carousel") {
      return (
        <EventsCarouselSlide
          event={item.wordpressEvents.events[subIndex]}
          panel={item.wordpressEvents}
          template={item.wordpressEvents.template}
          blockKey={item.sequenceBlockId}
        />
      );
    }

    if (item.type === "wordpress_events" && item.wordpressEvents?.mode === "list") {
      return (
        <EventsListSlide
          label={item.wordpressEvents.listLabel}
          events={item.wordpressEvents.events}
          panel={item.wordpressEvents}
          blockKey={item.sequenceBlockId}
        />
      );
    }

    if (item.type === "bulletin_board" && item.bulletinBoard?.mode === "carousel") {
      return (
        <BulletinBoardSlide
          item={item.bulletinBoard.items[subIndex]}
          panel={item.bulletinBoard}
          template={item.bulletinBoard.template}
          blockKey={item.sequenceBlockId}
        />
      );
    }

    if (item.type === "bulletin_board" && item.bulletinBoard?.mode === "list") {
      return (
        <BulletinBoardListSlide
          label={item.bulletinBoard.listLabel}
          items={item.bulletinBoard.items}
          panel={item.bulletinBoard}
          blockKey={item.sequenceBlockId}
        />
      );
    }

    if (item.type === "featured_readers" && item.featuredReaders?.mode === "carousel") {
      return (
        <FeaturedReaderSlide
          reader={item.featuredReaders.readers[subIndex]}
          panel={item.featuredReaders}
          template={item.featuredReaders.template}
          blockKey={item.sequenceBlockId}
        />
      );
    }

    if (item.type === "featured_readers" && item.featuredReaders?.mode === "list") {
      return (
        <FeaturedReaderListSlide
          label={item.featuredReaders.listLabel}
          readerGroups={item.featuredReaders.readerGroups}
          panel={item.featuredReaders}
          blockKey={item.sequenceBlockId}
        />
      );
    }

    return null;
  };

  const currentNode = current ? (
    renderSlide(current, eventIndex)
  ) : (
    <p className="text-white/60 text-xl">
      {sequenceName ? "No eligible content in this sequence right now." : "No live sequence is set."}
    </p>
  );

  // Block-to-block transition (PRD "transitions and animations" work):
  // whenever the *block* changes (a new sequenceBlockId — not just a
  // carousel sub-item advance within the same block), freeze the last frame
  // that was on screen as an "outgoing" layer underneath the fresh
  // "incoming" one, using the transition style/duration the block being
  // brought on screen carries (its own override, or the app-wide default —
  // both already resolved server-side onto `current.blockTransition`).
  type OutgoingLayer = { key: string; node: React.ReactNode; transition: BlockTransition; durationMs: number };
  const [outgoing, setOutgoing] = useState<OutgoingLayer | null>(null);
  const [prevBlockKey, setPrevBlockKey] = useState<string | null>(null);
  const prevNodeRef = useRef<React.ReactNode>(null);

  // Adjusting state during render (React's documented pattern for "storing
  // information from previous renders") rather than in a useEffect — an
  // effect runs one render *after* `current` has already flipped, so the
  // freshly-mounted incoming StageLayer would see `outgoing` still null on
  // that first render, permanently lock in "no transition" as its starting
  // point (its `entered` state initializes once, on mount), and only
  // observe the real transition style a render too late to animate from.
  // Computing it inline here means both layers mount already knowing the
  // right transition on the very first render where the new block appears.
  const blockKey = current?.sequenceBlockId ?? "__empty__";
  if (blockKey !== prevBlockKey) {
    const style = current?.blockTransition ?? "cut";
    const durationMs = current?.blockTransitionDurationMs ?? 0;
    if (prevBlockKey !== null && style !== "cut" && durationMs > 0) {
      setOutgoing({ key: prevBlockKey, node: prevNodeRef.current, transition: style, durationMs });
    } else {
      setOutgoing(null);
    }
    setPrevBlockKey(blockKey);
  }

  // Always keep the latest rendered frame around (after every commit) so
  // that whenever the block next changes, the render-phase check above has
  // the true last-seen frame of the outgoing block ready — including the
  // final carousel sub-item shown, not just its first one.
  useEffect(() => {
    prevNodeRef.current = currentNode;
  });

  // Once an outgoing layer's own transition has had time to finish, drop it
  // — it's been fully covered by the incoming layer for a while by then.
  useEffect(() => {
    if (!outgoing) return;
    const timer = setTimeout(() => setOutgoing(null), outgoing.durationMs);
    return () => clearTimeout(timer);
  }, [outgoing]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {outgoing && (
        <StageLayer key={outgoing.key} role="outgoing" transition={outgoing.transition} durationMs={outgoing.durationMs}>
          {outgoing.node}
        </StageLayer>
      )}
      <StageLayer
        key={blockKey}
        role="incoming"
        transition={outgoing ? outgoing.transition : "cut"}
        durationMs={outgoing?.durationMs ?? 0}
      >
        {currentNode}
      </StageLayer>
    </div>
  );
}

const BLOCK_TRANSITION_STYLES: Record<
  Exclude<BlockTransition, "cut">,
  { incoming: { from: React.CSSProperties; to: React.CSSProperties }; outgoing: { from: React.CSSProperties; to: React.CSSProperties } }
> = {
  crossfade: {
    incoming: { from: { opacity: 0 }, to: { opacity: 1 } },
    outgoing: { from: { opacity: 1 }, to: { opacity: 0 } },
  },
  slide: {
    incoming: { from: { opacity: 1, transform: "translateX(100%)" }, to: { opacity: 1, transform: "translateX(0%)" } },
    outgoing: { from: { opacity: 1, transform: "translateX(0%)" }, to: { opacity: 1, transform: "translateX(-100%)" } },
  },
  zoom: {
    incoming: { from: { opacity: 0, transform: "scale(0.92)" }, to: { opacity: 1, transform: "scale(1)" } },
    outgoing: { from: { opacity: 1, transform: "scale(1)" }, to: { opacity: 0, transform: "scale(1.08)" } },
  },
};

/**
 * One full-screen layer of the block-transition stage — either the
 * "incoming" (new) block or a frozen "outgoing" (previous) block's last
 * frame. For `transition === "cut"` it's just a plain, unanimated layer
 * (today's instant-swap behavior). Otherwise it starts at its style's
 * `from` position and flips to `to` one frame after mount, which is what
 * actually triggers the CSS transition.
 */
function StageLayer({
  role,
  transition,
  durationMs,
  children,
}: {
  role: "incoming" | "outgoing";
  transition: BlockTransition;
  durationMs: number;
  children: React.ReactNode;
}) {
  const [entered, setEntered] = useState(transition === "cut");

  useEffect(() => {
    if (transition === "cut") return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [transition]);

  const style: React.CSSProperties =
    transition === "cut"
      ? {}
      : {
          ...(entered ? BLOCK_TRANSITION_STYLES[transition][role].to : BLOCK_TRANSITION_STYLES[transition][role].from),
          transitionProperty: "opacity, transform",
          transitionDuration: `${durationMs}ms`,
          transitionTimingFunction: "ease-in-out",
        };

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ zIndex: role === "incoming" ? 2 : 1, ...style }}
    >
      {children}
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

const CONTENT_ANIM_CLASS: Record<ContentAnimation, string> = {
  none: "",
  fade: "content-anim-fade",
  slide: "content-anim-slide",
  zoom: "content-anim-zoom",
};

/**
 * Shared frame for the built-in WordPress renderers (Events, Bulletin
 * Board): a full-bleed background image (uploaded once per block — a
 * WordPress featured image is usually too busy/inconsistent for signage)
 * behind a padded, tinted panel that's vertically centered on the stage.
 * `children` is whatever that block's carousel/list content looks like.
 *
 * The panel itself — NOT the background image behind it — is what plays
 * the content-level entrance animation (`style.contentAnimation`): it's
 * wrapped in a div keyed by `contentKey`, so remounting on a new key (a new
 * carousel item, or a fresh block) replays the CSS animation automatically.
 */
function DynamicPanel({
  style,
  wide,
  contentKey,
  children,
}: {
  style: DynamicPanelStyle;
  /** List slides run taller (they show several items) than a single-item carousel card. */
  wide?: boolean;
  /** Changes whenever the content inside should replay its entrance
   * animation — a new carousel item's id, or the whole block's id for
   * list mode. */
  contentKey: string;
  children: React.ReactNode;
}) {
  const animClass = CONTENT_ANIM_CLASS[style.contentAnimation] ?? "";
  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
      {style.backgroundImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={style.backgroundImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div
        key={contentKey}
        className={`relative w-[85%] max-w-[1700px] rounded-2xl px-16 py-12 text-white overflow-hidden ${
          wide ? "max-h-[80%] flex flex-col" : ""
        } ${animClass}`}
        style={{
          backgroundColor: hexToRgba(style.divBackgroundColor, style.divBackgroundOpacity),
          animationDuration: `${style.contentAnimationDurationMs}ms`,
        }}
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
  // date/org/block-name "meta" elements read medium & metaColor, everything
  // else body. block_name reads as meta rather than title so it doesn't
  // visually compete with the item's own title when both are on screen.
  const isTitle = elementKey === "title";
  const isMeta = elementKey === "date_time" || elementKey === "organization" || elementKey === "block_name";
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
  blockKey,
}: {
  event: import("@/lib/resolve").FormattedEvent;
  panel: DynamicPanelStyle;
  template: ResolvedTemplate | null;
  blockKey: string;
}) {
  if (!event) return null;
  const contentKey = `${blockKey}:${event.id}`;
  if (template) {
    return (
      <DynamicPanel style={panel} wide contentKey={contentKey}>
        <TemplateSlide template={template} elements={event.elements} panel={panel} />
      </DynamicPanel>
    );
  }
  return (
    <DynamicPanel style={panel} contentKey={contentKey}>
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
  blockKey,
}: {
  item: import("@/lib/resolve").FormattedBulletinItem;
  panel: DynamicPanelStyle;
  template: ResolvedTemplate | null;
  blockKey: string;
}) {
  if (!item) return null;
  const contentKey = `${blockKey}:${item.id}`;
  if (template) {
    return (
      <DynamicPanel style={panel} wide contentKey={contentKey}>
        <TemplateSlide template={template} elements={item.elements} panel={panel} />
      </DynamicPanel>
    );
  }
  return (
    <DynamicPanel style={panel} contentKey={contentKey}>
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
  blockKey,
}: {
  label: string | null;
  events: import("@/lib/resolve").FormattedEvent[];
  panel: DynamicPanelStyle;
  blockKey: string;
}) {
  return (
    <DynamicPanel style={panel} wide contentKey={blockKey}>
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
  blockKey,
}: {
  label: string | null;
  items: import("@/lib/resolve").FormattedBulletinItem[];
  panel: DynamicPanelStyle;
  blockKey: string;
}) {
  return (
    <DynamicPanel style={panel} wide contentKey={blockKey}>
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
  blockKey,
}: {
  reader: import("@/lib/resolve").FormattedFeaturedReader;
  panel: DynamicPanelStyle;
  template: ResolvedTemplate | null;
  blockKey: string;
}) {
  if (!reader) return null;
  const contentKey = `${blockKey}:${reader.id}`;
  if (template) {
    return (
      <DynamicPanel style={panel} wide contentKey={contentKey}>
        <TemplateSlide template={template} elements={reader.elements} panel={panel} />
      </DynamicPanel>
    );
  }
  return (
    <DynamicPanel style={panel} contentKey={contentKey}>
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

/** The "list of lists": a list of featured readers (usually just one, but
 * more than one can be tagged for the same period), each with its own
 * sub-list of the book(s) they recommended — a reader with several
 * recommendations gets one header row and one row per book, rather than
 * repeating their name for every book. */
function FeaturedReaderListSlide({
  label,
  readerGroups,
  panel,
  blockKey,
}: {
  label: string | null;
  readerGroups: import("@/lib/resolve").FormattedFeaturedReaderGroup[];
  panel: DynamicPanelStyle;
  blockKey: string;
}) {
  return (
    <DynamicPanel style={panel} wide contentKey={blockKey}>
      {label && (
        <h1 className="text-5xl font-bold mb-8 shrink-0" style={{ color: panel.titleColor }}>
          {label}
        </h1>
      )}
      <div className="flex-1 flex flex-col justify-center gap-8 min-h-0 overflow-hidden">
        {readerGroups.map((group) => (
          <div key={group.readerId} className="flex items-start gap-5">
            {group.readerPhotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={group.readerPhotoUrl}
                alt={group.readerName}
                className="w-14 h-14 rounded-full object-cover shrink-0 mt-1"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-2xl font-medium mb-2" style={{ color: panel.metaColor }}>
                {group.readerName}
              </div>
              <div className="flex flex-col gap-2">
                {group.recommendations.map((reader) => (
                  <div key={reader.id} className="text-3xl font-semibold truncate border-b border-white/30 pb-2" style={{ color: panel.titleColor }}>
                    {reader.bookTitle}
                    {reader.bookAuthor && <span className="font-normal"> — {reader.bookAuthor}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        {readerGroups.length === 0 && <p className="text-xl text-white/70">No Featured Readers this month.</p>}
      </div>
    </DynamicPanel>
  );
}
