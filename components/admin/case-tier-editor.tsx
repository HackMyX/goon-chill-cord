"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { updateCaseTier } from "@/lib/actions/admin";
import { RARITY_LABELS, RARITY_ORDER, ALL_ITEM_TYPES, findCaseTier, type Rarity } from "@/lib/cases";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import type { CaseTierRow } from "@/components/admin/admin-shell";

export function CaseTierEditor({ tier }: { tier: CaseTierRow }) {
  const [price, setPrice] = useState(tier.price);
  const [weights, setWeights] = useState<Partial<Record<Rarity, number>>>(tier.rarity_weights);
  const [enabled, setEnabled] = useState(tier.enabled);
  const [itemTypes, setItemTypes] = useState<string[]>(
    tier.item_types ?? findCaseTier(tier.id)?.tier.itemTypes ?? []
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const sound = useSoundManager();
  const { currencyName } = useSiteConfig();

  function toggleType(type: string) {
    setItemTypes((curr) =>
      curr.includes(type) ? curr.filter((t) => t !== type) : [...curr, type]
    );
  }

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    const res = await updateCaseTier({
      tierId: tier.id,
      price,
      rarityWeights: weights,
      enabled,
      itemTypes,
    });
    setSaving(false);
    setStatus(res.success ? "saved" : "error");
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
          </button>
          {status === "saved" && <span className="text-sm font-medium text-emerald-400">Gespeichert.</span>}
          {status === "error" && <span className="text-sm font-medium text-red-400">Fehler.</span>}
        </div>
      }
    >
      <div onClick={(e) => e.stopPropagation()}>
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

          {RARITY_ORDER.map((rarity) => (
            <label key={rarity} className="flex flex-col gap-1 text-xs text-zinc-400">
              {RARITY_LABELS[rarity]} (%)
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
      </div>
    </CollapsibleAdminRow>
  );
}
