"use client";

import { useState } from "react";
import { Save, Loader2, Plus, X, Disc3, Info, Zap } from "lucide-react";
import { updatePlinkoConfig } from "@/lib/actions/plinko";
import type { PlinkoConfig, PlinkoRiskLevel } from "@/lib/actions/plinko";
import { useSoundManager } from "@/lib/sound-manager";

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
    >
      <span className={`relative block h-6 w-11 overflow-hidden rounded-full transition-colors duration-200 ${value ? "bg-purple-600" : "bg-zinc-700"}`}>
        <span className={`absolute left-0 top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
      </span>
    </button>
  );
}

const RISK_COLORS: Record<string, string> = {
  low:    "border-emerald-500/30 bg-emerald-500/[0.04]",
  medium: "border-amber-500/30   bg-amber-500/[0.04]",
  high:   "border-red-500/30     bg-red-500/[0.04]",
};

export function PlinkoConfigEditor({ config: initialConfig }: { config: PlinkoConfig }) {
  const [form, setForm] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const sound = useSoundManager();

  function showMsg(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  async function handleSave() {
    sound.click?.();
    setSaving(true);
    const res = await updatePlinkoConfig(form);
    setSaving(false);
    if (res.success) { sound.save?.(); showMsg("Gespeichert!", true); }
    else { sound.error?.(); showMsg(res.error ?? "Fehler.", false); }
  }

  function updateRisk(idx: number, patch: Partial<PlinkoRiskLevel>) {
    setForm((f) => {
      const rl = [...f.riskLevels];
      rl[idx] = { ...rl[idx], ...patch };
      return { ...f, riskLevels: rl };
    });
  }

  function updateMultiplier(riskIdx: number, mIdx: number, val: number) {
    setForm((f) => {
      const rl = [...f.riskLevels];
      const mults = [...rl[riskIdx].multipliers];
      mults[mIdx] = val;
      rl[riskIdx] = { ...rl[riskIdx], multipliers: mults };
      return { ...f, riskLevels: rl };
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Disc3 className="h-5 w-5 text-purple-400" />
          <h2 className="text-base font-bold text-zinc-100">Plinko Konfiguration</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Speichern
        </button>
      </div>

      {msg && (
        <div className={`rounded-xl border px-3 py-2 text-sm font-semibold ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
          {msg.text}
        </div>
      )}

      {/* Basic settings */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="mb-3 text-sm font-bold text-zinc-300">Grundeinstellungen</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 col-span-2 sm:col-span-3">
            <div>
              <p className="text-sm font-semibold text-zinc-200">Plinko aktiviert</p>
              <p className="text-[11px] text-zinc-500">Spieler können Plinko spielen</p>
            </div>
            <Toggle value={form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
          </div>

          {[
            { label: "Bälle/Stunde", key: "hourlyBallLimit", min: 1, max: 1000 },
            { label: "Kosten pro Ball (CR)", key: "ballCostCr", min: 1, max: 1000000 },
            { label: "Anzahl Reihen", key: "rows", min: 4, max: 16 },
            { label: "Max Gewinn (CR, 0=∞)", key: "maxWinCr", min: 0, max: 10000000 },
            { label: "Big-Win Schwelle (CR)", key: "bigWinThreshold", min: 0, max: 100000 },
          ].map(({ label, key, min, max }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[11px] text-zinc-500">{label}</span>
              <input
                type="number"
                min={min}
                max={max}
                value={form[key as keyof PlinkoConfig] as number}
                onChange={(e) => setForm((f) => ({ ...f, [key]: Math.max(min, Number(e.target.value) || 0) }))}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
          ))}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold text-zinc-300">Big Wins ankündigen</p>
              <p className="text-[10px] text-zinc-600">Im Global Chat</p>
            </div>
            <Toggle value={form.announceBigWins} onChange={(v) => setForm((f) => ({ ...f, announceBigWins: v }))} />
          </div>
        </div>
      </div>

      {/* Risk levels */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-300">Risikostufen & Multiplikatoren</h3>
          <div className="flex items-center gap-1 rounded-lg border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300">
            <Info className="h-3 w-3" />
            Multiplikatoren von links (außen) nach rechts (Mitte)
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {form.riskLevels.map((r, ri) => (
            <div key={r.key} className={`rounded-2xl border p-4 ${RISK_COLORS[r.key] ?? "border-white/10 bg-white/[0.02]"}`}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <input
                  value={r.emoji}
                  onChange={(e) => updateRisk(ri, { emoji: e.target.value.slice(-2) })}
                  className="w-14 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-lg outline-none focus:border-purple-400/60"
                  maxLength={2}
                />
                <input
                  value={r.label}
                  onChange={(e) => updateRisk(ri, { label: e.target.value })}
                  className="w-32 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
                <span className="ml-auto text-[10px] text-zinc-600">
                  EV ≈ {(r.multipliers.reduce((s, m) => s + m, 0) / r.multipliers.length).toFixed(2)}x (⌀ Mult)
                </span>
              </div>

              {/* Multipliers grid */}
              <div className="flex flex-wrap gap-2">
                {r.multipliers.map((m, mi) => (
                  <div key={mi} className="flex flex-col items-center gap-0.5">
                    <span className="text-[9px] text-zinc-600">#{mi + 1}</span>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      max={1000}
                      value={m}
                      onChange={(e) => updateMultiplier(ri, mi, Math.max(0, Number(e.target.value) || 0))}
                      className="w-14 rounded-lg border border-white/10 bg-black/30 px-1 py-1 text-center text-xs text-zinc-100 outline-none focus:border-purple-400/60"
                    />
                    <span className="text-[9px]" style={{ color: m >= 5 ? "#f59e0b" : m >= 2 ? "#10b981" : m >= 1 ? "#6366f1" : m >= 0.5 ? "#3b82f6" : "#ef4444" }}>
                      {m}x
                    </span>
                  </div>
                ))}
                <div className="flex items-end gap-1">
                  <button
                    type="button"
                    onClick={() => updateRisk(ri, { multipliers: [...r.multipliers, 1] })}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-white/20 text-zinc-500 hover:border-purple-400/50 hover:text-purple-300 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  {r.multipliers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => updateRisk(ri, { multipliers: r.multipliers.slice(0, -1) })}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-white/20 text-zinc-500 hover:border-red-400/50 hover:text-red-400 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setForm((f) => ({
              ...f,
              riskLevels: [...f.riskLevels, { key: `risk_${f.riskLevels.length + 1}`, label: "Neu", emoji: "⚪", multipliers: [2, 1, 0.5, 0.2, 0.5, 1, 2] }],
            }))}
            className="flex items-center gap-2 rounded-xl border border-dashed border-white/20 px-3 py-2.5 text-sm text-zinc-500 hover:border-purple-400/50 hover:text-purple-300 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Risikostufe hinzufügen
          </button>
        </div>
      </div>

      {/* Link */}
      <div className="flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-3 py-2 text-sm text-purple-300">
        <Zap className="h-4 w-4 shrink-0" />
        Plinko ist unter <a href="/plinko" target="_blank" className="underline">/plinko</a> für User erreichbar
      </div>
    </div>
  );
}
