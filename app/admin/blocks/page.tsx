"use client";

import { useEffect, useState } from "react";

type Category = { id: string; name: string; color: string };
type Block = {
  id: string;
  name: string;
  type: "static_image" | "video" | "dynamic_template";
  status: string;
  category: Category;
  durationSeconds: number | null;
  staticImage?: { imageAsset: { filePath: string } };
  video?: { videoAsset: { filePath: string }; durationSeconds: number };
};

export default function BlockLibraryPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [textHeavy, setTextHeavy] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [blocksRes, catsRes] = await Promise.all([fetch("/api/blocks"), fetch("/api/categories")]);
    const cats = await catsRes.json();
    setBlocks(await blocksRes.json());
    setCategories(cats);
    if (!categoryId && cats[0]) setCategoryId(cats[0].id);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data load
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name || !categoryId) return;
    setSubmitting(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const assetRes = await fetch("/api/assets", { method: "POST", body: uploadForm });
      const asset = await assetRes.json();

      const type = asset.type === "video" ? "video" : "static_image";

      await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          categoryId,
          type,
          assetId: asset.id,
          textHeavy,
          endDate: endDate || null,
        }),
      });

      setName("");
      setFile(null);
      setTextHeavy(false);
      setEndDate("");
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Block Library</h1>
        <p className="text-neutral-600 text-sm mt-1">
          Static images and videos. Add a block, then drop it into a sequence.
        </p>
      </div>

      <form onSubmit={submit} className="bg-white border rounded p-4 space-y-3 max-w-lg">
        <h2 className="font-medium">New Block</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Internal label (e.g. Fall Sale Poster)"
          className="border rounded px-3 py-2 text-sm w-full"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-full"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="file"
          accept="image/*,video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm w-full"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={textHeavy} onChange={(e) => setTextHeavy(e.target.checked)} />
          Text-heavy (longer default duration)
        </label>
        <label className="block text-sm">
          Expires on (optional — blank = evergreen)
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm w-full mt-1"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="bg-indigo-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {submitting ? "Uploading…" : "Add Block"}
        </button>
      </form>

      {loading ? (
        <p className="text-neutral-500 text-sm">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {blocks.map((b) => (
            <div key={b.id} className="border rounded bg-white overflow-hidden">
              <div className="aspect-video bg-neutral-100 flex items-center justify-center">
                {b.type === "static_image" && b.staticImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.staticImage.imageAsset.filePath} alt={b.name} className="w-full h-full object-cover" />
                )}
                {b.type === "video" && b.video && (
                  <video src={b.video.videoAsset.filePath} className="w-full h-full object-cover" muted />
                )}
              </div>
              <div className="p-2">
                <div className="text-sm font-medium truncate">{b.name}</div>
                <div className="text-xs text-neutral-500 flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: b.category.color }}
                  />
                  {b.category.name} · {b.status}
                </div>
              </div>
            </div>
          ))}
          {blocks.length === 0 && <p className="text-sm text-neutral-500">No blocks yet.</p>}
        </div>
      )}
    </div>
  );
}
