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

  // Advance to the next item after the current one's duration.
  useEffect(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (!current) return;

    advanceTimer.current = setTimeout(() => {
      setIndex((i) => (items.length ? (i + 1) % items.length : 0));
    }, current.durationSeconds * 1000);

    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [current, items.length]);

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
      </div>
    </div>
  );
}
