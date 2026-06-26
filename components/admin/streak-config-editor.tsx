"use client";

import { useState } from "react";
import { Flame, Save, Loader2, Zap, Calendar, TrendingUp, Star, Eye, EyeOff } from "lucide-react";
import { updateStreakConfig } from "@/lib/actions/streak";
import { computeStreakReward, type StreakConfig } from "@/lib/streak";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { AdminTooltip } from "@/components/admin/admin-tooltip";

const NUMBER_FIELDS: {
  key: keyof StreakConfig;
  label: string;
  hint: string;
  suffix?: string;
  step?: number;
  min?: number;
}[] = [
  { key: "baseReward", label: "Basis-Reward", hint: "Belohnung an Tag 1 eines Streaks", suffix: "CR" },
  { key: "dailyIncrement", label: "Tägliche Steigerung", hint: "+X pro weiterem Streak-Tag", suffix: "CR" },
  { key: "maxReward", label: "Maximaler Reward", hint: "Deckel — wächst nicht weiter darüber hinaus", suffix: "CR" },
  { key: "gracePeriodHours", label: "Gnadenfrist", hint: "Stunden nach Mitternacht zum Nachholen", suffix: "h", min: 0 },
  { key: "milestoneInterval", label: "Meilenstein-Intervall", hint: "Jeder Nte Tag = Bonus (0 = deaktiviert)", suffix: "Tage" },
  { key: "milestoneBonus", label: "Meilenstein-Bonus", hint: "Einmaliger Extra-Bonus an Meilenstein-Tagen", suffix: "CR" },
  { key: "weekendMultiplier", label: "Wochenend-Multiplikator", hint: "Multipliziert Tagesreward Sa+So (1.0 = aus)", suffix: "x", step: 0.1, min: 1 },
];

function rewardToColor(amount: number, max: number): string {
  const ratio = Math.min(1, amount / max);
  if (ratio >= 1) return "text-red-300 bg-red-500/20 border-red-400/50";
  if (ratio >= 0.75) return "text-orange-300 bg-orange-500/15 border-orange-400/40";
  if (ratio >= 0.5) return "text-amber-300 bg-amber-500/15 border-amber-400/40";
  if (ratio >= 0.25) return "text-yellow-300 bg-yellow-500/10 border-yellow-400/30";
  return "text-blue-300 bg-blue-500/8 border-blue-400/20";
}

export function StreakConfigEditor({ config }: { config: StreakConfig }) {
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewWeekend, setPreviewWeekend] = useState(false);
  const sound = useSoundManager();
  const { currencyName } = useSiteConfig();

  function setField<K extends keyof StreakConfig>(key: K, value: StreakConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateStreakConfig(form);
    setSaving(false);
    if (res.success) { sound.save(); setMessage("Gespeichert."); }
    else { sound.error(); setMessage(res.error ?? "Fehler."); }
    setTimeout(() => setMessage(null), 3000);
  }

  const weekdayDate = new Date("2024-01-01T12:00:00Z");
  const weekendDate = new Date("2024-01-06T12:00:00Z");
  const previewDate = previewWeekend ? weekendDate : weekdayDate;
  const previewDays = Array.from({ length: 30 }, (_, i) => i + 1);
  const maxPreviewReward = Math.max(...previewDays.map((d) => computeStreakReward(d, form, previewDate).totalCredits));

  return (
    <div className="flex flex-col gap-4">
      {/* Main config card */}
      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-zinc-100">
            <Flame className="h-5 w-5 text-orange-400" />
            Daily-Streak-Konfiguration
            <AdminTooltip text="Konfiguriert das tägliche Einlog-Belohnungssystem. Nutzer erhalten täglich Credits, die mit jedem weiteren Tag (Streak) wachsen. Wird hier deaktiviert, können Nutzer keinen Tagesbonus mehr einlösen." />
          </h3>
          <button
            onMouseEnter={sound.hover}
            onClick={() => setField("enabled", !form.enabled)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
              form.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
            }`}
          >
            {form.enabled ? "AKTIV" : "DEAKTIVIERT"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NUMBER_FIELDS.map((field) => (
            <label key={field.key as string} className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
                {field.label}
                <AdminTooltip text={field.hint} />
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={field.min ?? 0}
                  step={field.step ?? 1}
                  value={form[field.key] as number}
                  onChange={(e) => setField(field.key, Number(e.target.value) as never)}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
                {field.suffix && (
                  <span className="flex-shrink-0 text-xs text-zinc-500">
                    {field.suffix === "CR" ? currencyName : field.suffix}
                  </span>
                )}
              </div>
            </label>
          ))}

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
              Verhalten bei verpasstem Tag
              <AdminTooltip text="Was passiert, wenn ein Nutzer den täglichen Bonus nach Ablauf der Gnadenfrist nicht geclaimt hat. 'Zurücksetzen' setzt den Streak auf 1; 'Einfrieren' behält den Streak-Stand." />
            </span>
            <select
              value={form.resetOnMiss ? "reset" : "freeze"}
              onChange={(e) => setField("resetOnMiss", e.target.value === "reset")}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            >
              <option value="reset" className="bg-[#0f0e18]">Streak zurücksetzen auf 1</option>
              <option value="freeze" className="bg-[#0f0e18]">Streak einfrieren (nicht zurücksetzen)</option>
            </select>
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

      {/* Display settings card */}
      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-100">
          <Eye className="h-5 w-5 text-purple-400" />
          Anzeige-Einstellungen (TopBar)
          <AdminTooltip text="Steuert, welche Elemente im mittleren Bereich der oberen Navigationsleiste (TopBar) permanent angezeigt werden. Der 'Abholen'-Button für den Tagesbonus erscheint unabhängig davon immer, wenn eine Belohnung verfügbar ist." />
        </h3>
        <p className="mb-4 text-[11px] text-zinc-500">
          Steuert, was im mittleren Bereich der TopBar dauerhaft sichtbar ist. Die Claim-Schaltfläche erscheint immer, wenn eine Belohnung verfügbar ist.
        </p>
        <div className="flex flex-wrap gap-3">
          <div className="group/tip relative flex items-center gap-2">
            <button
              onMouseEnter={sound.hover}
              onClick={() => setField("showCountdown", !form.showCountdown)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-colors ${
                form.showCountdown
                  ? "border-purple-400/40 bg-purple-500/15 text-purple-200"
                  : "border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20"
              }`}
            >
              {form.showCountdown ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              Countdown-Uhr (HH:MM:SS)
            </button>
            <AdminTooltip text="Zeigt in der TopBar einen Countdown bis zum nächsten verfügbaren Tagesbonus (Stunden:Minuten:Sekunden). Hilfreich für Nutzer, die genau wissen wollen, wann sie wieder einloggen müssen." />
          </div>
          <div className="group/tip relative flex items-center gap-2">
            <button
              onMouseEnter={sound.hover}
              onClick={() => setField("showStreakCounter", !form.showStreakCounter)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-colors ${
                form.showStreakCounter
                  ? "border-orange-400/40 bg-orange-500/15 text-orange-200"
                  : "border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20"
              }`}
            >
              {form.showStreakCounter ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              Streak-Anzeige (🔥 X Tage)
            </button>
            <AdminTooltip text="Zeigt in der TopBar die aktuelle Streak-Anzahl des Nutzers mit Flammen-Icon (z.B. '🔥 7 Tage'). Motiviert Nutzer dazu, täglich einzuloggen." />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
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

      {/* Special Event card */}
      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-zinc-100">
            <Zap className="h-5 w-5 text-amber-400" />
            Sonder-Event
            <AdminTooltip text="Ein zeitlich begrenztes Event, das alle täglichen Streak-Belohnungen mit einem Extra-Multiplikator versieht (z.B. doppelte Credits). Das Event ist unabhängig vom Wochenend-Bonus und stapelt sich mit ihm." />
          </h3>
          <button
            onMouseEnter={sound.hover}
            onClick={() => setField("specialEventEnabled", !form.specialEventEnabled)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
              form.specialEventEnabled ? "bg-amber-500/25 text-amber-200" : "bg-zinc-700 text-zinc-400"
            }`}
          >
            {form.specialEventEnabled ? "AKTIV" : "DEAKTIVIERT"}
          </button>
        </div>

        <p className="mb-4 text-[11px] text-zinc-500">
          Wenn aktiviert, werden alle täglichen Streak-Rewards mit dem Event-Multiplikator
          multipliziert. Wirkt zusätzlich zum Wochenend-Multiplikator.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
              Event-Multiplikator
              <AdminTooltip text="Faktor, mit dem alle Streak-Belohnungen während des Events multipliziert werden. 2.0 = doppelte Credits, 3.0 = dreifache Credits. Wirkt zusätzlich zum Wochenend-Bonus (beide stapeln sich)." />
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                step={0.1}
                value={form.specialEventMultiplier}
                onChange={(e) => setField("specialEventMultiplier", Number(e.target.value))}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
              />
              <span className="flex-shrink-0 text-xs text-zinc-500">x</span>
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
              Event-Label
              <AdminTooltip text="Der Name oder die Beschreibung des Events, der im Streak-Popup und -Banner angezeigt wird. Kann Emojis enthalten (z.B. '🎉 Doppel-Credit-Wochenende'). Maximal ~40 Zeichen empfohlen." />
            </span>
            <input
              type="text"
              value={form.specialEventLabel}
              onChange={(e) => setField("specialEventLabel", e.target.value)}
              placeholder="z.B. Doppelte Credits 🎉"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
            />
          </label>
        </div>

        {form.specialEventEnabled && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            <Zap className="h-4 w-4 flex-shrink-0" />
            <span>Event aktiv: Alle Rewards werden mit <strong>{form.specialEventMultiplier}×</strong> multipliziert</span>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onMouseEnter={sound.hover}
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Speichern
          </button>
          {message && <span className="text-sm text-zinc-400">{message}</span>}
        </div>
      </div>

      {/* 30-day preview */}
      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-300">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              Reward-Kurve — 30 Tage Vorschau
            </h4>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Farbe = Reward-Stärke (blau → rot). Meilenstein-Tage sind gold umrandet.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-white/5 p-1 text-xs">
            <button
              onClick={() => setPreviewWeekend(false)}
              className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${!previewWeekend ? "bg-purple-500/30 text-purple-200" : "text-zinc-500"}`}
            >
              Werktag
            </button>
            <button
              onClick={() => setPreviewWeekend(true)}
              className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${previewWeekend ? "bg-purple-500/30 text-purple-200" : "text-zinc-500"}`}
            >
              Wochenende
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
          {previewDays.map((day) => {
            const result = computeStreakReward(day, form, previewDate);
            const colorCls = rewardToColor(result.totalCredits, maxPreviewReward);
            const isMilestone = result.isMilestone;
            return (
              <div
                key={day}
                title={`Tag ${day}: ${result.totalCredits.toLocaleString("de-DE")} ${currencyName}${isMilestone ? " + Meilenstein" : ""}`}
                className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-center transition-all hover:scale-105 ${
                  isMilestone
                    ? "border-amber-400/60 bg-amber-500/15"
                    : colorCls
                }`}
              >
                <span className="text-[9px] text-zinc-500">{day}</span>
                <span className={`text-[11px] font-bold leading-tight ${isMilestone ? "text-amber-200" : ""}`}>
                  {result.totalCredits >= 1000
                    ? `${(result.totalCredits / 1000).toFixed(1)}k`
                    : result.totalCredits}
                </span>
                {isMilestone && <Star className="h-2.5 w-2.5 text-amber-400" />}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Star className="h-3 w-3 text-amber-400" />
            Meilenstein-Tag (gold)
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-zinc-500" />
            Hover = exakter Wert
          </span>
          {form.specialEventEnabled && (
            <span className="flex items-center gap-1.5 text-amber-400">
              <Zap className="h-3 w-3" />
              Sonder-Event aktiv ({form.specialEventMultiplier}×)
            </span>
          )}
          {previewWeekend && (
            <span className="flex items-center gap-1.5 text-purple-400">
              Wochenend-Multiplikator ({form.weekendMultiplier}×) aktiv
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
