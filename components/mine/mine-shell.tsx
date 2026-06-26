"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Pickaxe, Trophy, Crown, Coins,
  TrendingUp, Clock, ShieldAlert, Sparkles, Star,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { useSoundManager } from "@/lib/sound-manager";
import { collectMineCredits, upgradeMine, getMineConfig } from "@/lib/actions/mine";
import { useLiveConfig } from "@/lib/use-live-config";
import type { MineConfig } from "@/lib/mine-config";
import type { MineProgress, MineLeaderboardEntry } from "@/lib/actions/mine";
import { StyledUsername } from "@/components/ui/styled-username";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcAccumulated(level: number, lastCollectedAt: string, config: MineConfig): number {
  const levelCfg = config.levels.find((l) => l.level === level);
  if (!levelCfg) return 0;
  const elapsedMs = Date.now() - new Date(lastCollectedAt).getTime();
  const elapsedHours = elapsedMs / 3_600_000;
  const maxStorage = levelCfg.crPerHour * levelCfg.maxStorageHours;
  return Math.min(Math.floor(levelCfg.crPerHour * elapsedHours), maxStorage);
}

function getLevelTheme(level: number) {
  if (level <= 2) return { label: "Kupfer", accent: "#c2784f", border: "border-amber-700/40", bg: "bg-amber-900/10", glow: "shadow-amber-900/40", text: "text-amber-600", ring: "ring-amber-700/40", ore: "🟫", particleColors: ["#d97706","#b45309","#78350f"] };
  if (level <= 4) return { label: "Silber", accent: "#a1a1aa", border: "border-zinc-500/40", bg: "bg-zinc-800/10", glow: "shadow-zinc-600/40", text: "text-zinc-300", ring: "ring-zinc-500/40", ore: "⬜", particleColors: ["#d4d4d8","#a1a1aa","#71717a"] };
  if (level <= 6) return { label: "Gold", accent: "#f59e0b", border: "border-amber-500/40", bg: "bg-amber-500/10", glow: "shadow-amber-500/30", text: "text-amber-400", ring: "ring-amber-500/30", ore: "🟡", particleColors: ["#fbbf24","#f59e0b","#d97706"] };
  if (level <= 8) return { label: "Diamant", accent: "#22d3ee", border: "border-cyan-500/40", bg: "bg-cyan-500/10", glow: "shadow-cyan-500/30", text: "text-cyan-400", ring: "ring-cyan-500/30", ore: "💎", particleColors: ["#22d3ee","#06b6d4","#0891b2"] };
  if (level === 9) return { label: "Amethyst", accent: "#a855f7", border: "border-purple-500/40", bg: "bg-purple-500/10", glow: "shadow-purple-500/30", text: "text-purple-400", ring: "ring-purple-500/30", ore: "🟣", particleColors: ["#c084fc","#a855f7","#9333ea"] };
  return { label: "Rubin", accent: "#f43f5e", border: "border-rose-500/40", bg: "bg-rose-500/10", glow: "shadow-rose-500/30", text: "text-rose-400", ring: "ring-rose-500/30", ore: "🔴", particleColors: ["#fb7185","#f43f5e","#e11d48"] };
}

// ---------------------------------------------------------------------------
// Ore particle (CSS-driven)
// ---------------------------------------------------------------------------

interface OreParticle { id: number; x: number; color: string }

function OreParticle({ x, color }: { x: number; color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: `${x}%`,
        width: 8,
        height: 8,
        borderRadius: 2,
        background: color,
        boxShadow: `0 0 6px ${color}`,
        animation: "ore-float 1.8s ease-out forwards",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Animated pickaxe trio
// ---------------------------------------------------------------------------

function PickaxeTrio({ active, theme }: { active: boolean; theme: ReturnType<typeof getLevelTheme> }) {
  return (
    <div className="relative flex items-end justify-center gap-4 py-6">
      {/* Left pickaxe (alt swing) */}
      <div
        className={`${active ? "" : "opacity-50"}`}
        style={{
          display: "inline-block",
          transformOrigin: "50% 100%",
          animation: active ? "pickaxe-swing-alt 0.7s ease-in-out infinite" : undefined,
          animationDelay: "0.25s",
          filter: active ? `drop-shadow(0 0 8px ${theme.accent})` : undefined,
        }}
      >
        <Pickaxe className="h-8 w-8" style={{ color: theme.accent, opacity: 0.7 }} />
      </div>

      {/* Center pickaxe (bigger, main swing) */}
      <div
        className={`${active ? "" : "opacity-60"}`}
        style={{
          display: "inline-block",
          transformOrigin: "50% 100%",
          animation: active ? "pickaxe-swing 0.65s ease-in-out infinite" : undefined,
          filter: active ? `drop-shadow(0 0 14px ${theme.accent})` : undefined,
        }}
      >
        <Pickaxe className="h-12 w-12" style={{ color: theme.accent }} />
      </div>

      {/* Right pickaxe (alt swing) */}
      <div
        className={`${active ? "" : "opacity-50"}`}
        style={{
          display: "inline-block",
          transformOrigin: "50% 100%",
          animation: active ? "pickaxe-swing-alt 0.7s ease-in-out infinite" : undefined,
          animationDelay: "0.15s",
          filter: active ? `drop-shadow(0 0 8px ${theme.accent})` : undefined,
        }}
      >
        <Pickaxe className="h-8 w-8" style={{ color: theme.accent, opacity: 0.7 }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard row
// ---------------------------------------------------------------------------

function LeaderboardRow({ entry, userId }: { entry: MineLeaderboardEntry; userId: string }) {
  const isSelf = entry.userId === userId;
  const theme = getLevelTheme(entry.level);
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${isSelf ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/20" : "hover:bg-white/[0.02]"}`}>
      <div className="flex w-6 items-center justify-center">
        {entry.rank === 1 ? <Crown className="h-4 w-4 text-amber-400" /> :
         entry.rank === 2 ? <Trophy className="h-4 w-4 text-zinc-300" /> :
         entry.rank === 3 ? <Trophy className="h-4 w-4 text-amber-600" /> :
         <span className="text-xs font-bold text-zinc-600">#{entry.rank}</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-sm font-semibold ${isSelf ? "text-amber-200" : "text-zinc-200"}`}>
          {isSelf ? "Du" : <StyledUsername name={entry.username} styleKey={entry.nameStyleKey} userId={entry.userId} size="md" />}
        </span>
        <span className={`text-[10px] font-bold uppercase ${theme.text}`}>{theme.ore} {theme.label} Lvl {entry.level}</span>
      </div>
      <div className="text-right">
        <span className="text-sm font-bold text-zinc-200">{(entry.totalMined / 1000).toFixed(1)}k</span>
        <p className="text-[10px] text-zinc-600">CR total</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface MineShellProps {
  userId: string;
  credits: number;
  streakDays: number;
  username: string;
  isAdmin: boolean;
  isModerator: boolean;
  config: MineConfig;
  progress: MineProgress;
  leaderboard: MineLeaderboardEntry[];
}

export function MineShell({
  userId,
  credits: initialCredits,
  streakDays,
  isAdmin,
  isModerator,
  config: initialConfig,
  progress: initialProgress,
  leaderboard,
}: MineShellProps) {
  const [config, setConfig] = useState(initialConfig);
  useLiveConfig("mine-config-live", getMineConfig, setConfig);
  const [credits, setCredits] = useState(initialCredits);
  const [progress, setProgress] = useState(initialProgress);
  const [accumulated, setAccumulated] = useState(() =>
    calcAccumulated(initialProgress.level, initialProgress.lastCollectedAt, config)
  );
  const [collecting, setCollecting] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [flashMsg, setFlashMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [collectFlash, setCollectFlash] = useState(false);
  const [oreParticles, setOreParticles] = useState<OreParticle[]>([]);
  const oreIdRef = useRef(0);
  const particleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const sound = useSoundManager();

  const levelCfg = config.levels.find((l) => l.level === progress.level) ?? config.levels[0];
  const maxStorage = levelCfg.crPerHour * levelCfg.maxStorageHours;
  const fillPct = Math.min(100, (accumulated / maxStorage) * 100);
  const isFull = accumulated >= maxStorage;
  const theme = getLevelTheme(progress.level);
  const isActive = !collecting && accumulated > 0;

  // 1-second live timer
  useEffect(() => {
    const update = () =>
      setAccumulated(calcAccumulated(progress.level, progress.lastCollectedAt, config));
    update();
    timerRef.current = setInterval(update, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [progress, config]);

  // Ore particles spawner when active
  useEffect(() => {
    if (!isActive) {
      if (particleTimerRef.current) clearInterval(particleTimerRef.current);
      return;
    }
    particleTimerRef.current = setInterval(() => {
      const colors = theme.particleColors;
      const newParticle: OreParticle = {
        id: oreIdRef.current++,
        x: 10 + Math.random() * 80,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
      setOreParticles((prev) => [...prev.slice(-20), newParticle]);
      setTimeout(() => {
        setOreParticles((prev) => prev.filter((p) => p.id !== newParticle.id));
      }, 1900);
    }, 600);
    return () => { if (particleTimerRef.current) clearInterval(particleTimerRef.current); };
  }, [isActive, theme]);

  function flash(text: string, ok: boolean) {
    setFlashMsg({ text, ok });
    setTimeout(() => setFlashMsg(null), 3500);
  }

  async function handleCollect() {
    if (collecting || accumulated <= 0) return;
    setCollecting(true);
    setCollectFlash(true);
    sound.click();

    const res = await collectMineCredits();
    setCollecting(false);
    setTimeout(() => setCollectFlash(false), 600);

    if (res.success) {
      setCredits(res.newCredits ?? credits);
      setProgress((p) => ({
        ...p,
        lastCollectedAt: new Date().toISOString(),
        totalMined: p.totalMined + (res.earned ?? 0),
      }));
      setAccumulated(0);
      flash(`+${(res.earned ?? 0).toLocaleString("de-DE")} CR abgebaut!`, true);
      sound.xpGain();
      router.refresh();
    } else {
      flash(res.error ?? "Fehler beim Abbauen.", false);
    }
  }

  async function handleUpgrade() {
    if (upgrading || !levelCfg.upgradeCost) return;
    if (credits < levelCfg.upgradeCost) {
      flash(`Nicht genug CR. Du brauchst ${levelCfg.upgradeCost.toLocaleString("de-DE")} CR.`, false);
      return;
    }
    setUpgrading(true);
    sound.click();

    const res = await upgradeMine();
    setUpgrading(false);

    if (res.success) {
      setCredits(res.newCredits ?? credits);
      setProgress((p) => ({ ...p, level: res.newLevel ?? p.level + 1 }));
      flash(`Mine auf Level ${res.newLevel} aufgewertet!`, true);
      router.refresh();
    } else {
      flash(res.error ?? "Upgrade fehlgeschlagen.", false);
    }
  }

  const nextLevelCfg = config.levels.find((l) => l.level === progress.level + 1);

  return (
    <div className="flex min-h-dvh flex-col bg-[#030305]">
      <TopBar credits={credits} streakDays={streakDays} isAdmin={isAdmin} isModerator={isModerator} />

      {/* Header */}
      <div className="border-b border-white/5 bg-[#06050f]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" onMouseEnter={sound.hover} onClick={sound.click}
              className="flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300">
              <ArrowLeft className="h-4 w-4" /> Zurück
            </Link>
            <div className="h-5 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <span className={theme.text}>
                <Pickaxe className="h-5 w-5" />
              </span>
              <span className="text-lg font-extrabold text-zinc-50">Goldmine</span>
            </div>
          </div>
          {isAdmin && (
            <Link href="/admin"
              className="flex items-center gap-1 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-400/10">
              <ShieldAlert className="h-3.5 w-3.5" /> Admin
            </Link>
          )}
        </div>
      </div>

      <main className="mx-auto w-full max-w-4xl flex-1 px-3 py-4 sm:px-4 sm:py-8">
        {/* Flash message */}
        {flashMsg && (
          <div className={`mb-5 rounded-xl border px-4 py-3 text-center text-sm font-bold transition-all ${
            flashMsg.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`} style={{ animation: "snake-banner-in 0.3s ease" }}>
            {flashMsg.text}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          {/* Left column */}
          <div className="flex flex-col gap-5">
            {/* Hero heading */}
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-600">Passives Einkommen</p>
              <h1 className="mt-1 text-2xl font-extrabold">
                <span className={theme.text}>{theme.ore} {config.sectionTitle}</span>
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500">{config.sectionSubtitle}</p>
            </div>

            {/* Main mine card */}
            <div className={`relative overflow-hidden rounded-2xl border shadow-2xl ${theme.border} ${theme.bg} ${theme.glow}`}>
              {/* Top bar */}
              <div className="flex items-center justify-between border-b border-white/8 px-5 py-3">
                <p className={`text-sm font-extrabold uppercase tracking-wider ${theme.text}`}>
                  {theme.label}mine
                </p>
                <span className={`rounded-full border px-3 py-0.5 text-[11px] font-extrabold uppercase ${theme.border} ${theme.bg} ${theme.text}`}>
                  Lvl {progress.level}
                </span>
              </div>

              {/* Pickaxe animation area with ore particles */}
              <div className="relative" style={{ minHeight: 110 }}>
                {/* Ambient glow bg */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `radial-gradient(ellipse at 50% 80%, ${theme.accent}22 0%, transparent 70%)`,
                    animation: isActive ? "mine-pulse 2s ease-in-out infinite" : undefined,
                  }}
                />

                {/* Ore particles */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  {oreParticles.map((p) => (
                    <OreParticle key={p.id} x={p.x} color={p.color} />
                  ))}
                </div>

                {/* Pickaxes */}
                <PickaxeTrio active={isActive} theme={theme} />

                {/* Mining rate live badge */}
                <div className="absolute right-4 top-3 flex flex-col items-end">
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${theme.text} opacity-60`}>Rate</span>
                  <span className={`text-lg font-extrabold tabular-nums ${theme.text}`}>
                    {levelCfg.crPerHour.toLocaleString("de-DE")} CR/h
                  </span>
                </div>
              </div>

              {/* Storage progress */}
              <div className="px-5 pb-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className={`text-base font-extrabold tabular-nums ${theme.text}`}>
                    {accumulated.toLocaleString("de-DE")} CR
                  </span>
                  <span className="text-xs text-zinc-600">/ {maxStorage.toLocaleString("de-DE")} CR Max</span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-black/50">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${fillPct}%`,
                      background: isFull
                        ? `linear-gradient(90deg, ${theme.accent}cc, ${theme.accent})`
                        : `linear-gradient(90deg, ${theme.accent}66, ${theme.accent}aa)`,
                      animation: isFull ? "mine-pulse 1.5s ease-in-out infinite" : undefined,
                    }}
                  />
                  {/* Shimmer on progress bar */}
                  {fillPct > 5 && (
                    <div className="absolute inset-0 -translate-x-full animate-[mine-shimmer_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  )}
                </div>
                {isFull && (
                  <p className={`mt-1.5 text-center text-[10px] font-extrabold uppercase tracking-widest ${theme.text}`}
                    style={{ animation: "mine-pulse 1.5s ease-in-out infinite" }}>
                    ⚠ Lager voll — jetzt abbauen!
                  </p>
                )}
              </div>

              {/* Collect button */}
              <div className="px-5 pb-3">
                <button
                  onClick={handleCollect}
                  disabled={collecting || accumulated <= 0}
                  onMouseEnter={sound.hover}
                  className={`relative w-full overflow-hidden rounded-xl py-4 text-base font-extrabold uppercase tracking-wider transition-all active:scale-[0.98] ${
                    accumulated <= 0
                      ? "cursor-not-allowed border border-white/10 bg-black/20 text-zinc-600"
                      : "border text-black shadow-lg"
                  }`}
                  style={accumulated > 0 ? {
                    background: `linear-gradient(135deg, ${theme.accent}cc, ${theme.accent})`,
                    borderColor: `${theme.accent}55`,
                    boxShadow: collectFlash
                      ? `0 0 30px ${theme.accent}99`
                      : `0 0 14px ${theme.accent}44`,
                    transition: "box-shadow 0.3s ease",
                  } : undefined}
                >
                  {collecting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                      Wird abgebaut…
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Pickaxe className="h-5 w-5" />
                      {accumulated.toLocaleString("de-DE")} CR Abbauen
                    </span>
                  )}
                  {/* Shine sweep */}
                  {accumulated > 0 && !collecting && (
                    <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[mine-shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  )}
                </button>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 px-5 pb-4">
                <div className="flex flex-col items-center rounded-xl border border-white/8 bg-black/20 py-3">
                  <TrendingUp className={`mb-1 h-4 w-4 ${theme.text}`} />
                  <span className={`text-lg font-extrabold ${theme.text}`}>{levelCfg.crPerHour.toLocaleString("de-DE")}</span>
                  <span className="text-[9px] font-semibold uppercase text-zinc-600">CR/Stunde</span>
                </div>
                <div className="flex flex-col items-center rounded-xl border border-white/8 bg-black/20 py-3">
                  <Clock className="mb-1 h-4 w-4 text-zinc-400" />
                  <span className="text-lg font-extrabold text-zinc-200">{levelCfg.maxStorageHours}h</span>
                  <span className="text-[9px] font-semibold uppercase text-zinc-600">Max-Lager</span>
                </div>
                <div className="flex flex-col items-center rounded-xl border border-white/8 bg-black/20 py-3">
                  <Coins className="mb-1 h-4 w-4 text-emerald-400" />
                  <span className="text-lg font-extrabold text-emerald-300">{progress.totalMined.toLocaleString("de-DE")}</span>
                  <span className="text-[9px] font-semibold uppercase text-zinc-600">Gesamt CR</span>
                </div>
              </div>

              {/* Upgrade */}
              {levelCfg.upgradeCost !== null ? (
                <div className="border-t border-white/8 px-5 py-3">
                  <button
                    onClick={handleUpgrade}
                    disabled={upgrading || credits < levelCfg.upgradeCost}
                    onMouseEnter={sound.hover}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-bold transition-all ${
                      credits >= levelCfg.upgradeCost
                        ? "border-purple-500/30 bg-purple-500/10 text-purple-200 hover:border-purple-400/50 hover:bg-purple-500/20"
                        : "cursor-not-allowed border-white/8 bg-black/10 text-zinc-600"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      {upgrading ? "Wird aufgewertet…" : `Upgrade → Lvl ${progress.level + 1}`}
                    </span>
                    <span className={`flex items-center gap-1 font-mono text-sm ${credits >= levelCfg.upgradeCost ? "text-purple-300" : "text-zinc-600"}`}>
                      <Coins className="h-4 w-4" />
                      {levelCfg.upgradeCost.toLocaleString("de-DE")} CR
                    </span>
                  </button>
                  {nextLevelCfg && (
                    <p className="mt-1.5 text-center text-[10px] text-zinc-600">
                      Nächste Rate: <span className={theme.text}>{nextLevelCfg.crPerHour.toLocaleString("de-DE")} CR/h</span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="border-t border-white/8 px-5 py-4 text-center">
                  <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold ${theme.border} ${theme.text}`}
                    style={{ animation: "mine-pulse 2s ease-in-out infinite" }}>
                    <Star className="h-4 w-4" />
                    Maximales Level erreicht!
                  </span>
                </div>
              )}
            </div>

            {/* Level overview */}
            <div className="rounded-2xl border border-white/8 bg-[#080712] p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-300">
                <Trophy className="h-4 w-4 text-amber-400" />
                Level-Übersicht
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {config.levels.map((lvl) => {
                  const lc = getLevelTheme(lvl.level);
                  const isActive = lvl.level === progress.level;
                  const isDone = lvl.level < progress.level;
                  return (
                    <div
                      key={lvl.level}
                      className={`flex flex-col items-center gap-0.5 rounded-xl border py-2.5 transition-all ${
                        isActive
                          ? `${lc.border} ${lc.bg} shadow-lg ring-1 ring-inset ${lc.ring}`
                          : isDone
                          ? "border-white/5 bg-white/[0.02]"
                          : "border-white/5 bg-transparent opacity-35"
                      }`}
                      style={isActive ? { boxShadow: `0 0 12px ${lc.accent}33` } : undefined}
                    >
                      {isDone && <span className="text-[9px] text-emerald-500">✓</span>}
                      <span className={`text-[10px] font-extrabold ${isActive ? lc.text : isDone ? "text-zinc-500" : "text-zinc-700"}`}>
                        L{lvl.level}
                      </span>
                      <span className="text-[8px]">{lc.ore}</span>
                      <span className={`text-[8px] tabular-nums ${isActive ? lc.text : isDone ? "text-zinc-600" : "text-zinc-700"}`}>
                        {lvl.crPerHour}/h
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            {/* My mine stats */}
            <div className="rounded-2xl border border-white/8 bg-[#080712] p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-600">Meine Mine</h3>
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Level</span>
                  <span className={`font-extrabold ${theme.text}`}>{theme.ore} Lvl {progress.level} — {theme.label}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Abgebaut (gesamt)</span>
                  <span className="font-bold text-zinc-200">{progress.totalMined.toLocaleString("de-DE")} CR</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Abbaurate</span>
                  <span className={`font-bold ${theme.text}`}>{levelCfg.crPerHour.toLocaleString("de-DE")} CR/h</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Bereit jetzt</span>
                  <span className={`font-extrabold tabular-nums ${accumulated > 0 ? "text-emerald-400" : "text-zinc-600"}`}>
                    {accumulated.toLocaleString("de-DE")} CR
                  </span>
                </div>
                {levelCfg.upgradeCost !== null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">Upgrade-Kosten</span>
                    <span className={`font-bold ${credits >= levelCfg.upgradeCost ? "text-emerald-400" : "text-red-400"}`}>
                      {levelCfg.upgradeCost.toLocaleString("de-DE")} CR
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Leaderboard */}
            <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#080712]">
              <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
                <Crown className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-bold text-zinc-100">Bestenliste</span>
                <span className="ml-auto text-[10px] text-zinc-600">nach CR gesamt</span>
              </div>
              {leaderboard.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-600">Noch keine Daten</div>
              ) : (
                <div className="flex flex-col">
                  {leaderboard.map((entry) => (
                    <LeaderboardRow key={entry.userId} entry={entry} userId={userId} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
