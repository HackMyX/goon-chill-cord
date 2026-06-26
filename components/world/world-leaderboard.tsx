"use client";

import { useEffect, useState } from "react";
import { Crown, Trophy, Flame, RotateCcw } from "lucide-react";
import { getWorldLeaderboard } from "@/lib/actions/mine";
import { StyledUsername } from "@/components/ui/styled-username";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  nameStyleKey?: string;
  bestStreak: number;
}

interface WorldLeaderboardProps {
  userId: string;
  username: string;
}

export function WorldLeaderboard({ userId, username }: WorldLeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await getWorldLeaderboard(20);
    setEntries(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const myRank = entries.findIndex((e) => e.userId === userId) + 1;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-400" />
          <h2 className="text-base font-bold text-zinc-100">Bestenliste — Farmwelt</h2>
        </div>
        <button
          onClick={load}
          className="rounded-full p-1.5 text-zinc-600 transition-colors hover:bg-white/10 hover:text-zinc-300"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <p className="mb-4 text-xs text-zinc-600">
        Rangliste nach bester Kill-Streak (höchste Anzahl aufeinanderfolgender Kills in einer Session)
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        </div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-600">Noch keine Kill-Streaks — sei der Erste!</div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {entries.map((entry) => {
            const isSelf = entry.userId === userId;
            const top3 = entry.rank <= 3;
            return (
              <div
                key={entry.userId}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                  isSelf
                    ? "bg-orange-500/15 ring-1 ring-inset ring-orange-500/25"
                    : top3
                    ? "bg-white/[0.03]"
                    : "hover:bg-white/[0.02]"
                }`}
              >
                {/* Rank icon */}
                <div className="flex w-6 justify-center">
                  {entry.rank === 1 ? <Crown className="h-4 w-4 text-amber-400" /> :
                   entry.rank === 2 ? <Trophy className="h-4 w-4 text-zinc-300" /> :
                   entry.rank === 3 ? <Trophy className="h-4 w-4 text-amber-600" /> :
                   <span className="text-xs font-bold text-zinc-600">#{entry.rank}</span>}
                </div>

                {/* Name */}
                <span className={`flex-1 truncate text-sm ${isSelf ? "font-extrabold text-orange-200" : "font-medium text-zinc-300"}`}>
                  {isSelf
                    ? <><StyledUsername name={entry.username} styleKey={entry.nameStyleKey} userId={entry.userId} size="md" /> <span className="text-orange-400">(Du)</span></>
                    : <StyledUsername name={entry.username} styleKey={entry.nameStyleKey} userId={entry.userId} size="md" />}
                </span>

                {/* Best streak */}
                <div className="flex items-center gap-1 text-sm">
                  <Flame className={`h-3.5 w-3.5 ${top3 ? "text-orange-400" : "text-zinc-600"}`} />
                  <span className={`font-bold tabular-nums ${
                    entry.rank === 1 ? "text-amber-400" :
                    entry.rank <= 3 ? "text-orange-400/80" :
                    isSelf ? "text-orange-300" : "text-zinc-300"
                  }`}>
                    {entry.bestStreak}
                  </span>
                  <span className="text-[10px] text-zinc-600">kills</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* My rank footer */}
      {!loading && myRank > 0 && (
        <div className="mt-4 border-t border-white/[0.06] pt-3 text-center text-xs text-zinc-600">
          Du bist auf Rang <span className="font-bold text-zinc-400">#{myRank}</span>
        </div>
      )}
      {!loading && myRank === 0 && entries.length > 0 && (
        <div className="mt-4 border-t border-white/[0.06] pt-3 text-center text-xs text-zinc-600">
          Du bist noch nicht in der Bestenliste — erreiche deine erste Kill-Streak!
        </div>
      )}
    </div>
  );
}
