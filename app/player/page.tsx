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

  // Advance to the next item after the current one's duration — except for
  // video, which must always play to its actual end (the `onEnded` handler
  // below advances it) rather than a fixed timer that could cut it short
  // (e.g. if the stored duration is only an estimate); and an events
  // carousel, which runs its own internal per-event timer (handled below)
  // before advancing to the next sequence item. A "list" mode events block
  // has no internal cycling, so it advances here like a static block.
  useEffect(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (!current || current.type === "video" || isEventsCarousel) return;

    advanceTimer.current = setTimeout(() => {
      setIndex((i) => (items.length ? (i + 1) % items.length : 0));
    }, current.durationSeconds * 1000);

    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [current, isEventsCarousel, items.length]);

  // Internal event carousel: cycle through this block's events every
  // `perItemDuration` (durationSeconds) seconds, then advance to the next
  // block in the sequence once all events have been shown.
  useEffect(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (!current || !isEventsCarousel || !current.wordpressEvents) return;

    const events = current.wordpressEvents.events;
    advanceTimer.current = setTimeout(() => {
      if (eventIndex + 1 >= events.length) {
        setIndex((i) => (items.length ? (i + 1) % items.length : 0));
      } else {
        setEventIndex((i) => i + 1);
      }
    }, current.durationSeconds * 1000);

    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [current, isEventsCarousel, eventIndex, items.length]);

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
      </div>
    </div>
  );
}

function EventsCarouselSlide({ event }: { event: import("@/lib/resolve").FormattedEvent }) {
  return (
    // Featured image fills the whole stage as a background; a translucent
    // panel with the event details slides in from the left on top of it.
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
        className="event-slide-in absolute left-0 top-0 bottom-0 w-[42%] flex flex-col justify-center gap-4 px-12 py-10"
        style={{ backgroundColor: "rgba(255,255,255,0.85)" }}
      >
        <h1 className="text-5xl font-bold leading-tight text-neutral-900">{event.title}</h1>
        <div className="text-xl font-medium text-neutral-700">
          {event.weekday}, {event.date} · {event.timeRange}
        </div>
        {event.excerpt && <p className="text-lg text-neutral-800 line-clamp-5">{event.excerpt}</p>}
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
