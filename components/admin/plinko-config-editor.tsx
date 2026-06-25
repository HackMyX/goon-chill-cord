"use client";

import { useState, useEffect } from "react";
import {
  Save, Loader2, Plus, X, Disc3, Info, Zap, BarChart2,
  Users, Coins, TrendingDown, Trophy, Clock, Eye, EyeOff, Sparkles, Bot, Gauge,
} from "lucide-react";
import { updatePlinkoConfig, getPlinkoAdminStats, type PlinkoAdminStats } from "@/lib/actions/plinko";
import type { PlinkoConfig, PlinkoRiskLevel } from "@/lib/actions/plinko";
import { useSoundManager } from "@/lib/sound-manager";

function Toggle({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label?: string; sub?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left w-full transition-colors ${value ? "border-emerald-500/30 bg-emerald-500/[0.05]" : "border-white/8 bg-white/[0.02]"}`}
    >
      <div>
        {label && <p className={`text-sm font-semibold ${value ? "text-zinc-200" : "text-zinc-400"}`}>{label}</p>}
        {sub && <p className="text-[11px] text-zinc-500">{sub}</p>}
      </div>
      <span className="shrink-0 rounded-full outline-none">
        <span className={`relative block h-6 w-11 overflow-hidden rounded-full transition-colors duration-200 ${value ? "bg-purple-600" : "bg-zinc-700"}`}>
          <span className={`absolute left-0 top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
        </span>
      </span>
    </button>
  );
}

function NumInput({ label, value, min, max, step, onChange, sub }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; sub?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
        className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
      />
      {sub && <span className="text-[10px] text-zinc-600">{sub}</span>}
    </label>
  );
}

function SliderInput({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">{label}</span>
        <span className="text-[11px] font-bold text-zinc-300">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-purple-500"
      />
      <div className="flex justify-between text-[10px] text-zinc-700">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

const RISK_COLORS: Record<string, string> = {
  low:    "border-emerald-500/30 bg-emerald-500/[0.04]",
  medium: "border-amber-500/30   bg-amber-500/[0.04]",
  high:   "border-red-500/30     bg-red-500/[0.04]",
};

function StatsSection() {
  const [stats, setStats] = useState<PlinkoAdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getPlinkoAdminStats().then((s) => { if (active) { setStats(s); setLoading(false); } });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="text-xs text-zinc-500">Lade Statistiken…</div>;
  if (!stats) return null;

  const houseEdge = stats.totalCrSpent > 0 ? ((stats.netCrForHouse / stats.totalCrSpent) * 100).toFixed(1) : "0.0";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart2 className="h-4 w-4 text-purple-400" />
        <h3 className="text-sm font-bold text-zinc-300">Plinko Statistiken (gesamt)</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { icon: <Disc3 className="h-3.5 w-3.5 text-blue-400" />, label: "Spiele gesamt", val: stats.totalPlays.toLocaleString("de-DE") },
          { icon: <Users className="h-3.5 w-3.5 text-purple-400" />, label: "Einzigartige Spieler", val: stats.uniquePlayers.toLocaleString("de-DE") },
          { icon: <Coins className="h-3.5 w-3.5 text-amber-400" />, label: "CR eingesetzt", val: `${stats.totalCrSpent.toLocaleString("de-DE")} CR` },
          { icon: <Coins className="h-3.5 w-3.5 text-emerald-400" />, label: "CR ausgezahlt", val: `${stats.totalCrPaidOut.toLocaleString("de-DE")} CR` },
          { icon: <TrendingDown className="h-3.5 w-3.5 text-red-400" />, label: "House Gewinn", val: `${stats.netCrForHouse.toLocaleString("de-DE")} CR (${houseEdge}%)` },
          { icon: <Trophy className="h-3.5 w-3.5 text-yellow-400" />, label: "Big Wins", val: stats.bigWinsCount.toLocaleString("de-DE") },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1 rounded-lg border border-white/8 bg-black/20 p-2.5">
            <div className="flex items-center gap-1.5">{s.icon}<span className="text-[10px] text-zinc-500">{s.label}</span></div>
            <span className="text-sm font-bold text-zinc-200">{s.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlinkoConfigEditor({ config: initialConfig }: { config: PlinkoConfig }) {
  const [form, setForm] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [quickBetInput, setQuickBetInput] = useState("");
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

  function addQuickBet() {
    const v = parseInt(quickBetInput, 10);
    if (!v || v <= 0) return;
    setForm((f) => ({ ...f, quickBetAmounts: [...new Set([...f.quickBetAmounts, v])].sort((a, b) => a - b) }));
    setQuickBetInput("");
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

      {/* Stats */}
      <StatsSection />

      {/* Basic + Limits */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="mb-3 text-sm font-bold text-zinc-300">Grundeinstellungen & Limits</h3>
        <Toggle
          value={form.enabled}
          onChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
          label="Plinko aktiviert"
          sub="Spieler können Bälle fallen lassen"
        />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumInput label="Bälle/Stunde" value={form.hourlyBallLimit} min={1} max={1000}
            onChange={(v) => setForm((f) => ({ ...f, hourlyBallLimit: v }))} />
          <NumInput label="Bälle/Tag (0=aus)" value={form.dailyBallLimit} min={0} max={10000}
            onChange={(v) => setForm((f) => ({ ...f, dailyBallLimit: v }))} />
          <NumInput label="Anzahl Reihen (4–16)" value={form.rows} min={4} max={16}
            onChange={(v) => setForm((f) => ({ ...f, rows: v }))} />
          <NumInput label="Max Gewinn (CR, 0=∞)" value={form.maxWinCr} min={0} max={10_000_000}
            onChange={(v) => setForm((f) => ({ ...f, maxWinCr: v }))} />
          <NumInput label="Big-Win Schwelle (CR)" value={form.bigWinThreshold} min={0} max={10_000_000}
            onChange={(v) => setForm((f) => ({ ...f, bigWinThreshold: v }))} />
        </div>
        <div className="mt-3">
          <Toggle
            value={form.announceBigWins}
            onChange={(v) => setForm((f) => ({ ...f, announceBigWins: v }))}
            label="Big Wins im Chat ankündigen"
            sub={`Automatische Systemnachricht ab ${form.bigWinThreshold.toLocaleString("de-DE")} CR Gewinn`}
          />
        </div>
      </div>

      {/* Variable betting */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-bold text-zinc-300">Einsatz-Konfiguration</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumInput label="Mindesteinsatz (CR)" value={form.minBetCr} min={1} max={1_000_000}
            sub="Minimum pro Ball"
            onChange={(v) => setForm((f) => ({ ...f, minBetCr: v }))} />
          <NumInput label="Maximaleinsatz (CR, 0=∞)" value={form.maxBetCr} min={0} max={10_000_000}
            sub="0 = nur durch Credits begrenzt"
            onChange={(v) => setForm((f) => ({ ...f, maxBetCr: v }))} />
        </div>

        {/* Quick bet amounts */}
        <div className="mt-3">
          <p className="mb-2 text-[11px] text-zinc-500">Schnell-Einsatz Buttons</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.quickBetAmounts.map((amt) => (
              <div key={amt} className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-300">
                {amt.toLocaleString("de-DE")} CR
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, quickBetAmounts: f.quickBetAmounts.filter((a) => a !== amt) }))}
                  className="text-zinc-600 hover:text-red-400 ml-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Betrag in CR"
              value={quickBetInput}
              onChange={(e) => setQuickBetInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addQuickBet()}
              className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
            <button
              type="button"
              onClick={addQuickBet}
              className="flex items-center gap-1 rounded-lg border border-dashed border-white/20 px-3 py-1.5 text-xs text-zinc-400 hover:border-purple-400/50 hover:text-purple-300 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Hinzufügen
            </button>
          </div>
        </div>
      </div>

      {/* Auto-bet */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-bold text-zinc-300">Auto-Bet</h3>
        </div>
        <Toggle
          value={form.autoBetEnabled}
          onChange={(v) => setForm((f) => ({ ...f, autoBetEnabled: v }))}
          label="Auto-Bet erlauben"
          sub="Spieler können Bälle automatisch in schneller Folge fallen lassen"
        />
      </div>

      {/* Display settings */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="mb-3 text-sm font-bold text-zinc-300">Anzeige-Einstellungen</h3>
        <div className="flex flex-col gap-2">
          <Toggle
            value={form.showHistory}
            onChange={(v) => setForm((f) => ({ ...f, showHistory: v }))}
            label="Spielverlauf anzeigen"
            sub="User sehen ihren persönlichen Spielverlauf & Statistiken"
          />
          <Toggle
            value={form.showLeaderboard}
            onChange={(v) => setForm((f) => ({ ...f, showLeaderboard: v }))}
            label="Leaderboard (Top Wins) anzeigen"
            sub="Öffentliche Rangliste der größten Gewinne"
          />
          {form.showLeaderboard && (
            <div className="pl-2 pt-1">
              <NumInput label="Leaderboard Einträge" value={form.leaderboardSize} min={3} max={50}
                onChange={(v) => setForm((f) => ({ ...f, leaderboardSize: v }))} />
            </div>
          )}
        </div>
      </div>

      {/* Visual settings */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-400" />
          <h3 className="text-sm font-bold text-zinc-300">Visuelle Einstellungen</h3>
        </div>
        <div className="flex flex-col gap-5">
          <Toggle
            value={form.particlesEnabled}
            onChange={(v) => setForm((f) => ({ ...f, particlesEnabled: v }))}
            label="Partikel-Effekte"
            sub="Funken bei Pin-Treffern, Explosionen bei Bucket-Landung, Sternregen"
          />
          <SliderInput
            label="Trail-Länge (Ball-Schweif)"
            value={form.trailLength}
            min={1}
            max={15}
            step={1}
            onChange={(v) => setForm((f) => ({ ...f, trailLength: v }))}
            format={(v) => `${v} Segmente`}
          />
          <SliderInput
            label="Glow-Intensität"
            value={form.glowIntensity}
            min={0}
            max={3}
            step={0.1}
            onChange={(v) => setForm((f) => ({ ...f, glowIntensity: Math.round(v * 10) / 10 }))}
            format={(v) => v === 0 ? "Aus" : `${v.toFixed(1)}×`}
          />
          <SliderInput
            label="Animationsgeschwindigkeit"
            value={form.animationSpeed}
            min={0.3}
            max={3}
            step={0.1}
            onChange={(v) => setForm((f) => ({ ...f, animationSpeed: Math.round(v * 10) / 10 }))}
            format={(v) => v <= 0.5 ? "Langsam" : v <= 1.2 ? "Normal" : v <= 2 ? "Schnell" : "Turbo"}
          />
        </div>
      </div>

      {/* Risk levels */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-300">Risikostufen & Multiplikatoren</h3>
          <div className="flex items-center gap-1 rounded-lg border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300">
            <Info className="h-3 w-3" />
            Außen → Mitte
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {form.riskLevels.map((r, ri) => {
            const avg = r.multipliers.reduce((s, m) => s + m, 0) / r.multipliers.length;
            const rtp = (avg * 100).toFixed(1);
            return (
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
                  <div className="ml-auto flex gap-3 text-[10px] text-zinc-500">
                    <span>⌀ {avg.toFixed(2)}x</span>
                    <span className={parseFloat(rtp) >= 100 ? "text-red-400" : "text-emerald-400"}>RTP {rtp}%</span>
                    <span>Max {Math.max(...r.multipliers)}x</span>
                  </div>
                </div>
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
                      <span className="text-[9px] font-bold" style={{ color: m >= 5 ? "#f59e0b" : m >= 2 ? "#10b981" : m >= 1 ? "#6366f1" : m >= 0.5 ? "#3b82f6" : "#ef4444" }}>
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
                {form.riskLevels.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, riskLevels: f.riskLevels.filter((_, i) => i !== ri) }))}
                    className="mt-3 flex items-center gap-1 text-[11px] text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <X className="h-3 w-3" /> Risikostufe entfernen
                  </button>
                )}
              </div>
            );
          })}
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

      <div className="flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-3 py-2 text-sm text-purple-300">
        <Zap className="h-4 w-4 shrink-0" />
        Plinko ist unter <a href="/plinko" target="_blank" className="underline">/plinko</a> für User erreichbar
      </div>
    </div>
  );
}
