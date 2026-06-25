"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Joystick, Pickaxe, Crown, Trophy, Medal, ChevronRight, Gamepad2 } from "lucide-react";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import type { SnakeLeaderboardEntry } from "@/lib/actions/snake";
import type { MineLeaderboardEntry } from "@/lib/actions/mine";
import { StyledUsername } from "@/components/ui/styled-username";

export type { SnakeLeaderboardEntry };
export type { MineLeaderboardEntry };

// ── Tab definitions ─────────────────────────────────────────────────────────

type GameTab = "snake_x1" | "snake_x2" | "snake_grind" | "snake_farm" | "mine";

const GAME_TABS: {
  id: GameTab;
  label: string;
  sublabel: string;
  href: string;
  icon: typeof Joystick;
  accent: string;          // text color
  border: string;          // active border
  bg: string;              // active bg
  glow: string;            // active glow shadow
  cardBorder: string;
  cardBg: string;
  rankOneBg: string;
  rankOneBorder: string;
  rankOneText: string;
  barGradient: string;
}[] = [
  {
    id: "snake_x1",
    label: "Snake",
    sublabel: "Classic ×1",
    href: "/snake",
    icon: Joystick,
    accent: "text-lime-400",
    border: "border-lime-500/40",
    bg: "bg-lime-500/10",
    glow: "shadow-[0_0_14px_rgba(132,204,22,0.2)]",
    cardBorder: "border-lime-500/20",
    cardBg: "bg-lime-500/5",
    rankOneBg: "bg-lime-500/10",
    rankOneBorder: "border-lime-500/30",
    rankOneText: "text-lime-300",
    barGradient: "from-lime-600 to-lime-400",
  },
  {
    id: "snake_x2",
    label: "Snake",
    sublabel: "Turbo ×2",
    href: "/snake",
    icon: Joystick,
    accent: "text-cyan-400",
    border: "border-cyan-500/40",
    bg: "bg-cyan-500/10",
    glow: "shadow-[0_0_14px_rgba(6,182,212,0.2)]",
    cardBorder: "border-cyan-500/20",
    cardBg: "bg-cyan-500/5",
    rankOneBg: "bg-cyan-500/10",
    rankOneBorder: "border-cyan-500/30",
    rankOneText: "text-cyan-300",
    barGradient: "from-cyan-600 to-cyan-400",
  },
  {
    id: "snake_grind",
    label: "Snake",
    sublabel: "Grind",
    href: "/snake",
    icon: Joystick,
    accent: "text-emerald-400",
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    glow: "shadow-[0_0_14px_rgba(52,211,153,0.2)]",
    cardBorder: "border-emerald-500/20",
    cardBg: "bg-emerald-500/5",
    rankOneBg: "bg-emerald-500/10",
    rankOneBorder: "border-emerald-500/30",
    rankOneText: "text-emerald-300",
    barGradient: "from-emerald-600 to-emerald-400",
  },
  {
    id: "snake_farm",
    label: "Snake",
    sublabel: "Endless",
    href: "/snake",
    icon: Joystick,
    accent: "text-yellow-400",
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/10",
    glow: "shadow-[0_0_14px_rgba(234,179,8,0.2)]",
    cardBorder: "border-yellow-500/20",
    cardBg: "bg-yellow-500/5",
    rankOneBg: "bg-yellow-500/10",
    rankOneBorder: "border-yellow-500/30",
    rankOneText: "text-yellow-300",
    barGradient: "from-yellow-600 to-yellow-400",
  },
  {
    id: "mine",
    label: "Mine",
    sublabel: "Abbau",
    href: "/mine",
    icon: Pickaxe,
    accent: "text-orange-400",
    border: "border-orange-500/40",
    bg: "bg-orange-500/10",
    glow: "shadow-[0_0_14px_rgba(249,115,22,0.2)]",
    cardBorder: "border-orange-500/20",
    cardBg: "bg-orange-500/5",
    rankOneBg: "bg-orange-500/10",
    rankOneBorder: "border-orange-500/30",
    rankOneText: "text-orange-300",
    barGradient: "from-orange-600 to-orange-400",
  },
];

const RANK_ICONS = [Crown, Trophy, Medal] as const;
const RANK_COLORS = ["text-amber-400", "text-zinc-400", "text-orange-400"] as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface GameLeaderboardsProps {
  snakeX1: SnakeLeaderboardEntry[];
  snakeX2: SnakeLeaderboardEntry[];
  snakeGrind: SnakeLeaderboardEntry[];
  snakeFarm: SnakeLeaderboardEntry[];
  mine: MineLeaderboardEntry[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GameLeaderboards({ snakeX1, snakeX2, snakeGrind, snakeFarm, mine }: GameLeaderboardsProps) {
  const [activeTab, setActiveTab] = useState<GameTab>("snake_x1");
  const { currencyName } = useSiteConfig();

  const dataMap: Record<GameTab, (SnakeLeaderboardEntry | MineLeaderboardEntry)[]> = {
    snake_x1: snakeX1,
    snake_x2: snakeX2,
    snake_grind: snakeGrind,
    snake_farm: snakeFarm,
    mine: mine,
  };

  const activeData = dataMap[activeTab];
  const activeDef = GAME_TABS.find((t) => t.id === activeTab)!;

  function getMetric(entry: SnakeLeaderboardEntry | MineLeaderboardEntry): string {
    if (activeTab === "mine") {
      const m = entry as MineLeaderboardEntry;
      return `${m.totalMined.toLocaleString("de-DE")} ${currencyName}`;
    }
    const s = entry as SnakeLeaderboardEntry;
    return `${s.bestScore} Punkte`;
  }

  function getSubMetric(entry: SnakeLeaderboardEntry | MineLeaderboardEntry): string {
    if (activeTab === "mine") {
      const m = entry as MineLeaderboardEntry;
      return `Level ${m.level}`;
    }
    const s = entry as SnakeLeaderboardEntry;
    return `${s.gamesPlayed} Spiele`;
  }

  const allEmpty = snakeX1.length === 0 && snakeX2.length === 0 &&
    snakeGrind.length === 0 && snakeFarm.length === 0 && mine.length === 0;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-10">
      {/* Section header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10">
          <Gamepad2 className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h2 className="text-lg font-black tracking-tight text-zinc-100">Spielebestenlisten</h2>
          <p className="text-[11px] text-zinc-600 mt-0.5">Wähle ein Spiel und sieh die Top-Spieler</p>
        </div>
      </div>

      {/* Game tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {GAME_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
                isActive
                  ? `${tab.bg} ${tab.border} ${tab.accent} ${tab.glow}`
                  : "border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:text-zinc-300 hover:border-white/15"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
              <span className={`text-[10px] font-medium opacity-70 ${isActive ? "" : ""}`}>{tab.sublabel}</span>
            </button>
          );
        })}
      </div>

      {/* Leaderboard panel */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className={`rounded-2xl border ${activeDef.cardBorder} ${activeDef.cardBg} overflow-hidden`}
        >
          {/* Card header */}
          <div className={`flex items-center justify-between border-b ${activeDef.cardBorder} px-5 py-3`}>
            <div className="flex items-center gap-2">
              <activeDef.icon className={`h-4 w-4 ${activeDef.accent}`} />
              <span className={`text-sm font-black ${activeDef.accent}`}>
                {activeDef.label} <span className="font-medium opacity-70">{activeDef.sublabel}</span>
              </span>
            </div>
            <Link
              href={activeDef.href}
              className={`flex items-center gap-1 text-[11px] font-semibold opacity-50 hover:opacity-100 transition-opacity ${activeDef.accent}`}
            >
              Spielen <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Entries */}
          {allEmpty || activeData.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <activeDef.icon className="h-10 w-10 text-zinc-700" />
              <p className="text-sm text-zinc-600">Noch keine Einträge — sei der Erste!</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {activeData.slice(0, 10).map((entry, i) => {
                const isTop3 = i < 3;
                const RankIcon = isTop3 ? RANK_ICONS[i] : null;
                const isFirst = i === 0;

                return (
                  <motion.div
                    key={entry.userId}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-white/[0.025] ${
                      isFirst ? `${activeDef.rankOneBg}` : ""
                    }`}
                  >
                    {/* Rank */}
                    <div className="w-8 shrink-0 flex justify-center">
                      {RankIcon ? (
                        <RankIcon className={`h-4 w-4 ${RANK_COLORS[i]} ${isFirst ? "drop-shadow-[0_0_6px_currentColor]" : ""}`} />
                      ) : (
                        <span className="text-xs font-black text-zinc-700">#{i + 1}</span>
                      )}
                    </div>

                    {/* Username */}
                    <span className={`flex-1 truncate text-sm font-semibold ${isFirst ? "text-zinc-50" : "text-zinc-200"}`}>
                      <StyledUsername
                        name={entry.username}
                        styleKey={(entry as SnakeLeaderboardEntry & MineLeaderboardEntry).nameStyleKey}
                        userId={(entry as SnakeLeaderboardEntry & MineLeaderboardEntry).userId}
                        size="md"
                      />
                    </span>

                    {/* Sub-metric (secondary info) */}
                    <span className="shrink-0 text-[11px] text-zinc-600 font-medium">
                      {getSubMetric(entry)}
                    </span>

                    {/* Primary metric */}
                    <span className={`shrink-0 text-sm font-black tabular-nums ${isFirst ? activeDef.rankOneText : activeDef.accent} ${isFirst ? "opacity-100" : "opacity-80"}`}>
                      {getMetric(entry)}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Bottom bar: progress visualization of top 3 */}
          {activeData.length >= 2 && (
            <div className={`border-t ${activeDef.cardBorder} px-5 py-3`}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Top 3 Vergleich</p>
              <div className="flex flex-col gap-1.5">
                {activeData.slice(0, 3).map((entry, i) => {
                  const maxVal = activeTab === "mine"
                    ? (activeData[0] as MineLeaderboardEntry).totalMined
                    : (activeData[0] as SnakeLeaderboardEntry).bestScore;
                  const val = activeTab === "mine"
                    ? (entry as MineLeaderboardEntry).totalMined
                    : (entry as SnakeLeaderboardEntry).bestScore;
                  const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;

                  return (
                    <div key={entry.userId} className="flex items-center gap-2">
                      <span className={`w-3 text-[10px] font-bold ${RANK_COLORS[i]}`}>#{i + 1}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ delay: 0.1 + i * 0.06, duration: 0.5, ease: "easeOut" }}
                          className={`h-full rounded-full bg-gradient-to-r ${activeDef.barGradient}`}
                        />
                      </div>
                      <span className="w-16 text-right text-[10px] font-semibold text-zinc-500 tabular-nums truncate">
                        {getMetric(entry)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
