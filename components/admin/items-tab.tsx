"use client";

import { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ItemRowEditor } from "@/components/admin/item-row-editor";
import { NewItemForm } from "@/components/admin/new-item-form";
import { ALL_ITEM_TYPES, RARITY_ORDER, RARITY_LABELS, getTypeLabel } from "@/lib/cases";
import { useSoundManager } from "@/lib/sound-manager";
import type { ItemRow } from "@/components/admin/admin-shell";

// Only an *initial guess* before the real height is measured (see
// `measureElement` below) — every row now starts collapsed (item-row-
// editor.tsx's stat-fields line is hidden behind an explicit expand
// toggle, components/admin/collapsible-admin-row.tsx), so unlike before,
// every row's *initial* height is genuinely the same regardless of its
// type. The virtualizer still measures actual rendered height per row
// (picking up the moment any individual row is expanded), this is only
// the first-paint guess.
const ESTIMATED_ROW_HEIGHT = 84;

export function ItemsTab({ items, setItems }: { items: ItemRow[]; setItems: (fn: (prev: ItemRow[]) => ItemRow[]) => void }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [rarityFilter, setRarityFilter] = useState<string>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sound = useSoundManager();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (rarityFilter !== "all" && item.rarity !== rarityFilter) return false;
      return true;
    });
  }, [items, query, typeFilter, rarityFilter]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div className="flex flex-col gap-3">
      <NewItemForm onCreated={(item) => setItems((prev) => [item, ...prev])} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Item suchen..."
            className="w-full bg-transparent text-sm text-zinc-100 outline-none"
          />
        </div>
        <select
          value={typeFilter}
          onMouseEnter={sound.hover}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        >
          <option value="all">Alle Kategorien</option>
          {ALL_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {getTypeLabel(t)}
            </option>
          ))}
        </select>
        <select
          value={rarityFilter}
          onMouseEnter={sound.hover}
          onChange={(e) => setRarityFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        >
          <option value="all">Alle Raritäten</option>
          {RARITY_ORDER.map((r) => (
            <option key={r} value={r}>
              {RARITY_LABELS[r]}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">
          {filtered.length.toLocaleString("de-DE")} / {items.length.toLocaleString("de-DE")} Items
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500">
          Keine Items gefunden.
        </p>
      ) : (
        <div ref={scrollRef} className="h-[70vh] overflow-y-auto pr-1">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = filtered[virtualRow.index];
              return (
                <div
                  key={item.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: 8,
                  }}
                >
                  <ItemRowEditor
                    item={item}
                    onDeleted={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
