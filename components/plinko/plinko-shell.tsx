"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import {
  Disc3, Trophy, Zap, TrendingDown, Clock, Coins, ChevronDown, BarChart3,
  Star, Medal, TrendingUp, RefreshCw, Crown, User,
} from "lucide-react";
import { PlinkoBoard } from "./plinko-board";
import {
  dropPlinkoBall,
  getMyPlinkoHistory,
  getMyPlinkoStats,
  getTopPlinkoWins,
  type PlinkoHistoryEntry,
  type PlinkoPersonalStats,
  type PlinkoLeaderEntry,
} from "@/lib/actions/plinko";
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

function MultiplierBar({ mults, highlightIdx }: { mults: number[]; highlightIdx?: number | null }) {
  const max = Math.max(...mults);
  return (
    <div className="flex items-end justify-center gap-0.5 rounded-xl border border-white/8 bg-black/20 px-3 py-2">
      {mults.map((m, i) => {
        const h = Math.max(6, (m / max) * 36);
        const col = m >= 5 ? "#f59e0b" : m >= 2 ? "#10b981" : m >= 1 ? "#6366f1" : m >= 0.5 ? "#3b82f6" : "#ef4444";
        const isHit = highlightIdx === i;
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div
              className={`w-5 rounded-sm transition-all ${isHit ? "ring-2 ring-white/50 scale-110" : ""}`}
              style={{ height: h, background: col, boxShadow: isHit ? `0 0 12px ${col}` : `0 0 6px ${col}66` }}
            />
            <span className="text-[8px] font-bold" style={{ color: col }}>{m}x</span>
          </div>
        );
      })}
    </div>
  );
}

function PersonalStatsPanel() {
  const [stats, setStats] = useState<PlinkoPersonalStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await getMyPlinkoStats();
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-xs text-zinc-500 py-2">Lade Statistiken…</div>;
  if (!stats || stats.totalPlays === 0) return null;

  const netColor = stats.netCr >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-purple-400" />
          <span className="text-xs font-bold text-zinc-300">Meine Statistiken</span>
        </div>
        <button onClick={load} className="text-zinc-600 hover:text-zinc-400 transition-colors">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { label: "Spiele", val: fmt(stats.totalPlays) },
          { label: "Eingesetzt", val: `${fmt(stats.totalSpent)} CR` },
          { label: "Gewonnen", val: `${fmt(stats.totalWon)} CR` },
          { label: "Netto", val: `${stats.netCr >= 0 ? "+" : ""}${fmt(stats.netCr)} CR`, color: netColor },
          { label: "Best Mult", val: `${stats.bestMultiplier}x` },
          { label: "Größter Win", val: `${fmt(stats.biggestWin)} CR` },
        ].map(({ label, val, color }) => (
          <div key={label} className="rounded-lg border border-white/8 bg-black/20 px-2.5 py-2">
            <div className="text-[10px] text-zinc-600">{label}</div>
            <div className={`text-sm font-bold ${color ?? "text-zinc-200"}`}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryPanel({ config }: { config: PlinkoConfig }) {
  const [history, setHistory] = useState<PlinkoHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyPlinkoHistory(30).then((h) => { setHistory(h); setLoading(false); });
  }, []);

  if (loading) return <div className="text-xs text-zinc-500 py-2">Lade Verlauf…</div>;
  if (history.length === 0) return <p className="text-center text-xs text-zinc-600 py-2">Noch kein Spiel</p>;

  return (
    <div className="max-h-60 overflow-y-auto space-y-1" style={{ scrollbarWidth: "thin" }}>
      {history.map((h, i) => {
        const col = h.resultMultiplier >= 2 ? "text-emerald-400" : h.resultMultiplier < 1 ? "text-red-400" : "text-zinc-300";
        const net = h.payoutCr - h.ballCost;
        const dt = new Date(h.createdAt);
        return (
          <div key={h.id} className={`flex items-center justify-between rounded-lg border border-white/5 px-2 py-1.5 text-[11px] ${i === 0 ? "border-purple-500/20 bg-purple-500/5" : "bg-white/[0.01]"}`}>
            <span className="text-zinc-600 w-10 text-[10px]">
              {dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-zinc-500 w-6 text-center">{h.riskLevel === "low" ? "🟢" : h.riskLevel === "medium" ? "🟡" : "🔴"}</span>
            <span className={`font-bold ${col} w-12 text-center`}>{h.resultMultiplier}x</span>
            <span className={`${net >= 0 ? "text-emerald-400" : "text-red-400"} font-semibold text-right flex-1`}>
              {net >= 0 ? "+" : ""}{fmt(net)} CR
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LeaderboardPanel({ config }: { config: PlinkoConfig }) {
  const [entries, setEntries] = useState<PlinkoLeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTopPlinkoWins(config.leaderboardSize).then((e) => { setEntries(e); setLoading(false); });
  }, [config.leaderboardSize]);

  if (loading) return <div className="text-xs text-zinc-500 py-2">Lade Rangliste…</div>;
  if (entries.length === 0) return <p className="text-center text-xs text-zinc-600 py-2">Noch keine Einträge</p>;

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-1">
      {entries.map((e, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 rounded-lg border border-white/5 px-3 py-2 ${i === 0 ? "border-yellow-400/20 bg-yellow-400/[0.04]" : "bg-white/[0.01]"}`}
        >
          <span className="w-5 text-center text-sm">{medals[i] ?? `${i + 1}.`}</span>
          <span className="flex-1 text-xs font-semibold text-zinc-300 truncate">{e.username}</span>
          <span className="text-[10px] text-zinc-500">{e.multiplier}x</span>
          <span className="text-xs font-bold text-amber-400">{fmt(e.payoutCr)} CR</span>
        </div>
      ))}
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
  const [sessionHistory, setSessionHistory] = useState<PlayResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"verlauf" | "leaderboard">("verlauf");
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
      setSessionHistory((h) => [
        { bucketIndex: res.bucketIndex!, multiplier: res.multiplier!, payout: res.payout!, newCredits: res.newCredits!, path: res.path!, riskLabel, riskEmoji },
        ...h.slice(0, 49),
      ]);
    });
  }

  function handleAnimationEnd() {
    setAnimating(false);
    if (currentMult !== null && sessionHistory[0]) {
      setCredits(sessionHistory[0].newCredits);
      if (sessionHistory[0].multiplier >= 2) sound.save?.();
    }
  }

  const lastResult = sessionHistory[0] ?? null;

  return (
    <div className="relative mx-auto max-w-5xl">
      {/* Background glow */}
      <div className="pointer-events-none absolute -inset-32 animate-pulse opacity-30"
        style={{ background: "radial-gradient(ellipse at center, rgba(139,92,246,0.15) 0%, transparent 70%)", animationDuration: "4s" }} />

      <div className="relative grid gap-4 lg:grid-cols-[1fr_360px]">

        {/* ── LEFT: Board + controls ──────────────────────────────────────── */}
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
                {config.dailyBallLimit > 0 && <span className="ml-1 text-zinc-600">· {config.dailyBallLimit}/Tag</span>}
              </div>
            </div>
          </div>

          {/* Risk selector */}
          <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${config.riskLevels.length}, 1fr)` }}>
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
                <span className="text-[10px] opacity-70">max {Math.max(...r.multipliers)}x</span>
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

          {/* Multiplier bar */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Multiplikatoren</span>
            <MultiplierBar mults={riskDef?.multipliers ?? []} highlightIdx={!animating ? currentBucket : null} />
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
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</div>
          )}
          {remaining === 0 && !error && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 text-sm text-orange-400">
              <Clock className="mr-1.5 inline h-3.5 w-3.5" />
              Stündliches Limit erreicht — komm später wieder!
            </div>
          )}

          {/* Personal stats */}
          {config.showHistory && <PersonalStatsPanel />}
        </div>

        {/* ── RIGHT: Sidebar ─────────────────────────────────────────────── */}
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

          {/* Session stats */}
          {sessionHistory.length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-bold text-zinc-300">Session Stats</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Spiele", val: sessionHistory.length },
                  { label: "Bälle/h", val: `${usedThisHour}/${config.hourlyBallLimit}` },
                  { label: "Best Mult", val: `${Math.max(...sessionHistory.map((h) => h.multiplier))}x` },
                  {
                    label: "Netto",
                    val: `${sessionHistory.reduce((s, h) => s + h.payout - config.ballCostCr, 0) >= 0 ? "+" : ""}${fmt(sessionHistory.reduce((s, h) => s + h.payout - config.ballCostCr, 0))} CR`,
                  },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-lg border border-white/8 bg-black/20 px-2 py-1.5 text-center">
                    <div className="text-[10px] text-zinc-600">{label}</div>
                    <div className="text-sm font-bold text-zinc-200">{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabbed: verlauf / leaderboard */}
          {(config.showHistory || config.showLeaderboard) && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              {/* Tab bar */}
              <div className="mb-3 flex gap-1">
                {config.showHistory && (
                  <button
                    onClick={() => setActiveTab("verlauf")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === "verlauf" ? "bg-purple-500/20 text-purple-300" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    Mein Verlauf
                  </button>
                )}
                {config.showLeaderboard && (
                  <button
                    onClick={() => setActiveTab("leaderboard")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === "leaderboard" ? "bg-amber-500/20 text-amber-300" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    <Crown className="h-3.5 w-3.5" />
                    Top Wins
                  </button>
                )}
              </div>

              {activeTab === "verlauf" && config.showHistory && (
                <HistoryPanel config={config} />
              )}
              {activeTab === "leaderboard" && config.showLeaderboard && (
                <LeaderboardPanel config={config} />
              )}
            </div>
          )}

          {/* Info */}
          <div className="rounded-xl border border-white/8 bg-white/[0.01] px-3 py-2.5">
            <p className="text-[11px] text-zinc-600">
              Einsatz: <span className="text-zinc-400">{fmt(config.ballCostCr)} CR</span> ·
              Limit: <span className="text-zinc-400">{config.hourlyBallLimit} Bälle/h</span>
              {config.dailyBallLimit > 0 && <> · <span className="text-zinc-400">{config.dailyBallLimit}/Tag</span></>}
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
