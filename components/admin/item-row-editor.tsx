"use client";

import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { upsertItem, deleteItem } from "@/lib/actions/admin";
import { RARITY_ORDER, RARITY_LABELS, RARITY_STYLES, type Rarity } from "@/lib/cases";
import { hasItemIcon, KNOWN_ICON_TYPES } from "@/lib/item-icons";
import { ItemRenderer } from "@/components/items/item-renderer";
import type { ItemRow } from "@/components/admin/admin-shell";

interface ItemRowEditorProps {
  item: ItemRow;
  onDeleted: (id: string) => void;
}

export function ItemRowEditor({ item, onDeleted }: ItemRowEditorProps) {
  const [name, setName] = useState(item.name);
  const [rarity, setRarity] = useState<Rarity>(item.rarity);
  const [type, setType] = useState(item.type);
  const [priceCr, setPriceCr] = useState(item.price_cr);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    const res = await upsertItem({ id: item.id, name, rarity, type, price_cr: priceCr });
    setSaving(false);
    setStatus(res.success ? "saved" : "error");
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await deleteItem(item.id);
    setDeleting(false);
    if (res.success) onDeleted(item.id);
    else setStatus("error");
  }

  const style = RARITY_STYLES[rarity];

  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition-all duration-200 ${style.hoverRing} ${style.hoverGlow}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <ItemRenderer type={type} rarity={rarity} size="md" />

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          placeholder="type"
          list="known-item-types"
          className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
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
          className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        />

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.5)] transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 rounded-lg border border-red-500/50 px-3 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {status === "saved" && <span className="text-sm text-emerald-400">✓</span>}
        {status === "error" && <span className="text-sm text-red-400">Fehler</span>}
      </div>
      {!hasItemIcon(type) && (
        <p className="mt-1.5 text-[11px] text-amber-400">
          Unbekannter Typ — zeigt den schwebenden Platzhalter statt eines festen Icons.
        </p>
      )}
    </div>
  );
}
