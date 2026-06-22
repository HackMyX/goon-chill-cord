"use client";

import { useState } from "react";
import { Flame, Save, Loader2 } from "lucide-react";
import { updateKillStreakConfig } from "@/lib/actions/kill-streak";
import { streakCrMultiplier, streakMobScale, type KillStreakConfig } from "@/lib/kill-streak";
import { useSoundManager } from "@/lib/sound-manager";

interface FieldDef {
  key: keyof KillStreakConfig;
  label: string;
  hint: string;
  step?: number;
}

const FIELDS: FieldDef[] = [
  {
    key: "multiplierPerKill",
    label: "CR-Multiplikator pro Kill",
    hint: "+X auf den Multiplikator je Kill in der laufenden Serie (z.B. 0.04 = +4%)",
    step: 0.01,
  },
  { key: "maxMultiplier", label: "Maximaler CR-Multiplikator", hint: "Deckel für den Multiplikator", step: 0.1 },
  {
    key: "mobScalePerKill",
    label: "Monster-Skalierung pro Kill",
    hint: "Erhöht Leben/Schaden selbst gespawnter Monster je Kill in der Serie (nur lokal, nicht global)",
    step: 0.01,
  },
  { key: "mobScaleMax", label: "Maximale Monster-Skalierung", hint: "Deckel für die Monster-Skalierung", step: 0.1 },
];

/**
 * Admin config for the kill-streak economy (lib/kill-streak.ts) — strictly
 * separate from the Daily-Streak tab (lib/streak.ts, login streak). Lives
 * in the Monster tab since "stronger monsters the longer your streak
 * runs" is the one knob here that directly affects monster behavior.
 */
export function KillStreakConfigEditor({ config }: { config: KillStreakConfig }) {
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  function setField(key: keyof KillStreakConfig, value: number) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateKillStreakConfig(form);
    setSaving(false);
    if (res.success) {
      sound.win();
      setMessage("Gespeichert.");
    } else {
      sound.error();
      setMessage(res.error ?? "Fehler.");
    }
    setTimeout(() => setMessage(null), 3000);
  }

  const previewKills = [0, 5, 10, 20, 40];

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
      <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-100">
        <Flame className="h-5 w-5 text-orange-400" />
        Kill-Streak-Konfiguration
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">{field.label}</span>
            <input
              type="number"
              min={0}
              step={field.step ?? 1}
              value={form[field.key]}
              onChange={(e) => setField(field.key, Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
            <span className="text-[11px] text-zinc-600">{field.hint}</span>
          </label>
        ))}
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto">
        {previewKills.map((kills) => (
          <div key={kills} className="flex min-w-[88px] flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2">
            <span className="text-[10px] text-zinc-500">{kills} Kills</span>
            <span className="text-sm font-bold text-amber-300">{streakCrMultiplier(kills, form).toFixed(2)}x CR</span>
            <span className="text-[10px] text-red-300">{streakMobScale(kills, form).toFixed(2)}x Mobs</span>
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
    </div>
  );
}
