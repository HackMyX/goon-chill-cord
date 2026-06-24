"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Trophy, Medal, Coins, Flame, Zap } from "lucide-react";
import { useRealtimeAllProfiles } from "@/lib/use-realtime-profile";
import { useSiteConfig } from "@/components/layout/site-config-provider";

export interface LeaderboardEntry {
  id: string;
  username: string;
  credits: number;
  streak_days?: number;
}

export interface StreakEntry {
  id: string;
  username: string;
  streak_days: number;
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  streakEntries?: StreakEntry[];
  showStreakTab?: boolean;
  style?: "podium" | "list";
}

const RANK_CONFIG = [
  {
    icon: Crown,
    label: "PLATZ 1",
    iconClass: "text-amber-400",
    borderClass: "border-amber-500/40",
    bgClass: "bg-amber-500/5",
    glowClass: "rank-1-glow",
    textClass: "text-amber-300",
    iconGlowClass: "drop-shadow-[0_0_12px_rgba(245,158,11,0.9)]",
    height: "h-44",
    iconAnimate: true,
  },
  {
    icon: Trophy,
    label: "#2",
    iconClass: "text-zinc-300",
    borderClass: "border-zinc-400/30",
    bgClass: "bg-zinc-400/5",
    glowClass: "rank-2-glow",
    textClass: "text-zinc-300",
    iconGlowClass: "drop-shadow-[0_0_6px_rgba(161,161,170,0.5)]",
    height: "h-36",
    iconAnimate: false,
  },
  {
    icon: Medal,
    label: "#3",
    iconClass: "text-orange-400",
    borderClass: "border-orange-500/30",
    bgClass: "bg-orange-500/5",
    glowClass: "rank-3-glow",
    textClass: "text-orange-300",
    iconGlowClass: "drop-shadow-[0_0_6px_rgba(251,146,60,0.5)]",
    height: "h-36",
    iconAnimate: false,
  },
];

const STREAK_RANK_CONFIG = [
  {
    label: "PLATZ 1",
    borderClass: "border-orange-500/50",
    bgClass: "bg-orange-500/8",
    glowClass: "rank-1-glow",
    textClass: "text-orange-300",
    height: "h-44",
    iconAnimate: true,
  },
  {
    label: "#2",
    borderClass: "border-amber-500/30",
    bgClass: "bg-amber-500/5",
    glowClass: "rank-2-glow",
    textClass: "text-amber-300",
    height: "h-36",
    iconAnimate: false,
  },
  {
    label: "#3",
    borderClass: "border-yellow-500/20",
    bgClass: "bg-yellow-500/5",
    glowClass: "rank-3-glow",
    textClass: "text-yellow-300",
    height: "h-36",
    iconAnimate: false,
  },
];

// Podium order: #2 left, #1 center, #3 right
const PODIUM_ORDER = [1, 0, 2] as const;

export function Leaderboard({
  entries: initialEntries,
  streakEntries: initialStreakEntries = [],
  showStreakTab = true,
  style = "podium",
}: LeaderboardProps) {
  const [creditEntries, setCreditEntries] = useState(initialEntries);
  const [streakEntries, setStreakEntries] = useState(initialStreakEntries);
  const [activeTab, setActiveTab] = useState<"credits" | "streak">("credits");
  const { currencyName } = useSiteConfig();

  useRealtimeAllProfiles((row) => {
    if (typeof row.id !== "string" || typeof row.username !== "string") return;

    // Update credits leaderboard
    if (typeof row.credits === "number") {
      setCreditEntries((curr) => {
        const without = curr.filter((e) => e.id !== row.id);
        if (row.profile_visible === false) return without;
        return [...without, { id: row.id, username: row.username as string, credits: row.credits as number }]
          .sort((a, b) => b.credits - a.credits)
          .slice(0, 10);
      });
    }

    // Update streak leaderboard
    if (typeof row.streak_days === "number") {
      setStreakEntries((curr) => {
        const without = curr.filter((e) => e.id !== row.id);
        if (row.profile_visible === false || row.streak_days === 0) return without;
        return [...without, { id: row.id, username: row.username as string, streak_days: row.streak_days as number }]
          .sort((a, b) => b.streak_days - a.streak_days)
          .slice(0, 10);
      });
    }
  });

  const isCredits = activeTab === "credits";
  const displayEntries = isCredits ? creditEntries : streakEntries;
  const top3 = displayEntries.slice(0, 3);
  const rest = displayEntries.slice(3);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Trophy className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-zinc-100">Bestenliste</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-live-dot" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Live</span>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        {showStreakTab && (
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("credits")}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 ${
                activeTab === "credits"
                  ? "bg-amber-500/15 border border-amber-500/30 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                  : "bg-white/5 border border-white/8 text-zinc-500 hover:text-zinc-300 hover:border-white/15"
              }`}
            >
              <Coins className="h-3.5 w-3.5" />
              Credits
            </button>
            <button
              onClick={() => setActiveTab("streak")}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 ${
                activeTab === "streak"
                  ? "bg-orange-500/15 border border-orange-500/30 text-orange-300 shadow-[0_0_12px_rgba(251,146,60,0.15)]"
                  : "bg-white/5 border border-white/8 text-zinc-500 hover:text-zinc-300 hover:border-white/15"
              }`}
            >
              <Flame className="h-3.5 w-3.5" />
              Streak
            </button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {displayEntries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Zap className="h-8 w-8 text-zinc-700" />
              <p className="text-sm text-zinc-600">Noch keine Daten vorhanden.</p>
            </div>
          ) : (
            <>
              {/* Podium Top 3 */}
              {style === "podium" && top3.length > 0 && (
                <div className="mb-4 flex items-end justify-center gap-3">
                  {PODIUM_ORDER.map((idx) => {
                    const entry = top3[idx];
                    if (!entry) return <div key={idx} className="w-28" />;
                    const cfg = isCredits ? RANK_CONFIG[idx] : null;
                    const sCfg = !isCredits ? STREAK_RANK_CONFIG[idx] : null;
                    const borderClass = cfg?.borderClass ?? sCfg?.borderClass ?? "";
                    const bgClass = cfg?.bgClass ?? sCfg?.bgClass ?? "";
                    const glowClass = cfg?.glowClass ?? sCfg?.glowClass ?? "";
                    const textClass = cfg?.textClass ?? sCfg?.textClass ?? "";
                    const heightClass = cfg?.height ?? sCfg?.height ?? "h-36";
                    const isFirst = idx === 0;

                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.08 }}
                        className={`flex flex-col items-center ${isFirst ? "w-32" : "w-28"}`}
                      >
                        {/* Icon / rank indicator */}
                        <div className="mb-2 flex flex-col items-center">
                          {isCredits ? (
                            cfg && (
                              <cfg.icon
                                className={`${isFirst ? "h-9 w-9" : "h-7 w-7"} ${cfg.iconClass} ${cfg.iconGlowClass} ${
                                  isFirst ? "animate-crown-bob" : ""
                                }`}
                              />
                            )
                          ) : (
                            <Flame
                              className={`${isFirst ? "h-9 w-9 text-orange-400" : "h-7 w-7 text-amber-400"} ${
                                isFirst ? "animate-flame drop-shadow-[0_0_10px_rgba(251,146,60,0.8)]" : ""
                              }`}
                            />
                          )}
                        </div>

                        {/* Card */}
                        <div
                          className={`relative w-full overflow-hidden rounded-xl border ${borderClass} ${bgClass} ${glowClass} ${heightClass} flex flex-col items-center justify-center gap-1 p-3 text-center`}
                        >
                          {/* Shimmer overlay */}
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent" />

                          <span className={`text-[10px] font-black uppercase tracking-widest ${textClass} opacity-70`}>
                            {isCredits ? cfg?.label : sCfg?.label}
                          </span>
                          <span className={`font-black ${isFirst ? "text-base" : "text-sm"} text-zinc-50 w-full truncate`}>
                            {entry.username}
                          </span>
                          {isCredits ? (
                            <span className={`text-xs font-bold ${textClass} tabular-nums`}>
                              {(entry as LeaderboardEntry).credits.toLocaleString("de-DE")}
                              <span className="ml-1 font-medium opacity-70">{currencyName}</span>
                            </span>
                          ) : (
                            <span className={`text-xs font-bold ${textClass}`}>
                              {(entry as StreakEntry).streak_days}
                              <span className="ml-1 font-medium opacity-70">Tage</span>
                            </span>
                          )}
                        </div>

                        {/* Rank number bar */}
                        <div
                          className={`mt-1.5 h-1.5 rounded-full ${
                            idx === 0 ? "w-full bg-amber-500/50" : idx === 1 ? "w-3/4 bg-zinc-500/30" : "w-1/2 bg-orange-500/30"
                          }`}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Ranks 4–10 (or all in list mode) */}
              <div className="flex flex-col gap-1.5">
                {(style === "podium" ? rest : displayEntries).map((entry, rawIdx) => {
                  const i = style === "podium" ? rawIdx + 3 : rawIdx;
                  const isTopThree = i < 3;
                  const rankColors = [
                    "text-amber-400",
                    "text-zinc-400",
                    "text-orange-400",
                  ];

                  return (
                    <motion.div
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: style === "podium" ? rawIdx * 0.04 : i * 0.04 }}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-300 ${
                        isTopThree && style === "list"
                          ? i === 0
                            ? "border-amber-500/30 bg-amber-500/5"
                            : i === 1
                            ? "border-zinc-400/20 bg-zinc-400/[0.03]"
                            : "border-orange-500/20 bg-orange-500/[0.03]"
                          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                      }`}
                    >
                      {/* Rank */}
                      <div className={`w-6 text-center text-sm font-black ${isTopThree && style === "list" ? rankColors[i] : "text-zinc-700"}`}>
                        {isTopThree && style === "list" ? (
                          i === 0 ? (
                            <Crown className={`h-4 w-4 ${rankColors[0]}`} />
                          ) : i === 1 ? (
                            <Trophy className={`h-4 w-4 ${rankColors[1]}`} />
                          ) : (
                            <Medal className={`h-4 w-4 ${rankColors[2]}`} />
                          )
                        ) : (
                          `#${i + 1}`
                        )}
                      </div>

                      {/* Name */}
                      <span className="flex-1 truncate text-sm font-semibold text-zinc-100">
                        {entry.username}
                      </span>

                      {/* Value */}
                      {isCredits ? (
                        <span className="text-sm font-bold text-purple-300 tabular-nums">
                          {(entry as LeaderboardEntry).credits.toLocaleString("de-DE")}
                          <span className="ml-1 text-xs font-medium text-purple-400/60">{currencyName}</span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Flame className="h-3.5 w-3.5 text-orange-400" />
                          <span className="text-sm font-bold text-orange-300 tabular-nums">
                            {(entry as StreakEntry).streak_days}
                            <span className="ml-1 text-xs font-medium text-orange-400/60">T.</span>
                          </span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
