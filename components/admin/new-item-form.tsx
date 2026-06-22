"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { upsertItem } from "@/lib/actions/admin";
import { RARITY_ORDER, RARITY_LABELS, getTypeLabel, type Rarity } from "@/lib/cases";
import { hasItemIcon, KNOWN_ICON_TYPES } from "@/lib/item-icons";
import { ItemRenderer } from "@/components/items/item-renderer";
import { useSoundManager } from "@/lib/sound-manager";
import { isWeaponType, isArmorType, isPerkType, isShieldType, SUGGESTED_DAMAGE_BY_RARITY, type PerkType } from "@/lib/combat";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import type { ItemRow } from "@/components/admin/admin-shell";

const PERK_TYPE_LABELS: Record<PerkType, string> = {
  none: "Kein Perk",
  speed_boost: "Speed Boost",
  jump_boost: "Jump Boost",
  hp_regen_boost: "HP-Regen Boost",
};

export function NewItemForm({ onCreated }: { onCreated: (item: ItemRow) => void }) {
  const [name, setName] = useState("");
  const [rarity, setRarity] = useState<Rarity>("normal");
  const [type, setType] = useState("");
  const [priceCr, setPriceCr] = useState(0);
  const [damage, setDamage] = useState(0);
  const [armor, setArmor] = useState(0);
  const [perkType, setPerkType] = useState<PerkType>("none");
  const [perkMagnitude, setPerkMagnitude] = useState(0);
  const [shieldHp, setShieldHp] = useState(0);
  const [shieldCooldown, setShieldCooldown] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();
  const { damageLabel } = useSiteConfig();

  async function handleCreate() {
    setSaving(true);
    setError(null);
    const res = await upsertItem({
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
    if (!res.success || !res.item) {
      setError(res.error ?? "Fehler.");
      return;
    }
    onCreated(res.item);
    setName("");
    setType("");
    setPriceCr(0);
    setDamage(0);
    setArmor(0);
    setPerkType("none");
    setPerkMagnitude(0);
    setShieldHp(0);
    setShieldCooldown(0);
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
          placeholder="type (z.B. hat, weapon)"
          list="known-item-types"
          className="w-44 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        />
        <datalist id="known-item-types">
          {KNOWN_ICON_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        {type && (
          <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-200">
            {getTypeLabel(type)}
          </span>
        )}
        <input
          type="number"
          value={priceCr}
          onChange={(e) => setPriceCr(Number(e.target.value) || 0)}
          placeholder="Preis"
          className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
        />
        {isWeaponType(type) && (
          <input
            type="number"
            min={0}
            value={damage}
            onChange={(e) => setDamage(Math.max(0, Number(e.target.value) || 0))}
            placeholder={`⚔ ${damageLabel} (Vorschlag ${SUGGESTED_DAMAGE_BY_RARITY[rarity]})`}
            className="w-40 rounded-lg border border-emerald-400/30 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-400/60"
          />
        )}
        {isArmorType(type) && (
          <input
            type="number"
            min={0}
            value={armor}
            onChange={(e) => setArmor(Math.max(0, Number(e.target.value) || 0))}
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
              placeholder="🔵 Schild-HP"
              className="w-32 rounded-lg border border-cyan-400/30 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-cyan-400/60"
            />
            <input
              type="number"
              min={0}
              value={shieldCooldown}
              onChange={(e) => setShieldCooldown(Math.max(0, Number(e.target.value) || 0))}
              placeholder="⏱ Cooldown (s)"
              className="w-32 rounded-lg border border-cyan-400/30 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-cyan-400/60"
            />
          </>
        )}
        <button
          onMouseEnter={sound.hover}
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
