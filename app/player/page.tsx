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

  // Advance to the next item after the current one's duration — except for
  // video, which must always play to its actual end (the `onEnded` handler
  // below advances it) rather than a fixed timer that could cut it short
  // (e.g. if the stored duration is only an estimate); and wordpress_events,
  // which runs its own internal per-event carousel (handled below) before
  // advancing to the next sequence item.
  useEffect(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (!current || current.type === "video" || current.type === "wordpress_events") return;

    advanceTimer.current = setTimeout(() => {
      setIndex((i) => (items.length ? (i + 1) % items.length : 0));
    }, current.durationSeconds * 1000);

    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [current, items.length]);

  // Internal event carousel: cycle through this block's events every
  // `perItemDuration` (durationSeconds) seconds, then advance to the next
  // block in the sequence once all events have been shown.
  useEffect(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (!current || current.type !== "wordpress_events" || !current.wordpressEvents) return;

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
  }, [current, eventIndex, items.length]);

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

        {current?.type === "wordpress_events" && current.wordpressEvents && (
          <EventsCarouselSlide event={current.wordpressEvents.events[eventIndex]} />
        )}
      </div>
    </div>
  );
}

function EventsCarouselSlide({ event }: { event: import("@/lib/resolve").FormattedEvent }) {
  return (
    // The player stage is already 16:9 (a signage display); text on the
    // left 2/3, featured image on the right 1/3 (per spec).
    <div className="w-full h-full bg-white flex">
      <div className="w-2/3 h-full flex flex-col justify-center px-12 py-10 gap-4">
        <div className="text-2xl font-medium text-neutral-600">
          {event.weekday}, {event.date} · {event.timeRange}
        </div>
        <h1 className="text-6xl font-bold leading-tight text-neutral-900">{event.title}</h1>
        {event.excerpt && <p className="text-2xl text-neutral-700 line-clamp-5">{event.excerpt}</p>}
      </div>
      <div className="w-1/3 h-full bg-neutral-100">
        {event.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400 text-lg">
            No image
          </div>
        )}
      </div>
    </div>
  );
}
