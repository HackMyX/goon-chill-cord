"use client";

import { Search, X } from "lucide-react";
import { RARITY_LABELS, RARITY_ORDER, RARITY_STYLES, type Rarity } from "@/lib/cases";
import { useSoundManager } from "@/lib/sound-manager";

export type SortKey =
  | "rarity-desc"
  | "rarity-asc"
  | "name-asc"
  | "name-desc"
  | "value-desc"
  | "value-asc"
  | "newest"
  | "oldest";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "rarity-desc", label: "Seltenheit: hoch → niedrig" },
  { value: "rarity-asc", label: "Seltenheit: niedrig → hoch" },
  { value: "name-asc", label: "Name: A → Z" },
  { value: "name-desc", label: "Name: Z → A" },
  { value: "value-desc", label: "Wert: hoch → niedrig" },
  { value: "value-asc", label: "Wert: niedrig → hoch" },
  { value: "newest", label: "Neueste zuerst" },
  { value: "oldest", label: "Älteste zuerst" },
];

interface WardrobeFiltersProps {
  query: string;
  onQueryChange: (query: string) => void;
  activeRarities: Set<Rarity>;
  onToggleRarity: (rarity: Rarity) => void;
  equippedOnly: boolean;
  onToggleEquippedOnly: () => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  resultCount: number;
}

export function WardrobeFilters({
  query,
  onQueryChange,
  activeRarities,
  onToggleRarity,
  equippedOnly,
  onToggleEquippedOnly,
  sort,
  onSortChange,
  resultCount,
}: WardrobeFiltersProps) {
  const sound = useSoundManager();
  const hasActiveFilters = query.trim() !== "" || activeRarities.size > 0 || equippedOnly;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Item suchen..."
            className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-purple-400/60"
          />
        </div>

        <select
          value={sort}
          onMouseEnter={sound.hover}
          onChange={(e) => {
            sound.click();
            onSortChange(e.target.value as SortKey);
          }}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-purple-400/60"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#0f0e18]">
              {opt.label}
            </option>
          ))}
        </select>

        <button
          onMouseEnter={sound.hover}
          onClick={() => {
            sound.click();
            onToggleEquippedOnly();
          }}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
            equippedOnly
              ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
              : "border-white/10 text-zinc-400 hover:border-white/30"
          }`}
        >
          Nur ausgerüstet
        </button>

        {hasActiveFilters && (
          <button
            onMouseEnter={sound.hover}
            onClick={() => {
              sound.click();
              onQueryChange("");
              for (const r of activeRarities) onToggleRarity(r);
              if (equippedOnly) onToggleEquippedOnly();
            }}
            className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:border-red-400/40 hover:text-red-300"
          >
            <X className="h-3 w-3" />
            Filter zurücksetzen
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {RARITY_ORDER.map((rarity) => {
          const active = activeRarities.has(rarity);
          const style = RARITY_STYLES[rarity];
          return (
            <button
              key={rarity}
              onMouseEnter={sound.hover}
              onClick={() => {
                sound.click();
                onToggleRarity(rarity);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${
                active
                  ? style.rainbow
                    ? "ultra-border-animated"
                    : `${style.border} ${style.bg} ${style.text}`
                  : "border-white/10 text-zinc-500 hover:border-white/25 hover:text-zinc-300"
              }`}
            >
              {active && style.rainbow
                ? <span className="rainbow-text">{RARITY_LABELS[rarity]}</span>
                : RARITY_LABELS[rarity]}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-zinc-500">{resultCount} Item{resultCount === 1 ? "" : "s"}</span>
      </div>
    </div>
  );
}
