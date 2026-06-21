"use client";

import { useState } from "react";
import { Flame, Save, Loader2 } from "lucide-react";
import { updateStreakConfig } from "@/lib/actions/streak";
import { computeStreakReward, type StreakConfig } from "@/lib/streak";
import { useSoundManager } from "@/lib/sound-manager";

interface FieldDef {
  key: keyof StreakConfig;
  label: string;
  hint: string;
  suffix?: string;
}

const NUMBER_FIELDS: FieldDef[] = [
  { key: "baseReward", label: "Basis-Reward", hint: "Belohnung an Tag 1 eines Streaks", suffix: "CR" },
  { key: "dailyIncrement", label: "Tägliche Steigerung", hint: "+X CR pro weiterem Streak-Tag", suffix: "CR" },
  { key: "maxReward", label: "Maximaler Reward", hint: "Deckel — wächst nicht weiter darüber hinaus", suffix: "CR" },
  { key: "gracePeriodHours", label: "Gnadenfrist", hint: "Stunden nach Mitternacht, in denen ein verpasster Tag noch nachgeholt werden kann", suffix: "h" },
  { key: "milestoneInterval", label: "Meilenstein-Intervall", hint: "Jeder Nte Tag löst einen Bonus aus (0 = aus)", suffix: "Tage" },
  { key: "milestoneBonus", label: "Meilenstein-Bonus", hint: "Einmaliger Extra-Bonus an Meilenstein-Tagen", suffix: "CR" },
];

/**
 * Full admin config surface for the daily-streak reward curve
 * (lib/streak.ts has the actual math) — every knob the system supports,
 * with a live preview table so an admin can see exactly what changing a
 * number does to the first two weeks of rewards before saving.
 */
export function StreakConfigEditor({ config }: { config: StreakConfig }) {
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  function setField<K extends keyof StreakConfig>(key: K, value: StreakConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateStreakConfig(form);
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

  const previewDays = Array.from({ length: 14 }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-zinc-100">
            <Flame className="h-5 w-5 text-orange-400" />
            Daily-Streak-Konfiguration
          </h3>
          <button
            onMouseEnter={sound.hover}
            onClick={() => setField("enabled", !form.enabled)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
              form.enabled
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-red-500/20 text-red-300"
            }`}
          >
            {form.enabled ? "AKTIV" : "DEAKTIVIERT"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NUMBER_FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-400">{field.label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={form[field.key] as number}
                  onChange={(e) => setField(field.key, Number(e.target.value) as never)}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
                {field.suffix && <span className="text-xs text-zinc-500">{field.suffix}</span>}
              </div>
              <span className="text-[11px] text-zinc-600">{field.hint}</span>
            </label>
          ))}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">Verhalten bei verpasstem Tag</span>
            <select
              value={form.resetOnMiss ? "reset" : "freeze"}
              onChange={(e) => setField("resetOnMiss", e.target.value === "reset")}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            >
              <option value="reset" className="bg-[#0f0e18]">
                Streak zurücksetzen auf 1
              </option>
              <option value="freeze" className="bg-[#0f0e18]">
                Streak einfrieren (nicht zurücksetzen)
              </option>
            </select>
            <span className="text-[11px] text-zinc-600">
              Außerhalb der Gnadenfrist greift dieses Verhalten
            </span>
          </label>
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

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <h4 className="mb-3 text-sm font-bold text-zinc-300">
          Vorschau — erste 14 Streak-Tage mit aktuellen Werten
        </h4>
        <div className="flex gap-2">
          {previewDays.map((day) => {
            const result = computeStreakReward(day, form);
            return (
              <div
                key={day}
                className={`flex min-w-[64px] flex-col items-center gap-1 rounded-lg border px-2 py-2 ${
                  result.isMilestone
                    ? "border-amber-400/60 bg-amber-500/10"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <span className="text-[10px] text-zinc-500">Tag {day}</span>
                <span className="text-sm font-bold text-purple-300">{result.totalCredits}</span>
                {result.isMilestone && <span className="text-[10px] text-amber-300">Meilenstein</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
