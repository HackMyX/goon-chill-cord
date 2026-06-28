"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Star, Zap, Trophy, Package, Palette, Crown, Lock,
  ChevronUp, ChevronDown, TrendingUp, Gift, Info,
} from "lucide-react";
import { getLevelColor, getLevelBgColor, LEVEL_TITLES, DEFAULT_LEVEL_ROAD_CONFIG, isMilestoneLevel, type UserLevelInfo, type LevelDefinition, type LevelReward, type LevelRewardDisplay, type LevelRoadConfig } from "@/lib/level-system";
import { Sparkles, Rocket, Flame, Coins, Shirt } from "lucide-react";

const ACH_ICON: Record<string, typeof Star> = {
  star: Star, crown: Crown, package: Package, flame: Flame, coins: Coins, zap: Zap, shirt: Shirt,
};
import { getXpConfig, getMyLevelInfo } from "@/lib/actions/level-system";
import { getMyAchievements } from "@/lib/actions/achievements";
import type { AchievementProgress } from "@/lib/achievements";
import { LevelRoad } from "@/components/ui/level-road";

// ── Helpers ───────────────────────────────────────────────────────────────────

function levelGradient(level: number): string {
  if (level >= 50) return "from-amber-500/25 via-amber-500/5 to-transparent";
  if (level >= 40) return "from-purple-500/25 via-purple-500/5 to-transparent";
  if (level >= 30) return "from-cyan-500/25 via-cyan-500/5 to-transparent";
  if (level >= 20) return "from-emerald-500/25 via-emerald-500/5 to-transparent";
  if (level >= 10) return "from-blue-500/25 via-blue-500/5 to-transparent";
  return "from-zinc-500/20 via-zinc-500/4 to-transparent";
}

function levelAccent(level: number): string {
  if (level >= 50) return "#f59e0b";
  if (level >= 40) return "#a78bfa";
  if (level >= 30) return "#67e8f9";
  if (level >= 20) return "#34d399";
  if (level >= 10) return "#60a5fa";
  return "#94a3b8";
}

function levelGlow(level: number): string {
  if (level >= 50) return "rgba(245,158,11,0.4)";
  if (level >= 40) return "rgba(167,139,250,0.4)";
  if (level >= 30) return "rgba(103,232,249,0.4)";
  if (level >= 20) return "rgba(52,211,153,0.4)";
  if (level >= 10) return "rgba(96,165,250,0.4)";
  return "rgba(148,163,184,0.3)";
}

function levelRomanNum(level: number): string {
  const TIERS: [number, string][] = [[50,"L"],[40,"XL"],[30,"XXX"],[20,"XX"],[10,"X"],[1,"I"]];
  for (const [min, label] of TIERS) {
    if (level >= min) return label;
  }
  return "I";
}

function RewardIcon({ type }: { type: string }) {
  switch (type) {
    case "credits":    return <Zap className="h-3.5 w-3.5 text-yellow-400" />;
    case "ability":    return <Crown className="h-3.5 w-3.5 text-fuchsia-400" />;
    case "badge":      return <Trophy className="h-3.5 w-3.5 text-amber-400" />;
    case "name_style": return <Palette className="h-3.5 w-3.5 text-cyan-400" />;
    default:           return <Gift className="h-3.5 w-3.5 text-purple-400" />;
  }
}

function rewardLabel(r: LevelReward): string {
  if (r.type === "credits") return `${r.amount?.toLocaleString("de-DE") ?? "?"} CR`;
  if (r.type === "ability") return r.abilityKey ?? "Fähigkeit";
  if (r.type === "badge") return r.badgeKey ?? "Badge";
  if (r.type === "name_style") return r.nameStyleKey ?? "Style";
  return r.type;
}

// ── Ambient animated backdrop (aurora orbs + drifting particles) ──────────────

// Fixed positions so the field is stable across re-renders (no hydration churn).
const PARTICLES = [
  { left: "12%", top: "22%", size: 3, dur: 6.5, delay: 0 },
  { left: "82%", top: "14%", size: 2, dur: 7.5, delay: 0.6 },
  { left: "48%", top: "8%",  size: 2, dur: 5.5, delay: 1.1 },
  { left: "68%", top: "34%", size: 3, dur: 8.0, delay: 0.3 },
  { left: "28%", top: "44%", size: 2, dur: 6.0, delay: 1.4 },
  { left: "92%", top: "48%", size: 2, dur: 7.0, delay: 0.9 },
  { left: "6%",  top: "60%", size: 2, dur: 6.8, delay: 0.2 },
  { left: "58%", top: "62%", size: 3, dur: 7.8, delay: 1.7 },
];

function AmbientFx({ accent, glow }: { accent: string; glow: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -top-16 -left-10 h-56 w-56 rounded-full blur-3xl"
        style={{ background: glow }}
        animate={{ x: [0, 26, 0], y: [0, 18, 0], opacity: [0.16, 0.30, 0.16] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-8 -right-12 h-64 w-64 rounded-full blur-3xl"
        style={{ background: `${accent}22` }}
        animate={{ x: [0, -22, 0], y: [0, 26, 0], opacity: [0.10, 0.24, 0.10] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ left: p.left, top: p.top, width: p.size, height: p.size, background: accent }}
          animate={{ y: [0, -14, 0], opacity: [0.12, 0.5, 0.12] }}
          transition={{ duration: p.dur, repeat: Infinity, ease: "easeInOut", delay: p.delay }}
        />
      ))}
    </div>
  );
}

// ── XP Ring ───────────────────────────────────────────────────────────────────

function XpRing({
  level,
  progressPercent,
  size = 96,
}: {
  level: number;
  progressPercent: number;
  size?: number;
}) {
  const accent = levelAccent(level);
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (progressPercent / 100) * circ;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div style={{ width: size, height: size }} className="relative shrink-0">
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
        {/* Progress */}
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={accent} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${accent})`, transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      {/* Level number */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: accent }}>Lv.</span>
        <span className="text-2xl font-black leading-none text-white tabular-nums">{level}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: accent }}>
          {levelRomanNum(level)}
        </span>
      </div>
    </div>
  );
}

// ── Tier Row ──────────────────────────────────────────────────────────────────

function TierRow({
  def,
  currentLevel,
}: {
  def: LevelDefinition;
  currentLevel: number;
}) {
  const [open, setOpen] = useState(false);
  const isCurrent = def.level === currentLevel;
  const isUnlocked = def.level <= currentLevel;
  const accent = levelAccent(def.level);
  const bg = getLevelBgColor(def.level);

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isCurrent
          ? "border-white/20 bg-white/[0.05]"
          : isUnlocked
            ? "border-white/8 bg-white/[0.02]"
            : "border-white/5 bg-white/[0.01] opacity-60"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {/* Level badge */}
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-black tabular-nums ${bg}`}
          style={{ color: accent, boxShadow: isCurrent ? `0 0 8px ${levelGlow(def.level)}` : undefined }}
        >
          {isCurrent ? <Star className="h-4 w-4" /> : isUnlocked ? def.level : <Lock className="h-3.5 w-3.5 opacity-50" />}
        </div>

        {/* Title + tier */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-white">{def.title || (LEVEL_TITLES[def.level] ?? `Level ${def.level}`)}</span>
            {isCurrent && (
              <span className="rounded-full border border-white/20 bg-white/10 px-1.5 py-0.5 text-[9px] font-black text-white/70">
                AKTUELL
              </span>
            )}
          </div>
          <span className="text-[11px] text-zinc-500">{def.xpRequired.toLocaleString("de-DE")} XP</span>
        </div>

        {/* Rewards count */}
        {def.rewards.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <Package className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs text-zinc-500">{def.rewards.length}</span>
          </div>
        )}

        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        )}
      </button>

      {open && def.rewards.length > 0 && (
        <div className="border-t border-white/6 px-4 pb-3 pt-2.5 flex flex-wrap gap-2">
          {def.rewards.map((reward, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs"
            >
              <RewardIcon type={reward.type} />
              <span className="text-zinc-300 font-semibold">
                {reward.type === "credits" ? `${reward.amount?.toLocaleString("de-DE") ?? "?"} CR` :
                 reward.type === "ability" ? (reward.abilityKey ?? "Fähigkeit") :
                 reward.type === "badge" ? (reward.badgeKey ?? "Badge") :
                 reward.type === "name_style" ? (reward.nameStyleKey ?? "Style") :
                 reward.type}
              </span>
            </div>
          ))}
        </div>
      )}
      {open && def.rewards.length === 0 && (
        <div className="border-t border-white/6 px-4 pb-3 pt-2.5">
          <p className="text-xs text-zinc-600 italic">Keine Belohnung für dieses Level konfiguriert.</p>
        </div>
      )}
    </div>
  );
}

// ── XP sources info ───────────────────────────────────────────────────────────

const XP_SOURCE_LABELS: Record<string, string> = {
  mine_collect:          "Mine (pro 100 CR)",
  streak_per_day:        "Tagesstreak (pro Tag)",
  snake_per_score_point: "Snake (pro Punkt)",
  plinko_per_drop:       "Plinko (pro Drop)",
  don_win:               "DON (Sieg)",
  case_open:             "Case öffnen",
  world_kill:            "Farmwelt: Monster töten",
  bp_tier_claim:         "Battle Pass Tier",
  pvp_kill:              "PvP: Spieler töten",
};

// ── Main modal ────────────────────────────────────────────────────────────────

export function LevelMenuModal({
  levelInfo,
  onClose,
}: {
  levelInfo: UserLevelInfo;
  onClose: () => void;
}) {
  const [levels, setLevels] = useState<LevelDefinition[]>([]);
  const [xpSources, setXpSources] = useState<Record<string, number>>({});
  const [rewardDisplay, setRewardDisplay] = useState<LevelRewardDisplay>("3d");
  const [roadConfig, setRoadConfig] = useState<LevelRoadConfig>(DEFAULT_LEVEL_ROAD_CONFIG);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"road" | "progress" | "preview" | "achievements" | "levels" | "sources">("road");
  const [achievements, setAchievements] = useState<AchievementProgress[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Lazy-load achievements the first time the tab is opened.
  useEffect(() => {
    if (tab === "achievements" && achievements === null) {
      getMyAchievements().then(setAchievements).catch(() => setAchievements([]));
    }
  }, [tab, achievements]);

  const accent = levelAccent(levelInfo.level);
  const glow = levelGlow(levelInfo.level);
  const gradient = levelGradient(levelInfo.level);

  useEffect(() => {
    getXpConfig().then((cfg) => {
      setLevels(cfg.levels);
      setXpSources(cfg.sources as unknown as Record<string, number>);
      setRewardDisplay(cfg.levelRewardDisplay ?? "3d");
      setRoadConfig(cfg.levelRoadConfig ?? DEFAULT_LEVEL_ROAD_CONFIG);
      setLoading(false);
      // Scroll to current level after render
      setTimeout(() => {
        const el = listRef.current?.querySelector(`[data-level="${levelInfo.level}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    });
  }, [levelInfo.level]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const maxLevel = levels.length > 0 ? Math.max(...levels.map((l) => l.level)) : 50;
  const isMaxLevel = levelInfo.level >= maxLevel;

  // Render into <body> so the fixed overlay is positioned against the viewport.
  // Rendered inline (inside the TopBar) it gets trapped by the TopBar's
  // `backdrop-blur` — backdrop-filter establishes a containing block for fixed
  // descendants, so `fixed inset-0` would anchor to the tiny header instead of
  // the screen, leaving the popup clipped at the very top of the page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="level-menu-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
          className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[#0b0a14] shadow-2xl"
          style={{ maxHeight: "90vh" }}
        >
          {/* Background gradient */}
          <div
            className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${gradient}`}
          />
          {/* Glow sphere */}
          <div
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl"
            style={{ background: glow, opacity: 0.25 }}
          />
          {/* Animated ambient backdrop (admin-toggleable) */}
          {roadConfig.ambientFx !== false && <AmbientFx accent={accent} glow={glow} />}

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div className="relative flex items-center gap-5 px-6 pb-5 pt-6">
            <XpRing level={levelInfo.level} progressPercent={levelInfo.progressPercent} size={96} />
            <div className="flex-1 min-w-0">
              <p
                className="text-[11px] font-black uppercase tracking-[0.2em]"
                style={{ color: accent }}
              >
                {LEVEL_TITLES[levelInfo.level] ?? "Spieler"}
              </p>
              <h2 className="text-2xl font-black text-white">Level {levelInfo.level}</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                {levelInfo.xp.toLocaleString("de-DE")} XP gesamt
              </p>
              {!isMaxLevel && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-zinc-600">
                      Fortschritt zu Lv. {levelInfo.level + 1}
                    </span>
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: accent }}>
                      {levelInfo.xpInCurrentLevel.toLocaleString("de-DE")} / {levelInfo.xpForCurrentLevel.toLocaleString("de-DE")} XP
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/8">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${levelInfo.progressPercent}%` }}
                      transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${accent}99, ${accent})`,
                        boxShadow: `0 0 10px ${glow}`,
                      }}
                    />
                  </div>
                </div>
              )}
              {isMaxLevel && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-[11px] font-black text-amber-300">
                  <Crown className="h-3.5 w-3.5" /> MAX LEVEL
                </div>
              )}
            </div>
          </div>

          {/* Milestone celebration banner (admin-toggleable) */}
          {isMilestoneLevel(levelInfo.level, roadConfig) && roadConfig.celebrateMilestones !== false && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative mx-4 mb-2 flex items-center gap-2 overflow-hidden rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-500/15 via-fuchsia-500/10 to-amber-500/15 px-3 py-2"
            >
              <motion.span
                aria-hidden
                className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/10 blur-md"
                animate={{ x: ["0%", "420%"] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
              />
              <Crown className="relative h-4 w-4 text-amber-300 animate-crown-bob drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
              <span className="relative text-xs font-black text-amber-100">
                Meilenstein erreicht — Level {levelInfo.level}!
              </span>
              <Sparkles className="relative ml-auto h-3.5 w-3.5 text-fuchsia-300" />
            </motion.div>
          )}

          {/* Tabs */}
          <div className="flex overflow-x-auto border-b border-white/[0.06] px-4" style={{ scrollbarWidth: "none" }}>
            {(["road", "progress", "preview", "achievements", "levels", "sources"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 whitespace-nowrap py-2.5 text-[11px] font-bold transition-colors sm:text-xs ${
                  tab === t
                    ? "border-b-2 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                style={tab === t ? { borderColor: accent, color: accent } : undefined}
              >
                {t === "road" ? "🛣️ Road" : t === "progress" ? "📊 Fortschritt" : t === "preview" ? "🔮 Vorschau" : t === "achievements" ? "🏅 Erfolge" : t === "levels" ? "🏆 Alle Level" : "⚡ XP-Quellen"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div
            ref={listRef}
            className="overflow-y-auto p-4"
            style={{ maxHeight: "calc(90vh - 280px)", scrollbarWidth: "none" }}
          >
            {/* Level Road tab */}
            {tab === "road" && (
              loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                </div>
              ) : (
                <LevelRoad
                  levels={levels}
                  currentLevel={levelInfo.level}
                  defaultDisplay={rewardDisplay}
                  roadConfig={roadConfig}
                  onOpenDailyQuests={() => {
                    onClose();
                    window.dispatchEvent(new CustomEvent("gn:open-daily-quests"));
                  }}
                />
              )
            )}

            {/* Progress tab */}
            {tab === "progress" && (
              <div className="flex flex-col gap-4">
                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Gesamt-XP", value: levelInfo.xp.toLocaleString("de-DE"), icon: <TrendingUp className="h-4 w-4" />, color: accent },
                    { label: "Aktuelles Level", value: `${levelInfo.level} / ${maxLevel}`, icon: <Star className="h-4 w-4" />, color: accent },
                    { label: "XP nächstes Level", value: isMaxLevel ? "Max!" : (levelInfo.xpForCurrentLevel - levelInfo.xpInCurrentLevel).toLocaleString("de-DE"), icon: <Zap className="h-4 w-4" />, color: accent },
                    { label: "Fortschritt", value: isMaxLevel ? "100%" : `${levelInfo.progressPercent}%`, icon: <Crown className="h-4 w-4" />, color: accent },
                  ].map((s) => (
                    <div key={s.label} className="flex flex-col gap-1 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <div className="flex items-center gap-2" style={{ color: accent }}>
                        {s.icon}
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{s.label}</span>
                      </div>
                      <span className="text-lg font-black text-white tabular-nums">{s.value}</span>
                    </div>
                  ))}
                </div>

                {/* Rewards earned */}
                {levelInfo.currentLevelDef?.rewards && levelInfo.currentLevelDef.rewards.length > 0 && (
                  <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                    <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
                      <Gift className="h-3.5 w-3.5" />
                      Aktuelle Level-Belohnungen
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {levelInfo.currentLevelDef.rewards.map((reward, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs"
                        >
                          <RewardIcon type={reward.type} />
                          <span className="text-zinc-300 font-semibold">
                            {reward.type === "credits" ? `${reward.amount?.toLocaleString("de-DE") ?? "?"} CR` :
                             reward.type === "ability" ? (reward.abilityKey ?? "Fähigkeit") :
                             reward.type === "badge" ? (reward.badgeKey ?? "Badge") :
                             reward.type === "name_style" ? (reward.nameStyleKey ?? "Style") :
                             reward.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Next level preview */}
                {levelInfo.nextLevelDef && (
                  <div
                    className="rounded-xl border p-4"
                    style={{ borderColor: `${accent}30`, background: `${accent}08` }}
                  >
                    <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: accent }}>
                      <TrendingUp className="h-3.5 w-3.5" />
                      Nächstes Level: {levelInfo.nextLevelDef.level} — {levelInfo.nextLevelDef.title}
                    </p>
                    {levelInfo.nextLevelDef.rewards.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {levelInfo.nextLevelDef.rewards.map((reward, i) => (
                          <div key={i} className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs">
                            <RewardIcon type={reward.type} />
                            <span className="text-zinc-300 font-semibold">
                              {reward.type === "credits" ? `${reward.amount?.toLocaleString("de-DE") ?? "?"} CR` :
                               reward.type === "ability" ? (reward.abilityKey ?? "Fähigkeit") :
                               reward.type === "badge" ? (reward.badgeKey ?? "Badge") :
                               reward.type === "name_style" ? (reward.nameStyleKey ?? "Style") :
                               reward.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-600 italic">Keine Belohnung für dieses Level.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Upcoming rewards preview tab */}
            {tab === "preview" && (
              loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                </div>
              ) : (() => {
                const upcoming = levels.filter((l) => l.level > levelInfo.level).sort((a, b) => a.level - b.level).slice(0, 6);
                if (upcoming.length === 0) {
                  return (
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                      <Crown className="h-10 w-10 text-amber-400" />
                      <p className="text-sm font-bold text-amber-200">Maximales Level erreicht!</p>
                      <p className="text-xs text-zinc-500">Du hast alle Level-Belohnungen freigeschaltet.</p>
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col gap-2.5">
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                      <Rocket className="h-3.5 w-3.5" style={{ color: accent }} /> Was als Nächstes auf dich wartet
                    </p>
                    {upcoming.map((def, idx) => {
                      const dist = def.level - levelInfo.level;
                      const mile = isMilestoneLevel(def.level, roadConfig);
                      return (
                        <motion.div
                          key={def.level}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={`flex items-start gap-3 rounded-xl border p-3 ${mile ? "border-amber-400/25 bg-amber-500/[0.04]" : "border-white/8 bg-white/[0.02]"}`}
                        >
                          <div
                            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-black"
                            style={{ borderColor: `${accent}40`, color: accent, background: `${accent}10` }}
                          >
                            {def.level}
                            {mile && <Crown className="absolute -top-2 -right-2 h-3.5 w-3.5 text-amber-300 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)]" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-bold text-zinc-100 truncate">{def.title}</span>
                              <span className="shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400">in {dist} Lvl</span>
                            </div>
                            {def.rewards.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {def.rewards.map((r, i) => (
                                  <span key={i} className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1 text-[11px] font-semibold text-zinc-300">
                                    <RewardIcon type={r.type} /> {rewardLabel(r)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-1 text-[10px] italic text-zinc-600">Keine Belohnung</p>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                );
              })()
            )}

            {/* Achievements tab */}
            {tab === "achievements" && (
              achievements === null ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                </div>
              ) : (() => {
                const earnedCount = achievements.filter((a) => a.earned).length;
                return (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                        <Trophy className="h-3.5 w-3.5 text-amber-400" /> Erfolge
                      </p>
                      <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-black tabular-nums" style={{ color: accent }}>
                        {earnedCount} / {achievements.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {achievements.map((a, idx) => {
                        const Icon = ACH_ICON[a.iconKey] ?? Trophy;
                        return (
                          <motion.div
                            key={a.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                            className={`relative flex items-center gap-3 overflow-hidden rounded-xl border p-3 ${a.earned ? "border-white/12 bg-white/[0.04]" : "border-white/[0.05] bg-white/[0.01]"}`}
                          >
                            <div
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
                              style={{
                                borderColor: a.earned ? `${a.color}60` : "rgba(255,255,255,0.08)",
                                background: a.earned ? `${a.color}1a` : "transparent",
                                color: a.earned ? a.color : "#52525b",
                                boxShadow: a.earned ? `0 0 14px -3px ${a.color}` : undefined,
                              }}
                            >
                              {a.earned ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className={`text-sm font-bold ${a.earned ? "text-zinc-100" : "text-zinc-400"}`}>{a.title}</p>
                                {a.earned && <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-300">✓</span>}
                              </div>
                              <p className="text-[11px] text-zinc-500">{a.description}</p>
                              {!a.earned && (
                                <div className="mt-1.5">
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                                    <div className="h-full rounded-full" style={{ width: `${a.progress * 100}%`, background: a.color }} />
                                  </div>
                                  <p className="mt-0.5 text-[9px] tabular-nums text-zinc-600">{a.current.toLocaleString("de-DE")} / {a.threshold.toLocaleString("de-DE")}</p>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            )}

            {/* All levels tab */}
            {tab === "levels" && (
              <div className="flex flex-col gap-1.5">
                {loading ? (
                  <div className="flex items-center justify-center py-10 text-sm text-zinc-600">Lade Level…</div>
                ) : levels.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <Info className="h-8 w-8 text-zinc-600" />
                    <p className="text-sm text-zinc-500">Noch keine Level konfiguriert.</p>
                    <p className="text-xs text-zinc-600">Admin → Level-System zum Konfigurieren.</p>
                  </div>
                ) : (
                  levels.map((def) => (
                    <div key={def.level} data-level={def.level}>
                      <TierRow def={def} currentLevel={levelInfo.level} />
                    </div>
                  ))
                )}
              </div>
            )}

            {/* XP sources tab */}
            {tab === "sources" && (
              <div className="flex flex-col gap-2">
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                  <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
                    <Zap className="h-3.5 w-3.5 text-yellow-400" />
                    XP pro Aktivität
                  </p>
                  {loading ? (
                    <p className="text-xs text-zinc-600">Lade…</p>
                  ) : (
                    <div className="flex flex-col divide-y divide-white/[0.04]">
                      {Object.entries(xpSources).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between py-2.5">
                          <span className="text-sm text-zinc-300">{XP_SOURCE_LABELS[key] ?? key}</span>
                          <span className="font-mono text-sm font-bold tabular-nums" style={{ color: accent }}>
                            +{typeof value === "number" ? value : String(value)} XP
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] px-4 py-3">
                  <p className="flex items-start gap-2 text-xs text-blue-300/70">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    XP-Raten werden vom Admin konfiguriert und können sich jederzeit ändern. Ausgerüstete XP-Booster-Fähigkeiten multiplizieren alle gewonnenen XP.
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// ── Self-loading trigger (use in top-bar etc.) ────────────────────────────────

export function LevelMenuTrigger({
  level,
  children,
}: {
  level: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [levelInfo, setLevelInfo] = useState<UserLevelInfo | null>(null);
  const [fetching, setFetching] = useState(false);

  function handleOpen() {
    setOpen(true);
    if (!levelInfo && !fetching) {
      setFetching(true);
      getMyLevelInfo().then((info) => {
        setLevelInfo(info);
        setFetching(false);
      }).catch(() => setFetching(false));
    }
  }

  // Cross-link: another panel (e.g. Daily Quests) can open the level menu by
  // dispatching `gn:open-level`. Self-contained so there's no stale-closure issue.
  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      getMyLevelInfo().then(setLevelInfo).catch(() => {});
    };
    window.addEventListener("gn:open-level", onOpen);
    return () => window.removeEventListener("gn:open-level", onOpen);
  }, []);

  const fallbackLevelInfo: UserLevelInfo = {
    xp: 0,
    level,
    equippedAbilityKey: null,
    currentLevelDef: null,
    nextLevelDef: null,
    xpInCurrentLevel: 0,
    xpForCurrentLevel: 0,
    progressPercent: 0,
  };

  return (
    <>
      <button type="button" onClick={handleOpen} className="contents">
        {children}
      </button>
      {open && (
        <LevelMenuModal
          levelInfo={levelInfo ?? fallbackLevelInfo}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
