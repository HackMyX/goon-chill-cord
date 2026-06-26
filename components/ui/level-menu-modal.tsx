"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Star, Zap, Trophy, Package, Palette, Crown, Lock,
  ChevronUp, ChevronDown, TrendingUp, Gift, Info,
} from "lucide-react";
import { getLevelColor, getLevelBgColor, LEVEL_TITLES, type UserLevelInfo, type LevelDefinition } from "@/lib/level-system";
import { getXpConfig, getMyLevelInfo } from "@/lib/actions/level-system";

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
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"progress" | "levels" | "sources">("progress");
  const listRef = useRef<HTMLDivElement>(null);

  const accent = levelAccent(levelInfo.level);
  const glow = levelGlow(levelInfo.level);
  const gradient = levelGradient(levelInfo.level);

  useEffect(() => {
    getXpConfig().then((cfg) => {
      setLevels(cfg.levels);
      setXpSources(cfg.sources as unknown as Record<string, number>);
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

  return (
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

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06] px-4">
            {(["progress", "levels", "sources"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                  tab === t
                    ? "border-b-2 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                style={tab === t ? { borderColor: accent, color: accent } : undefined}
              >
                {t === "progress" ? "📊 Fortschritt" : t === "levels" ? "🏆 Alle Level" : "⚡ XP-Quellen"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div
            ref={listRef}
            className="overflow-y-auto p-4"
            style={{ maxHeight: "calc(90vh - 280px)", scrollbarWidth: "none" }}
          >
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
    </AnimatePresence>
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
