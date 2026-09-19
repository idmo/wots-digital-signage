"use client";

import { useEffect, useState } from "react";

type Category = { id: string; name: string; color: string; defaultDurationSeconds: number };
type DataSource = { id: string; name: string; type: string };
type DynamicInfo = {
  dataSourceId: string;
  dataSource: DataSource;
  displayMode: string;
  maxItems: number;
  perItemDuration: number;
  listLabel: string | null;
};
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
  dynamic?: DynamicInfo;
};

type BlockKind = "upload" | "wordpress_events" | "wordpress_bulletin_board";

const DYNAMIC_KIND_LABEL: Record<Exclude<BlockKind, "upload">, string> = {
  wordpress_events: "WordPress Events",
  wordpress_bulletin_board: "Community Bulletin Board",
};

function dynamicBlockSummaryLabel(dataSourceType: string | undefined, displayMode: string | undefined) {
  const noun = dataSourceType === "wordpress_bulletin_board" ? "Bulletin Board" : "Events";
  return displayMode === "list" ? `${noun} List` : `${noun} Carousel`;
}

function dynamicBlockIcon(dataSourceType: string | undefined) {
  return dataSourceType === "wordpress_bulletin_board" ? "📌" : "🗓️";
}

export default function BlockLibraryPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);

  const [blockKind, setBlockKind] = useState<BlockKind>("upload");

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [textHeavy, setTextHeavy] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [dynDataSourceId, setDynDataSourceId] = useState("");
  const [dynDisplayMode, setDynDisplayMode] = useState<"carousel" | "list">("carousel");
  const [dynListLabel, setDynListLabel] = useState("");
  const [dynMaxItems, setDynMaxItems] = useState("10");
  const [dynPerItemDuration, setDynPerItemDuration] = useState("10");

  const [editingBlock, setEditingBlock] = useState<Block | null>(null);

  const dataSourcesForKind = (kind: BlockKind) => dataSources.filter((s) => s.type === kind);

  const load = async () => {
    const [blocksRes, catsRes, sourcesRes] = await Promise.all([
      fetch("/api/blocks"),
      fetch("/api/categories"),
      fetch("/api/data-sources"),
    ]);
    const cats = await catsRes.json();
    const sources: DataSource[] = await sourcesRes.json();
    setBlocks(await blocksRes.json());
    setCategories(cats);
    setDataSources(sources);
    if (!categoryId && cats[0]) setCategoryId(cats[0].id);
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data load
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the selected data source valid whenever the block kind (or the
  // available sources) changes.
  useEffect(() => {
    if (blockKind === "upload") return;
    const available = dataSourcesForKind(blockKind);
    if (!available.some((s) => s.id === dynDataSourceId)) {
      setDynDataSourceId(available[0]?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockKind, dataSources]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (blockKind === "upload") {
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
      return;
    }

    // A dynamic block (WordPress Events or Community Bulletin Board) — the
    // block itself only needs the data source + display settings; which
    // renderer it gets on /player is decided by the data source's type.
    const kindLabel = DYNAMIC_KIND_LABEL[blockKind];
    const missing: string[] = [];
    if (!name.trim()) missing.push("an internal label");
    if (!categoryId) missing.push("a category");
    if (!dynDataSourceId) missing.push(`a ${kindLabel} data source`);
    if (dynDisplayMode === "list" && !dynListLabel.trim()) missing.push("a label for the list");
    if (missing.length) {
      setError(`Add ${missing.join(", ")} before submitting.`);
      return;
    }

    setSubmitting(true);
    try {
      const blockRes = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          categoryId,
          type: "dynamic_template",
          dataSourceId: dynDataSourceId,
          displayMode: dynDisplayMode,
          listLabel: dynDisplayMode === "list" ? dynListLabel : null,
          maxItems: Number(dynMaxItems) || 10,
          perItemDuration: Number(dynPerItemDuration) || 10,
          endDate: endDate || null,
        }),
      });
      if (!blockRes.ok) {
        const body = await blockRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Couldn't create block (${blockRes.status})`);
      }
      setName("");
      setEndDate("");
      setDynListLabel("");
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

        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => setBlockKind("upload")}
            className={`px-3 py-1.5 rounded border ${
              blockKind === "upload" ? "bg-indigo-600 text-white border-indigo-600" : "text-neutral-600"
            }`}
          >
            Image / Video
          </button>
          <button
            type="button"
            onClick={() => setBlockKind("wordpress_events")}
            className={`px-3 py-1.5 rounded border ${
              blockKind === "wordpress_events" ? "bg-indigo-600 text-white border-indigo-600" : "text-neutral-600"
            }`}
          >
            WordPress Events
          </button>
          <button
            type="button"
            onClick={() => setBlockKind("wordpress_bulletin_board")}
            className={`px-3 py-1.5 rounded border ${
              blockKind === "wordpress_bulletin_board" ? "bg-indigo-600 text-white border-indigo-600" : "text-neutral-600"
            }`}
          >
            Community Bulletin Board
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Internal label (e.g. Fall Sale Poster)"
          className="border rounded px-3 py-2 text-sm w-full"
        />
        <CategorySelect
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          onCreated={(c) => setCategories((prev) => [...prev, c])}
        />

        {blockKind === "upload" ? (
          <>
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
          </>
        ) : (
          <>
            {dataSourcesForKind(blockKind).length === 0 ? (
              <p className="text-sm text-neutral-500">
                No {DYNAMIC_KIND_LABEL[blockKind]} data source yet — add one on the{" "}
                <a href="/admin/data-sources" className="text-indigo-600 hover:underline">
                  Data Sources
                </a>{" "}
                page first.
              </p>
            ) : (
              <select
                value={dynDataSourceId}
                onChange={(e) => setDynDataSourceId(e.target.value)}
                className="border rounded px-3 py-2 text-sm w-full"
              >
                {dataSourcesForKind(blockKind).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => setDynDisplayMode("carousel")}
                className={`px-3 py-1.5 rounded border ${
                  dynDisplayMode === "carousel" ? "bg-indigo-600 text-white border-indigo-600" : "text-neutral-600"
                }`}
              >
                Carousel
              </button>
              <button
                type="button"
                onClick={() => setDynDisplayMode("list")}
                className={`px-3 py-1.5 rounded border ${
                  dynDisplayMode === "list" ? "bg-indigo-600 text-white border-indigo-600" : "text-neutral-600"
                }`}
              >
                List
              </button>
            </div>

            {dynDisplayMode === "list" && (
              <label className="block text-sm">
                List label
                <input
                  value={dynListLabel}
                  onChange={(e) => setDynListLabel(e.target.value)}
                  placeholder="e.g. Upcoming Events, or Coming this October"
                  className="border rounded px-3 py-2 text-sm w-full mt-1"
                />
              </label>
            )}

            <label className="block text-sm">
              Number of {blockKind === "wordpress_bulletin_board" ? "postings" : "events"} to display
              <input
                type="number"
                min={1}
                max={50}
                value={dynMaxItems}
                onChange={(e) => setDynMaxItems(e.target.value)}
                className="border rounded px-3 py-2 text-sm w-full mt-1"
              />
            </label>
            <label className="block text-sm">
              {dynDisplayMode === "list" ? "Seconds to display the list" : "Seconds per item in the carousel"}
              <input
                type="number"
                min={1}
                value={dynPerItemDuration}
                onChange={(e) => setDynPerItemDuration(e.target.value)}
                className="border rounded px-3 py-2 text-sm w-full mt-1"
              />
            </label>
          </>
        )}

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
          {submitting ? "Saving…" : "Add Block"}
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
                {b.type === "dynamic_template" && b.dynamic && (
                  <div className="text-center px-2">
                    <div className="text-2xl">{dynamicBlockIcon(b.dynamic.dataSource?.type)}</div>
                    <div className="text-xs text-neutral-500 mt-1">
                      {dynamicBlockSummaryLabel(b.dynamic.dataSource?.type, b.dynamic.displayMode)}
                    </div>
                  </div>
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
                  {b.type === "video"
                    ? `${b.video?.durationSeconds ?? "?"}s (full length)`
                    : b.type === "dynamic_template"
                    ? b.dynamic?.displayMode === "list"
                      ? `"${b.dynamic?.listLabel ?? ""}" · ${b.dynamic?.maxItems ?? "?"} items · ${
                          b.dynamic?.perItemDuration ?? "?"
                        }s`
                      : `${b.dynamic?.maxItems ?? "?"} items · ${b.dynamic?.perItemDuration ?? "?"}s each`
                    : `${b.durationSeconds ?? b.category.defaultDurationSeconds}s`}
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
          dataSources={dataSourcesForKind(
            (editingBlock.dynamic?.dataSource?.type as BlockKind | undefined) ?? "wordpress_events"
          )}
          onCategoryCreated={(c) => setCategories((prev) => [...prev, c])}
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
  dataSources,
  onCategoryCreated,
  onClose,
  onSaved,
  onDeleted,
}: {
  block: Block;
  categories: Category[];
  dataSources: DataSource[];
  onCategoryCreated: (category: Category) => void;
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
  const [dynDataSourceId, setDynDataSourceId] = useState(block.dynamic?.dataSourceId ?? "");
  const [dynDisplayMode, setDynDisplayMode] = useState<"carousel" | "list">(
    block.dynamic?.displayMode === "list" ? "list" : "carousel"
  );
  const [dynListLabel, setDynListLabel] = useState(block.dynamic?.listLabel ?? "");
  const [dynMaxItems, setDynMaxItems] = useState(String(block.dynamic?.maxItems ?? 10));
  const [dynPerItemDuration, setDynPerItemDuration] = useState(String(block.dynamic?.perItemDuration ?? 10));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  const isBulletinBoard = block.dynamic?.dataSource?.type === "wordpress_bulletin_board";

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
          ...(block.type === "dynamic_template"
            ? {
                dataSourceId: dynDataSourceId,
                displayMode: dynDisplayMode,
                listLabel: dynDisplayMode === "list" ? dynListLabel : null,
                maxItems: Number(dynMaxItems) || 10,
                perItemDuration: Number(dynPerItemDuration) || 10,
              }
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
          <div className="mt-1">
            <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} onCreated={onCategoryCreated} />
          </div>
        </label>

        {block.type === "static_image" && (
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
        )}

        {block.type === "video" && (
          <p className="text-xs text-neutral-500">
            Videos always play to their full length ({block.video?.durationSeconds ?? "?"}s) — duration
            isn&apos;t editable for video blocks.
          </p>
        )}

        {block.type === "dynamic_template" && (
          <>
            <label className="block text-sm">
              {isBulletinBoard ? "Community bulletin board" : "WordPress events"} data source
              <select
                value={dynDataSourceId}
                onChange={(e) => setDynDataSourceId(e.target.value)}
                className="border rounded px-3 py-2 text-sm w-full mt-1"
              >
                {dataSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => setDynDisplayMode("carousel")}
                className={`px-3 py-1.5 rounded border ${
                  dynDisplayMode === "carousel" ? "bg-indigo-600 text-white border-indigo-600" : "text-neutral-600"
                }`}
              >
                Carousel
              </button>
              <button
                type="button"
                onClick={() => setDynDisplayMode("list")}
                className={`px-3 py-1.5 rounded border ${
                  dynDisplayMode === "list" ? "bg-indigo-600 text-white border-indigo-600" : "text-neutral-600"
                }`}
              >
                List
              </button>
            </div>

            {dynDisplayMode === "list" && (
              <label className="block text-sm">
                List label
                <input
                  value={dynListLabel}
                  onChange={(e) => setDynListLabel(e.target.value)}
                  placeholder="e.g. Upcoming Events, or Coming this October"
                  className="border rounded px-3 py-2 text-sm w-full mt-1"
                />
              </label>
            )}

            <label className="block text-sm">
              Number of {isBulletinBoard ? "postings" : "events"} to display
              <input
                type="number"
                min={1}
                max={50}
                value={dynMaxItems}
                onChange={(e) => setDynMaxItems(e.target.value)}
                className="border rounded px-3 py-2 text-sm w-full mt-1"
              />
            </label>
            <label className="block text-sm">
              {dynDisplayMode === "list" ? "Seconds to display the list" : "Seconds per item in the carousel"}
              <input
                type="number"
                min={1}
                value={dynPerItemDuration}
                onChange={(e) => setDynPerItemDuration(e.target.value)}
                className="border rounded px-3 py-2 text-sm w-full mt-1"
              />
            </label>
          </>
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

function CategorySelect({
  categories,
  value,
  onChange,
  onCreated,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (category: Category) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#4f46e5");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const createCategory = async () => {
    if (!newName.trim()) {
      setError("Give the category a name.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, color: newColor, defaultDurationSeconds: 10 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Couldn't create category (${res.status})`);
      }
      const category = await res.json();
      onCreated(category);
      onChange(category.id);
      setAdding(false);
      setNewName("");
      setNewColor("#4f46e5");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === "__new__") {
            setAdding(true);
          } else {
            onChange(e.target.value);
          }
        }}
        className="border rounded px-3 py-2 text-sm w-full"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="__new__">+ Add new category…</option>
      </select>

      {adding && (
        <div className="mt-2 border rounded p-3 bg-neutral-50 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
              className="border rounded px-2 py-1.5 text-sm flex-1"
              autoFocus
            />
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-8 w-10 border rounded shrink-0"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={createCategory}
              disabled={creating}
              className="bg-indigo-600 text-white rounded px-3 py-1.5 text-xs disabled:opacity-50"
            >
              {creating ? "Adding…" : "Add category"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError("");
              }}
              className="text-xs text-neutral-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
