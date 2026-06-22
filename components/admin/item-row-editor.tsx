"use client";

import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { upsertItem, deleteItem } from "@/lib/actions/admin";
import { RARITY_ORDER, RARITY_LABELS, RARITY_STYLES, getTypeLabel, type Rarity } from "@/lib/cases";
import { hasItemIcon, KNOWN_ICON_TYPES } from "@/lib/item-icons";
import { ItemRenderer } from "@/components/items/item-renderer";
import { useSoundManager } from "@/lib/sound-manager";
import { isWeaponType, isArmorType, isPerkType, isShieldType, SUGGESTED_DAMAGE_BY_RARITY, type PerkType } from "@/lib/combat";
import type { ItemRow } from "@/components/admin/admin-shell";

const PERK_TYPE_LABELS: Record<PerkType, string> = {
  none: "Kein Perk",
  speed_boost: "Speed Boost",
  jump_boost: "Jump Boost",
  hp_regen_boost: "HP-Regen Boost",
};

interface ItemRowEditorProps {
  item: ItemRow;
  onDeleted: (id: string) => void;
}

export function ItemRowEditor({ item, onDeleted }: ItemRowEditorProps) {
  const [name, setName] = useState(item.name);
  const [rarity, setRarity] = useState<Rarity>(item.rarity);
  const [type, setType] = useState(item.type);
  const [priceCr, setPriceCr] = useState(item.price_cr);
  const [damage, setDamage] = useState(item.damage ?? 0);
  const [armor, setArmor] = useState(item.armor ?? 0);
  const [perkType, setPerkType] = useState<PerkType>(item.perk_type ?? "none");
  const [perkMagnitude, setPerkMagnitude] = useState(item.perk_magnitude ?? 0);
  const [shieldHp, setShieldHp] = useState(item.shield_hp ?? 0);
  const [shieldCooldown, setShieldCooldown] = useState(item.shield_regen_cooldown_sec ?? 0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const sound = useSoundManager();

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    const res = await upsertItem({
      id: item.id,
      name,
      rarity,
      type,
      price_cr: priceCr,
      damage: isWeaponType(type) ? damage : null,
      armor: isArmorType(type) ? armor : 0,
      perk_type: isPerkType(type) ? perkType : "none",
      perk_magnitude: isPerkType(type) ? perkMagnitude : 0,
      shield_hp: isShieldType(type) ? shieldHp : 0,
      shield_regen_cooldown_sec: isShieldType(type) ? shieldCooldown : 0,
    });
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
          onMouseEnter={sound.hover}
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
        <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-200">
          {getTypeLabel(type)}
        </span>
        <datalist id="known-item-types">
          {KNOWN_ICON_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <input
          type="number"
          value={priceCr}
          onChange={(e) => setPriceCr(Number(e.target.value) || 0)}
          title="Preis (CR)"
          className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        />

        {isWeaponType(type) && (
          <input
            type="number"
            min={0}
            value={damage}
            onChange={(e) => setDamage(Math.max(0, Number(e.target.value) || 0))}
            title="Schaden (DMG)"
            placeholder={`⚔ DMG (Vorschlag ${SUGGESTED_DAMAGE_BY_RARITY[rarity]})`}
            className="w-36 rounded-lg border border-emerald-400/30 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-400/60"
          />
        )}

        <button
          onMouseEnter={sound.hover}
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.5)] transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
        </button>
        <button
          onMouseEnter={sound.hover}
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 rounded-lg border border-red-500/50 px-3 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {status === "saved" && <span className="text-sm text-emerald-400">✓</span>}
        {status === "error" && <span className="text-sm text-red-400">Fehler</span>}
      </div>

      {(isArmorType(type) || isPerkType(type) || isShieldType(type)) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/5 pt-2">
          {isArmorType(type) && (
            <input
              type="number"
              min={0}
              value={armor}
              onChange={(e) => setArmor(Math.max(0, Number(e.target.value) || 0))}
              title="Rüstung (Schadensreduktion)"
              placeholder="🛡 Rüstung"
              className="w-32 rounded-lg border border-blue-400/30 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-blue-400/60"
            />
          )}
          {isPerkType(type) && (
            <>
              <select
                value={perkType}
                onMouseEnter={sound.hover}
                onChange={(e) => setPerkType(e.target.value as PerkType)}
                className="rounded-lg border border-amber-400/30 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
              >
                {Object.entries(PERK_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {perkType !== "none" && (
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  value={perkMagnitude}
                  onChange={(e) => setPerkMagnitude(Math.max(0, Number(e.target.value) || 0))}
                  title="Perk-Stärke (z.B. 0.15 = +15%)"
                  placeholder="Stärke (z.B. 0.15)"
                  className="w-36 rounded-lg border border-amber-400/30 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-amber-400/60"
                />
              )}
            </>
          )}
          {isShieldType(type) && (
            <>
              <input
                type="number"
                min={0}
                value={shieldHp}
                onChange={(e) => setShieldHp(Math.max(0, Number(e.target.value) || 0))}
                title="Schild-HP (0 = rein kosmetisch)"
                placeholder="🔵 Schild-HP"
                className="w-32 rounded-lg border border-cyan-400/30 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-cyan-400/60"
              />
              <input
                type="number"
                min={0}
                value={shieldCooldown}
                onChange={(e) => setShieldCooldown(Math.max(0, Number(e.target.value) || 0))}
                title="Schild-Respawn-Cooldown (Sekunden)"
                placeholder="⏱ Cooldown (s)"
                className="w-32 rounded-lg border border-cyan-400/30 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-cyan-400/60"
              />
            </>
          )}
        </div>
      )}

      {!hasItemIcon(type) && (
        <p className="mt-1.5 text-[11px] text-amber-400">
          Unbekannter Typ — zeigt den schwebenden Platzhalter statt eines festen Icons.
        </p>
      )}
    </div>
  );
}
