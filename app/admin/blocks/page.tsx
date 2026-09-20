"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Category = { id: string; name: string; color: string; defaultDurationSeconds: number };
type DataSource = { id: string; name: string; type: string };
type LayoutTemplate = { id: string; name: string; dataSourceType: string };
type DynamicInfo = {
  dataSourceId: string;
  dataSource: DataSource;
  displayMode: string;
  maxItems: number;
  perItemDuration: number;
  listLabel: string | null;
  featuredMonthYear: string | null;
  backgroundImage: { filePath: string } | null;
  divBackgroundColor: string;
  divBackgroundOpacity: number;
  titleColor: string;
  bodyColor: string;
  metaColor: string;
  templateId: string | null;
  template: LayoutTemplate | null;
};
type Block = {
  id: string;
  name: string;
  type: "static_image" | "video" | "dynamic_template";
  status: string;
  category: Category;
  durationSeconds: number | null;
  note: string | null;
  // null = use the app-wide default from Settings.
  contentAnimation: "none" | "fade" | "slide" | "zoom" | null;
  blockTransition: "cut" | "crossfade" | "slide" | "zoom" | null;
  staticImage?: { imageAsset: { filePath: string } };
  video?: { videoAsset: { filePath: string }; durationSeconds: number };
  dynamic?: DynamicInfo;
};

const CONTENT_ANIMATION_LABEL: Record<string, string> = {
  fade: "Fade in",
  slide: "Slide + fade",
  zoom: "Zoom + fade",
  none: "None (instant)",
};

const BLOCK_TRANSITION_LABEL: Record<string, string> = {
  crossfade: "Crossfade / dissolve",
  slide: "Slide",
  zoom: "Zoom",
  cut: "Cut (instant)",
};

/** A shared "use global default, or override" select for the two
 * transition/animation settings — used in both the create form and the
 * edit modal. `value === ""` means "use the app-wide default from
 * Settings". */
function TransitionOverrideSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Record<string, string>;
}) {
  return (
    <label className="block text-sm">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded px-3 py-2 text-sm w-full mt-1"
      >
        <option value="">Use global default (Settings)</option>
        {Object.entries(options).map(([value, optLabel]) => (
          <option key={value} value={value}>
            {optLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

type BlockKind = "upload" | "wordpress_events" | "wordpress_bulletin_board" | "wordpress_featured_readers";

const DYNAMIC_KIND_LABEL: Record<Exclude<BlockKind, "upload">, string> = {
  wordpress_events: "WordPress Events",
  wordpress_bulletin_board: "Community Bulletin Board",
  wordpress_featured_readers: "Featured Readers",
};

const DYNAMIC_ITEM_NOUN: Record<Exclude<BlockKind, "upload">, string> = {
  wordpress_events: "events",
  wordpress_bulletin_board: "postings",
  wordpress_featured_readers: "recommendations",
};

function dynamicBlockSummaryLabel(dataSourceType: string | undefined, displayMode: string | undefined) {
  const noun =
    dataSourceType === "wordpress_bulletin_board"
      ? "Bulletin Board"
      : dataSourceType === "wordpress_featured_readers"
      ? "Featured Readers"
      : "Events";
  return displayMode === "list" ? `${noun} List` : `${noun} Carousel`;
}

function dynamicBlockIcon(dataSourceType: string | undefined) {
  if (dataSourceType === "wordpress_bulletin_board") return "📌";
  if (dataSourceType === "wordpress_featured_readers") return "📚";
  return "🗓️";
}

export default function BlockLibraryPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [templates, setTemplates] = useState<LayoutTemplate[]>([]);
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
  const [dynFeaturedMonthYear, setDynFeaturedMonthYear] = useState("");
  const [dynMaxItems, setDynMaxItems] = useState("10");
  const [dynPerItemDuration, setDynPerItemDuration] = useState("10");
  const [dynBackgroundFile, setDynBackgroundFile] = useState<File | null>(null);
  const [dynDivColor, setDynDivColor] = useState("#000000");
  const [dynDivOpacity, setDynDivOpacity] = useState("60");
  const [dynTitleColor, setDynTitleColor] = useState("#ffffff");
  const [dynBodyColor, setDynBodyColor] = useState("#ffffff");
  const [dynMetaColor, setDynMetaColor] = useState("#ffffff");
  const [dynTemplateId, setDynTemplateId] = useState("");
  const [contentAnimation, setContentAnimation] = useState("");
  const [blockTransition, setBlockTransition] = useState("");

  const [editingBlock, setEditingBlock] = useState<Block | null>(null);

  const dataSourcesForKind = (kind: BlockKind) => dataSources.filter((s) => s.type === kind);
  const templatesForKind = (kind: BlockKind) => templates.filter((t) => t.dataSourceType === kind);

  const load = async () => {
    const [blocksRes, catsRes, sourcesRes, templatesRes] = await Promise.all([
      fetch("/api/blocks"),
      fetch("/api/categories"),
      fetch("/api/data-sources"),
      fetch("/api/templates"),
    ]);
    const cats = await catsRes.json();
    const sources: DataSource[] = await sourcesRes.json();
    setBlocks(await blocksRes.json());
    setCategories(cats);
    setDataSources(sources);
    setTemplates(await templatesRes.json());
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
    const availableTemplates = templatesForKind(blockKind);
    if (!availableTemplates.some((t) => t.id === dynTemplateId)) {
      setDynTemplateId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockKind, dataSources, templates]);

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
            blockTransition: blockTransition || null,
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
        setBlockTransition("");
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
      let backgroundImageAssetId: string | undefined;
      if (dynBackgroundFile) {
        const uploadForm = new FormData();
        uploadForm.append("file", dynBackgroundFile);
        const assetRes = await fetch("/api/assets", { method: "POST", body: uploadForm });
        if (!assetRes.ok) {
          const body = await assetRes.json().catch(() => ({}));
          throw new Error(body.error ?? `Background image upload failed (${assetRes.status})`);
        }
        backgroundImageAssetId = (await assetRes.json()).id;
      }

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
          featuredMonthYear: blockKind === "wordpress_featured_readers" ? dynFeaturedMonthYear.trim() || null : undefined,
          maxItems: Number(dynMaxItems) || 10,
          perItemDuration: Number(dynPerItemDuration) || 10,
          endDate: endDate || null,
          backgroundImageAssetId,
          divBackgroundColor: dynDivColor,
          divBackgroundOpacity: Number(dynDivOpacity) || 0,
          titleColor: dynTitleColor,
          bodyColor: dynBodyColor,
          metaColor: dynMetaColor,
          templateId: dynTemplateId || null,
          contentAnimation: contentAnimation || null,
          blockTransition: blockTransition || null,
        }),
      });
      if (!blockRes.ok) {
        const body = await blockRes.json().catch(() => ({}));
        throw new Error(body.error ?? `Couldn't create block (${blockRes.status})`);
      }
      setName("");
      setEndDate("");
      setDynListLabel("");
      setDynFeaturedMonthYear("");
      setDynBackgroundFile(null);
      setDynDivColor("#000000");
      setDynDivOpacity("60");
      setDynTitleColor("#ffffff");
      setDynBodyColor("#ffffff");
      setDynTemplateId("");
      setDynMetaColor("#ffffff");
      setContentAnimation("");
      setBlockTransition("");
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
          <button
            type="button"
            onClick={() => setBlockKind("wordpress_featured_readers")}
            className={`px-3 py-1.5 rounded border ${
              blockKind === "wordpress_featured_readers" ? "bg-indigo-600 text-white border-indigo-600" : "text-neutral-600"
            }`}
          >
            Featured Readers
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

            {blockKind === "wordpress_featured_readers" && (
              <label className="block text-sm">
                Month &amp; Year (optional)
                <input
                  value={dynFeaturedMonthYear}
                  onChange={(e) => setDynFeaturedMonthYear(e.target.value)}
                  placeholder="Blank = current month, or pin one e.g. September 2025"
                  className="border rounded px-3 py-2 text-sm w-full mt-1"
                />
                <span className="text-xs text-neutral-500 mt-1 block">
                  Matched against each Reader&apos;s own &quot;Featured Month and Year&quot; field in WordPress.
                </span>
              </label>
            )}

            <label className="block text-sm">
              Number of {DYNAMIC_ITEM_NOUN[blockKind]} to display
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

            <div className="border-t pt-3 space-y-2">
              <label className="block text-sm">
                Layout template
                <select
                  value={dynTemplateId}
                  onChange={(e) => setDynTemplateId(e.target.value)}
                  className="border rounded px-3 py-2 text-sm w-full mt-1"
                >
                  <option value="">Built-in renderer (default)</option>
                  {templatesForKind(blockKind).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-neutral-500">
                Only applies in Carousel mode.{" "}
                <Link href="/admin/templates" className="text-indigo-600 hover:underline">
                  Manage templates
                </Link>
                .
              </p>
            </div>

            <div className="border-t pt-3 space-y-3">
              <p className="text-xs text-neutral-500">
                Player background &amp; text panel — shown behind every item this block pulls in. No need for a
                WordPress featured image; a QR code is shown instead.
              </p>
              <label className="block text-sm">
                Background image (16:9 — scales to cover the screen)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setDynBackgroundFile(e.target.files?.[0] ?? null)}
                  className="text-sm w-full mt-1"
                />
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  Panel color
                  <input
                    type="color"
                    value={dynDivColor}
                    onChange={(e) => setDynDivColor(e.target.value)}
                    className="h-8 w-10 border rounded"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm flex-1">
                  Opacity
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={dynDivOpacity}
                    onChange={(e) => setDynDivOpacity(e.target.value)}
                    className="flex-1"
                  />
                  <span className="text-xs text-neutral-500 w-10 text-right">{dynDivOpacity}%</span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  Title color
                  <input
                    type="color"
                    value={dynTitleColor}
                    onChange={(e) => setDynTitleColor(e.target.value)}
                    className="h-8 w-10 border rounded"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Excerpt color
                  <input
                    type="color"
                    value={dynBodyColor}
                    onChange={(e) => setDynBodyColor(e.target.value)}
                    className="h-8 w-10 border rounded"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Date/time color
                  <input
                    type="color"
                    value={dynMetaColor}
                    onChange={(e) => setDynMetaColor(e.target.value)}
                    className="h-8 w-10 border rounded"
                  />
                </label>
              </div>
            </div>

            <div className="border-t pt-3">
              <TransitionOverrideSelect
                label="Content animation override"
                value={contentAnimation}
                onChange={setContentAnimation}
                options={CONTENT_ANIMATION_LABEL}
              />
            </div>
          </>
        )}

        <TransitionOverrideSelect
          label="Block transition override"
          value={blockTransition}
          onChange={setBlockTransition}
          options={BLOCK_TRANSITION_LABEL}
        />

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
                {b.dynamic?.dataSource?.type === "wordpress_featured_readers" && (
                  <div className="text-xs text-neutral-500">
                    {b.dynamic.featuredMonthYear ? `Pinned: ${b.dynamic.featuredMonthYear}` : "Current month (auto)"}
                  </div>
                )}
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
          templates={templatesForKind(
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
  templates,
  onCategoryCreated,
  onClose,
  onSaved,
  onDeleted,
}: {
  block: Block;
  categories: Category[];
  dataSources: DataSource[];
  templates: LayoutTemplate[];
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
  const [dynFeaturedMonthYear, setDynFeaturedMonthYear] = useState(block.dynamic?.featuredMonthYear ?? "");
  const [dynMaxItems, setDynMaxItems] = useState(String(block.dynamic?.maxItems ?? 10));
  const [dynPerItemDuration, setDynPerItemDuration] = useState(String(block.dynamic?.perItemDuration ?? 10));
  const [dynBackgroundFile, setDynBackgroundFile] = useState<File | null>(null);
  const [clearBackground, setClearBackground] = useState(false);
  const [dynDivColor, setDynDivColor] = useState(block.dynamic?.divBackgroundColor ?? "#000000");
  const [dynDivOpacity, setDynDivOpacity] = useState(String(block.dynamic?.divBackgroundOpacity ?? 60));
  const [dynTitleColor, setDynTitleColor] = useState(block.dynamic?.titleColor ?? "#ffffff");
  const [dynBodyColor, setDynBodyColor] = useState(block.dynamic?.bodyColor ?? "#ffffff");
  const [dynMetaColor, setDynMetaColor] = useState(block.dynamic?.metaColor ?? "#ffffff");
  const [dynTemplateId, setDynTemplateId] = useState(block.dynamic?.templateId ?? "");
  const [contentAnimation, setContentAnimation] = useState(block.contentAnimation ?? "");
  const [blockTransition, setBlockTransition] = useState(block.blockTransition ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  const isBulletinBoard = block.dynamic?.dataSource?.type === "wordpress_bulletin_board";
  const isFeaturedReaders = block.dynamic?.dataSource?.type === "wordpress_featured_readers";
  const dynDataSourceLabel = isBulletinBoard
    ? "Community bulletin board"
    : isFeaturedReaders
    ? "Featured Readers"
    : "WordPress events";
  const dynItemNoun = isBulletinBoard ? "postings" : isFeaturedReaders ? "recommendations" : "events";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Name can't be empty.");
      return;
    }
    setSaving(true);
    try {
      let backgroundImageAssetId: string | null | undefined;
      if (dynBackgroundFile) {
        const uploadForm = new FormData();
        uploadForm.append("file", dynBackgroundFile);
        const assetRes = await fetch("/api/assets", { method: "POST", body: uploadForm });
        if (!assetRes.ok) {
          const body = await assetRes.json().catch(() => ({}));
          throw new Error(body.error ?? `Background image upload failed (${assetRes.status})`);
        }
        backgroundImageAssetId = (await assetRes.json()).id;
      } else if (clearBackground) {
        backgroundImageAssetId = null;
      }

      const res = await fetch(`/api/blocks/${block.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          categoryId,
          note,
          contentAnimation: contentAnimation || null,
          blockTransition: blockTransition || null,
          ...(block.type === "static_image"
            ? { durationSeconds: durationSeconds === "" ? null : Number(durationSeconds) }
            : {}),
          ...(block.type === "dynamic_template"
            ? {
                dataSourceId: dynDataSourceId,
                displayMode: dynDisplayMode,
                listLabel: dynDisplayMode === "list" ? dynListLabel : null,
                featuredMonthYear: isFeaturedReaders ? dynFeaturedMonthYear.trim() || null : undefined,
                maxItems: Number(dynMaxItems) || 10,
                perItemDuration: Number(dynPerItemDuration) || 10,
                ...(backgroundImageAssetId !== undefined ? { backgroundImageAssetId } : {}),
                divBackgroundColor: dynDivColor,
                divBackgroundOpacity: Number(dynDivOpacity) || 0,
                titleColor: dynTitleColor,
                bodyColor: dynBodyColor,
                metaColor: dynMetaColor,
                templateId: dynTemplateId || null,
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
              {dynDataSourceLabel} data source
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

            {isFeaturedReaders && (
              <label className="block text-sm">
                Month &amp; Year (optional)
                <input
                  value={dynFeaturedMonthYear}
                  onChange={(e) => setDynFeaturedMonthYear(e.target.value)}
                  placeholder="Blank = current month, or pin one e.g. September 2025"
                  className="border rounded px-3 py-2 text-sm w-full mt-1"
                />
                <span className="text-xs text-neutral-500 mt-1 block">
                  Matched against each Reader&apos;s own &quot;Featured Month and Year&quot; field in WordPress.
                </span>
              </label>
            )}

            <label className="block text-sm">
              Number of {dynItemNoun} to display
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

            <div className="border-t pt-3 space-y-2">
              <label className="block text-sm">
                Layout template
                <select
                  value={dynTemplateId}
                  onChange={(e) => setDynTemplateId(e.target.value)}
                  className="border rounded px-3 py-2 text-sm w-full mt-1"
                >
                  <option value="">Built-in renderer (default)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-neutral-500">
                Only applies in Carousel mode.{" "}
                <Link href="/admin/templates" className="text-indigo-600 hover:underline">
                  Manage templates
                </Link>
                .
              </p>
            </div>

            <div className="border-t pt-3 space-y-3">
              <p className="text-xs text-neutral-500">
                Player background &amp; text panel — shown behind every item this block pulls in.
              </p>
              {block.dynamic?.backgroundImage && !clearBackground && !dynBackgroundFile && (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={block.dynamic.backgroundImage.filePath}
                    alt="Current background"
                    className="w-24 aspect-video object-cover rounded border"
                  />
                  <button
                    type="button"
                    onClick={() => setClearBackground(true)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}
              <label className="block text-sm">
                {block.dynamic?.backgroundImage ? "Replace background image" : "Background image (16:9 — scales to cover the screen)"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    setDynBackgroundFile(e.target.files?.[0] ?? null);
                    setClearBackground(false);
                  }}
                  className="text-sm w-full mt-1"
                />
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  Panel color
                  <input
                    type="color"
                    value={dynDivColor}
                    onChange={(e) => setDynDivColor(e.target.value)}
                    className="h-8 w-10 border rounded"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm flex-1">
                  Opacity
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={dynDivOpacity}
                    onChange={(e) => setDynDivOpacity(e.target.value)}
                    className="flex-1"
                  />
                  <span className="text-xs text-neutral-500 w-10 text-right">{dynDivOpacity}%</span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  Title color
                  <input
                    type="color"
                    value={dynTitleColor}
                    onChange={(e) => setDynTitleColor(e.target.value)}
                    className="h-8 w-10 border rounded"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Excerpt color
                  <input
                    type="color"
                    value={dynBodyColor}
                    onChange={(e) => setDynBodyColor(e.target.value)}
                    className="h-8 w-10 border rounded"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Date/time color
                  <input
                    type="color"
                    value={dynMetaColor}
                    onChange={(e) => setDynMetaColor(e.target.value)}
                    className="h-8 w-10 border rounded"
                  />
                </label>
              </div>
            </div>

            <div className="border-t pt-3">
              <TransitionOverrideSelect
                label="Content animation override"
                value={contentAnimation}
                onChange={setContentAnimation}
                options={CONTENT_ANIMATION_LABEL}
              />
            </div>
          </>
        )}

        <TransitionOverrideSelect
          label="Block transition override"
          value={blockTransition}
          onChange={setBlockTransition}
          options={BLOCK_TRANSITION_LABEL}
        />

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
