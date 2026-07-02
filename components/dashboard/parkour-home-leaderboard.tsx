"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Crown, Trophy, Medal, ChevronRight, Zap, Skull, Loader2 } from "lucide-react";
import { StyledUsername } from "@/components/ui/styled-username";
import { PrioBadgeRow } from "@/components/ui/prio-badge-row";
import { PARKOUR_MAPS, formatParkourTime } from "@/lib/parkour-config";
import { getParkourHomeLeaderboard, type ParkourHomeEntry } from "@/lib/actions/parkour";

const RANK_ICONS = [Crown, Trophy, Medal] as const;
const RANK_COLORS = ["text-amber-400", "text-zinc-400", "text-orange-500"] as const;
const RANK_GLOW = [
  "drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]",
  "drop-shadow-[0_0_6px_rgba(161,161,170,0.5)]",
  "drop-shadow-[0_0_6px_rgba(249,115,22,0.5)]",
] as const;
const AVATAR_FB = [
  "bg-amber-500/20 text-amber-200",
  "bg-zinc-500/20 text-zinc-300",
  "bg-orange-500/20 text-orange-300",
] as const;

type Scope = "overall" | string;

/** The homepage Parkour block: one card, with a Gesamt + per-map switcher, in the
 * same visual family as the other Spielebestenlisten. "Gesamt" ranks by maps
 * completed then total best-time (the all-around king). Configurable (enable /
 * order / limit) via the normal game_leaderboard_config, id "parkour". */
export function ParkourHomeLeaderboard({ label, limit }: { label: string; limit: number }) {
  const [scope, setScope] = useState<Scope>("overall");
  const [rows, setRows] = useState<ParkourHomeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getParkourHomeLeaderboard(scope, limit).then((data) => {
      if (!cancelled) { setRows(data); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [scope, limit]);

  const isOverall = scope === "overall";
  const tabs: { id: Scope; label: string }[] = [
    { id: "overall", label: "Gesamt" },
    ...PARKOUR_MAPS.map((m) => ({ id: m.id, label: m.name })),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 180, damping: 22 }}
      className="overflow-hidden rounded-2xl border border-fuchsia-500/25 bg-fuchsia-500/5"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-fuchsia-500/25 bg-fuchsia-500/10 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/20">
            <Zap className="h-4 w-4 text-fuchsia-400" />
          </div>
          <div>
            <span className="text-sm font-black text-fuchsia-400">{label}</span>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              {isOverall ? "Gesamt — schnellste Allrounder" : "Bestzeit pro Map"}
            </p>
          </div>
        </div>
        <Link
          href="/parkour"
          className="flex items-center gap-1 rounded-lg border border-fuchsia-500/25 bg-black/20 px-3 py-1.5 text-[11px] font-semibold text-fuchsia-400 opacity-70 transition-opacity hover:opacity-100"
        >
          Öffnen <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Map / Gesamt switcher */}
      <div className="flex flex-wrap gap-1 border-b border-fuchsia-500/15 bg-black/20 px-3 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setScope(t.id)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
              scope === t.id ? "bg-fuchsia-500/20 text-fuchsia-200" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Entries */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-fuchsia-400" /></div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Zap className="h-10 w-10 text-zinc-800" />
          <p className="text-sm text-zinc-600">Noch keine Zeiten — sei der Erste!</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.035]">
          {rows.map((e) => {
            const i = e.rank - 1;
            const isTop3 = e.rank <= 3;
            const RIcon = isTop3 ? RANK_ICONS[i] : null;
            return (
              <div key={e.userId} className={`flex items-center gap-3 px-4 py-2.5 ${e.rank === 1 ? "bg-fuchsia-500/10" : ""}`}>
                <div className="flex w-7 shrink-0 justify-center">
                  {RIcon ? <RIcon className={`h-4 w-4 ${RANK_COLORS[i]} ${RANK_GLOW[i]}`} /> : <span className="text-xs font-black text-zinc-700">#{e.rank}</span>}
                </div>
                {isTop3 && (
                  <div className="relative shrink-0">
                    {e.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-1.5 ring-fuchsia-400/40" />
                    ) : (
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${AVATAR_FB[i]}`}>
                        {e.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  <StyledUsername name={e.username} styleKey={e.nameStyleKey} userId={e.userId} size="sm" />
                  {e.prioBadges && e.prioBadges.length > 0 && <PrioBadgeRow badgeKeys={e.prioBadges} size="xs" max={2} />}
                </div>
                {/* Deaths + (overall) maps done */}
                <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-zinc-600">
                  {isOverall && <span className="text-fuchsia-400/70">{e.mapsDone}/{PARKOUR_MAPS.length} Maps</span>}
                  <Skull className="h-3 w-3 text-red-400/70" />{e.deaths}
                </span>
                <span className={`shrink-0 font-mono text-sm font-black tabular-nums ${e.rank === 1 ? "text-fuchsia-300" : "text-fuchsia-400/80"}`}>
                  {formatParkourTime(e.timeMs)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
