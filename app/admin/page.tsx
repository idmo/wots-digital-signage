"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Sequence = {
  id: string;
  name: string;
  isLive: boolean;
  _count: { blocks: number };
};

export default function AdminDashboard() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await fetch("/api/sequences");
    setSequences(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data load
    load();
  }, []);

  const createSequence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await fetch("/api/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    setNewName("");
    load();
  };

  const activate = async (id: string) => {
    await fetch(`/api/sequences/${id}/activate`, { method: "POST" });
    load();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Sequences (&quot;Shows&quot;)</h1>
        <p className="text-neutral-600 text-sm mt-1">
          Only one sequence is live at a time — it&apos;s what the player renders.
        </p>
      </div>

      <form onSubmit={createSequence} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New sequence name (e.g. Main Loop)"
          className="border rounded px-3 py-2 text-sm flex-1 max-w-sm"
        />
        <button type="submit" className="bg-indigo-600 text-white rounded px-4 py-2 text-sm">
          Create
        </button>
      </form>

      {loading ? (
        <p className="text-neutral-500 text-sm">Loading…</p>
      ) : (
        <div className="divide-y border rounded bg-white">
          {sequences.length === 0 && (
            <p className="p-4 text-sm text-neutral-500">No sequences yet — create one above.</p>
          )}
          {sequences.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {s.name}
                  {s.isLive && (
                    <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                      LIVE
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-500">{s._count.blocks} block(s)</div>
              </div>
              <div className="flex gap-3 text-sm">
                <Link href={`/admin/sequences/${s.id}`} className="text-indigo-600 hover:underline">
                  Edit
                </Link>
                {!s.isLive && (
                  <button onClick={() => activate(s.id)} className="text-neutral-700 hover:underline">
                    Make Live
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
