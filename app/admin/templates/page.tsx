"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CONTENT_ELEMENTS,
  TEMPLATE_LAYOUTS,
  LAYOUT_IDS,
  emptyRegions,
  type DataSourceKind,
  type LayoutId,
  type TemplateRegions,
} from "@/lib/templates";

type Template = {
  id: string;
  name: string;
  dataSourceType: DataSourceKind;
  layout: LayoutId;
  regions: string; // JSON string
};

const KIND_LABEL: Record<DataSourceKind, string> = {
  wordpress_events: "WordPress Events",
  wordpress_bulletin_board: "Community Bulletin Board",
  wordpress_featured_readers: "Featured Readers",
};

const REGION_LABEL: Record<string, string> = {
  top: "Top (full width)",
  bl: "Bottom left",
  br: "Bottom right",
  lt: "Left top",
  lb: "Left bottom",
  right: "Right (full height)",
  left: "Left (full height)",
  rt: "Right top",
  rb: "Right bottom",
};

/** Small 16:9 grid preview used on the layout-picker buttons — same
 * grid-template-areas as the real canvas, just tiny and unlabeled. */
function LayoutIcon({ layout, active }: { layout: LayoutId; active: boolean }) {
  const def = TEMPLATE_LAYOUTS[layout];
  return (
    <div
      className="grid gap-0.5 w-16 h-9 rounded overflow-hidden border"
      style={{
        gridTemplateAreas: def.gridTemplateAreas,
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        borderColor: active ? "#4f46e5" : "#d4d4d4",
      }}
    >
      {def.regions.map((r) => (
        <div key={r} style={{ gridArea: r }} className={active ? "bg-indigo-400" : "bg-neutral-300"} />
      ))}
    </div>
  );
}

export default function TemplatesPage() {
  const [dataSourceKind, setDataSourceKind] = useState<DataSourceKind>("wordpress_events");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [layout, setLayout] = useState<LayoutId>("stack");
  const [regions, setRegions] = useState<TemplateRegions>(emptyRegions("stack"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dragOverRegion, setDragOverRegion] = useState<string | null>(null);

  const elements = CONTENT_ELEMENTS[dataSourceKind];
  const layoutDef = TEMPLATE_LAYOUTS[layout];

  const usedKeys = useMemo(() => new Set(Object.values(regions).flat()), [regions]);

  const load = async (kind: DataSourceKind) => {
    setLoading(true);
    const res = await fetch(`/api/templates?dataSourceType=${kind}`);
    setTemplates(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data source switch reloads the list
    load(dataSourceKind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSourceKind]);

  const resetEditor = (kind: DataSourceKind) => {
    setEditingId(null);
    setName("");
    setLayout("stack");
    setRegions(emptyRegions("stack"));
    setError("");
    void kind;
  };

  const editTemplate = (t: Template) => {
    setEditingId(t.id);
    setName(t.name);
    setLayout(t.layout);
    try {
      const parsed = JSON.parse(t.regions);
      setRegions({ ...emptyRegions(t.layout), ...parsed });
    } catch {
      setRegions(emptyRegions(t.layout));
    }
    setError("");
  };

  const changeLayout = (next: LayoutId) => {
    if (next === layout) return;
    const hasContent = Object.values(regions).some((list) => list.length > 0);
    if (hasContent && !window.confirm("Switching layout clears the current region assignments. Continue?")) {
      return;
    }
    setLayout(next);
    setRegions(emptyRegions(next));
  };

  const placeElement = (key: string, regionId: string) => {
    setRegions((prev) => {
      const next: TemplateRegions = {};
      for (const [r, list] of Object.entries(prev)) {
        next[r] = list.filter((k) => k !== key);
      }
      next[regionId] = [...(next[regionId] ?? []), key];
      return next;
    });
  };

  const removeElement = (key: string, regionId: string) => {
    setRegions((prev) => ({ ...prev, [regionId]: (prev[regionId] ?? []).filter((k) => k !== key) }));
  };

  const moveElement = (regionId: string, index: number, dir: -1 | 1) => {
    setRegions((prev) => {
      const list = [...(prev[regionId] ?? [])];
      const target = index + dir;
      if (target < 0 || target >= list.length) return prev;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...prev, [regionId]: list };
    });
  };

  const save = async () => {
    setError("");
    if (!name.trim()) {
      setError("Give the template a name.");
      return;
    }
    setSaving(true);
    try {
      const payload = { name, dataSourceType: dataSourceKind, layout, regions };
      const res = editingId
        ? await fetch(`/api/templates/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Couldn't save (${res.status})`);
      }
      const saved = await res.json();
      await load(dataSourceKind);
      editTemplate(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this template? Blocks using it fall back to the built-in renderer.")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (editingId === id) resetEditor(dataSourceKind);
    await load(dataSourceKind);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="text-neutral-600 text-sm mt-1">
          Reusable drag-and-drop layouts for dynamic blocks. Pick a layout, then drag content elements from a
          data source into its regions. Assign a saved template to any matching block from the Block Library.
        </p>
      </div>

      <div className="flex gap-2 text-sm">
        {(Object.keys(KIND_LABEL) as DataSourceKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => {
              setDataSourceKind(kind);
              resetEditor(kind);
            }}
            className={`px-3 py-1.5 rounded border ${
              dataSourceKind === kind ? "bg-indigo-600 text-white border-indigo-600" : "text-neutral-600"
            }`}
          >
            {KIND_LABEL[kind]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-6">
        {/* Saved templates list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">Saved</h2>
            <button
              type="button"
              onClick={() => resetEditor(dataSourceKind)}
              className="text-xs text-indigo-600 hover:underline"
            >
              + New
            </button>
          </div>
          {loading ? (
            <p className="text-xs text-neutral-500">Loading…</p>
          ) : templates.length === 0 ? (
            <p className="text-xs text-neutral-500">No templates yet for {KIND_LABEL[dataSourceKind]}.</p>
          ) : (
            <ul className="space-y-1">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className={`border rounded px-2 py-1.5 text-sm flex items-center justify-between gap-2 cursor-pointer ${
                    editingId === t.id ? "border-indigo-600 bg-indigo-50" : "bg-white"
                  }`}
                  onClick={() => editTemplate(t)}
                >
                  <span className="truncate">{t.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(t.id);
                    }}
                    className="text-xs text-red-600 hover:underline shrink-0"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Editor: layout picker + canvas */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Layout</label>
            <div className="flex gap-3">
              {LAYOUT_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => changeLayout(id)}
                  className="flex flex-col items-center gap-1"
                  title={TEMPLATE_LAYOUTS[id].label}
                >
                  <LayoutIcon layout={id} active={layout === id} />
                  <span className={`text-xs ${layout === id ? "text-indigo-600 font-medium" : "text-neutral-500"}`}>
                    {TEMPLATE_LAYOUTS[id].label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Canvas (16:9 — drag a content element from the right onto a region)
            </label>
            <div
              className="w-full aspect-video bg-neutral-800 rounded-lg p-3 grid gap-2"
              style={{
                gridTemplateAreas: layoutDef.gridTemplateAreas,
                gridTemplateColumns: "1fr 1fr",
                gridTemplateRows: "1fr 1fr",
              }}
            >
              {layoutDef.regions.map((regionId) => (
                <div
                  key={regionId}
                  style={{ gridArea: regionId }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverRegion(regionId);
                  }}
                  onDragLeave={() => setDragOverRegion((r) => (r === regionId ? null : r))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const key = e.dataTransfer.getData("text/plain");
                    if (key) placeElement(key, regionId);
                    setDragOverRegion(null);
                  }}
                  className={`rounded-md border-2 border-dashed p-2 flex flex-col gap-1.5 overflow-auto ${
                    dragOverRegion === regionId ? "border-indigo-400 bg-indigo-950/40" : "border-neutral-600 bg-neutral-900/40"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                    {REGION_LABEL[regionId] ?? regionId}
                  </div>
                  {(regions[regionId] ?? []).map((key, i) => {
                    const def = elements.find((e) => e.key === key);
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-1 bg-neutral-700 text-white text-xs rounded px-2 py-1"
                      >
                        <span className="flex-1 truncate">{def?.label ?? key}</span>
                        <button
                          type="button"
                          onClick={() => moveElement(regionId, i, -1)}
                          disabled={i === 0}
                          className="text-neutral-300 hover:text-white disabled:opacity-30 px-0.5"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveElement(regionId, i, 1)}
                          disabled={i === (regions[regionId]?.length ?? 0) - 1}
                          className="text-neutral-300 hover:text-white disabled:opacity-30 px-0.5"
                          title="Move down"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => removeElement(key, regionId)}
                          className="text-neutral-300 hover:text-red-400 px-0.5"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  {(regions[regionId] ?? []).length === 0 && (
                    <div className="text-[11px] text-neutral-600 italic">Drop here</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Template name (e.g. "${KIND_LABEL[dataSourceKind]} — Photo Top")`}
              className="border rounded px-3 py-2 text-sm flex-1"
            />
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="bg-indigo-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Create template"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => resetEditor(dataSourceKind)}
                className="text-sm text-neutral-600 hover:underline"
              >
                New instead
              </button>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Content element palette */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-700">
            {KIND_LABEL[dataSourceKind]} elements
          </h2>
          <p className="text-xs text-neutral-500">Drag onto a region. Each element can only be placed once.</p>
          <div className="space-y-2">
            {elements.map((el) => {
              const used = usedKeys.has(el.key);
              return (
                <div
                  key={el.key}
                  draggable={!used}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", el.key)}
                  className={`border rounded px-3 py-2 text-sm ${
                    used ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" : "bg-white cursor-grab hover:border-indigo-400"
                  }`}
                >
                  <div className="font-medium flex items-center gap-1.5">
                    <span className="text-xs uppercase tracking-wide text-neutral-400">{el.type}</span>
                    {el.label}
                  </div>
                  {el.hint && <div className="text-xs text-neutral-500">{el.hint}</div>}
                  {used && <div className="text-xs text-indigo-500 mt-0.5">Already placed</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
