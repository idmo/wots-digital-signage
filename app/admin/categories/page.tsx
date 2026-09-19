"use client";

import { useEffect, useState } from "react";

type Category = {
  id: string;
  name: string;
  color: string;
  defaultDurationSeconds: number;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [color, setColor] = useState("#4f46e5");
  const [defaultDurationSeconds, setDefaultDurationSeconds] = useState(10);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const res = await fetch("/api/categories");
    setCategories(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data load
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Give the category a name.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color, defaultDurationSeconds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Couldn't create category (${res.status})`);
      }
      setName("");
      setColor("#4f46e5");
      setDefaultDurationSeconds(10);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-neutral-600 text-sm mt-1">
          Blocks are grouped into categories (PRD §3.5) — each block picks one when it&apos;s created,
          and the color/default duration here are just conveniences (a block can still override its
          own duration).
        </p>
      </div>

      <form onSubmit={submit} className="bg-white border rounded p-4 space-y-3 max-w-md">
        <h2 className="font-medium">New Category</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Staff Picks)"
          className="border rounded px-3 py-2 text-sm w-full"
        />
        <label className="flex items-center gap-2 text-sm">
          Color
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-14 border rounded"
          />
        </label>
        <label className="block text-sm">
          Default duration (seconds)
          <input
            type="number"
            min={1}
            value={defaultDurationSeconds}
            onChange={(e) => setDefaultDurationSeconds(Number(e.target.value))}
            className="border rounded px-3 py-2 text-sm w-full mt-1"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="bg-indigo-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add Category"}
        </button>
      </form>

      {loading ? (
        <p className="text-neutral-500 text-sm">Loading…</p>
      ) : (
        <div className="divide-y border rounded bg-white max-w-md">
          {categories.length === 0 && (
            <p className="p-4 text-sm text-neutral-500">No categories yet.</p>
          )}
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3">
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: c.color }}
              />
              <span className="text-sm font-medium">{c.name}</span>
              <span className="text-xs text-neutral-500 ml-auto">
                {c.defaultDurationSeconds}s default
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
