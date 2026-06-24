"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users, Search } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { ProfileModal } from "@/components/community/profile-modal";
import { PlayerCardAvatar } from "@/components/community/player-card-avatar";
import { subscribeToPresence } from "@/lib/presence-client";
import { RARITY_LABELS, RARITY_ORDER, RARITY_STYLES, type Rarity } from "@/lib/cases";
import type { EquippedItem } from "@/lib/rarity-colors";
import { useSoundManager } from "@/lib/sound-manager";
import { useRealtimeProfile, useRealtimeAllProfiles } from "@/lib/use-realtime-profile";
import { useSiteConfig } from "@/components/layout/site-config-provider";

export interface PlayerCard {
  id: string;
  username: string;
  credits: number;
  role: string;
  memberSince: string;
  gender: "m" | "w";
  equippedByCategory: Record<string, EquippedItem | undefined>;
  rarityCounts: Record<Rarity, number>;
}

interface PlayerListShellProps {
  players: PlayerCard[];
  credits: number;
  streakDays: number;
  viewerId: string;
  isAdmin?: boolean;
  isModerator?: boolean;
}

function totalItems(counts: Record<Rarity, number>): number {
  return RARITY_ORDER.reduce((sum, r) => sum + counts[r], 0);
}

/** Live "who's online" via Supabase Realtime Presence (lib/presence-
 * client.ts) — components/layout/presence-heartbeat.tsx tracks every
 * logged-in user on the same shared channel; this just listens for sync
 * events. Not a "last active today" guess — this is the actual current
 * set of connected tabs, so it's never wrong in a way a heuristic could
 * be (and always includes the viewer themselves, since the heartbeat is
 * mounted app-wide).
 *
 * Goes through the shared lib/presence-client.ts module rather than
 * creating its own `supabase.channel(PRESENCE_CHANNEL)` — `createClient()`
 * returns a cached singleton, so a second independent `.channel()` call
 * for the same topic resolves to the *same* already-subscribed channel
 * object the heartbeat created, and calling `.on("presence", ...)` on an
 * already-subscribed channel throws ("cannot add presence callbacks after
 * subscribe()"), which is exactly the runtime error this replaces. */
function useOnlineUserIds(): Set<string> {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    return subscribeToPresence(setOnlineIds);
  }, []);

  return onlineIds;
}

export function PlayerListShell({ players: initialPlayers, credits: initialCredits, streakDays, viewerId, isAdmin = false, isModerator = false }: PlayerListShellProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [credits, setCredits] = useState(initialCredits);
  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setCredits(row.credits);
  });
  const [players, setPlayers] = useState(initialPlayers);
  const { currencyName } = useSiteConfig();
  // Other players' credits (shown on each card) update live too — e.g. an
  // admin editing someone's balance, or anyone winning/spending, reflects
  // here immediately without a reload.
  useRealtimeAllProfiles((row) => {
    if (typeof row.id !== "string" || typeof row.credits !== "number") return;
    setPlayers((curr) => curr.map((p) => (p.id === row.id ? { ...p, credits: row.credits as number } : p)));
  });
  const sound = useSoundManager();
  const onlineIds = useOnlineUserIds();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.username.toLowerCase().includes(q));
  }, [players, query]);

  const activeCount = onlineIds.size;

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} isAdmin={isAdmin} isModerator={isModerator} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-8">
        <Link
          href="/"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Link>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="glow-text flex items-center gap-2 text-2xl font-extrabold text-zinc-50">
            <Users className="h-6 w-6 text-purple-400" />
            Spieler Liste
            <span className="text-base font-semibold text-zinc-500">({players.length} Spieler)</span>
          </h1>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            {activeCount} online
          </div>
        </div>

        <div className="relative mb-6 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Spieler suchen..."
            className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-purple-400/60"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-10 text-center text-sm text-zinc-500">
            Keine Spieler gefunden.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((player) => {
              const total = totalItems(player.rarityCounts);
              const active = onlineIds.has(player.id);
              return (
                <button
                  key={player.id}
                  onMouseEnter={sound.hover}
                  onClick={() => {
                    sound.click();
                    setSelectedId(player.id);
                  }}
                  className="group relative flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0f0e18] p-4 text-left transition-all hover:border-purple-400/50 hover:shadow-[0_0_24px_rgba(168,85,247,0.25)]"
                >
                  <div className="h-32 w-full overflow-hidden rounded-xl border border-white/5 bg-[#08050f]">
                    <PlayerCardAvatar
                      gender={player.gender}
                      equippedByCategory={player.equippedByCategory}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-100">{player.username}</span>
                      {player.id === viewerId && (
                        <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                          DU
                        </span>
                      )}
                      {player.role === "admin" && (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          ADMIN
                        </span>
                      )}
                    </div>
                    {active && (
                      <span
                        title="Online"
                        className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                      />
                    )}
                  </div>

                  <p className="flex items-center gap-1 text-sm font-semibold text-purple-300">
                    {new Intl.NumberFormat("de-DE").format(player.credits)} {currencyName}
                  </p>

                  {total === 0 ? (
                    <p className="text-xs text-zinc-500">Keine Items</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {RARITY_ORDER.map((rarity) => {
                        const count = player.rarityCounts[rarity];
                        if (count === 0) return null;
                        const style = RARITY_STYLES[rarity];
                        return (
                          <span
                            key={rarity}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${style.border} ${style.bg} ${style.text}`}
                          >
                            {RARITY_LABELS[rarity]} ×{count}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <span className="mt-auto text-[11px] text-zinc-600 transition-colors group-hover:text-purple-300">
                    Profil ansehen →
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {selectedId && (
        <ProfileModal key={selectedId} userId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
