"use client";

import { use, useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Block = { id: string; name: string; type: string; category: { name: string; color: string } };
type SequenceBlock = { id: string; blockId: string; position: number; block: Block };
type Sequence = { id: string; name: string; blocks: SequenceBlock[] };

function SortableRow({ sb, onRemove }: { sb: SequenceBlock; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sb.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-3 border rounded bg-white p-3"
    >
      <button {...attributes} {...listeners} className="cursor-grab text-neutral-400" aria-label="Drag to reorder">
        ⠿
      </button>
      <span
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: sb.block.category.color }}
      />
      <span className="text-sm flex-1">{sb.block.name}</span>
      <span className="text-xs text-neutral-400">{sb.block.category.name}</span>
      <button onClick={() => onRemove(sb.id)} className="text-xs text-red-600 hover:underline">
        Remove
      </button>
    </div>
  );
}

export default function SequenceBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [availableBlocks, setAvailableBlocks] = useState<Block[]>([]);
  const [addBlockId, setAddBlockId] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    const [seqRes, blocksRes] = await Promise.all([
      fetch(`/api/sequences/${id}`),
      fetch("/api/blocks"),
    ]);
    setSequence(await seqRes.json());
    setAvailableBlocks(await blocksRes.json());
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client-side data load
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const persistOrder = async (blocks: SequenceBlock[]) => {
    await fetch(`/api/sequences/${id}/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequenceBlockIds: blocks.map((b) => b.id) }),
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!sequence) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sequence.blocks.findIndex((b) => b.id === active.id);
    const newIndex = sequence.blocks.findIndex((b) => b.id === over.id);
    const reordered = arrayMove(sequence.blocks, oldIndex, newIndex);
    setSequence({ ...sequence, blocks: reordered });
    persistOrder(reordered);
  };

  const addBlock = async () => {
    if (!sequence || !addBlockId) return;
    const blockIds = [...sequence.blocks.map((b) => b.blockId), addBlockId];
    await fetch(`/api/sequences/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockIds }),
    });
    setAddBlockId("");
    load();
  };

  const removeBlock = async (sequenceBlockId: string) => {
    if (!sequence) return;
    const blockIds = sequence.blocks.filter((b) => b.id !== sequenceBlockId).map((b) => b.blockId);
    await fetch(`/api/sequences/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockIds }),
    });
    load();
  };

  if (!sequence) return <p className="text-sm text-neutral-500">Loading…</p>;

  const usedIds = new Set(sequence.blocks.map((b) => b.blockId));
  const addable = availableBlocks.filter((b) => !usedIds.has(b.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{sequence.name}</h1>
        <p className="text-neutral-600 text-sm mt-1">Drag to reorder. This is the play order the player follows.</p>
      </div>

      <div className="flex gap-2">
        <select
          value={addBlockId}
          onChange={(e) => setAddBlockId(e.target.value)}
          className="border rounded px-3 py-2 text-sm flex-1 max-w-sm"
        >
          <option value="">Add a block…</option>
          {addable.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.category.name})
            </option>
          ))}
        </select>
        <button onClick={addBlock} className="bg-indigo-600 text-white rounded px-4 py-2 text-sm">
          Add
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sequence.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {sequence.blocks.map((sb) => (
              <SortableRow key={sb.id} sb={sb} onRemove={removeBlock} />
            ))}
            {sequence.blocks.length === 0 && (
              <p className="text-sm text-neutral-500">No blocks in this sequence yet.</p>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
