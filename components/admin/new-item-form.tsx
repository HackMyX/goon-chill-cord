"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { upsertItem } from "@/lib/actions/admin";
import { RARITY_ORDER, RARITY_LABELS, type Rarity } from "@/lib/cases";
import { hasItemIcon, KNOWN_ICON_TYPES } from "@/lib/item-icons";
import { ItemRenderer } from "@/components/items/item-renderer";
import type { ItemRow } from "@/components/admin/admin-shell";

export function NewItemForm({ onCreated }: { onCreated: (item: ItemRow) => void }) {
  const [name, setName] = useState("");
  const [rarity, setRarity] = useState<Rarity>("normal");
  const [type, setType] = useState("");
  const [priceCr, setPriceCr] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    const res = await upsertItem({ name, rarity, type, price_cr: priceCr });
    setSaving(false);
    if (!res.success || !res.item) {
      setError(res.error ?? "Fehler.");
      return;
    }
    onCreated(res.item);
    setName("");
    setType("");
    setPriceCr(0);
  }

  return (
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/[0.04] px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {type && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/30">
            <ItemRenderer type={type} rarity={rarity} size="sm" />
          </div>
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="min-w-[140px] flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        />
        <select
          value={rarity}
          onChange={(e) => setRarity(e.target.value as Rarity)}
          className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        >
          {RARITY_ORDER.map((r) => (
            <option key={r} value={r}>
              {RARITY_LABELS[r]}
            </option>
          ))}
        </select>
        <input
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="type (z.B. hat, weapon)"
          list="known-item-types"
          className="w-44 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        />
        <datalist id="known-item-types">
          {KNOWN_ICON_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <input
          type="number"
          value={priceCr}
          onChange={(e) => setPriceCr(Number(e.target.value) || 0)}
          placeholder="Preis"
          className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        />
        <button
          onClick={handleCreate}
          disabled={saving || !name.trim() || !type.trim()}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.5)] transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Erstellen
        </button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        {type && !hasItemIcon(type) ? (
          <span className="text-amber-400">
            Unbekannter Typ „{type}&quot; — Item zeigt den schwebenden Platzhalter statt eines
            festen Icons.
          </span>
        ) : (
          <>Icon wird automatisch aus dem Typ abgeleitet (siehe lib/item-icons.ts). Bekannte Typen: {KNOWN_ICON_TYPES.join(", ")}.</>
        )}
      </p>
    </div>
  );
}
