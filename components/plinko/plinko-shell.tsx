"use client";

import { useState, useTransition } from "react";
import { Disc3, Trophy, Zap, TrendingDown, Clock, Coins, ChevronDown, BarChart3 } from "lucide-react";
import { PlinkoBoard } from "./plinko-board";
import { dropPlinkoBall } from "@/lib/actions/plinko";
import type { PlinkoConfig } from "@/lib/actions/plinko";
import { useSoundManager } from "@/lib/sound-manager";

interface Props {
  config: PlinkoConfig;
  initialCredits: number;
  initialUsedThisHour: number;
}

interface PlayResult {
  bucketIndex: number;
  multiplier: number;
  payout: number;
  newCredits: number;
  path: number[];
  riskLabel: string;
  riskEmoji: string;
}

const RISK_COLORS: Record<string, string> = {
  low:    "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  medium: "text-amber-400  border-amber-500/40  bg-amber-500/10",
  high:   "text-red-400    border-red-500/40    bg-red-500/10",
};

const RISK_ACTIVE: Record<string, string> = {
  low:    "border-emerald-400 bg-emerald-500/20 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.35)]",
  medium: "border-amber-400  bg-amber-500/20  text-amber-300  shadow-[0_0_16px_rgba(245,158,11,0.35)]",
  high:   "border-red-400    bg-red-500/20    text-red-300    shadow-[0_0_16px_rgba(239,68,68,0.35)]",
};

function fmt(n: number) { return new Intl.NumberFormat("de-DE").format(n); }

function MultiplierBar({ mults }: { mults: number[] }) {
  const max = Math.max(...mults);
  return (
    <div className="flex items-end justify-center gap-0.5 rounded-xl border border-white/8 bg-black/20 px-3 py-2">
      {mults.map((m, i) => {
        const h = Math.max(6, (m / max) * 36);
        const col = m >= 5 ? "#f59e0b" : m >= 2 ? "#10b981" : m >= 1 ? "#6366f1" : m >= 0.5 ? "#3b82f6" : "#ef4444";
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className="w-5 rounded-sm transition-all"
              style={{ height: h, background: col, boxShadow: `0 0 6px ${col}66` }}
            />
            <span className="text-[8px] font-bold" style={{ color: col }}>{m}x</span>
          </div>
        );
      })}
    </div>
  );
}

export function PlinkoShell({ config, initialCredits, initialUsedThisHour }: Props) {
  const [credits, setCredits] = useState(initialCredits);
  const [usedThisHour, setUsedThisHour] = useState(initialUsedThisHour);
  const [activeRisk, setActiveRisk] = useState(config.riskLevels[0]?.key ?? "low");
  const [pending, startTransition] = useTransition();
  const [animating, setAnimating] = useState(false);
  const [currentPath, setCurrentPath] = useState<number[] | null>(null);
  const [currentBucket, setCurrentBucket] = useState<number | null>(null);
  const [currentMult, setCurrentMult] = useState<number | null>(null);
  const [history, setHistory] = useState<PlayResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();

  const riskDef = config.riskLevels.find((r) => r.key === activeRisk) ?? config.riskLevels[0];
  const remaining = Math.max(0, config.hourlyBallLimit - usedThisHour);
  const canPlay = !pending && !animating && remaining > 0 && credits >= config.ballCostCr && config.enabled;

  function handleDrop() {
    if (!canPlay) return;
    sound.click?.();
    setError(null);
    setCurrentPath(null);
    setCurrentBucket(null);
    setCurrentMult(null);

    startTransition(async () => {
      const res = await dropPlinkoBall({ riskLevel: activeRisk });
      if (!res.success) {
        setError(res.error ?? "Fehler.");
        sound.error?.();
        return;
      }
      const riskLabel = riskDef?.label ?? activeRisk;
      const riskEmoji = riskDef?.emoji ?? "";
      setCurrentPath(res.path!);
      setCurrentBucket(res.bucketIndex!);
      setCurrentMult(res.multiplier!);
      setAnimating(true);
      setUsedThisHour((u) => u + 1);
      setHistory((h) => [
        { bucketIndex: res.bucketIndex!, multiplier: res.multiplier!, payout: res.payout!, newCredits: res.newCredits!, path: res.path!, riskLabel, riskEmoji },
        ...h.slice(0, 19),
      ]);
    });
  }

  function handleAnimationEnd() {
    setAnimating(false);
    if (currentMult !== null && history[0]) {
      setCredits(history[0].newCredits);
      if ((history[0].multiplier) >= 2) sound.save?.();
    }
  }

  const lastResult = history[0] ?? null;

  return (
    <div className="relative mx-auto max-w-4xl">
      {/* Animated background glow */}
      <div className="pointer-events-none absolute -inset-32 animate-pulse opacity-30"
        style={{ background: "radial-gradient(ellipse at center, rgba(139,92,246,0.15) 0%, transparent 70%)", animationDuration: "4s" }} />

      <div className="relative grid gap-4 lg:grid-cols-[1fr_340px]">

        {/* Board + controls */}
        <div className="flex flex-col gap-4">

          {/* Header */}
          <div className="flex items-center justify-between rounded-2xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20">
                <Disc3 className="h-5 w-5 text-purple-300" style={{ animation: animating ? "spin 0.4s linear infinite" : "none" }} />
                <div className="absolute inset-0 animate-ping rounded-xl bg-purple-500/20 opacity-0" style={{ animationDuration: "2s", opacity: animating ? 0.4 : 0 }} />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight text-zinc-100">Plinko</h1>
                <p className="text-[11px] text-zinc-500">Lass den Ball fallen — Glück entscheidet!</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1.5 text-sm font-bold text-amber-300">
                <Coins className="h-4 w-4" />
                {fmt(credits)} CR
              </div>
              <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                <Clock className="h-3 w-3" />
                {remaining}/{config.hourlyBallLimit} Bälle/h
              </div>
            </div>
          </div>

          {/* Risk selector */}
          <div className="grid grid-cols-3 gap-2">
            {config.riskLevels.map((r) => (
              <button
                key={r.key}
                onClick={() => { setActiveRisk(r.key); sound.click?.(); }}
                className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${
                  activeRisk === r.key ? RISK_ACTIVE[r.key] ?? "border-purple-400 bg-purple-500/20 text-purple-300" : `${RISK_COLORS[r.key] ?? "text-zinc-400 border-white/10 bg-white/5"} hover:opacity-80`
                }`}
              >
                <span className="text-lg">{r.emoji}</span>
                <span>{r.label}</span>
                <span className="text-[10px] opacity-70">
                  max {Math.max(...r.multipliers)}x
                </span>
              </button>
            ))}
          </div>

          {/* Board */}
          <PlinkoBoard
            rows={config.rows}
            riskLevel={riskDef!}
            path={currentPath}
            bucketIndex={currentBucket}
            multiplier={currentMult}
            isDropping={animating}
            onAnimationEnd={handleAnimationEnd}
          />

          {/* Multiplier bar preview */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Multiplikatoren</span>
            <MultiplierBar mults={riskDef?.multipliers ?? []} />
          </div>

          {/* Drop button */}
          <button
            onClick={handleDrop}
            disabled={!canPlay}
            className={`relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-4 text-base font-black transition-all disabled:opacity-40 ${
              canPlay
                ? "bg-gradient-to-r from-purple-700 via-violet-600 to-purple-700 text-white shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:shadow-[0_0_50px_rgba(139,92,246,0.7)] hover:scale-[1.02] active:scale-[0.98]"
                : "bg-zinc-800 text-zinc-500"
            }`}
          >
            {canPlay && (
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -left-20 top-0 h-full w-20 animate-[shimmer_1.8s_linear_infinite] bg-white/10 skew-x-[-20deg]" />
              </div>
            )}
            {pending || animating ? (
              <>
                <Disc3 className="h-5 w-5 animate-spin" />
                {animating ? "Ball fällt…" : "Wird berechnet…"}
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" />
                Ball fallen lassen — {fmt(config.ballCostCr)} CR
              </>
            )}
          </button>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}
          {remaining === 0 && !error && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 text-sm text-orange-400">
              <Clock className="mr-1.5 inline h-3.5 w-3.5" />
              Stündliches Limit erreicht — morgen wieder!
            </div>
          )}
        </div>

        {/* Sidebar: last result + history */}
        <div className="flex flex-col gap-4">

          {/* Last result */}
          <div className={`rounded-2xl border p-4 transition-all ${
            lastResult
              ? lastResult.multiplier >= 2
                ? "border-emerald-500/40 bg-emerald-500/[0.06] shadow-[0_0_30px_rgba(52,211,153,0.2)]"
                : lastResult.multiplier < 1
                  ? "border-red-500/30 bg-red-500/[0.04]"
                  : "border-purple-500/30 bg-purple-500/[0.04]"
              : "border-white/8 bg-white/[0.02]"
          }`}>
            <div className="mb-2 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-bold text-zinc-300">Letztes Ergebnis</span>
            </div>
            {lastResult ? (
              <div className="flex flex-col gap-2">
                <div className="text-center">
                  <div
                    className="text-5xl font-black"
                    style={{
                      color: lastResult.multiplier >= 2 ? "#10b981" : lastResult.multiplier < 1 ? "#ef4444" : "#6366f1",
                      textShadow: `0 0 20px ${lastResult.multiplier >= 2 ? "#10b981" : lastResult.multiplier < 1 ? "#ef4444" : "#6366f1"}`,
                    }}
                  >
                    {lastResult.multiplier}x
                  </div>
                  <div className="mt-1 text-sm font-bold text-zinc-300">
                    {lastResult.payout >= config.ballCostCr ? "+" : ""}{fmt(lastResult.payout - config.ballCostCr)} CR
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {lastResult.riskEmoji} {lastResult.riskLabel} · {fmt(lastResult.payout)} ausgezahlt
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-zinc-600">Noch kein Spiel</p>
            )}
          </div>

          {/* Stats */}
          {history.length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-bold text-zinc-300">Session Stats</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Spiele", val: history.length },
                  { label: "Bälle/h", val: `${usedThisHour}/${config.hourlyBallLimit}` },
                  { label: "Best Mult", val: `${Math.max(...history.map((h) => h.multiplier))}x` },
                  { label: "Gewinn", val: `${history.reduce((s, h) => s + h.payout - config.ballCostCr, 0) >= 0 ? "+" : ""}${fmt(history.reduce((s, h) => s + h.payout - config.ballCostCr, 0))} CR` },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-lg border border-white/8 bg-black/20 px-2 py-1.5 text-center">
                    <div className="text-[10px] text-zinc-600">{label}</div>
                    <div className="text-sm font-bold text-zinc-200">{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center gap-2">
              <ChevronDown className="h-4 w-4 text-zinc-500" />
              <span className="text-xs font-bold text-zinc-400">Verlauf</span>
            </div>
            {history.length === 0 ? (
              <p className="text-center text-xs text-zinc-600">Noch kein Spiel</p>
            ) : (
              <div className="flex flex-col gap-1">
                {history.slice(0, 15).map((h, i) => {
                  const col = h.multiplier >= 2 ? "text-emerald-400" : h.multiplier < 1 ? "text-red-400" : "text-zinc-300";
                  const net = h.payout - config.ballCostCr;
                  return (
                    <div key={i} className={`flex items-center justify-between rounded-lg border border-white/5 px-2 py-1 text-[11px] ${i === 0 ? "border-purple-500/20 bg-purple-500/5" : "bg-white/[0.01]"}`}>
                      <span className="text-zinc-600">{h.riskEmoji}</span>
                      <span className={`font-bold ${col}`}>{h.multiplier}x</span>
                      <span className={net >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {net >= 0 ? "+" : ""}{fmt(net)} CR
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="rounded-xl border border-white/8 bg-white/[0.01] px-3 py-2.5">
            <p className="text-[11px] text-zinc-600">
              Einsatz: <span className="text-zinc-400">{fmt(config.ballCostCr)} CR</span> ·
              Limit: <span className="text-zinc-400">{config.hourlyBallLimit} Bälle/Stunde</span>
              {config.maxWinCr > 0 && <> · Max Win: <span className="text-amber-400">{fmt(config.maxWinCr)} CR</span></>}
            </p>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%) skewX(-20deg); }
          100% { transform: translateX(600%) skewX(-20deg); }
        }
      `}</style>
    </div>
  );
}
