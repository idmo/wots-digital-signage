"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedItem } from "@/lib/resolve";

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
    } else {
      // Static block, or a "list" mode events/bulletin block — no internal
      // cycling, just advance to the next sequence item after its duration.
      advanceTimer.current = setTimeout(() => {
        setIndex((i) => (items.length ? (i + 1) % items.length : 0));
      }, current.durationSeconds * 1000);
    }

    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [current, isEventsCarousel, isBulletinCarousel, eventIndex, items.length]);

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
          <EventsCarouselSlide event={current.wordpressEvents.events[eventIndex]} />
        )}

        {current?.type === "wordpress_events" && current.wordpressEvents?.mode === "list" && (
          <EventsListSlide label={current.wordpressEvents.listLabel} events={current.wordpressEvents.events} />
        )}

        {current?.type === "bulletin_board" && current.bulletinBoard?.mode === "carousel" && (
          <BulletinBoardSlide item={current.bulletinBoard.items[eventIndex]} />
        )}

        {current?.type === "bulletin_board" && current.bulletinBoard?.mode === "list" && (
          <BulletinBoardListSlide label={current.bulletinBoard.listLabel} items={current.bulletinBoard.items} />
        )}
      </div>
    </div>
  );
}

function EventsCarouselSlide({ event }: { event: import("@/lib/resolve").FormattedEvent }) {
  return (
    // Featured image fills the whole stage as a background; a translucent
    // panel with the event details spans the full width across the bottom
    // of the stage, sliding up from off-screen. It's at least a quarter of
    // the stage's height, but grows taller to fit a longer excerpt.
    <div className="relative w-full h-full bg-black overflow-hidden">
      {event.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.imageUrl} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-lg bg-neutral-800">
          No image
        </div>
      )}
      <div
        key={event.id}
        className="event-slide-in absolute left-0 bottom-0 w-full min-h-[25%] max-h-full flex flex-col justify-center gap-2 px-12 py-6 overflow-hidden"
        style={{ backgroundColor: "rgba(255,255,255,0.85)" }}
      >
        <h1 className="text-[4.5rem] font-bold leading-tight text-neutral-900 line-clamp-1">{event.title}</h1>
        <div className="text-[3rem] font-medium text-neutral-700">
          {event.weekday}, {event.date} · {event.timeRange}
        </div>
        {event.excerpt && <p className="text-[2.625rem] text-neutral-800 leading-snug">{event.excerpt}</p>}
      </div>
    </div>
  );
}

// Community Bulletin Board — brand dark green from the shop's website.
const BULLETIN_GREEN = "#60893c";

function BulletinBoardSlide({ item }: { item: import("@/lib/resolve").FormattedBulletinItem }) {
  if (!item) return null;
  const hasImage = Boolean(item.imageUrl);

  return (
    <div className="relative w-full h-full flex overflow-hidden" style={{ backgroundColor: BULLETIN_GREEN }}>
      {/* Text panel: header (org name) + body. Full width & centered when
          there's no featured image; otherwise the left half of a 50/50 split. */}
      <div
        key={item.id}
        className={`flex flex-col justify-center gap-6 px-16 py-12 text-white ${
          hasImage ? "w-1/2" : "w-full items-center text-center"
        }`}
      >
        <h1 className="text-[4rem] font-bold leading-tight">{item.orgName}</h1>
        <p className={`text-[2.25rem] leading-snug whitespace-pre-line ${hasImage ? "" : "max-w-4xl"}`}>
          {item.body}
        </p>
        {item.qrCodeDataUrl && (
          <div className="flex items-center gap-4 mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.qrCodeDataUrl} alt="Scan for more" className="w-32 h-32 bg-white p-2 rounded" />
            <span className="text-lg text-white/80">Scan to learn more</span>
          </div>
        )}
      </div>

      {hasImage && (
        <div className="w-1/2 h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl!} alt={item.orgName} className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  );
}

function BulletinBoardListSlide({
  label,
  items,
}: {
  label: string | null;
  items: import("@/lib/resolve").FormattedBulletinItem[];
}) {
  return (
    <div className="w-full h-full flex flex-col px-16 py-12 text-white" style={{ backgroundColor: BULLETIN_GREEN }}>
      {label && <h1 className="text-5xl font-bold mb-8 shrink-0">{label}</h1>}
      <div className="flex-1 flex flex-col justify-center gap-6 min-h-0 overflow-hidden">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-8 border-b border-white/30 pb-4">
            <div className="text-2xl font-semibold w-72 shrink-0">{item.orgName}</div>
            <div className="text-xl text-white/90 line-clamp-2">{item.body}</div>
          </div>
        ))}
        {items.length === 0 && <p className="text-xl text-white/70">No current postings.</p>}
      </div>
    </div>
  );
}

function EventsListSlide({
  label,
  events,
}: {
  label: string | null;
  events: import("@/lib/resolve").FormattedEvent[];
}) {
  return (
    <div className="w-full h-full bg-white flex flex-col px-16 py-12">
      {label && <h1 className="text-5xl font-bold text-neutral-900 mb-8 shrink-0">{label}</h1>}
      <div className="flex-1 flex flex-col justify-center gap-5 min-h-0 overflow-hidden">
        {events.map((event) => (
          <div key={event.id} className="flex items-baseline gap-8 border-b border-neutral-200 pb-4">
            <div className="text-xl text-neutral-500 w-72 shrink-0">
              {event.weekday}, {event.date} · {event.timeRange}
            </div>
            <div className="text-3xl font-semibold text-neutral-900 truncate">{event.title}</div>
          </div>
        ))}
        {events.length === 0 && <p className="text-xl text-neutral-400">No upcoming events.</p>}
      </div>
    </div>
  );
}
