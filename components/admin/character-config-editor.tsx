"use client";

import { useState } from "react";
import { Save, Loader2, UserCog } from "lucide-react";
import { updateCharacterConfig } from "@/lib/actions/character-config";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import type { CharacterConfig } from "@/lib/character-config";
import { useSoundManager } from "@/lib/sound-manager";

interface FieldDef {
  key: keyof CharacterConfig;
  label: string;
  hint: string;
  step: number;
}

const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Vitalwerte",
    fields: [
      { key: "playerMaxHp", label: "Max. HP", hint: "Maximale Lebenspunkte des Spielers", step: 5 },
      { key: "hpRegenPerSec", label: "HP-Regen / Sek.", hint: "Heilung pro Sekunde nach der Verzögerung", step: 0.5 },
      {
        key: "hpRegenDelayAfterHitSec",
        label: "HP-Regen-Verzögerung (s)",
        hint: "Sekunden ohne Treffer, bevor die Heilung wieder einsetzt",
        step: 0.5,
      },
      {
        key: "respawnInvulnerableSec",
        label: "Respawn-Unverwundbarkeit (s)",
        hint: "Schutzdauer direkt nach dem Respawn",
        step: 0.5,
      },
    ],
  },
  {
    title: "Ausdauer",
    fields: [
      { key: "playerMaxStamina", label: "Max. Ausdauer", hint: "Maximale Ausdauer (Sprint-Ressource)", step: 5 },
      {
        key: "staminaSprintDrainPerSec",
        label: "Sprint-Verbrauch / Sek.",
        hint: "Ausdauer-Verlust pro Sekunde beim Sprinten",
        step: 1,
      },
      { key: "staminaRegenPerSec", label: "Ausdauer-Regen / Sek.", hint: "Regeneration, solange nicht gesprintet wird", step: 1 },
      {
        key: "staminaMinToStartSprint",
        label: "Mindest-Ausdauer für Sprint",
        hint: "Muss erst wieder über diese Schwelle regenerieren, nachdem Ausdauer auf 0 fiel",
        step: 1,
      },
      { key: "jumpCooldownSec", label: "Sprung-Cooldown (s)", hint: "Mindestabstand zwischen zwei Sprüngen", step: 0.1 },
    ],
  },
  {
    title: "Bewegung",
    fields: [
      { key: "moveSpeed", label: "Gehgeschwindigkeit", hint: "Basistempo ohne Sprint, Welteinheiten/Sek.", step: 0.1 },
      { key: "sprintMultiplier", label: "Sprint-Multiplikator", hint: "Multipliziert die Gehgeschwindigkeit beim Sprinten", step: 0.1 },
    ],
  },
  {
    title: "Kampf",
    fields: [
      { key: "fistDamage", label: "Faustschaden", hint: "Schaden ohne ausgerüstete Waffe — auch die Mindestwirkung jeder Waffe", step: 1 },
      { key: "attackRange", label: "Angriffsreichweite", hint: "Maximale Distanz für einen Treffer, Welteinheiten", step: 0.1 },
      { key: "attackCooldown", label: "Angriffs-Cooldown (s)", hint: "Mindestabstand zwischen zwei Schlägen", step: 0.05 },
      {
        key: "attackHitRadius",
        label: "Trefferradius (nah)",
        hint: "Mindest-Breite des Trefferkegels direkt vor dem Spieler",
        step: 0.05,
      },
      {
        key: "attackConeHalfAngle",
        label: "Trefferkegel-Halbwinkel (rad)",
        hint: "Öffnungswinkel des Trefferkegels in die Ferne, Radiant",
        step: 0.05,
      },
      {
        key: "sprintDamageMultiplier",
        label: "Sprint-Schadensbonus",
        hint: "Schadens-Multiplikator bei einem Treffer während des Sprintens",
        step: 0.05,
      },
      {
        key: "airborneDamageMultiplier",
        label: "Luft-Schadensbonus",
        hint: "Schadens-Multiplikator bei einem Treffer in der Luft",
        step: 0.05,
      },
      {
        key: "pvpDamageMultiplier",
        label: "PvP-Schadens-Dämpfer",
        hint: "Zusätzlicher Dämpfer nur bei Treffern gegen andere Spieler (nie bei Monstern)",
        step: 0.05,
      },
      {
        key: "perkMultiplierCap",
        label: "Perk-Multiplikator-Deckel",
        hint: "Obergrenze für gestapelte Tempo-/Sprung-/Regen-Perks (Amulett+Ring)",
        step: 0.05,
      },
    ],
  },
];

/**
 * Admin config for every player/combat base stat the 3D World has
 * (lib/character-config.ts) — mirrors what used to be a pile of hardcoded
 * lib/combat.ts constants, now all live-tunable. Lives inside the Games
 * tab's "3D World" card (components/admin/games-tab.tsx), same as
 * WorldSessionConfigEditor/KillStreakConfigEditor.
 */
export function CharacterConfigEditor({ config }: { config: CharacterConfig }) {
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  function setField(key: keyof CharacterConfig, value: number) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateCharacterConfig(form);
    setSaving(false);
    if (res.success) {
      sound.save();
      setMessage("Gespeichert.");
    } else {
      sound.error();
      setMessage(res.error ?? "Fehler.");
    }
    setTimeout(() => setMessage(null), 3000);
  }

  return (
    <CollapsibleAdminRow
      header={
        <div className="flex items-center gap-2">
          <UserCog className="h-5 w-5 text-cyan-300" />
          <span className="text-base font-bold text-zinc-100">Charakter &amp; Kampf — Grundwerte</span>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">{group.title}</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {group.fields.map((field) => (
                <label key={field.key} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-zinc-400">{field.label}</span>
                  <input
                    type="number"
                    min={0}
                    step={field.step}
                    value={form[field.key]}
                    onChange={(e) => setField(field.key, Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                  />
                  <span className="text-[11px] text-zinc-600">{field.hint}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onMouseEnter={sound.hover}
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Speichern
        </button>
        {message && <span className="text-sm text-zinc-400">{message}</span>}
      </div>
    </CollapsibleAdminRow>
  );
}
