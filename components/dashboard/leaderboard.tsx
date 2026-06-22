"use client";

import { useState } from "react";
import { Crown, Trophy, Medal } from "lucide-react";
import { useRealtimeAllProfiles } from "@/lib/use-realtime-profile";
import { useSiteConfig } from "@/components/layout/site-config-provider";

export interface LeaderboardEntry {
  id: string;
  username: string;
  credits: number;
}

const RANK_ICONS = [
  { Icon: Crown, className: "text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.7)]" },
  { Icon: Trophy, className: "text-zinc-300" },
  { Icon: Medal, className: "text-orange-400" },
];

export function Leaderboard({ entries: initialEntries }: { entries: LeaderboardEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const { currencyName } = useSiteConfig();

  // Re-sorts and re-slices on every credits change anywhere — so a credit
  // change (case win, admin edit, trade, anything) reorders this list (and
  // can bump someone in or out of the top 10) without a page reload.
  useRealtimeAllProfiles((row) => {
    if (typeof row.id !== "string" || typeof row.credits !== "number" || typeof row.username !== "string") return;
    setEntries((curr) => {
      const without = curr.filter((e) => e.id !== row.id);
      // Respect the "Auf der Bestenliste anzeigen" privacy toggle — a
      // newly-hidden profile drops out of live updates the same way it's
      // excluded from the initial server fetch.
      if (row.profile_visible === false) return without;
      return [...without, { id: row.id, username: row.username as string, credits: row.credits as number }]
        .sort((a, b) => b.credits - a.credits)
        .slice(0, 10);
    });
  });

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="text-center">
        <h2 className="glow-text text-2xl font-extrabold text-zinc-50">
          Bestenliste
        </h2>
        <p className="mt-1 text-sm text-zinc-400">Top 10 nach Credits</p>
      </div>

      <div className="glow-box mt-5 overflow-hidden rounded-xl border border-purple-500/30">
        {entries.map((entry, i) => {
          const rank = RANK_ICONS[i];
          return (
            <div
              key={entry.id}
              className={`flex items-center justify-between px-4 py-3 ${
                i % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"
              } ${i === 0 ? "bg-amber-500/5" : ""} ${
                i < entries.length - 1 ? "border-b border-purple-500/10" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                {rank ? (
                  <rank.Icon className={`h-5 w-5 ${rank.className}`} />
                ) : (
                  <span className="w-5 text-center text-sm font-semibold text-purple-300">
                    #{i + 1}
                  </span>
                )}
                <span className="font-semibold text-zinc-100">{entry.username}</span>
              </div>
              <span className="font-bold text-purple-300">
                {entry.credits.toLocaleString("de-DE")} {currencyName}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
