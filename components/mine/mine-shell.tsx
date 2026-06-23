"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Pickaxe, Trophy, Crown, ChevronRight, Coins,
  TrendingUp, Clock, ShieldAlert, Sparkles, Hammer,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { useSoundManager } from "@/lib/sound-manager";
import { collectMineCredits, upgradeMine } from "@/lib/actions/mine";
import type { MineConfig, MineLevel } from "@/lib/mine-config";
import type { MineProgress, MineLeaderboardEntry } from "@/lib/actions/mine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcAccumulated(level: number, lastCollectedAt: string, config: MineConfig): number {
  const levelCfg = config.levels.find((l) => l.level === level);
  if (!levelCfg) return 0;
  const elapsedMs = Date.now() - new Date(lastCollectedAt).getTime();
  const elapsedHours = elapsedMs / 3600000;
  const maxStorage = levelCfg.crPerHour * levelCfg.maxStorageHours;
  return Math.min(Math.floor(levelCfg.crPerHour * elapsedHours), maxStorage);
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return `${d}d ${h}h`;
}

function getLevelColor(level: number): { text: string; border: string; bg: string; glow: string; ore: string } {
  if (level <= 2) return { text: "text-amber-600", border: "border-amber-700/40", bg: "bg-amber-900/10", glow: "shadow-amber-900/30", ore: "Kupfer" };
  if (level <= 4) return { text: "text-zinc-300", border: "border-zinc-500/40", bg: "bg-zinc-800/10", glow: "shadow-zinc-600/30", ore: "Silber" };
  if (level <= 6) return { text: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10", glow: "shadow-amber-500/30", ore: "Gold" };
  if (level <= 8) return { text: "text-cyan-400", border: "border-cyan-500/40", bg: "bg-cyan-500/10", glow: "shadow-cyan-500/30", ore: "Diamant" };
  if (level === 9) return { text: "text-purple-400", border: "border-purple-500/40", bg: "bg-purple-500/10", glow: "shadow-purple-500/30", ore: "Amethyst" };
  return { text: "text-rose-400", border: "border-rose-500/40", bg: "bg-rose-500/10", glow: "shadow-rose-500/30", ore: "Rubin" };
}

// Animated pickaxe icon
function AnimatedPickaxe({ active, delay = 0, size = "h-8 w-8" }: { active: boolean; delay?: number; size?: string }) {
  return (
    <div
      className={`transition-transform ${active ? "animate-bounce" : ""}`}
      style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
    >
      <Hammer className={`${size} opacity-70`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard row
// ---------------------------------------------------------------------------

function LeaderboardRow({ entry, userId }: { entry: MineLeaderboardEntry; userId: string }) {
  const isSelf = entry.userId === userId;
  const { text } = getLevelColor(entry.level);
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${isSelf ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/20" : "hover:bg-white/[0.02]"}`}>
      <div className="flex w-6 justify-center">
        {entry.rank === 1 ? <Crown className="h-4 w-4 text-amber-400" /> :
         entry.rank === 2 ? <Trophy className="h-4 w-4 text-zinc-300" /> :
         entry.rank === 3 ? <Trophy className="h-4 w-4 text-amber-600" /> :
         <span className="text-xs font-bold text-zinc-600">#{entry.rank}</span>}
      </div>
      <div className="flex flex-1 flex-col min-w-0">
        <span className={`truncate text-sm font-semibold ${isSelf ? "text-amber-200" : "text-zinc-200"}`}>
          {isSelf ? "Du" : entry.username}
        </span>
        <span className={`text-[10px] font-bold uppercase ${text}`}>Lvl {entry.level}</span>
      </div>
      <div className="text-right">
        <span className="text-sm font-bold text-zinc-200">{(entry.totalMined / 1000).toFixed(1)}k</span>
        <p className="text-[10px] text-zinc-600">CR gesamt</p>
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
  username,
  isAdmin,
  isModerator,
  config,
  progress: initialProgress,
  leaderboard,
}: MineShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  const [progress, setProgress] = useState(initialProgress);
  const [accumulated, setAccumulated] = useState(() =>
    calcAccumulated(initialProgress.level, initialProgress.lastCollectedAt, config)
  );
  const [collecting, setCollecting] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [flashMsg, setFlashMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const router = useRouter();
  const sound = useSoundManager();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const levelCfg = config.levels.find((l) => l.level === progress.level) ?? config.levels[0];
  const maxStorage = levelCfg.crPerHour * levelCfg.maxStorageHours;
  const fillPct = Math.min(100, (accumulated / maxStorage) * 100);
  const isFull = accumulated >= maxStorage;
  const colors = getLevelColor(progress.level);

  // Live timer — update accumulated every 5 seconds
  useEffect(() => {
    const update = () => {
      setAccumulated(calcAccumulated(progress.level, progress.lastCollectedAt, config));
    };
    update();
    timerRef.current = setInterval(update, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [progress, config]);

  function flash(text: string, ok: boolean) {
    setFlashMsg({ text, ok });
    setTimeout(() => setFlashMsg(null), 3000);
  }

  async function handleCollect() {
    if (collecting || accumulated <= 0) return;
    setCollecting(true);
    setIsAnimating(true);
    sound.click();

    const res = await collectMineCredits();
    setCollecting(false);
    setIsAnimating(false);

    if (res.success) {
      setCredits(res.newCredits ?? credits);
      setProgress((p) => ({
        ...p,
        lastCollectedAt: new Date().toISOString(),
        totalMined: p.totalMined + (res.earned ?? 0),
      }));
      setAccumulated(0);
      flash(`+${(res.earned ?? 0).toLocaleString("de-DE")} CR abgebaut!`, true);
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
    <div className="flex min-h-screen flex-col bg-[#030305]">
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
              <Pickaxe className="h-5 w-5 text-amber-400" />
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

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {/* Flash message */}
        {flashMsg && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-center text-sm font-bold transition-all ${
            flashMsg.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}>
            {flashMsg.text}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          {/* Left: Mine card + level overview */}
          <div className="flex flex-col gap-5">
            {/* Hero section */}
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-600">
                Passives Einkommen
              </p>
              <h1 className="mt-1 flex items-center justify-center gap-2 text-2xl font-extrabold">
                <Pickaxe className={`h-6 w-6 ${colors.text}`} />
                <span className={colors.text}>{config.sectionTitle}</span>
              </h1>
            </div>

            {/* Main mine card */}
            <div className={`relative overflow-hidden rounded-2xl border ${colors.border} ${colors.bg} shadow-2xl ${colors.glow}`}>
              {/* Ore type label + level badge */}
              <div className="flex items-center justify-between border-b border-white/8 px-5 py-3">
                <p className={`text-sm font-extrabold uppercase tracking-wider ${colors.text}`}>
                  {colors.ore}mine
                </p>
                <span className={`rounded-full border px-3 py-0.5 text-[11px] font-extrabold uppercase ${colors.border} ${colors.bg} ${colors.text}`}>
                  Lvl {progress.level}
                </span>
              </div>

              {/* Animated pickaxes */}
              <div className={`flex items-end justify-center gap-3 py-5 ${colors.text}`}>
                <AnimatedPickaxe active={isAnimating || isFull} delay={0} size="h-7 w-7" />
                <AnimatedPickaxe active={isAnimating || isFull} delay={200} size="h-10 w-10" />
                <AnimatedPickaxe active={isAnimating || isFull} delay={100} size="h-7 w-7" />
              </div>

              {/* Storage progress */}
              <div className="px-5 pb-3">
                <div className="mb-2 flex justify-between text-xs text-zinc-400">
                  <span className="font-bold">{accumulated.toLocaleString("de-DE")} CR bereit</span>
                  <span className="text-zinc-600">Max {maxStorage.toLocaleString("de-DE")} CR</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-black/40">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      isFull
                        ? "animate-pulse bg-amber-400"
                        : fillPct > 60
                        ? "bg-gradient-to-r from-amber-600 to-amber-400"
                        : "bg-gradient-to-r from-amber-800 to-amber-600"
                    }`}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
                {isFull && (
                  <p className="mt-1 text-center text-[10px] font-bold uppercase tracking-widest text-amber-400">
                    Lager voll!
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
                      : `border ${colors.border} bg-gradient-to-r from-amber-700 to-amber-500 text-black shadow-lg shadow-amber-600/20 hover:from-amber-600 hover:to-amber-400 hover:shadow-amber-500/40`
                  }`}
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
                    <div className="absolute inset-0 -translate-x-full animate-[sweep_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  )}
                </button>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3 px-5 pb-4">
                <div className="flex flex-col items-center rounded-xl border border-white/8 bg-black/20 py-3">
                  <TrendingUp className={`mb-1 h-5 w-5 ${colors.text}`} />
                  <span className={`text-xl font-extrabold ${colors.text}`}>{levelCfg.crPerHour.toLocaleString("de-DE")}</span>
                  <span className="text-[10px] font-semibold uppercase text-zinc-600">CR / Stunde</span>
                </div>
                <div className="flex flex-col items-center rounded-xl border border-white/8 bg-black/20 py-3">
                  <Clock className="mb-1 h-5 w-5 text-zinc-400" />
                  <span className="text-xl font-extrabold text-zinc-200">{levelCfg.maxStorageHours}h</span>
                  <span className="text-[10px] font-semibold uppercase text-zinc-600">Max-Lager</span>
                </div>
              </div>

              {/* Upgrade button */}
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
                    <span className="flex items-center gap-1 font-mono text-sm">
                      <Coins className="h-4 w-4" />
                      {levelCfg.upgradeCost.toLocaleString("de-DE")} CR
                    </span>
                  </button>
                  {nextLevelCfg && (
                    <p className="mt-1.5 text-center text-[10px] text-zinc-600">
                      Nächste Rate: {nextLevelCfg.crPerHour.toLocaleString("de-DE")} CR/h
                    </p>
                  )}
                </div>
              ) : (
                <div className="border-t border-white/8 px-5 py-3 text-center">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-bold ${colors.border} ${colors.text}`}>
                    <Crown className="h-4 w-4" />
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
                  const lc = getLevelColor(lvl.level);
                  const isActive = lvl.level === progress.level;
                  const isDone = lvl.level < progress.level;
                  return (
                    <div
                      key={lvl.level}
                      className={`flex flex-col items-center rounded-xl border py-2.5 transition-all ${
                        isActive
                          ? `${lc.border} ${lc.bg} shadow-lg ring-1 ring-inset ${lc.border}`
                          : isDone
                          ? "border-white/5 bg-white/[0.02]"
                          : "border-white/5 bg-transparent opacity-40"
                      }`}
                    >
                      {isDone && (
                        <span className="mb-0.5 text-[9px] text-emerald-500">✓</span>
                      )}
                      <span className={`text-[10px] font-extrabold ${isActive ? lc.text : isDone ? "text-zinc-500" : "text-zinc-700"}`}>
                        L{lvl.level}
                      </span>
                      <span className={`text-[9px] ${isActive ? lc.text : isDone ? "text-zinc-600" : "text-zinc-700"}`}>
                        {lvl.crPerHour}/h
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Stats + Leaderboard */}
          <div className="flex flex-col gap-4">
            {/* My stats */}
            <div className="rounded-2xl border border-white/8 bg-[#080712] p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-600">Meine Mine</h3>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Level</span>
                  <span className={`font-extrabold ${colors.text}`}>Lvl {progress.level} — {colors.ore}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Gesamt abgebaut</span>
                  <span className="font-bold text-zinc-200">{progress.totalMined.toLocaleString("de-DE")} CR</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">Rate</span>
                  <span className="font-bold text-amber-400">{levelCfg.crPerHour.toLocaleString("de-DE")} CR/h</span>
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
            <div className="rounded-2xl border border-white/8 bg-[#080712] overflow-hidden">
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
