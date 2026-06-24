"use client";

import { useState } from "react";
import { Save, PawPrint } from "lucide-react";
import { updatePetConfig } from "@/lib/actions/pets";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { useSoundManager } from "@/lib/sound-manager";
import type { PetTypeConfig } from "@/lib/pets";

/**
 * Edits one of the fixed pet species (lib/pets.ts) — same "fixed rows,
 * full stat editing, no create/delete" shape as MonsterTypeEditor, which
 * this is a direct structural copy of.
 */
export function PetConfigEditor({ type }: { type: PetTypeConfig }) {
  const [damage, setDamage] = useState(type.damage);
  const [aggroRadius, setAggroRadius] = useState(type.aggroRadius);
  const [attackSpeed, setAttackSpeed] = useState(type.attackSpeed);
  const [moveSpeed, setMoveSpeed] = useState(type.moveSpeed);
  const [enabled, setEnabled] = useState(type.enabled);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const sound = useSoundManager();

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    sound.click();
    const res = await updatePetConfig({
      id: type.id,
      damage,
      aggroRadius,
      attackSpeed,
      moveSpeed,
      enabled,
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
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-purple-500/10">
            <PawPrint className="h-4 w-4 text-purple-300" />
          </span>
          <div className="min-w-[120px]">
            <p className="font-semibold text-zinc-100">{type.name}</p>
            <p className="text-xs text-zinc-500">{type.id}</p>
          </div>
          <button
            onMouseEnter={sound.hover}
            onClick={(e) => {
              e.stopPropagation();
              sound.click();
              setEnabled((v) => !v);
            }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              enabled ? "border-emerald-400/50 text-emerald-300" : "border-red-400/50 text-red-300"
            }`}
          >
            {enabled ? "Greift an" : "Deaktiviert"}
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
      <div onClick={(e) => e.stopPropagation()} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Schaden
          <input
            type="number"
            min={0}
            value={damage}
            onChange={(e) => setDamage(Math.max(0, Number(e.target.value) || 0))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Aggro-Radius
          <input
            type="number"
            step="0.5"
            min={0}
            value={aggroRadius}
            onChange={(e) => setAggroRadius(Math.max(0, Number(e.target.value) || 0))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Angriffstempo (s)
          <input
            type="number"
            step="0.1"
            min={0.1}
            value={attackSpeed}
            onChange={(e) => setAttackSpeed(Math.max(0.1, Number(e.target.value) || 0.1))}
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
      </div>
    </CollapsibleAdminRow>
  );
}
