"use client";

import { useEffect, useState } from "react";

type Settings = {
  contentAnimation: "none" | "fade" | "slide" | "zoom";
  contentAnimationDurationMs: number;
  blockTransition: "cut" | "crossfade" | "slide" | "zoom";
  blockTransitionDurationMs: number;
};

const CONTENT_ANIMATION_OPTIONS: { value: Settings["contentAnimation"]; label: string; hint: string }[] = [
  { value: "fade", label: "Fade in", hint: "Content fades from transparent to opaque." },
  { value: "slide", label: "Slide + fade", hint: "Content rises slightly from below while fading in." },
  { value: "zoom", label: "Zoom + fade", hint: "Content scales up slightly from ~95% while fading in." },
  { value: "none", label: "None (instant)", hint: "Content just appears — no animation." },
];

const BLOCK_TRANSITION_OPTIONS: { value: Settings["blockTransition"]; label: string; hint: string }[] = [
  { value: "crossfade", label: "Crossfade / dissolve", hint: "The outgoing block fades out while the incoming one fades in." },
  { value: "slide", label: "Slide", hint: "The incoming block slides in while the outgoing one slides out." },
  { value: "zoom", label: "Zoom", hint: "The incoming block scales in from slightly smaller while fading in." },
  { value: "cut", label: "Cut (instant)", hint: "No transition — one block is instantly replaced by the next." },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data load
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Couldn't save settings (${res.status})`);
      }
      setSettings(await res.json());
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return <p className="text-neutral-500 text-sm">Loading…</p>;
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-neutral-600 text-sm mt-1">
          App-wide defaults for transitions and animations. Any block can override either of these on its own —
          see its Edit form on the Block Library page.
        </p>
      </div>

      <section className="bg-white border rounded p-4 space-y-3">
        <h2 className="font-medium">Content animation</h2>
        <p className="text-sm text-neutral-600">
          How a dynamic block&apos;s own content (text, images, QR code — not its background image) animates in
          when it first appears or changes, e.g. moving to the next item in a carousel.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CONTENT_ANIMATION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`border rounded p-3 text-sm cursor-pointer ${
                settings.contentAnimation === opt.value ? "border-indigo-600 bg-indigo-50" : "border-neutral-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="contentAnimation"
                  checked={settings.contentAnimation === opt.value}
                  onChange={() => setSettings({ ...settings, contentAnimation: opt.value })}
                />
                <span className="font-medium">{opt.label}</span>
              </div>
              <p className="text-xs text-neutral-500 mt-1">{opt.hint}</p>
            </label>
          ))}
        </div>
        <label className="block text-sm max-w-xs">
          Duration (milliseconds)
          <input
            type="number"
            min={0}
            step={50}
            value={settings.contentAnimationDurationMs}
            onChange={(e) => setSettings({ ...settings, contentAnimationDurationMs: Number(e.target.value) || 0 })}
            className="border rounded px-3 py-2 text-sm w-full mt-1"
          />
        </label>
      </section>

      <section className="bg-white border rounded p-4 space-y-3">
        <h2 className="font-medium">Block transition</h2>
        <p className="text-sm text-neutral-600">
          How the whole screen changes from one block in the sequence to the next.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {BLOCK_TRANSITION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`border rounded p-3 text-sm cursor-pointer ${
                settings.blockTransition === opt.value ? "border-indigo-600 bg-indigo-50" : "border-neutral-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="blockTransition"
                  checked={settings.blockTransition === opt.value}
                  onChange={() => setSettings({ ...settings, blockTransition: opt.value })}
                />
                <span className="font-medium">{opt.label}</span>
              </div>
              <p className="text-xs text-neutral-500 mt-1">{opt.hint}</p>
            </label>
          ))}
        </div>
        <label className="block text-sm max-w-xs">
          Duration (milliseconds)
          <input
            type="number"
            min={0}
            step={50}
            value={settings.blockTransitionDurationMs}
            onChange={(e) => setSettings({ ...settings, blockTransitionDurationMs: Number(e.target.value) || 0 })}
            className="border rounded px-3 py-2 text-sm w-full mt-1"
          />
        </label>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-indigo-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-green-700">Saved.</span>}
      </div>
    </div>
  );
}
