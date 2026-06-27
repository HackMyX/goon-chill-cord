"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Trophy, Medal, Coins, Flame, Zap } from "lucide-react";
import { useRealtimeAllProfiles } from "@/lib/use-realtime-profile";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { StyledUsername } from "@/components/ui/styled-username";
import { BadgePill } from "@/components/ui/badge-pill";
import { PrioBadgeRow } from "@/components/ui/prio-badge-row";
import { badgeRank } from "@/lib/badges";
import { useLiveConfig } from "@/lib/use-live-config";
import { getHomepageAvatarMode } from "@/lib/actions/homepage-leaderboards";
import type { HomepageAvatarMode } from "@/lib/actions/homepage-leaderboards";

export interface LeaderboardEntry {
  id: string;
  username: string;
  credits: number;
  streak_days?: number;
  active_name_style_key?: string;
  avatarUrl?: string | null;
  badges?: string[];
  prio_badges?: string[];
}

export interface StreakEntry {
  id: string;
  username: string;
  streak_days: number;
  active_name_style_key?: string;
  avatarUrl?: string | null;
  badges?: string[];
  prio_badges?: string[];
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  streakEntries?: StreakEntry[];
  showStreakTab?: boolean;
  style?: "podium" | "list";
  /** Profilbild-Modus der Startseite: "top3" = nur Top 3, "all" = alle Plätze. */
  avatarMode?: HomepageAvatarMode;
}

// Ränge/Fallbacks für Avatare in den Listen-Zeilen (Plätze 1–3 farbcodiert).
const REST_AVATAR_RING = [
  "ring-amber-400/70 shadow-[0_0_14px_rgba(245,158,11,0.4)]",
  "ring-zinc-400/50",
  "ring-orange-500/50",
] as const;
const REST_AVATAR_FB = [
  "bg-amber-500/20 text-amber-200",
  "bg-zinc-500/20 text-zinc-300",
  "bg-orange-500/20 text-orange-300",
] as const;

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

/** Top-2 owned badges by the canonical site-wide priority (fallback when a
 * user has no prio_badges set — keeps the order consistent with everywhere). */
function topOwnedBadges(badges: string[]): string[] {
  return [...badges].sort((a, b) => badgeRank(a) - badgeRank(b)).slice(0, 2);
}

export function Leaderboard({
  entries: initialEntries,
  streakEntries: initialStreakEntries = [],
  showStreakTab = true,
  style = "podium",
  avatarMode: initialAvatarMode = "top3",
}: LeaderboardProps) {
  const [creditEntries, setCreditEntries] = useState(initialEntries);
  const [streakEntries, setStreakEntries] = useState(initialStreakEntries);
  const [activeTab, setActiveTab] = useState<"credits" | "streak">("credits");
  const [avatarMode, setAvatarMode] = useState<HomepageAvatarMode>(initialAvatarMode);
  const { currencyName } = useSiteConfig();

  // Live: Admin ändert den Profilbild-Modus → sofort ohne Reload übernehmen.
  useLiveConfig("game-leaderboard-live", getHomepageAvatarMode, setAvatarMode);

  useRealtimeAllProfiles((row) => {
    if (typeof row.id !== "string" || typeof row.username !== "string") return;

    const activeNameStyleKey = row.active_name_style_key as string | undefined;
    const prioBadges = Array.isArray(row.prio_badges)
      ? (row.prio_badges as string[])
      : undefined;
    const avatarUrl = typeof row.avatar_url === "string" ? row.avatar_url : undefined;
    const isHidden = row.profile_visible === false;

    // Apply identity fields (name style, prio badges, avatar) to any existing
    // entry even when credits/streak didn't change — so a name-style or badge
    // swap is reflected immediately for everyone watching the leaderboard.
    setCreditEntries((curr) => {
      const existing = curr.find((e) => e.id === row.id);
      if (isHidden) return curr.filter((e) => e.id !== row.id);

      const credits =
        typeof row.credits === "number" ? row.credits : existing?.credits;

      // Not in the list and no credit data from this event → nothing to do.
      if (credits === undefined) return curr;

      const without = curr.filter((e) => e.id !== row.id);
      return [
        ...without,
        {
          id: row.id,
          username: row.username as string,
          credits,
          active_name_style_key: activeNameStyleKey ?? existing?.active_name_style_key,
          prio_badges: prioBadges ?? existing?.prio_badges,
          avatarUrl: avatarUrl ?? existing?.avatarUrl,
        },
      ]
        .sort((a, b) => b.credits - a.credits)
        .slice(0, 10);
    });

    setStreakEntries((curr) => {
      const existing = curr.find((e) => e.id === row.id);
      if (isHidden) return curr.filter((e) => e.id !== row.id);

      const streak =
        typeof row.streak_days === "number"
          ? row.streak_days
          : existing?.streak_days;

      if (streak === undefined || streak === 0) {
        return curr.filter((e) => e.id !== row.id);
      }

      const without = curr.filter((e) => e.id !== row.id);
      return [
        ...without,
        {
          id: row.id,
          username: row.username as string,
          streak_days: streak,
          active_name_style_key: activeNameStyleKey ?? existing?.active_name_style_key,
          prio_badges: prioBadges ?? existing?.prio_badges,
          avatarUrl: avatarUrl ?? existing?.avatarUrl,
        },
      ]
        .sort((a, b) => b.streak_days - a.streak_days)
        .slice(0, 10);
    });
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

                    const AVATAR_RING = [
                      "ring-amber-400/80 shadow-[0_0_22px_rgba(245,158,11,0.55)]",
                      "ring-zinc-400/60 shadow-[0_0_14px_rgba(161,161,170,0.35)]",
                      "ring-orange-500/60 shadow-[0_0_14px_rgba(251,146,60,0.35)]",
                    ] as const;
                    const AVATAR_FALLBACK_BG = [
                      "bg-amber-500/20 text-amber-200",
                      "bg-zinc-500/20 text-zinc-300",
                      "bg-orange-500/20 text-orange-300",
                    ] as const;
                    const RANK_DOT_BG = ["bg-amber-500", "bg-zinc-400", "bg-orange-500"] as const;

                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: 30, scale: 0.88 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                          delay: idx * 0.12,
                          type: "spring",
                          stiffness: 240,
                          damping: 22,
                        }}
                        className={`flex flex-col items-center ${isFirst ? "w-32" : "w-28"}`}
                      >
                        {/* Rank icon above avatar */}
                        <div className="mb-1.5 flex flex-col items-center">
                          {isCredits ? (
                            cfg && (
                              <cfg.icon
                                className={`${isFirst ? "h-8 w-8" : "h-6 w-6"} ${cfg.iconClass} ${cfg.iconGlowClass} ${isFirst ? "animate-crown-bob" : ""}`}
                              />
                            )
                          ) : (
                            <Flame
                              className={`${isFirst ? "h-8 w-8 text-orange-400" : "h-6 w-6 text-amber-400"} ${isFirst ? "animate-flame drop-shadow-[0_0_10px_rgba(251,146,60,0.8)]" : ""}`}
                            />
                          )}
                        </div>

                        {/* Avatar with rank glow ring */}
                        <motion.div
                          className="relative mb-2"
                          whileHover={{ scale: 1.1, transition: { type: "spring", stiffness: 400, damping: 15 } }}
                          animate={isFirst ? {
                            scale: [1, 1.04, 1],
                            transition: { duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.5 },
                          } : undefined}
                        >
                          {entry.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={entry.avatarUrl}
                              alt=""
                              className={`rounded-full object-cover ring-2 ${AVATAR_RING[idx]} ${isFirst ? "h-14 w-14" : "h-11 w-11"}`}
                            />
                          ) : (
                            <div
                              className={`flex items-center justify-center rounded-full font-black ring-2 ${AVATAR_RING[idx]} ${AVATAR_FALLBACK_BG[idx]} ${isFirst ? "h-14 w-14 text-xl" : "h-11 w-11 text-base"}`}
                            >
                              {entry.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {/* Rank number dot */}
                          <div
                            className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-[2.5px] border-[#09090f] text-[9px] font-black text-black ${RANK_DOT_BG[idx]}`}
                          >
                            {idx + 1}
                          </div>
                        </motion.div>

                        {/* Card */}
                        <div
                          className={`relative w-full overflow-hidden rounded-xl border ${borderClass} ${bgClass} ${glowClass} ${heightClass} flex flex-col items-center justify-center gap-1 p-2.5 text-center`}
                        >
                          {/* Shimmer */}
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent" />
                          {/* Subtle inner glow at top */}
                          {isFirst && (
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-amber-400/10 to-transparent" />
                          )}

                          <span className={`text-[10px] font-black uppercase tracking-widest ${textClass} opacity-60`}>
                            {isCredits ? cfg?.label : sCfg?.label}
                          </span>
                          <span className={`font-black ${isFirst ? "text-sm" : "text-xs"} text-zinc-50 w-full truncate`}>
                            <StyledUsername
                              name={entry.username}
                              styleKey={entry.active_name_style_key}
                              userId={entry.id}
                              size={isFirst ? "md" : "sm"}
                            />
                          </span>
                          {entry.prio_badges && entry.prio_badges.length > 0
                            ? <PrioBadgeRow badgeKeys={entry.prio_badges} size="xs" max={2} className="justify-center" />
                            : entry.badges && entry.badges.length > 0
                            ? <div className="flex flex-wrap justify-center gap-0.5 max-w-full">
                                {topOwnedBadges(entry.badges).map((bk) => <BadgePill key={bk} badgeKey={bk} />)}
                              </div>
                            : null
                          }
                          {isCredits ? (
                            <span className={`text-xs font-bold ${textClass} tabular-nums`}>
                              {(entry as LeaderboardEntry).credits.toLocaleString("de-DE")}
                              <span className="ml-1 font-medium opacity-60">{currencyName}</span>
                            </span>
                          ) : (
                            <span className={`text-xs font-bold ${textClass}`}>
                              {(entry as StreakEntry).streak_days}
                              <span className="ml-1 font-medium opacity-60">Tage</span>
                            </span>
                          )}
                        </div>

                        {/* Rank bar */}
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
                  // Foto nur bei "all" ODER Top 3; ab Platz 4 (Standardmodus)
                  // bewusst NUR der Initial-Buchstabe, kein Bild.
                  const showPhoto = (avatarMode === "all" || isTopThree) && !!entry.avatarUrl;
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

                      {/* Avatar: Top 3 (oder "all") = Foto, ab Platz 4 nur der Buchstabe */}
                      <div className="relative shrink-0">
                        {showPhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={entry.avatarUrl!}
                            alt=""
                            className={`h-8 w-8 rounded-full object-cover ring-1.5 ${isTopThree ? REST_AVATAR_RING[i] : "ring-white/10"}`}
                          />
                        ) : (
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ring-1.5 ${isTopThree ? `${REST_AVATAR_RING[i]} ${REST_AVATAR_FB[i]}` : "ring-white/10 bg-white/5 text-zinc-500"}`}
                          >
                            {entry.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Name + badges */}
                      <div className="flex flex-1 min-w-0 items-center gap-1.5 flex-wrap">
                        <span className="truncate text-sm font-semibold text-zinc-100">
                          <StyledUsername
                            name={entry.username}
                            styleKey={entry.active_name_style_key}
                            userId={entry.id}
                            size="sm"
                          />
                        </span>
                        {entry.prio_badges && entry.prio_badges.length > 0
                          ? <PrioBadgeRow badgeKeys={entry.prio_badges} size="xs" max={2} />
                          : entry.badges && topOwnedBadges(entry.badges).map((bk) => <BadgePill key={bk} badgeKey={bk} />)
                        }
                      </div>

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
