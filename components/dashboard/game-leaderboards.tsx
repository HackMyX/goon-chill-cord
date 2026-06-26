"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Crown, Trophy, Medal, ChevronRight, Gamepad2, Joystick, Pickaxe, Zap, CircleDot, Globe, Package, TrendingUp } from "lucide-react";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { StyledUsername } from "@/components/ui/styled-username";
import { PrioBadgeRow } from "@/components/ui/prio-badge-row";
import type { GameLeaderboardSection, GameLeaderboardListId } from "@/lib/actions/homepage-leaderboards";

export type { GameLeaderboardSection };

// ── Visual config per game type ───────────────────────────────────────────────

interface GameVisual {
  icon: typeof Joystick;
  label: string;
  sublabel: string;
  href: string;
  accent: string;
  border: string;
  bg: string;
  headerBg: string;
  rankOneBg: string;
  rankOneText: string;
  barFrom: string;
  barTo: string;
  metricSuffix: string;
  metricFormat?: "credits" | "number" | "xp";
}

const GAME_VISUALS: Record<GameLeaderboardListId, GameVisual> = {
  snake_x1: {
    icon: Joystick, label: "Snake", sublabel: "Classic ×1", href: "/snake",
    accent: "text-lime-400", border: "border-lime-500/25", bg: "bg-lime-500/5",
    headerBg: "bg-lime-500/10", rankOneBg: "bg-lime-500/10", rankOneText: "text-lime-300",
    barFrom: "from-lime-600", barTo: "to-lime-400", metricSuffix: "Punkte",
  },
  snake_x2: {
    icon: Joystick, label: "Snake", sublabel: "Turbo ×2", href: "/snake",
    accent: "text-cyan-400", border: "border-cyan-500/25", bg: "bg-cyan-500/5",
    headerBg: "bg-cyan-500/10", rankOneBg: "bg-cyan-500/10", rankOneText: "text-cyan-300",
    barFrom: "from-cyan-600", barTo: "to-cyan-400", metricSuffix: "Punkte",
  },
  snake_grind: {
    icon: Joystick, label: "Snake", sublabel: "Grind", href: "/snake",
    accent: "text-emerald-400", border: "border-emerald-500/25", bg: "bg-emerald-500/5",
    headerBg: "bg-emerald-500/10", rankOneBg: "bg-emerald-500/10", rankOneText: "text-emerald-300",
    barFrom: "from-emerald-600", barTo: "to-emerald-400", metricSuffix: "Punkte",
  },
  snake_farm: {
    icon: Joystick, label: "Snake", sublabel: "Endless", href: "/snake",
    accent: "text-yellow-400", border: "border-yellow-500/25", bg: "bg-yellow-500/5",
    headerBg: "bg-yellow-500/10", rankOneBg: "bg-yellow-500/10", rankOneText: "text-yellow-300",
    barFrom: "from-yellow-600", barTo: "to-yellow-400", metricSuffix: "Punkte",
  },
  mine: {
    icon: Pickaxe, label: "Mine", sublabel: "Abbau", href: "/mine",
    accent: "text-orange-400", border: "border-orange-500/25", bg: "bg-orange-500/5",
    headerBg: "bg-orange-500/10", rankOneBg: "bg-orange-500/10", rankOneText: "text-orange-300",
    barFrom: "from-orange-600", barTo: "to-orange-400", metricSuffix: "", metricFormat: "credits",
  },
  plinko: {
    icon: CircleDot, label: "Plinko", sublabel: "Bester Treffer", href: "/plinko",
    accent: "text-pink-400", border: "border-pink-500/25", bg: "bg-pink-500/5",
    headerBg: "bg-pink-500/10", rankOneBg: "bg-pink-500/10", rankOneText: "text-pink-300",
    barFrom: "from-pink-600", barTo: "to-pink-400", metricSuffix: "", metricFormat: "credits",
  },
  world: {
    icon: Globe, label: "Farmwelt", sublabel: "Credits", href: "/world",
    accent: "text-emerald-400", border: "border-emerald-500/25", bg: "bg-emerald-500/5",
    headerBg: "bg-emerald-500/10", rankOneBg: "bg-emerald-500/10", rankOneText: "text-emerald-300",
    barFrom: "from-emerald-600", barTo: "to-emerald-400", metricSuffix: "", metricFormat: "credits",
  },
  cases: {
    icon: Package, label: "Cases", sublabel: "Geöffnet", href: "/cases",
    accent: "text-violet-400", border: "border-violet-500/25", bg: "bg-violet-500/5",
    headerBg: "bg-violet-500/10", rankOneBg: "bg-violet-500/10", rankOneText: "text-violet-300",
    barFrom: "from-violet-600", barTo: "to-violet-400", metricSuffix: "Cases",
  },
  xp: {
    icon: TrendingUp, label: "Level & XP", sublabel: "Erfahrung", href: "/",
    accent: "text-sky-400", border: "border-sky-500/25", bg: "bg-sky-500/5",
    headerBg: "bg-sky-500/10", rankOneBg: "bg-sky-500/10", rankOneText: "text-sky-300",
    barFrom: "from-sky-600", barTo: "to-sky-400", metricSuffix: "XP", metricFormat: "xp",
  },
};

const RANK_ICONS = [Crown, Trophy, Medal] as const;
const RANK_ICON_COLORS = ["text-amber-400", "text-zinc-400", "text-orange-500"] as const;
const RANK_GLOW = [
  "drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]",
  "drop-shadow-[0_0_6px_rgba(161,161,170,0.5)]",
  "drop-shadow-[0_0_6px_rgba(249,115,22,0.5)]",
] as const;
const AVATAR_RING = [
  "ring-amber-400/70 shadow-[0_0_18px_rgba(245,158,11,0.45)]",
  "ring-zinc-400/50 shadow-[0_0_10px_rgba(161,161,170,0.25)]",
  "ring-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.3)]",
] as const;
const AVATAR_FB_BG = [
  "bg-amber-500/20 text-amber-200",
  "bg-zinc-500/20 text-zinc-300",
  "bg-orange-500/20 text-orange-300",
] as const;

// ── Animated rank icon ────────────────────────────────────────────────────────

function RankDisplay({ rank, vis }: { rank: number; vis: GameVisual }) {
  if (rank > 3) {
    return <span className="text-xs font-black text-zinc-700">#{rank}</span>;
  }
  const RIcon = RANK_ICONS[rank - 1];
  const color = RANK_ICON_COLORS[rank - 1];
  const glow = RANK_GLOW[rank - 1];
  if (rank === 1) {
    return (
      <motion.div
        animate={{ scale: [1, 1.18, 1], rotate: [-6, 6, -6, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut" }}
      >
        <RIcon className={`h-5 w-5 ${color} ${glow}`} />
      </motion.div>
    );
  }
  return <RIcon className={`h-4 w-4 ${color} ${glow}`} />;
}

// ── Mini podium (top 3 avatars) ───────────────────────────────────────────────

function MiniPodium({ entries, vis }: { entries: { username: string; avatarUrl?: string; userId: string }[]; vis: GameVisual }) {
  if (entries.length < 2) return null;
  const [first, second, third] = entries;
  const podium = [second, first, third].filter(Boolean);
  const heights = ["h-10", "h-14", "h-8"];
  const rings = [AVATAR_RING[1], AVATAR_RING[0], AVATAR_RING[2]];
  const fbs = [AVATAR_FB_BG[1], AVATAR_FB_BG[0], AVATAR_FB_BG[2]];
  const numbers = [2, 1, 3];

  return (
    <div className={`flex items-end justify-center gap-3 px-4 py-3 border-b ${vis.border} ${vis.headerBg}`}>
      {podium.map((entry, i) => (
        <div key={entry.userId} className="flex flex-col items-center gap-1">
          <div className="relative">
            {entry.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={entry.avatarUrl} alt="" className={`${heights[i]} aspect-square rounded-full object-cover ring-2 ${rings[i]}`} />
            ) : (
              <div className={`${heights[i]} aspect-square rounded-full flex items-center justify-center text-xs font-black ring-2 ${rings[i]} ${fbs[i]}`}>
                {entry.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black ${
              numbers[i] === 1 ? "bg-amber-500 text-black" :
              numbers[i] === 2 ? "bg-zinc-600 text-white" :
              "bg-orange-700 text-white"
            }`}>
              {numbers[i]}
            </span>
          </div>
          <span className="max-w-[64px] truncate text-[9px] font-semibold text-zinc-500">
            {entry.username}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Single leaderboard card ───────────────────────────────────────────────────

function GameLeaderboardCard({
  section,
  sectionIndex,
  currencyName,
}: {
  section: GameLeaderboardSection;
  sectionIndex: number;
  currencyName: string;
}) {
  const vis = GAME_VISUALS[section.item.id];
  const { entries } = section;
  const maxVal = entries[0]?.primaryValue ?? 1;

  function formatValue(v: number): string {
    const fmt = vis.metricFormat;
    if (fmt === "credits") {
      const s = v.toLocaleString("de-DE");
      return currencyName ? `${s} ${currencyName}` : s;
    }
    if (fmt === "xp") {
      return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M XP`
           : v >= 1_000    ? `${(v / 1_000).toFixed(1)}k XP`
           : `${v.toLocaleString("de-DE")} XP`;
    }
    const suffix = vis.metricSuffix;
    return suffix ? `${v.toLocaleString("de-DE")} ${suffix}` : v.toLocaleString("de-DE");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: sectionIndex * 0.1, type: "spring", stiffness: 180, damping: 22 }}
      className={`overflow-hidden rounded-2xl border ${vis.border} ${vis.bg}`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between border-b ${vis.border} ${vis.headerBg} px-5 py-3.5`}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/20">
            <vis.icon className={`h-4 w-4 ${vis.accent}`} />
          </div>
          <div>
            <span className={`text-sm font-black ${vis.accent}`}>{section.item.label}</span>
            <p className="text-[10px] text-zinc-600 mt-0.5">
              Top {Math.min(section.item.limit, entries.length || section.item.limit)} · {vis.sublabel}
            </p>
          </div>
        </div>
        <Link
          href={vis.href}
          className={`flex items-center gap-1 rounded-lg border ${vis.border} bg-black/20 px-3 py-1.5 text-[11px] font-semibold ${vis.accent} opacity-70 hover:opacity-100 transition-opacity`}
        >
          Öffnen <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Mini podium for top 3 */}
      {entries.length >= 2 && <MiniPodium entries={entries} vis={vis} />}

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <vis.icon className="h-10 w-10 text-zinc-800" />
          <p className="text-sm text-zinc-600">Noch keine Einträge — sei der Erste!</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.035]">
          {entries.map((entry, i) => {
            const isTop3 = i < 3;
            const isFirst = i === 0;

            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: sectionIndex * 0.1 + i * 0.03 }}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.02] ${isFirst ? vis.rankOneBg : ""}`}
              >
                {/* Rank icon/number */}
                <div className="w-7 shrink-0 flex justify-center">
                  <RankDisplay rank={i + 1} vis={vis} />
                </div>

                {/* Avatar */}
                <div className="relative shrink-0">
                  {entry.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.avatarUrl}
                      alt=""
                      className={`h-8 w-8 rounded-full object-cover ring-1.5 ${isTop3 ? AVATAR_RING[i] : "ring-white/10"}`}
                    />
                  ) : (
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ring-1.5 ${isTop3 ? `${AVATAR_RING[i]} ${AVATAR_FB_BG[i]}` : "ring-white/10 bg-white/5 text-zinc-500"}`}
                    >
                      {entry.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Name + prio badges */}
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <StyledUsername
                    name={entry.username}
                    styleKey={entry.nameStyleKey}
                    userId={entry.userId}
                    size="sm"
                  />
                  {entry.prioBadges && entry.prioBadges.length > 0 && (
                    <PrioBadgeRow badgeKeys={entry.prioBadges} size="xs" max={2} />
                  )}
                </div>

                {/* Secondary label */}
                <span className="shrink-0 text-[11px] font-medium text-zinc-600">
                  {entry.secondaryLabel}
                </span>

                {/* Primary value */}
                <span
                  className={`shrink-0 text-sm font-black tabular-nums ${
                    isFirst ? vis.rankOneText : vis.accent
                  } ${isFirst ? "" : "opacity-70"}`}
                >
                  {formatValue(entry.primaryValue)}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Top 3 comparison bars */}
      {entries.length >= 2 && (
        <div className={`border-t ${vis.border} px-5 py-3`}>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-700">Top 3 Vergleich</p>
          <div className="flex flex-col gap-1.5">
            {entries.slice(0, 3).map((entry, i) => {
              const pct = maxVal > 0 ? (entry.primaryValue / maxVal) * 100 : 0;
              return (
                <div key={entry.userId} className="flex items-center gap-2">
                  <span className={`w-4 text-[10px] font-bold ${RANK_ICON_COLORS[i]}`}>#{i + 1}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.15 + i * 0.06, duration: 0.55, ease: "easeOut" }}
                      className={`h-full rounded-full bg-gradient-to-r ${vis.barFrom} ${vis.barTo}`}
                    />
                  </div>
                  <span className="w-20 text-right text-[10px] font-semibold text-zinc-600 tabular-nums truncate">
                    {formatValue(entry.primaryValue)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function GameLeaderboards({ sections }: { sections: GameLeaderboardSection[] }) {
  const { currencyName } = useSiteConfig();

  if (sections.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-12">
      {/* Section header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10">
          <Gamepad2 className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h2 className="text-lg font-black tracking-tight text-zinc-100">Spielebestenlisten</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Zap className="h-3 w-3 text-violet-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-violet-600">
              {sections.length} {sections.length === 1 ? "Liste" : "Listen"} aktiv
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {sections.map((section, i) => (
          <GameLeaderboardCard
            key={section.item.id}
            section={section}
            sectionIndex={i}
            currencyName={currencyName}
          />
        ))}
      </div>
    </section>
  );
}
