"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Crown, Trophy, Medal, ChevronRight, Gamepad2, Joystick, Pickaxe, Zap, CircleDot, Globe, Package, TrendingUp } from "lucide-react";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { StyledUsername } from "@/components/ui/styled-username";
import { PrioBadgeRow } from "@/components/ui/prio-badge-row";
import type { GameLeaderboardSection, GameLeaderboardListId, HomepageAvatarMode } from "@/lib/actions/homepage-leaderboards";
import { fetchHomepageLeaderboardData } from "@/lib/actions/homepage-leaderboards";
import { useLiveConfig } from "@/lib/use-live-config";

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

// ── Fat podium (top 3 with photos, name, badges, value) ───────────────────────

type GLEntry = GameLeaderboardSection["entries"][number];

// Podium order: #2 left, #1 center (taller), #3 right.
const PODIUM_ORDER = [1, 0, 2] as const;

function Podium({
  entries,
  vis,
  format,
}: {
  entries: GLEntry[];
  vis: GameVisual;
  format: (v: number) => string;
}) {
  if (entries.length < 2) return null;
  const top = entries.slice(0, 3);

  return (
    <div className={`flex items-end justify-center gap-2.5 border-b ${vis.border} ${vis.headerBg} px-4 pb-4 pt-5`}>
      {PODIUM_ORDER.map((idx) => {
        const entry = top[idx];
        if (!entry) return <div key={idx} className="w-24" />;
        const isFirst = idx === 0;
        const RIcon = RANK_ICONS[idx];
        return (
          <motion.div
            key={entry.userId}
            initial={{ opacity: 0, y: 22, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: idx * 0.1, type: "spring", stiffness: 240, damping: 22 }}
            className={`flex flex-col items-center ${isFirst ? "w-28" : "w-24"}`}
          >
            <RIcon
              className={`mb-1 ${isFirst ? "h-6 w-6 animate-crown-bob" : "h-5 w-5"} ${RANK_ICON_COLORS[idx]} ${RANK_GLOW[idx]}`}
            />
            <div className="relative mb-1.5">
              {entry.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.avatarUrl}
                  alt=""
                  className={`${isFirst ? "h-16 w-16" : "h-12 w-12"} rounded-full object-cover ring-2 ${AVATAR_RING[idx]}`}
                />
              ) : (
                <div
                  className={`${isFirst ? "h-16 w-16 text-lg" : "h-12 w-12 text-base"} flex items-center justify-center rounded-full font-black ring-2 ${AVATAR_RING[idx]} ${AVATAR_FB_BG[idx]}`}
                >
                  {entry.username.charAt(0).toUpperCase()}
                </div>
              )}
              <span
                className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#09090f] text-[9px] font-black ${
                  idx === 0 ? "bg-amber-500 text-black" : idx === 1 ? "bg-zinc-500 text-white" : "bg-orange-600 text-white"
                }`}
              >
                {idx + 1}
              </span>
            </div>
            <span className="max-w-full truncate text-[11px] font-bold text-zinc-100">
              <StyledUsername name={entry.username} styleKey={entry.nameStyleKey} userId={entry.userId} size="sm" />
            </span>
            {entry.prioBadges && entry.prioBadges.length > 0 && (
              <PrioBadgeRow badgeKeys={entry.prioBadges} size="xs" max={2} className="mt-0.5 justify-center" />
            )}
            <span className={`mt-0.5 text-[11px] font-black tabular-nums ${vis.accent}`}>
              {format(entry.primaryValue)}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Single leaderboard card ───────────────────────────────────────────────────

function GameLeaderboardCard({
  section,
  sectionIndex,
  currencyName,
  avatarMode,
}: {
  section: GameLeaderboardSection;
  sectionIndex: number;
  currencyName: string;
  avatarMode: HomepageAvatarMode;
}) {
  const vis = GAME_VISUALS[section.item.id];
  const { entries } = section;
  const maxVal = entries[0]?.primaryValue ?? 1;
  const showPodium = entries.length >= 2;

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

      {/* Fat podium for top 3 (shown when ≥2 entries) */}
      <Podium entries={entries} vis={vis} format={formatValue} />

      {/* Entries — when the podium is shown, the list starts at rank 4 so the
          Top 3 never appear twice; otherwise it lists everyone. */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <vis.icon className="h-10 w-10 text-zinc-800" />
          <p className="text-sm text-zinc-600">Noch keine Einträge — sei der Erste!</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.035]">
          {(showPodium ? entries.slice(3) : entries).map((entry, li) => {
            const rank = showPodium ? li + 4 : li + 1;
            const i = rank - 1;
            const isTop3 = rank <= 3;
            const isFirst = rank === 1;
            // Profilbild nur zeigen, wenn der Modus "all" ist ODER es ein Top-3-Platz
            // ist. Ab Platz 4 im "top3"-Modus bewusst der neutrale Initial-Kreis
            // (= "nur der Buchstabe"), damit die Zeilen sauber ausgerichtet bleiben.
            const showPhoto = (avatarMode === "all" || isTop3) && !!entry.avatarUrl;

            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: sectionIndex * 0.1 + li * 0.03 }}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.02] ${isFirst ? vis.rankOneBg : ""}`}
              >
                {/* Rank icon/number */}
                <div className="w-7 shrink-0 flex justify-center">
                  <RankDisplay rank={rank} vis={vis} />
                </div>

                {/* Avatar: NUR die ersten 3 Plätze zeigen ein Bild (oder Initial als
                    Fallback). Ab Platz 4 bewusst GAR NICHTS — kein Foto UND kein
                    Anfangsbuchstabe. */}
                {isTop3 && (
                  <div className="relative shrink-0">
                    {showPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.avatarUrl}
                        alt=""
                        className={`h-8 w-8 rounded-full object-cover ring-1.5 ${AVATAR_RING[i]}`}
                      />
                    ) : (
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ring-1.5 ${AVATAR_RING[i]} ${AVATAR_FB_BG[i]}`}
                      >
                        {entry.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                )}

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

export function GameLeaderboards({
  sections: initialSections,
  avatarMode: initialAvatarMode = "top3",
}: {
  sections: GameLeaderboardSection[];
  avatarMode?: HomepageAvatarMode;
}) {
  const { currencyName } = useSiteConfig();
  const [data, setData] = useState<{ sections: GameLeaderboardSection[]; avatarMode: HomepageAvatarMode }>({
    sections: initialSections,
    avatarMode: initialAvatarMode,
  });
  // Ein Admin-Save broadcastet "game-leaderboard-live" → Sektionen UND
  // Profilbild-Modus werden live ohne Reload neu geladen (AGENTS §3).
  useLiveConfig("game-leaderboard-live", fetchHomepageLeaderboardData, setData);
  const { sections, avatarMode } = data;

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
            avatarMode={avatarMode}
          />
        ))}
      </div>
    </section>
  );
}
