"use client";

import { useState } from "react";
import { Save, PawPrint, RotateCcw, ChevronDown, ChevronUp, Star } from "lucide-react";
import { updatePetConfig, updatePetRarityOverride, deletePetRarityOverride } from "@/lib/actions/pets";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { useSoundManager } from "@/lib/sound-manager";
import {
  PET_RARITIES,
  PET_RARITY_LABELS,
  defaultRarityStats,
  type PetTypeConfig,
  type PetRarity,
  type PetRarityStats,
} from "@/lib/pets";

const RARITY_COLORS: Record<PetRarity, { border: string; bg: string; text: string; badge: string; glow: string }> = {
  normal:   { border: "border-zinc-500/40",   bg: "bg-zinc-800/30",   text: "text-zinc-300",  badge: "bg-zinc-700 text-zinc-300",              glow: "" },
  selten:   { border: "border-sky-500/50",     bg: "bg-sky-900/20",    text: "text-sky-300",   badge: "bg-sky-500/20 text-sky-300 border border-sky-500/40",   glow: "shadow-[0_0_12px_rgba(14,165,233,0.25)]" },
  mythisch: { border: "border-purple-500/50",  bg: "bg-purple-900/20", text: "text-purple-300", badge: "bg-purple-500/20 text-purple-300 border border-purple-500/40", glow: "shadow-[0_0_14px_rgba(168,85,247,0.3)]" },
  ultra:    { border: "border-amber-400/60",   bg: "bg-amber-900/20",  text: "text-amber-300",  badge: "bg-amber-400/20 text-amber-300 border border-amber-400/50",    glow: "shadow-[0_0_18px_rgba(251,191,36,0.35)]" },
};

const RARITY_STARS: Record<PetRarity, number> = {
  normal: 1, selten: 2, mythisch: 3, ultra: 4,
};

function StatField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  decimals = 0,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  decimals?: number;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-400">
      <span className="font-semibold">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={decimals === 0 ? value : value.toFixed(decimals)}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, n));
        }}
        className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60 tabular-nums"
      />
      {hint && <span className="text-[10px] text-zinc-600 leading-tight">{hint}</span>}
    </label>
  );
}

function RarityStatsEditor({
  petTypeId,
  petName,
  rarity,
  baseConfig,
  initialStats,
  hasOverride,
}: {
  petTypeId: string;
  petName: string;
  rarity: PetRarity;
  baseConfig: PetTypeConfig;
  initialStats: PetRarityStats;
  hasOverride: boolean;
}) {
  const sound = useSoundManager();
  const [damage, setDamage] = useState(initialStats.damage);
  const [aggroRadius, setAggroRadius] = useState(initialStats.aggroRadius);
  const [attackSpeed, setAttackSpeed] = useState(initialStats.attackSpeed);
  const [moveSpeed, setMoveSpeed] = useState(initialStats.moveSpeed);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "reset">("idle");
  const [isOverride, setIsOverride] = useState(hasOverride);

  const colors = RARITY_COLORS[rarity];
  const computed = defaultRarityStats(baseConfig)[rarity];

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    sound.click();
    const res = await updatePetRarityOverride({
      petTypeId,
      rarity,
      damage,
      aggroRadius,
      attackSpeed,
      moveSpeed,
    });
    setSaving(false);
    if (res.success) {
      setStatus("saved");
      setIsOverride(true);
      sound.save();
    } else {
      setStatus("error");
      sound.error();
    }
    setTimeout(() => setStatus("idle"), 2500);
  }

  async function handleReset() {
    setResetting(true);
    sound.click();
    const res = await deletePetRarityOverride(petTypeId, rarity);
    setResetting(false);
    if (res.success) {
      setDamage(computed.damage);
      setAggroRadius(computed.aggroRadius);
      setAttackSpeed(computed.attackSpeed);
      setMoveSpeed(computed.moveSpeed);
      setIsOverride(false);
      setStatus("reset");
      sound.save();
    } else {
      setStatus("error");
      sound.error();
    }
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} ${colors.glow} p-3`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${colors.badge}`}>
            {"★".repeat(RARITY_STARS[rarity])} {PET_RARITY_LABELS[rarity]}
          </span>
          {isOverride ? (
            <span className="text-[10px] text-emerald-400 font-semibold">Individuell gesetzt</span>
          ) : (
            <span className="text-[10px] text-zinc-600 font-medium">Standard (×{["1.00","1.30","1.75","2.50"][PET_RARITIES.indexOf(rarity)]} Basis)</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isOverride && (
            <button
              onClick={handleReset}
              disabled={resetting}
              title="Auf Standard zurücksetzen"
              className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-semibold text-zinc-500 hover:border-red-400/40 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold transition-colors disabled:opacity-50 ${
              rarity === "ultra"
                ? "bg-amber-500/20 border border-amber-400/40 text-amber-300 hover:bg-amber-500/30"
                : rarity === "mythisch"
                ? "bg-purple-500/20 border border-purple-400/40 text-purple-300 hover:bg-purple-500/30"
                : rarity === "selten"
                ? "bg-sky-500/20 border border-sky-400/40 text-sky-300 hover:bg-sky-500/30"
                : "bg-zinc-700 border border-zinc-600 text-zinc-200 hover:bg-zinc-600"
            }`}
          >
            <Save className="h-3 w-3" />
            {saving ? "…" : "Speichern"}
          </button>
          {status === "saved" && <span className="text-[10px] text-emerald-400 font-semibold">✓ Gespeichert</span>}
          {status === "reset" && <span className="text-[10px] text-zinc-400 font-semibold">↺ Zurückgesetzt</span>}
          {status === "error" && <span className="text-[10px] text-red-400 font-semibold">✗ Fehler</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatField
          label="⚔ Schaden"
          value={damage}
          onChange={setDamage}
          min={1}
          hint={`Standard: ${computed.damage}`}
        />
        <StatField
          label="📡 Aggro-Radius"
          value={aggroRadius}
          onChange={setAggroRadius}
          step={0.5}
          decimals={1}
          hint={`Standard: ${computed.aggroRadius}`}
        />
        <StatField
          label="⚡ Atk-Tempo (s)"
          value={attackSpeed}
          onChange={setAttackSpeed}
          step={0.05}
          min={0.05}
          decimals={2}
          hint={`Standard: ${computed.attackSpeed}s (niedriger = schneller)`}
        />
        <StatField
          label="🐾 Bewegung"
          value={moveSpeed}
          onChange={setMoveSpeed}
          step={0.1}
          decimals={1}
          hint={`Standard: ${computed.moveSpeed}`}
        />
      </div>
    </div>
  );
}

/**
 * Edits one of the fixed pet species — base stats + per-rarity overrides.
 * Base stats define the "Normal" tier baseline; rarity overrides let admins
 * set exact values for Selten / Mythisch / Ultra pets of this species.
 */
export function PetConfigEditor({ type }: { type: PetTypeConfig }) {
  const [damage, setDamage] = useState(type.damage);
  const [aggroRadius, setAggroRadius] = useState(type.aggroRadius);
  const [attackSpeed, setAttackSpeed] = useState(type.attackSpeed);
  const [moveSpeed, setMoveSpeed] = useState(type.moveSpeed);
  const [enabled, setEnabled] = useState(type.enabled);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [showRarity, setShowRarity] = useState(false);
  const sound = useSoundManager();

  // Synthetic base config derived from current editor state (so rarity
  // default previews reflect unsaved edits in real-time)
  const liveBase: PetTypeConfig = {
    ...type,
    damage, aggroRadius, attackSpeed, moveSpeed, enabled,
  };

  // Determine which rarities already have DB overrides (server provides
  // rarityStats for every tier; we detect an override by comparing to
  // defaultRarityStats — if they differ, it was set explicitly in the DB)
  const computedDefaults = defaultRarityStats(type);
  function isOverride(rarity: PetRarity): boolean {
    const s = type.rarityStats[rarity];
    const d = computedDefaults[rarity];
    if (!s) return false;
    return s.damage !== d.damage || s.aggroRadius !== d.aggroRadius ||
           s.attackSpeed !== d.attackSpeed || s.moveSpeed !== d.moveSpeed;
  }

  async function handleSaveBase() {
    setSaving(true);
    setStatus("idle");
    sound.click();
    const res = await updatePetConfig({ id: type.id, damage, aggroRadius, attackSpeed, moveSpeed, enabled });
    setSaving(false);
    setStatus(res.success ? "saved" : "error");
    if (res.success) sound.save();
    else sound.error();
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <CollapsibleAdminRow
      header={
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-purple-500/10">
            <PawPrint className="h-4 w-4 text-purple-300" />
          </span>
          <div className="min-w-[120px]">
            <p className="font-semibold text-zinc-100">{type.name}</p>
            <p className="text-xs text-zinc-500">{type.id}</p>
          </div>
          <button
            onMouseEnter={sound.hover}
            onClick={(e) => { e.stopPropagation(); sound.click(); setEnabled((v) => !v); }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              enabled ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10" : "border-red-400/50 text-red-300 bg-red-500/10"
            }`}
          >
            {enabled ? "✓ Greift an" : "✗ Deaktiviert"}
          </button>
          <button
            onMouseEnter={sound.hover}
            onClick={(e) => { e.stopPropagation(); handleSaveBase(); }}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.5)] transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "…" : "Basis speichern"}
          </button>
          {status === "saved" && <span className="text-sm font-medium text-emerald-400">✓ Gespeichert</span>}
          {status === "error" && <span className="text-sm font-medium text-red-400">✗ Fehler</span>}
          {/* Rarity overrides indicator */}
          <div className="ml-auto flex gap-1">
            {PET_RARITIES.map((r) => (
              <span
                key={r}
                title={`${PET_RARITY_LABELS[r]}: ${isOverride(r) ? "Individuell" : "Standard"}`}
                className={`h-2 w-2 rounded-full ${
                  isOverride(r)
                    ? r === "ultra" ? "bg-amber-400" : r === "mythisch" ? "bg-purple-400" : r === "selten" ? "bg-sky-400" : "bg-zinc-400"
                    : "bg-zinc-700"
                }`}
              />
            ))}
          </div>
        </div>
      }
    >
      <div onClick={(e) => e.stopPropagation()} className="space-y-4">
        {/* Base stats */}
        <div>
          <p className="mb-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">Basis-Stats (Normal-Rarität Baseline)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatField label="⚔ Schaden" value={damage} onChange={setDamage} min={1} />
            <StatField label="📡 Aggro-Radius" value={aggroRadius} onChange={setAggroRadius} step={0.5} decimals={1} />
            <StatField label="⚡ Atk-Tempo (s)" value={attackSpeed} onChange={setAttackSpeed} step={0.1} min={0.1} decimals={1} hint="Niedriger = schneller" />
            <StatField label="🐾 Bewegungstempo" value={moveSpeed} onChange={setMoveSpeed} step={0.1} decimals={1} />
          </div>
        </div>

        {/* Rarity overrides toggle */}
        <button
          onClick={() => { sound.click(); setShowRarity((v) => !v); }}
          className="flex w-full items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
        >
          <Star className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="flex-1 text-sm font-bold text-zinc-200">Rarität-Stats anpassen</span>
          <div className="flex gap-1.5 mr-2">
            {PET_RARITIES.map((r) => (
              <span
                key={r}
                className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${RARITY_COLORS[r].badge}`}
              >
                {PET_RARITY_LABELS[r]}
                {isOverride(r) ? " ✓" : ""}
              </span>
            ))}
          </div>
          {showRarity ? <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" /> : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />}
        </button>

        {showRarity && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 leading-relaxed px-1">
              Rarität-Stats überschreiben die Standardwerte (Basis × Multiplikator) für diese spezifische Rarität.
              Greif nur ein wenn du von den Standardwerten abweichen willst — die Standardwerte sind bereits ausbalanciert.
            </p>
            {PET_RARITIES.map((rarity) => (
              <RarityStatsEditor
                key={rarity}
                petTypeId={type.id}
                petName={type.name}
                rarity={rarity}
                baseConfig={liveBase}
                initialStats={type.rarityStats[rarity]}
                hasOverride={isOverride(rarity)}
              />
            ))}
          </div>
        )}
      </div>
    </CollapsibleAdminRow>
  );
}
