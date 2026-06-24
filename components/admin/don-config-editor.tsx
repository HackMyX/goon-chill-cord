"use client";

import { useState } from "react";
import {
  Save, Loader2, Coins, Zap, Timer, Target, Plus, X, Eye, EyeOff, Check,
} from "lucide-react";
import { updateDonConfig } from "@/lib/actions/don-config";
import { DEFAULT_DON_CONFIG, type DonConfig } from "@/lib/don-config";
import { useSoundManager } from "@/lib/sound-manager";

interface Props {
  config: DonConfig;
}

export function DonConfigEditor({ config }: Props) {
  const [form, setForm] = useState<DonConfig>(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [newQuick, setNewQuick] = useState("");
  const sound = useSoundManager();

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateDonConfig(form);
    setSaving(false);
    if (res.success) {
      sound.save();
      setMessage({ text: "Gespeichert.", ok: true });
    } else {
      sound.error();
      setMessage({ text: res.error ?? "Fehler.", ok: false });
    }
    setTimeout(() => setMessage(null), 3000);
  }

  function addQuickAmount() {
    const val = Number(newQuick.trim());
    if (!val || val <= 0 || form.quickAmounts.includes(val)) return;
    setForm((f) => ({ ...f, quickAmounts: [...f.quickAmounts, val].sort((a, b) => a - b) }));
    setNewQuick("");
  }

  function removeQuickAmount(val: number) {
    setForm((f) => ({ ...f, quickAmounts: f.quickAmounts.filter((v) => v !== val) }));
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-zinc-100">
            <Coins className="h-5 w-5 text-amber-400" />
            Double or Nothing — Einstellungen
          </h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Konfiguriert das Glücksspiel-Minispiel auf der Startseite vollständig.
          </p>
        </div>
        <button
          type="button"
          onMouseEnter={sound.hover}
          onClick={() => {
            sound.click();
            setForm((f) => ({ ...f, enabled: !f.enabled }));
          }}
          className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition-colors ${
            form.enabled
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "border-zinc-600/40 bg-zinc-800/40 text-zinc-500"
          }`}
        >
          {form.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {form.enabled ? "Aktiv" : "Deaktiviert"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Daily limit */}
        <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-black/30 p-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            Tageslimit (Flips/Tag)
          </span>
          <input
            type="number"
            min={1}
            max={9999}
            placeholder="Kein Limit"
            value={form.dailyFlipLimit ?? ""}
            onChange={(e) => setForm((f) => ({
              ...f,
              dailyFlipLimit: e.target.value.trim() ? Math.max(1, Number(e.target.value) || 1) : null,
            }))}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-400/60"
          />
          <span className="text-[10px] text-zinc-600">Leerlassen = kein Tageslimit. Zahl eingeben = max. Flips pro User pro Tag.</span>
        </div>

        {/* Hourly limit */}
        <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-black/30 p-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            <Timer className="h-3.5 w-3.5 text-cyan-400" />
            Stundenlimit (Flips/Stunde)
          </span>
          <input
            type="number"
            min={1}
            max={9999}
            placeholder="Kein Limit"
            value={form.hourlyFlipLimit ?? ""}
            onChange={(e) => setForm((f) => ({
              ...f,
              hourlyFlipLimit: e.target.value.trim() ? Math.max(1, Number(e.target.value) || 1) : null,
            }))}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-400/60"
          />
          <span className="text-[10px] text-zinc-600">Leerlassen = kein Stundenlimit. Gilt pro rollendem 60-Minuten-Fenster.</span>
        </div>

        {/* Cooldown */}
        <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-black/30 p-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            <Timer className="h-3.5 w-3.5 text-sky-400" />
            Cooldown (Sekunden)
          </span>
          <input
            type="number"
            min={0}
            max={3600}
            value={form.cooldownSec}
            onChange={(e) => setForm((f) => ({ ...f, cooldownSec: Math.max(0, Number(e.target.value) || 0) }))}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-sky-400/60"
          />
          <span className="text-[10px] text-zinc-600">0 = kein Cooldown. Cooldown wird serverseitig erzwungen.</span>
        </div>

        {/* Win chance */}
        <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-black/30 p-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            <Target className="h-3.5 w-3.5 text-purple-400" />
            Gewinnchance (%)
          </span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={99}
              step={1}
              value={Math.round(form.winChance * 100)}
              onChange={(e) => setForm((f) => ({ ...f, winChance: Number(e.target.value) / 100 }))}
              className="flex-1 accent-purple-500"
            />
            <span className="w-10 text-right text-sm font-bold text-purple-300">
              {Math.round(form.winChance * 100)}%
            </span>
          </div>
          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-500"
              style={{ width: `${form.winChance * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-zinc-600">Standard: 50% (fair). Höher = mehr Gewinne für User.</span>
        </div>

        {/* Min bet */}
        <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-black/30 p-3">
          <span className="text-xs font-semibold text-zinc-300">Mindesteinsatz</span>
          <input
            type="number"
            min={1}
            value={form.minBet}
            onChange={(e) => setForm((f) => ({ ...f, minBet: Math.max(1, Number(e.target.value) || 1) }))}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
          <span className="text-[10px] text-zinc-600">Kleinster erlaubter Einsatz in Credits.</span>
        </div>

        {/* Max bet */}
        <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-black/30 p-3">
          <span className="text-xs font-semibold text-zinc-300">Maximaleinsatz (leer = unbegrenzt)</span>
          <input
            type="number"
            min={1}
            placeholder="Kein Limit"
            value={form.maxBet ?? ""}
            onChange={(e) => setForm((f) => ({
              ...f,
              maxBet: e.target.value.trim() ? Math.max(1, Number(e.target.value)) : null,
            }))}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
          />
          <span className="text-[10px] text-zinc-600">Leerlassen = nur durch Kontostand begrenzt.</span>
        </div>

        {/* Show remaining spins */}
        <div className="flex flex-col justify-between gap-2 rounded-xl border border-white/8 bg-black/30 p-3">
          <span className="text-xs font-semibold text-zinc-300">Verbleibende Flips anzeigen</span>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, showRemainingSpins: !f.showRemainingSpins }))}
            className={`flex items-center gap-2 self-start rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
              form.showRemainingSpins
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-zinc-600/40 bg-zinc-800/40 text-zinc-500"
            }`}
          >
            {form.showRemainingSpins ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {form.showRemainingSpins ? "Sichtbar" : "Versteckt"}
          </button>
          <span className="text-[10px] text-zinc-600">Fortschrittsbalken + Zähler sichtbar für den User.</span>
        </div>

        {/* All In */}
        <div className="flex flex-col justify-between gap-2 rounded-xl border border-white/8 bg-black/30 p-3">
          <span className="text-xs font-semibold text-zinc-300">ALL IN Schnellwahl</span>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, allowAllIn: !f.allowAllIn }))}
            className={`flex items-center gap-2 self-start rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
              form.allowAllIn
                ? "border-red-500/40 bg-red-500/15 text-red-300"
                : "border-zinc-600/40 bg-zinc-800/40 text-zinc-500"
            }`}
          >
            {form.allowAllIn ? <Check className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {form.allowAllIn ? "Aktiviert" : "Deaktiviert"}
          </button>
          <span className="text-[10px] text-zinc-600">Zeigt Spielern einen &quot;ALL IN&quot;-Button — setzt den gesamten Kontostand als Einsatz.</span>
        </div>
      </div>

      {/* Texts */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-zinc-400">Abschnitts-Titel</span>
          <input
            type="text"
            maxLength={60}
            value={form.sectionTitle}
            onChange={(e) => setForm((f) => ({ ...f, sectionTitle: e.target.value }))}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-zinc-400">Abschnitts-Untertitel</span>
          <input
            type="text"
            maxLength={120}
            value={form.sectionSubtitle}
            onChange={(e) => setForm((f) => ({ ...f, sectionSubtitle: e.target.value }))}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
      </div>

      {/* Quick amounts */}
      <div className="mt-4">
        <span className="text-xs font-semibold text-zinc-400">Schnellauswahl-Beträge</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {form.quickAmounts.map((val) => (
            <div
              key={val}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1"
            >
              <span className="text-sm font-semibold text-amber-300">{val.toLocaleString("de-DE")}</span>
              <button
                type="button"
                onClick={() => removeQuickAmount(val)}
                className="text-amber-600 hover:text-red-400"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              placeholder="Neu…"
              value={newQuick}
              onChange={(e) => setNewQuick(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addQuickAmount()}
              className="w-24 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
            <button
              type="button"
              onClick={addQuickAmount}
              className="rounded-lg border border-white/10 p-1.5 text-zinc-500 hover:border-amber-400/50 hover:text-amber-300"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <span className="mt-1 block text-[11px] text-zinc-600">
          Klick-Schnellauswahl-Beträge für den User. Automatisch sortiert.
        </span>
      </div>

      {/* Reset + Save */}
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/8 pt-4">
        {message && (
          <span className={`text-sm font-medium ${message.ok ? "text-emerald-400" : "text-red-400"}`}>
            {message.ok ? <Check className="mr-1 inline h-4 w-4" /> : null}
            {message.text}
          </span>
        )}
        <button
          type="button"
          onClick={() => setForm(DEFAULT_DON_CONFIG)}
          className="ml-auto text-xs text-zinc-600 underline hover:text-zinc-400"
        >
          Zurücksetzen
        </button>
        <button
          onMouseEnter={sound.hover}
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl border border-purple-500/40 bg-purple-500/15 px-5 py-2 text-sm font-bold text-purple-200 transition-colors hover:bg-purple-500/25 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Speichern
        </button>
      </div>
    </div>
  );
}
