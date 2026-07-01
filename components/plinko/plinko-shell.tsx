"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Disc3, Trophy, Zap, Clock, Coins, ChevronDown, BarChart3,
  Star, Crown, User, RefreshCw, Bot, Pause, Play, TrendingDown, TrendingUp, ArrowLeft,
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
import { getPlinkoConfig } from "@/lib/actions/plinko";
import { useLiveConfig } from "@/lib/use-live-config";
import { useSoundManager } from "@/lib/sound-manager";
import { StyledUsername } from "@/components/ui/styled-username";
import { ActiveBonusDock } from "@/components/rewards/active-bonus-dock";
import { ActiveAbilityBadge } from "@/components/rewards/active-ability-badge";
import { LimitMeter } from "@/components/rewards/limit-meter";
import { useGameplaySignal } from "@/lib/gameplay-activity";
import { RotateHint } from "@/components/games/rotate-hint";

interface Props {
  config: PlinkoConfig;
  initialCredits: number;
  initialUsedThisHour: number;
  isAdmin?: boolean;
  isModerator?: boolean;
}

interface PlayResult {
  bucketIndex: number;
  multiplier: number;
  payout: number;
  betAmount: number;
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

function fmt(n: number) { return new Intl.NumberFormat("de-DE").format(Math.round(n)); }

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

// Animated credit counter
function AnimatedCredits({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (value === prevRef.current) return;
    const start = prevRef.current;
    const end = value;
    prevRef.current = value;
    const startTime = performance.now();
    const duration = Math.min(800, Math.abs(end - start) / 50);

    function tick(now: number) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + (end - start) * ease));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return <span key={value}>{fmt(display)}</span>;
}

function PersonalStatsPanel({ reloadKey = 0 }: { reloadKey?: number }) {
  const [stats, setStats] = useState<PlinkoPersonalStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await getMyPlinkoStats();
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, reloadKey]);

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

function HistoryPanel({ reloadKey = 0 }: { reloadKey?: number }) {
  const [history, setHistory] = useState<PlinkoHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const h = await getMyPlinkoHistory(30);
    setHistory(h);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, reloadKey]);

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
            <span className="text-zinc-600 text-[10px] w-16">{fmt(h.ballCost)} CR</span>
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

function LeaderboardPanel({ config, reloadKey = 0 }: { config: PlinkoConfig; reloadKey?: number }) {
  const [entries, setEntries] = useState<PlinkoLeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTopPlinkoWins(config.leaderboardSize).then((e) => { setEntries(e); setLoading(false); });
  }, [config.leaderboardSize, reloadKey]);

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
          <span className="flex-1 text-xs font-semibold text-zinc-300 truncate">
            <StyledUsername name={e.username} styleKey={e.nameStyleKey} userId={e.userId} size="sm" />
          </span>
          <span className="text-[10px] text-zinc-500">{e.multiplier}x</span>
          <span className="text-xs font-bold text-amber-400">{fmt(e.payoutCr)} CR</span>
        </div>
      ))}
    </div>
  );
}

// Session history dot-timeline
function SessionDots({ history }: { history: PlayResult[] }) {
  if (history.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 py-1">
      {history.slice(0, 40).map((h, i) => {
        const col = h.multiplier >= 5 ? "#f59e0b" : h.multiplier >= 2 ? "#10b981" : h.multiplier >= 1 ? "#6366f1" : h.multiplier >= 0.5 ? "#3b82f6" : "#ef4444";
        return (
          <div
            key={i}
            title={`${h.multiplier}x · ${h.riskEmoji} ${h.riskLabel} · Einsatz: ${fmt(h.betAmount)} CR`}
            className="h-2.5 w-2.5 rounded-full transition-all hover:scale-150"
            style={{ backgroundColor: col, boxShadow: `0 0 5px ${col}88` }}
          />
        );
      })}
    </div>
  );
}

export function PlinkoShell({ config: initialConfig, initialCredits, initialUsedThisHour, isAdmin = false, isModerator = false }: Props) {
  const [config, setConfig] = useState(initialConfig);
  useLiveConfig("plinko-config-live", getPlinkoConfig, setConfig);
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
  const [betAmount, setBetAmount] = useState(config.minBetCr);
  const [autoBet, setAutoBet] = useState(false);
  // Active while a ball drops or auto-bet runs → big celebrations wait for a pause.
  useGameplaySignal("plinko", animating || autoBet);
  const [bigWinOverlay, setBigWinOverlay] = useState<{ mult: number; payout: number } | null>(null);
  const sound = useSoundManager();
  const autoBetRef = useRef(false);
  // Server result is stashed here and only committed to the visible UI (last
  // result, session history, credits, big-win overlay) when the ball LANDS.
  const pendingResultRef = useRef<PlayResult | null>(null);
  // Bumped on every LANDED drop so the history/leaderboard/stats panels reload.
  const [resultsVersion, setResultsVersion] = useState(0);
  // Always-fresh pointer to doDropBall so the auto-bet effect never calls a
  // stale closure (the old setTimeout-in-callback version captured canPlay=false
  // while the previous ball was still animating and killed auto-bet instantly).
  const doDropRef = useRef<() => void>(() => {});

  const riskDef = config.riskLevels.find((r) => r.key === activeRisk) ?? config.riskLevels[0];
  const remaining = Math.max(0, config.hourlyBallLimit - usedThisHour);
  const effectiveMax = config.maxBetCr > 0 ? Math.min(config.maxBetCr, credits) : credits;
  const canPlay = !pending && !animating && remaining > 0 && credits >= betAmount && betAmount >= config.minBetCr && config.enabled;

  // Clamp bet whenever credits change
  useEffect(() => {
    setBetAmount((b) => Math.max(config.minBetCr, Math.min(b, effectiveMax || config.minBetCr)));
  }, [credits, config.minBetCr, effectiveMax]);

  // Sync auto-bet ref
  useEffect(() => { autoBetRef.current = autoBet; }, [autoBet]);

  function doDropBall() {
    if (!canPlay) { if (autoBetRef.current) setAutoBet(false); return; }
    sound.click?.();
    setError(null);
    setCurrentPath(null);
    setCurrentBucket(null);
    setCurrentMult(null);

    const thisBet = betAmount;
    const riskLabel = riskDef?.label ?? activeRisk;
    const riskEmoji = riskDef?.emoji ?? "";
    startTransition(async () => {
      const res = await dropPlinkoBall({ riskLevel: activeRisk, betAmount: thisBet });
      if (!res.success) {
        setError(res.error ?? "Fehler.");
        sound.error?.();
        setAutoBet(false);
        return;
      }
      // Stash the outcome — it stays hidden until the ball reaches the bottom.
      // Only the board's animation inputs (path/bucket/mult) are set now.
      pendingResultRef.current = {
        bucketIndex: res.bucketIndex!, multiplier: res.multiplier!, payout: res.payout!,
        betAmount: thisBet, newCredits: res.newCredits!, path: res.path!, riskLabel, riskEmoji,
      };
      setCurrentPath(res.path!);
      setCurrentBucket(res.bucketIndex!);
      setCurrentMult(res.multiplier!);
      setAnimating(true);
      setUsedThisHour((u) => u + 1);
    });
  }
  // Keep the ref pointed at the latest closure for the auto-bet effect.
  doDropRef.current = doDropBall;

  // Called by the board the instant the ball settles in a bucket — THIS is
  // where the result becomes visible (result panel, session list, credits,
  // big-win overlay, sounds, panel refresh).
  function handleAnimationEnd() {
    setAnimating(false);
    const r = pendingResultRef.current;
    if (!r) return;
    pendingResultRef.current = null;
    setSessionHistory((h) => [r, ...h.slice(0, 49)]);
    setCredits(r.newCredits);
    setResultsVersion((v) => v + 1);
    if (r.multiplier >= 5) {
      setBigWinOverlay({ mult: r.multiplier, payout: r.payout });
      setTimeout(() => setBigWinOverlay(null), 3000);
    }
    sound.plinkoLand?.();
    if (r.multiplier >= 2) sound.save?.();
    sound.xpGain?.();
  }

  // Effect-driven auto-bet: re-evaluates whenever the play-state settles, so it
  // always sees fresh values. Schedules the next drop a beat after the previous
  // ball lands; stops cleanly when credits/limit run out.
  useEffect(() => {
    if (!autoBet || animating || pending) return;
    if (!canPlay) { setAutoBet(false); return; }
    const t = setTimeout(() => doDropRef.current(), 450);
    return () => clearTimeout(t);
  }, [autoBet, animating, pending, canPlay]);

  const lastResult = sessionHistory[0] ?? null;
  const sessionNet = sessionHistory.reduce((s, h) => s + h.payout - h.betAmount, 0);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <RotateHint game="plinko" label="Plinko" />
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: "radial-gradient(ellipse, rgba(139,92,246,0.4) 0%, transparent 70%)" }} />
      </div>

      {/* Big Win Overlay */}
      {bigWinOverlay && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center" style={{ animation: "fadeInOut 3s ease forwards" }}>
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-amber-400/40 bg-zinc-950/95 px-10 py-8 shadow-[0_0_80px_rgba(245,158,11,0.5)]">
            <div className="text-5xl">🎰</div>
            <div className="text-6xl font-black text-amber-400" style={{ textShadow: "0 0 40px rgba(245,158,11,0.8)" }}>
              {bigWinOverlay.mult}x
            </div>
            <div className="text-xl font-bold text-zinc-100">+{fmt(bigWinOverlay.payout)} CR</div>
            <div className="text-sm text-amber-300/70">Mega Win!</div>
          </div>
        </div>
      )}

      {/* ── Mini Header ── */}
      <header className="flex-none flex items-center justify-between border-b border-white/8 bg-[#07021a]/95 backdrop-blur-xl px-4 py-2.5 z-20">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-white/8 transition-colors"
            aria-label="Zurück"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/20">
              <Disc3
                className="h-4 w-4 text-purple-300"
                style={{ animation: animating ? "spin 0.4s linear infinite" : "none" }}
              />
              {animating && <div className="absolute inset-0 animate-ping rounded-lg bg-purple-500/20" />}
            </div>
            <span className="font-black text-base text-zinc-100 tracking-tight">Plinko</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm font-bold text-amber-300">
            <Coins className="h-3.5 w-3.5" />
            <AnimatedCredits value={credits} /> CR
          </div>
          <LimitMeter
            remaining={remaining}
            total={config.hourlyBallLimit}
            label="Bälle/h"
            icon={<Clock className="h-3.5 w-3.5" />}
            size="sm"
            className="hidden w-[148px] lg:flex"
          />
          <ActiveAbilityBadge refreshKey={resultsVersion} />
          <ActiveBonusDock game="plinko" suffix="Bälle" refreshKey={resultsVersion} />
        </div>
      </header>

      {/* ── Main content ──
          Zero-Cutoff: the outer shell is h-dvh (dynamic viewport, shrinks with
          the mobile browser toolbar) and this region scrolls on mobile/tablet.
          The safe-area bottom padding keeps the drop button clear of the iOS
          home indicator / Android nav bar / retracting toolbar instead of
          sitting flush against the edge (or hidden behind it). */}
      <div
        className="flex-1 overflow-y-auto lg:overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="h-full lg:grid lg:grid-cols-[1fr_320px] gap-3 p-3">

          {/* ── LEFT: Board + controls ─────────────────────────────────── */}
          <div className="flex flex-col gap-2.5 mb-3 lg:mb-0 lg:overflow-hidden lg:min-h-0 lg:h-full">

          {/* Limit-Anzeige (Mobile/Tablet — prominent; Desktop zeigt sie im Header) */}
          <div className="flex-none lg:hidden">
            <LimitMeter
              remaining={remaining}
              total={config.hourlyBallLimit}
              label="Bälle diese Stunde"
              icon={<Clock className="h-3.5 w-3.5" />}
            />
            {config.dailyBallLimit > 0 && (
              <p className="mt-1 text-center text-[10px] font-semibold text-zinc-500">
                Tageslimit: <span className="text-zinc-300">{config.dailyBallLimit}/Tag</span>
              </p>
            )}
          </div>

          {/* Risk selector */}
          <div className="flex-none grid gap-1.5" style={{ gridTemplateColumns: `repeat(${config.riskLevels.length}, 1fr)` }}>
            {config.riskLevels.map((r) => (
              <button
                key={r.key}
                onClick={() => { setActiveRisk(r.key); sound.click?.(); }}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                  activeRisk === r.key ? RISK_ACTIVE[r.key] ?? "border-purple-400 bg-purple-500/20 text-purple-300" : `${RISK_COLORS[r.key] ?? "text-zinc-400 border-white/10 bg-white/5"} hover:opacity-80`
                }`}
              >
                <span className="text-base">{r.emoji}</span>
                <span>{r.label}</span>
                <span className="hidden sm:inline text-[10px] opacity-60">max {Math.max(...r.multipliers)}x</span>
              </button>
            ))}
          </div>

          {/* Board — fills all remaining space on desktop */}
          <div className="flex-none lg:flex-1 lg:min-h-0 rounded-2xl overflow-hidden" style={{ minHeight: "min(55vw, 360px)" }}>
          <PlinkoBoard
            rows={Math.max(2, (riskDef?.multipliers.length ?? 13) - 1)}
            riskLevel={riskDef!}
            path={currentPath}
            bucketIndex={currentBucket}
            multiplier={currentMult}
            betAmount={betAmount}
            isDropping={animating}
            onAnimationEnd={handleAnimationEnd}
            config={{
              particlesEnabled: config.particlesEnabled,
              trailLength: config.trailLength,
              glowIntensity: config.glowIntensity,
              animationSpeed: config.animationSpeed,
            }}
          />

          </div>{/* end board wrapper */}

          {/* Multiplier bar — compact */}
          <div className="flex-none flex items-center gap-2">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-zinc-600">Mult</span>
            <div className="flex-1">
              <MultiplierBar mults={riskDef?.multipliers ?? []} highlightIdx={!animating ? currentBucket : null} />
            </div>
          </div>

          {/* ── Bet controls — compact row ── */}
          <div className="flex-none rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-bold text-zinc-400">Einsatz</span>
              <div className="relative flex-1">
                <input
                  type="number"
                  min={config.minBetCr}
                  max={effectiveMax || config.minBetCr}
                  value={betAmount}
                  onChange={(e) => {
                    const v = Math.max(config.minBetCr, Number(e.target.value) || config.minBetCr);
                    setBetAmount(config.maxBetCr > 0 ? Math.min(v, config.maxBetCr) : v);
                  }}
                  className="w-full rounded-lg border border-white/15 bg-black/40 py-1.5 pl-3 pr-10 text-sm font-bold text-zinc-100 outline-none focus:border-purple-400/60"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">CR</span>
              </div>
              <button onClick={() => setBetAmount((b) => Math.max(config.minBetCr, Math.floor(b / 2)))}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-zinc-400 hover:text-zinc-200 transition-colors">½</button>
              <button onClick={() => setBetAmount((b) => Math.min(effectiveMax, b * 2))}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-bold text-zinc-400 hover:text-zinc-200 transition-colors">×2</button>
              <button onClick={() => setBetAmount(effectiveMax || config.minBetCr)}
                className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-400 hover:bg-amber-500/20 transition-colors">MAX</button>
            </div>
            {config.quickBetAmounts.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {config.quickBetAmounts.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => {
                      const clamped = Math.max(config.minBetCr, config.maxBetCr > 0 ? Math.min(amt, config.maxBetCr) : amt);
                      setBetAmount(Math.min(clamped, credits));
                      sound.click?.();
                    }}
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                      betAmount === amt ? "border-purple-400/60 bg-purple-500/20 text-purple-300" : "border-white/10 bg-white/5 text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {amt >= 1_000_000 ? `${amt / 1_000_000}M` : amt >= 1_000 ? `${amt / 1_000}K` : fmt(amt)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Drop button + auto-bet */}
          <div className="flex-none flex gap-2">
            <button
              onClick={doDropBall}
              disabled={!canPlay}
              className={`relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl py-3 text-sm font-black transition-all disabled:opacity-40 ${
                canPlay
                  ? "bg-gradient-to-r from-purple-700 via-violet-600 to-purple-700 text-white shadow-[0_0_24px_rgba(139,92,246,0.5)] hover:shadow-[0_0_40px_rgba(139,92,246,0.7)] hover:scale-[1.01] active:scale-[0.98]"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {canPlay && (
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute -left-20 top-0 h-full w-20 animate-[shimmer_1.8s_linear_infinite] bg-white/10 skew-x-[-20deg]" />
                </div>
              )}
              {pending || animating ? (
                <><Disc3 className="h-4 w-4 animate-spin" />{animating ? "Ball fällt…" : "Wird berechnet…"}</>
              ) : (
                <><Zap className="h-4 w-4" />Fallen lassen — {fmt(betAmount)} CR</>
              )}
            </button>
            {config.autoBetEnabled && (
              <button
                onClick={() => setAutoBet((a) => !a)}
                title={autoBet ? "Auto-Bet stoppen" : "Auto-Bet starten"}
                className={`flex items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-all ${
                  autoBet
                    ? "border-amber-400/50 bg-amber-500/20 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-pulse"
                    : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {autoBet ? <Pause className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                <span className="hidden sm:inline">{autoBet ? "Stop" : "Auto"}</span>
              </button>
            )}
          </div>

          {error && (
            <div className="flex-none rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
          )}
          {remaining === 0 && !error && (
            <div className="flex-none rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-400">
              <Clock className="mr-1 inline h-3 w-3" />Stündliches Limit erreicht!
            </div>
          )}

          {/* Session dots — only on mobile / when space allows */}
          {sessionHistory.length > 0 && (
            <div className="flex-none rounded-xl border border-white/8 bg-white/[0.01] px-3 py-1.5">
              <div className="mb-1 text-[9px] text-zinc-600 uppercase tracking-widest">Session ({sessionHistory.length})</div>
              <SessionDots history={sessionHistory} />
            </div>
          )}

          {config.showHistory && (
            <div className="flex-none lg:hidden"><PersonalStatsPanel reloadKey={resultsVersion} /></div>
          )}

          </div>{/* end LEFT column */}

          {/* ── RIGHT: Sidebar ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 lg:overflow-y-auto lg:h-full pb-3" style={{ scrollbarWidth: "thin" }}>

            {/* Last result */}
            <div className={`rounded-2xl border p-3 transition-all ${
              lastResult
                ? lastResult.multiplier >= 2
                  ? "border-emerald-500/40 bg-emerald-500/[0.06] shadow-[0_0_24px_rgba(52,211,153,0.2)]"
                  : lastResult.multiplier < 1
                    ? "border-red-500/30 bg-red-500/[0.04]"
                    : "border-purple-500/30 bg-purple-500/[0.04]"
                : "border-white/8 bg-white/[0.02]"
            }`}>
              <div className="mb-2 flex items-center gap-2">
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-bold text-zinc-300">Letztes Ergebnis</span>
              </div>
              {lastResult ? (
                <div className="text-center">
                  <div
                    className="text-4xl font-black transition-all"
                    style={{
                      color: lastResult.multiplier >= 2 ? "#10b981" : lastResult.multiplier < 1 ? "#ef4444" : "#6366f1",
                      textShadow: `0 0 20px ${lastResult.multiplier >= 2 ? "#10b981" : lastResult.multiplier < 1 ? "#ef4444" : "#6366f1"}`,
                    }}
                  >
                    {lastResult.multiplier}x
                  </div>
                  <div className={`mt-0.5 text-sm font-bold ${lastResult.payout >= lastResult.betAmount ? "text-emerald-400" : "text-red-400"}`}>
                    {lastResult.payout >= lastResult.betAmount ? "+" : ""}{fmt(lastResult.payout - lastResult.betAmount)} CR
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {lastResult.riskEmoji} {lastResult.riskLabel} · {fmt(lastResult.betAmount)} → {fmt(lastResult.payout)} CR
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-zinc-600">Noch kein Spiel</p>
              )}
            </div>

            {/* Session stats */}
            {sessionHistory.length > 0 && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5 text-purple-400" />
                  <span className="text-xs font-bold text-zinc-300">Session Stats</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: "Spiele", val: sessionHistory.length },
                    { label: "Bälle/h", val: `${usedThisHour}/${config.hourlyBallLimit}` },
                    { label: "Best Mult", val: `${Math.max(...sessionHistory.map((h) => h.multiplier))}x` },
                    {
                      label: "Netto",
                      val: `${sessionNet >= 0 ? "+" : ""}${fmt(sessionNet)} CR`,
                      color: sessionNet >= 0 ? "text-emerald-400" : "text-red-400",
                    },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="rounded-lg border border-white/8 bg-black/20 px-2 py-1.5 text-center">
                      <div className="text-[9px] text-zinc-600">{label}</div>
                      <div className={`text-xs font-bold ${color ?? "text-zinc-200"}`}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* History / Leaderboard tabs */}
            {(config.showHistory || config.showLeaderboard) && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
                <div className="mb-2.5 flex gap-1">
                  {config.showHistory && (
                    <button
                      onClick={() => setActiveTab("verlauf")}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === "verlauf" ? "bg-purple-500/20 text-purple-300" : "text-zinc-500 hover:text-zinc-300"}`}
                    >
                      <ChevronDown className="h-3 w-3" />Mein Verlauf
                    </button>
                  )}
                  {config.showLeaderboard && (
                    <button
                      onClick={() => setActiveTab("leaderboard")}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === "leaderboard" ? "bg-amber-500/20 text-amber-300" : "text-zinc-500 hover:text-zinc-300"}`}
                    >
                      <Crown className="h-3 w-3" />Top Wins
                    </button>
                  )}
                </div>
                {activeTab === "verlauf" && config.showHistory && <HistoryPanel reloadKey={resultsVersion} />}
                {activeTab === "leaderboard" && config.showLeaderboard && <LeaderboardPanel config={config} reloadKey={resultsVersion} />}
              </div>
            )}

            {/* Personal stats — desktop sidebar */}
            {config.showHistory && (
              <div className="hidden lg:block"><PersonalStatsPanel reloadKey={resultsVersion} /></div>
            )}

            {/* Info footer */}
            <div className="rounded-xl border border-white/8 bg-white/[0.01] px-3 py-2">
              <p className="text-[10px] text-zinc-600">
                Einsatz: <span className="text-zinc-400">{fmt(config.minBetCr)}–{config.maxBetCr > 0 ? fmt(config.maxBetCr) : "∞"} CR</span> ·
                Limit: <span className="text-zinc-400">{config.hourlyBallLimit}/h</span>
                {config.dailyBallLimit > 0 && <> · <span className="text-zinc-400">{config.dailyBallLimit}/Tag</span></>}
                {config.maxWinCr > 0 && <> · Max: <span className="text-amber-400">{fmt(config.maxWinCr)} CR</span></>}
              </p>
            </div>
          </div>{/* end RIGHT sidebar */}

        </div>{/* end grid */}
      </div>{/* end scroll area */}

      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%) skewX(-20deg); }
          100% { transform: translateX(600%) skewX(-20deg); }
        }
        @keyframes fadeInOut {
          0%   { opacity: 0; transform: scale(0.8); }
          15%  { opacity: 1; transform: scale(1.05); }
          75%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.95); }
        }
      `}</style>
    </div>
  );
}
