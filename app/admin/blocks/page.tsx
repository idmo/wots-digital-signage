"use client";

import { useEffect, useState } from "react";

type Category = { id: string; name: string; color: string; defaultDurationSeconds: number };
type Block = {
  id: string;
  name: string;
  type: "static_image" | "video" | "dynamic_template";
  status: string;
  category: Category;
  durationSeconds: number | null;
  note: string | null;
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
  const [error, setError] = useState("");

  const [editingBlock, setEditingBlock] = useState<Block | null>(null);

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
    setError("");

    const missing: string[] = [];
    if (!name.trim()) missing.push("an internal label");
    if (!categoryId) missing.push("a category");
    if (!file) missing.push("a file");
    if (missing.length) {
      setError(`Add ${missing.join(" and ")} before submitting.`);
      return;
    }

    setSubmitting(true);
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file!);
      const assetRes = await fetch("/api/assets", { method: "POST", body: uploadForm });
      if (!assetRes.ok) {
        const body = await assetRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (${assetRes.status})`);
      }
      const asset = await assetRes.json();

      const type = asset.type === "video" ? "video" : "static_image";

      const blockRes = await fetch("/api/blocks", {
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
      if (!blockRes.ok) {
        const body = await blockRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Couldn't create block (${blockRes.status})`);
      }

      setName("");
      setFile(null);
      setTextHeavy(false);
      setEndDate("");
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
        {error && <p className="text-sm text-red-600">{error}</p>}
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
            <div key={b.id} className="border rounded bg-white overflow-hidden flex flex-col">
              <div className="aspect-video bg-neutral-100 flex items-center justify-center">
                {b.type === "static_image" && b.staticImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.staticImage.imageAsset.filePath} alt={b.name} className="w-full h-full object-cover" />
                )}
                {b.type === "video" && b.video && (
                  <video src={b.video.videoAsset.filePath} className="w-full h-full object-cover" muted />
                )}
              </div>
              <div className="p-2 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-1">
                  <div className="text-sm font-medium truncate">{b.name}</div>
                  <button
                    onClick={() => setEditingBlock(b)}
                    className="text-xs text-indigo-600 hover:underline shrink-0"
                  >
                    Edit
                  </button>
                </div>
                <div className="text-xs text-neutral-500 flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: b.category.color }}
                  />
                  {b.category.name} · {b.status} ·{" "}
                  {b.type === "video" ? `${b.video?.durationSeconds ?? "?"}s (full length)` : `${b.durationSeconds ?? b.category.defaultDurationSeconds}s`}
                </div>
                {b.note && (
                  <div className="text-xs text-neutral-600 italic mt-1 line-clamp-2">{b.note}</div>
                )}
              </div>
            </div>
          ))}
          {blocks.length === 0 && <p className="text-sm text-neutral-500">No blocks yet.</p>}
        </div>
      )}

      {editingBlock && (
        <EditBlockModal
          block={editingBlock}
          categories={categories}
          onClose={() => setEditingBlock(null)}
          onSaved={async () => {
            setEditingBlock(null);
            await load();
          }}
          onDeleted={async () => {
            setEditingBlock(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function EditBlockModal({
  block,
  categories,
  onClose,
  onSaved,
  onDeleted,
}: {
  block: Block;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(block.name);
  const [categoryId, setCategoryId] = useState(block.category.id);
  const [note, setNote] = useState(block.note ?? "");
  const [durationSeconds, setDurationSeconds] = useState(
    block.durationSeconds != null ? String(block.durationSeconds) : ""
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Name can't be empty.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/blocks/${block.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          categoryId,
          note,
          ...(block.type === "static_image"
            ? { durationSeconds: durationSeconds === "" ? null : Number(durationSeconds) }
            : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Couldn't save changes (${res.status})`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/blocks/${block.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Couldn't delete block (${res.status})`);
      }
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-5 space-y-3"
      >
        <h2 className="font-medium text-lg">Edit Block</h2>

        <label className="block text-sm">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded px-3 py-2 text-sm w-full mt-1"
          />
        </label>

        <label className="block text-sm">
          Category
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="border rounded px-3 py-2 text-sm w-full mt-1"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {block.type === "static_image" ? (
          <label className="block text-sm">
            Duration (seconds) — blank uses the category default ({block.category.defaultDurationSeconds}s)
            <input
              type="number"
              min={1}
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(e.target.value)}
              placeholder={String(block.category.defaultDurationSeconds)}
              className="border rounded px-3 py-2 text-sm w-full mt-1"
            />
          </label>
        ) : (
          <p className="text-xs text-neutral-500">
            Videos always play to their full length ({block.video?.durationSeconds ?? "?"}s) — duration
            isn&apos;t editable for video blocks.
          </p>
        )}

        <label className="block text-sm">
          Note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for whoever's managing this (e.g. swap after Sept 30)"
            rows={3}
            className="border rounded px-3 py-2 text-sm w-full mt-1 resize-none"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          <div>
            {confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-600">Delete for good?</span>
                <button
                  type="button"
                  onClick={doDelete}
                  disabled={deleting}
                  className="text-sm text-red-600 font-medium hover:underline disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="text-sm text-neutral-500 hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="text-sm text-red-600 hover:underline"
              >
                Delete block
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="text-sm text-neutral-600 hover:underline">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
