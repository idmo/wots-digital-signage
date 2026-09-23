"use client";

import { useEffect, useState } from "react";

type SyncLog = {
  id: string;
  runAt: string;
  status: "success" | "error";
  itemsFetched: number;
  errorMessage: string | null;
  trigger: string;
};

type DataSource = {
  id: string;
  name: string;
  type: string;
  config: string;
  lastSyncedAt: string | null;
  syncLogs: SyncLog[];
};

function parseBaseUrl(config: string): string | null {
  try {
    return JSON.parse(config)?.base_url ?? null;
  } catch {
    return null;
  }
}

export default function DataSourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [sourceType, setSourceType] = useState<
    "wordpress_events" | "wordpress_bulletin_board" | "wordpress_featured_readers"
  >("wordpress_events");
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBaseUrl, setEditBaseUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  const load = async () => {
    const res = await fetch("/api/data-sources");
    setSources(await res.json());
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
      setError("Give the data source a name.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/data-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: sourceType,
          config: baseUrl.trim() ? { base_url: baseUrl.trim() } : {},
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Couldn't create data source (${res.status})`);
      }
      setName("");
      setBaseUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const syncNow = async (id: string) => {
    setSyncingId(id);
    try {
      await fetch(`/api/data-sources/${id}/sync`, { method: "POST" });
      await load();
    } finally {
      setSyncingId(null);
    }
  };

  const startEditing = (s: DataSource) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditBaseUrl(parseBaseUrl(s.config) ?? "");
    setEditError("");
    setConfirmingDeleteId(null);
    setDeleteError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditError("");
  };

  const saveEdit = async (id: string) => {
    setEditError("");
    if (!editName.trim()) {
      setEditError("Name can't be empty.");
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch(`/api/data-sources/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, baseUrl: editBaseUrl }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Couldn't save changes (${res.status})`);
      }
      setEditingId(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setEditSaving(false);
    }
  };

  const doDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/data-sources/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Couldn't delete data source (${res.status})`);
      }
      setConfirmingDeleteId(null);
      await load();
    } catch (err) {
      setDeleteError({ id, message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Data Sources</h1>
        <p className="text-neutral-600 text-sm mt-1">
          Where synced content comes from (PRD §6): WordPress Events (via The Events Calendar&apos;s
          REST API, <code className="text-xs">/wp-json/tribe/events/v1/events</code>), the
          Community Bulletin Board (a Pods custom post type,{" "}
          <code className="text-xs">/wp-json/wp/v2/bulletin_board_item</code>), or Featured Readers
          (a small custom endpoint joining reader + recommendation + WooCommerce product,{" "}
          <code className="text-xs">/wp-json/signage/v1/featured-readers</code> — see{" "}
          <code className="text-xs">docs/featured-readers-endpoint.php</code>).
        </p>
      </div>

      <form onSubmit={submit} className="bg-white border rounded p-4 space-y-3 max-w-lg">
        <h2 className="font-medium">New WordPress Data Source</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSourceType("wordpress_events")}
            className={`flex-1 border rounded px-3 py-2 text-sm ${
              sourceType === "wordpress_events" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white"
            }`}
          >
            WordPress Events
          </button>
          <button
            type="button"
            onClick={() => setSourceType("wordpress_bulletin_board")}
            className={`flex-1 border rounded px-3 py-2 text-sm ${
              sourceType === "wordpress_bulletin_board" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white"
            }`}
          >
            Community Bulletin Board
          </button>
          <button
            type="button"
            onClick={() => setSourceType("wordpress_featured_readers")}
            className={`flex-1 border rounded px-3 py-2 text-sm ${
              sourceType === "wordpress_featured_readers" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white"
            }`}
          >
            Featured Readers
          </button>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Internal label (e.g. Shop Events Calendar)"
          className="border rounded px-3 py-2 text-sm w-full"
        />
        <label className="block text-sm">
          WordPress site base URL (optional — blank falls back to the
          <code className="text-xs mx-1">WORDPRESS_BASE_URL</code> env var)
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://www.wordonthestreetbooks.com"
            className="border rounded px-3 py-2 text-sm w-full mt-1"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="bg-indigo-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add Data Source"}
        </button>
      </form>

      {loading ? (
        <p className="text-neutral-500 text-sm">Loading…</p>
      ) : (
        <div className="divide-y border rounded bg-white">
          {sources.length === 0 && (
            <p className="p-4 text-sm text-neutral-500">No data sources yet.</p>
          )}
          {sources.map((s) => {
            const latest = s.syncLogs?.[0];
            const url = parseBaseUrl(s.config);
            const isEditing = editingId === s.id;

            if (isEditing) {
              return (
                <div key={s.id} className="p-4 space-y-3 bg-indigo-50/40">
                  <div className="text-xs text-neutral-400 font-normal">({s.type})</div>
                  <label className="block text-sm">
                    Internal label
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="border rounded px-3 py-2 text-sm w-full mt-1"
                    />
                  </label>
                  <label className="block text-sm">
                    WordPress site base URL (blank falls back to the{" "}
                    <code className="text-xs">WORDPRESS_BASE_URL</code> env var)
                    <input
                      value={editBaseUrl}
                      onChange={(e) => setEditBaseUrl(e.target.value)}
                      placeholder="https://www.wordonthestreetbooks.com"
                      className="border rounded px-3 py-2 text-sm w-full mt-1"
                    />
                  </label>
                  {editError && <p className="text-sm text-red-600">{editError}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => saveEdit(s.id)}
                      disabled={editSaving}
                      className="bg-indigo-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
                    >
                      {editSaving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={cancelEditing} className="text-sm text-neutral-600 hover:underline">
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={s.id} className="p-4 space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">
                    {s.name} <span className="text-xs text-neutral-400 font-normal">({s.type})</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => syncNow(s.id)}
                      disabled={syncingId === s.id}
                      className="text-sm text-indigo-600 hover:underline disabled:opacity-50"
                    >
                      {syncingId === s.id ? "Syncing…" : "Sync Now"}
                    </button>
                    <button
                      onClick={() => startEditing(s)}
                      className="text-sm text-indigo-600 hover:underline"
                    >
                      Edit
                    </button>
                    {confirmingDeleteId === s.id ? (
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-neutral-600">Delete for good?</span>
                        <button
                          onClick={() => doDelete(s.id)}
                          disabled={deletingId === s.id}
                          className="text-sm text-red-600 font-medium hover:underline disabled:opacity-50"
                        >
                          {deletingId === s.id ? "Deleting…" : "Yes, delete"}
                        </button>
                        <button
                          onClick={() => setConfirmingDeleteId(null)}
                          className="text-sm text-neutral-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setConfirmingDeleteId(s.id);
                          setDeleteError(null);
                        }}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-xs text-neutral-500">
                  Pulling from:{" "}
                  {url ? (
                    <a href={url} target="_blank" className="text-indigo-600 hover:underline">
                      {url}
                    </a>
                  ) : (
                    <span className="italic">
                      (no base_url set — falls back to the server&apos;s WORDPRESS_BASE_URL env var)
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-500">
                  Last synced: {s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleString() : "never"}
                </div>
                {latest && (
                  <div className={`text-xs ${latest.status === "error" ? "text-red-600" : "text-neutral-500"}`}>
                    Last run ({latest.trigger}, {new Date(latest.runAt).toLocaleString()}):{" "}
                    {latest.status === "success"
                      ? `${latest.itemsFetched} item(s) fetched`
                      : `failed — ${latest.errorMessage}`}
                  </div>
                )}
                {deleteError?.id === s.id && (
                  <div className="text-xs text-red-600">{deleteError.message}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
