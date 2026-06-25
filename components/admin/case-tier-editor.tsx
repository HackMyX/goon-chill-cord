"use client";

import { useState } from "react";
import { Save, Search, X } from "lucide-react";
import { updateCaseTier } from "@/lib/actions/admin";
import { RARITY_LABELS, RARITY_ORDER, RARITY_STYLES, ALL_ITEM_TYPES, findCaseTier, type Rarity } from "@/lib/cases";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import type { CaseTierRow, ItemRow } from "@/components/admin/admin-shell";

const RARITY_FILTER_STYLES: Record<Rarity, { active: string; inactive: string }> = {
  normal:   { active: "border-blue-400/60 bg-blue-500/15 text-blue-200",    inactive: "border-white/10 text-zinc-500 hover:border-blue-400/40 hover:text-blue-400" },
  selten:   { active: "border-purple-400/60 bg-purple-500/15 text-purple-200", inactive: "border-white/10 text-zinc-500 hover:border-purple-400/40 hover:text-purple-400" },
  mythisch: { active: "border-amber-400/60 bg-amber-500/15 text-amber-200",  inactive: "border-white/10 text-zinc-500 hover:border-amber-400/40 hover:text-amber-400" },
  ultra:    { active: "border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-200", inactive: "border-white/10 text-zinc-500 hover:border-fuchsia-400/40 hover:text-fuchsia-400" },
};

const RARITY_DOT: Record<Rarity, string> = {
  normal: "bg-blue-400",
  selten: "bg-purple-400",
  mythisch: "bg-amber-400",
  ultra: "bg-fuchsia-400",
};

export function CaseTierEditor({ tier, items }: { tier: CaseTierRow; items: ItemRow[] }) {
  const [price, setPrice] = useState(tier.price);
  const [weights, setWeights] = useState<Partial<Record<Rarity, number>>>(tier.rarity_weights);
  const [enabled, setEnabled] = useState(tier.enabled);
  const [itemTypes, setItemTypes] = useState<string[]>(
    tier.item_types ?? findCaseTier(tier.id)?.tier.itemTypes ?? []
  );
  const [itemIds, setItemIds] = useState<string[]>(tier.item_ids ?? []);
  const [groupLabel, setGroupLabel] = useState(tier.group_label ?? "");
  const [groupSubtitle, setGroupSubtitle] = useState(tier.group_subtitle ?? "");
  const [previewCost, setPreviewCost] = useState(tier.preview_cost ?? 0);
  const [multiOpenMax, setMultiOpenMax] = useState(tier.multi_open_max ?? 10);
  const [itemSearch, setItemSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all");
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const sound = useSoundManager();
  const { currencyName } = useSiteConfig();

  const isStandard = tier.id.endsWith("-standard");

  function toggleType(type: string) {
    setItemTypes((curr) =>
      curr.includes(type) ? curr.filter((t) => t !== type) : [...curr, type]
    );
  }

  function toggleItem(id: string) {
    setItemIds((curr) =>
      curr.includes(id) ? curr.filter((i) => i !== id) : [...curr, id]
    );
  }

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !itemSearch.trim() ||
      item.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
      item.type.toLowerCase().includes(itemSearch.toLowerCase());
    const matchesRarity = rarityFilter === "all" || item.rarity === rarityFilter;
    const matchesPinned = !showPinnedOnly || itemIds.includes(item.id);
    return matchesSearch && matchesRarity && matchesPinned;
  });

  // Count pinned items per rarity for the summary badges
  const pinnedPerRarity = RARITY_ORDER.reduce<Record<Rarity, number>>((acc, r) => {
    acc[r] = items.filter((i) => itemIds.includes(i.id) && i.rarity === r).length;
    return acc;
  }, { normal: 0, selten: 0, mythisch: 0, ultra: 0 });

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    const res = await updateCaseTier({
      tierId: tier.id,
      price,
      rarityWeights: weights,
      enabled,
      itemTypes,
      itemIds,
      groupLabel: isStandard ? (groupLabel.trim() || null) : null,
      groupSubtitle: isStandard ? (groupSubtitle.trim() || null) : null,
      previewCost: Math.max(0, previewCost),
      multiOpenMax: Math.min(10, Math.max(2, multiOpenMax)),
    });
    setSaving(false);
    setStatus(res.success ? "saved" : "error");
    if (res.success) sound.save();
    else sound.error();
  }

  return (
    <CollapsibleAdminRow
      header={
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[140px]">
            <p className="font-semibold text-zinc-100">{tier.label}</p>
            <p className="text-xs text-zinc-500">
              {tier.group_id} · {tier.id}
            </p>
          </div>
          <button
            onMouseEnter={sound.hover}
            onClick={(e) => {
              e.stopPropagation();
              sound.click();
              setEnabled((v) => !v);
            }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              enabled
                ? "border-emerald-400/50 text-emerald-300"
                : "border-red-400/50 text-red-300"
            }`}
          >
            {enabled ? "Aktiv" : "Deaktiviert"}
          </button>
          <button
            onMouseEnter={sound.hover}
            onClick={(e) => {
              e.stopPropagation();
              handleSave();
            }}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.5)] transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Speichern
          </button>
          {status === "saved" && <span className="text-sm font-medium text-emerald-400">Gespeichert.</span>}
          {status === "error" && <span className="text-sm font-medium text-red-400">Fehler.</span>}
        </div>
      }
    >
      <div onClick={(e) => e.stopPropagation()}>
        {/* Group title/subtitle — stored on the standard-tier row, controls whole group */}
        {isStandard && (
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Gruppen-Titel (leer = Standardname)
              <input
                type="text"
                value={groupLabel}
                onChange={(e) => setGroupLabel(e.target.value)}
                placeholder="z.B. Cosmetics Case"
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Gruppen-Subtitle (leer = Standardtext)
              <input
                type="text"
                value={groupSubtitle}
                onChange={(e) => setGroupSubtitle(e.target.value)}
                placeholder="z.B. Alle Cosmetics ab 100 CR"
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Preis ({currencyName})
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Sofort-Zeigen Kosten ({currencyName}, 0 = gratis)
            <input
              type="number"
              min={0}
              value={previewCost}
              onChange={(e) => setPreviewCost(Math.max(0, Number(e.target.value) || 0))}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Max. Batch-Open (2–10)
            <input
              type="number"
              min={2}
              max={10}
              value={multiOpenMax}
              onChange={(e) => setMultiOpenMax(Math.min(10, Math.max(2, Number(e.target.value) || 2)))}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-blue-400/60"
            />
          </label>

          {RARITY_ORDER.map((rarity) => (
            <label key={rarity} className="flex flex-col gap-1 text-xs text-zinc-400">
              <span className={RARITY_STYLES[rarity].text}>{RARITY_LABELS[rarity]} (%)</span>
              <input
                type="number"
                step="0.01"
                value={weights[rarity] ?? 0}
                onChange={(e) =>
                  setWeights((w) => ({ ...w, [rarity]: Number(e.target.value) || 0 }))
                }
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
          ))}
        </div>

        <p className="mt-4 text-xs font-semibold tracking-wide text-purple-300">
          ITEM-POOL — welche Typen dieses Tier ziehen darf
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ALL_ITEM_TYPES.map((type) => (
            <button
              key={type}
              onMouseEnter={sound.hover}
              onClick={() => {
                sound.click();
                toggleType(type);
              }}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                itemTypes.includes(type)
                  ? "border-purple-400/60 bg-purple-500/15 text-purple-200"
                  : "border-white/10 text-zinc-500 hover:border-white/30"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Pinned item IDs — when set, override type-based pool entirely */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold tracking-wide text-amber-300">
                EXAKTE ITEMS
              </p>
              {itemIds.length > 0 ? (
                <>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                    {itemIds.length} gepinnt — überschreibt Typen-Pool
                  </span>
                  {/* Per-rarity count badges */}
                  {RARITY_ORDER.filter((r) => pinnedPerRarity[r] > 0).map((r) => (
                    <span key={r} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${RARITY_STYLES[r].bg} ${RARITY_STYLES[r].text}`}>
                      {pinnedPerRarity[r]}× {RARITY_LABELS[r]}
                    </span>
                  ))}
                </>
              ) : (
                <span className="text-[10px] text-zinc-500">(leer = Typen-Pool wird genutzt)</span>
              )}
            </div>
            {itemIds.length > 0 && (
              <button
                onMouseEnter={sound.hover}
                onClick={() => {
                  sound.click();
                  setItemIds([]);
                }}
                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-red-400"
              >
                <X className="h-3 w-3" />
                Alle entfernen
              </button>
            )}
          </div>

          {/* Rarity filter row */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); setRarityFilter("all"); }}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                rarityFilter === "all"
                  ? "border-white/30 bg-white/10 text-zinc-100"
                  : "border-white/10 text-zinc-500 hover:border-white/20"
              }`}
            >
              Alle
            </button>
            {RARITY_ORDER.map((r) => (
              <button
                key={r}
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); setRarityFilter(rarityFilter === r ? "all" : r); }}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  rarityFilter === r
                    ? RARITY_FILTER_STYLES[r].active
                    : RARITY_FILTER_STYLES[r].inactive
                }`}
              >
                {RARITY_LABELS[r]}
                {pinnedPerRarity[r] > 0 && (
                  <span className="ml-1 opacity-70">·{pinnedPerRarity[r]}</span>
                )}
              </button>
            ))}
            {itemIds.length > 0 && (
              <button
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); setShowPinnedOnly((v) => !v); }}
                className={`ml-auto rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  showPinnedOnly
                    ? "border-amber-400/60 bg-amber-500/15 text-amber-200"
                    : "border-white/10 text-zinc-500 hover:border-white/20"
                }`}
              >
                Nur Gepinnte
              </button>
            )}
          </div>

          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Items suchen (Name oder Typ)…"
              className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-3 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </div>

          <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-white/5 bg-black/20">
            {filteredItems.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-500">Keine Items gefunden.</p>
            ) : (
              filteredItems.map((item) => {
                const pinned = itemIds.includes(item.id);
                const rarity = item.rarity as Rarity;
                return (
                  <button
                    key={item.id}
                    onMouseEnter={sound.hover}
                    onClick={() => {
                      sound.click();
                      toggleItem(item.id);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                      pinned ? "bg-amber-500/10 text-amber-200" : "text-zinc-400 hover:bg-white/5"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 flex-shrink-0 rounded-full ${
                        pinned ? "bg-amber-400" : RARITY_DOT[rarity] ?? "bg-zinc-600"
                      }`}
                    />
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="text-zinc-600">{item.type}</span>
                    <span className={`ml-1 text-[10px] font-semibold ${RARITY_STYLES[rarity]?.text ?? "text-zinc-500"}`}>
                      {RARITY_LABELS[rarity] ?? item.rarity}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </CollapsibleAdminRow>
  );
}
