"use client";

import { useState } from "react";
import { Save, Skull } from "lucide-react";
import { updateMonsterType } from "@/lib/actions/monsters";
import { useSoundManager } from "@/lib/sound-manager";
import type { MonsterTypeConfig } from "@/lib/monsters";

/**
 * Edits one of the 8 fixed monster variants (lib/monsters.ts) — same
 * "fixed rows, full stat editing, no create/delete" shape as
 * CaseTierEditor. `type.id` is never editable since
 * lib/actions/monsters.ts' updateMonsterType() only accepts the 8 known
 * ids; this form can only ever change what one of them *does*.
 */
export function MonsterTypeEditor({ type }: { type: MonsterTypeConfig }) {
  const [name, setName] = useState(type.name);
  const [health, setHealth] = useState(type.health);
  const [attackDamage, setAttackDamage] = useState(type.attackDamage);
  const [moveSpeed, setMoveSpeed] = useState(type.moveSpeed);
  const [aggroRange, setAggroRange] = useState(type.aggroRange);
  const [attackRange, setAttackRange] = useState(type.attackRange);
  const [attackCooldown, setAttackCooldown] = useState(type.attackCooldown);
  const [rewardMin, setRewardMin] = useState(type.rewardMin);
  const [rewardMax, setRewardMax] = useState(type.rewardMax);
  const [spawnWeight, setSpawnWeight] = useState(type.spawnWeight);
  const [colorHex, setColorHex] = useState(type.colorHex);
  const [enabled, setEnabled] = useState(type.enabled);
  const [hasWeapon, setHasWeapon] = useState(type.hasWeapon ?? false);
  const [canThrow, setCanThrow] = useState(type.canThrow ?? false);
  const [throwDamage, setThrowDamage] = useState(type.throwDamage ?? 0);
  const [throwCooldown, setThrowCooldown] = useState(type.throwCooldown ?? 2);
  const [throwRange, setThrowRange] = useState(type.throwRange ?? Math.max(attackRange + 1, 5));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const sound = useSoundManager();

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    const res = await updateMonsterType({
      id: type.id,
      name,
      health,
      attackDamage,
      moveSpeed,
      aggroRange,
      attackRange,
      attackCooldown,
      rewardMin,
      rewardMax,
      spawnWeight,
      colorHex,
      enabled,
      hasWeapon,
      canThrow,
      throwDamage,
      throwCooldown,
      throwRange,
    });
    setSaving(false);
    setStatus(res.success ? "saved" : "error");
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all duration-200 hover:border-purple-400/30 hover:shadow-[0_0_24px_rgba(168,85,247,0.12)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10"
            style={{ backgroundColor: `${colorHex}33` }}
          >
            <Skull className="h-4 w-4" style={{ color: colorHex }} />
          </span>
          <div>
            <p className="font-semibold text-zinc-100">{type.name}</p>
            <p className="text-xs text-zinc-500">{type.id}</p>
          </div>
        </div>
        <button
          onMouseEnter={sound.hover}
          onClick={() => {
            sound.click();
            setEnabled((v) => !v);
          }}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            enabled ? "border-emerald-400/50 text-emerald-300" : "border-red-400/50 text-red-300"
          }`}
        >
          {enabled ? "Spawnt" : "Deaktiviert"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Anzeigename
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Farbe
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
              className="h-9 w-10 rounded-lg border border-white/10 bg-black/30"
            />
            <input
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Leben (HP)
          <input
            type="number"
            min={1}
            value={health}
            onChange={(e) => setHealth(Math.max(1, Number(e.target.value) || 1))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Angriffsschaden
          <input
            type="number"
            min={0}
            value={attackDamage}
            onChange={(e) => setAttackDamage(Math.max(0, Number(e.target.value) || 0))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Bewegungstempo
          <input
            type="number"
            step="0.1"
            min={0}
            value={moveSpeed}
            onChange={(e) => setMoveSpeed(Math.max(0, Number(e.target.value) || 0))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Aggro-Reichweite
          <input
            type="number"
            step="0.5"
            min={0}
            value={aggroRange}
            onChange={(e) => setAggroRange(Math.max(0, Number(e.target.value) || 0))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Angriffsreichweite
          <input
            type="number"
            step="0.1"
            min={0}
            value={attackRange}
            onChange={(e) => setAttackRange(Math.max(0, Number(e.target.value) || 0))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Angriffstempo (s)
          <input
            type="number"
            step="0.1"
            min={0.1}
            value={attackCooldown}
            onChange={(e) => setAttackCooldown(Math.max(0.1, Number(e.target.value) || 0.1))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Belohnung min (CR)
          <input
            type="number"
            min={0}
            value={rewardMin}
            onChange={(e) => setRewardMin(Math.max(0, Number(e.target.value) || 0))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Belohnung max (CR)
          <input
            type="number"
            min={0}
            value={rewardMax}
            onChange={(e) => setRewardMax(Math.max(0, Number(e.target.value) || 0))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Spawn-Gewicht
          <input
            type="number"
            min={0}
            value={spawnWeight}
            onChange={(e) => setSpawnWeight(Math.max(0, Number(e.target.value) || 0))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
      </div>

      {/* Held weapon (purely cosmetic) + ranged throw — see
          components/world/monster.tsx's MonsterWeapon/ThrownProjectile for
          what these actually render/do in the World. */}
      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-white/10 pt-3">
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={hasWeapon}
            onChange={(e) => setHasWeapon(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-black/30"
          />
          Trägt Waffe (nur visuell)
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={canThrow}
            onChange={(e) => setCanThrow(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-black/30"
          />
          Kann werfen (Fernkampf)
        </label>
        {canThrow && (
          <>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Wurfschaden
              <input
                type="number"
                min={0}
                value={throwDamage}
                onChange={(e) => setThrowDamage(Math.max(0, Number(e.target.value) || 0))}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Wurf-Cooldown (s)
              <input
                type="number"
                step="0.1"
                min={0.2}
                value={throwCooldown}
                onChange={(e) => setThrowCooldown(Math.max(0.2, Number(e.target.value) || 0.2))}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Wurfreichweite
              <input
                type="number"
                step="0.5"
                min={0}
                value={throwRange}
                onChange={(e) => setThrowRange(Math.max(0, Number(e.target.value) || 0))}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
              <span className="text-[11px] text-zinc-500">Muss zwischen Angriffs- und Aggro-Reichweite liegen</span>
            </label>
          </>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onMouseEnter={sound.hover}
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.5)] transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Speichert..." : "Speichern"}
        </button>
        {status === "saved" && <span className="text-sm font-medium text-emerald-400">Gespeichert.</span>}
        {status === "error" && <span className="text-sm font-medium text-red-400">Fehler beim Speichern.</span>}
      </div>
    </div>
  );
}
