"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users, Search, Crown, Shield, Flame } from "lucide-react";
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
  streakDays: number;
  gender: "m" | "w";
  equippedByCategory: Record<string, EquippedItem | undefined>;
  rarityCounts: Record<Rarity, number>;
}

type RoleFilter = "all" | "admin" | "moderator" | "user";

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
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [credits, setCredits] = useState(initialCredits);
  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setCredits(row.credits);
  });
  const [players, setPlayers] = useState(initialPlayers);
  const { currencyName } = useSiteConfig();
  useRealtimeAllProfiles((row) => {
    if (typeof row.id !== "string" || typeof row.credits !== "number") return;
    setPlayers((curr) => curr.map((p) => (p.id === row.id ? { ...p, credits: row.credits as number } : p)));
  });
  const sound = useSoundManager();
  const onlineIds = useOnlineUserIds();

  const adminCount = useMemo(() => players.filter((p) => p.role === "admin").length, [players]);
  const modCount = useMemo(() => players.filter((p) => p.role === "moderator").length, [players]);
  const userCount = useMemo(() => players.filter((p) => p.role === "user" || (p.role !== "admin" && p.role !== "moderator")).length, [players]);

  const filtered = useMemo(() => {
    let list = players;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((p) => p.username.toLowerCase().includes(q));
    if (roleFilter === "admin") list = list.filter((p) => p.role === "admin");
    else if (roleFilter === "moderator") list = list.filter((p) => p.role === "moderator");
    else if (roleFilter === "user") list = list.filter((p) => p.role !== "admin" && p.role !== "moderator");
    return list;
  }, [players, query, roleFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aOnline = onlineIds.has(a.id) ? 1 : 0;
      const bOnline = onlineIds.has(b.id) ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return b.credits - a.credits;
    });
  }, [filtered, onlineIds]);

  const activeCount = onlineIds.size;

  const roleFilterButtons: Array<{ key: RoleFilter; label: string; count: number; Icon?: typeof Crown; activeCls: string }> = [
    { key: "all",        label: "Alle",    count: players.length, activeCls: "border-purple-500/40 bg-purple-500/15 text-purple-200" },
    { key: "admin",      label: "Admins",  count: adminCount,     Icon: Crown,  activeCls: "border-amber-500/40 bg-amber-500/15 text-amber-200" },
    { key: "moderator",  label: "Mods",    count: modCount,       Icon: Shield, activeCls: "border-sky-500/40 bg-sky-500/15 text-sky-200" },
    { key: "user",       label: "Spieler", count: userCount,      activeCls: "border-zinc-500/40 bg-zinc-500/15 text-zinc-200" },
  ];

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

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="glow-text flex items-center gap-2 text-2xl font-extrabold text-zinc-50">
              <Users className="h-6 w-6 text-purple-400" />
              Community
              <span className="text-base font-normal text-zinc-500">({players.length} Mitglieder)</span>
            </h1>
            <p className="mt-1 text-xs text-zinc-600">
              {adminCount > 0 && <><span className="text-amber-400">{adminCount} Admin{adminCount !== 1 ? "s" : ""}</span> · </>}
              {modCount > 0 && <><span className="text-sky-400">{modCount} Mod{modCount !== 1 ? "s" : ""}</span> · </>}
              {userCount} Spieler
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            {activeCount} online
          </div>
        </div>

        {/* Search + role filter bar */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Spieler suchen…"
              className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-purple-400/60"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {roleFilterButtons.map(({ key, label, count, Icon, activeCls }) => {
              const active = roleFilter === key;
              return (
                <button
                  key={key}
                  onMouseEnter={sound.hover}
                  onClick={() => { sound.click(); setRoleFilter(key); }}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                    active
                      ? activeCls
                      : "border-white/8 bg-white/[0.02] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                  }`}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${active ? "bg-white/20" : "bg-white/8 text-zinc-600"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {sorted.length === 0 ? (
          <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-10 text-center text-sm text-zinc-500">
            Keine Spieler gefunden.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sorted.map((player) => {
              const total = totalItems(player.rarityCounts);
              const online = onlineIds.has(player.id);
              const isPlayerAdmin = player.role === "admin";
              const isPlayerMod = player.role === "moderator";
              const cardBorder = isPlayerAdmin
                ? "border-amber-500/30 hover:border-amber-400/60 hover:shadow-[0_0_28px_rgba(245,158,11,0.2)]"
                : isPlayerMod
                  ? "border-sky-500/25 hover:border-sky-400/55 hover:shadow-[0_0_28px_rgba(14,165,233,0.2)]"
                  : "border-white/10 hover:border-purple-400/50 hover:shadow-[0_0_24px_rgba(168,85,247,0.25)]";

              return (
                <button
                  key={player.id}
                  onMouseEnter={sound.hover}
                  onClick={() => {
                    sound.click();
                    setSelectedId(player.id);
                  }}
                  className={`group relative flex flex-col gap-3 rounded-2xl border bg-[#0f0e18] p-4 text-left transition-all ${cardBorder}`}
                >
                  {/* Staff glow accent */}
                  {isPlayerAdmin && (
                    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/[0.07] to-transparent" />
                  )}
                  {isPlayerMod && (
                    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500/[0.06] to-transparent" />
                  )}

                  <div className="relative h-32 w-full overflow-hidden rounded-xl border border-white/5 bg-[#08050f]">
                    <PlayerCardAvatar
                      gender={player.gender}
                      equippedByCategory={player.equippedByCategory}
                    />
                    {online && (
                      <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                    )}
                  </div>

                  <div className="flex items-start justify-between gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="font-bold text-zinc-100 truncate">{player.username}</span>
                      {player.id === viewerId && (
                        <span className="shrink-0 rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-bold text-purple-300">DU</span>
                      )}
                      {isPlayerAdmin && (
                        <span className="shrink-0 flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                          <Crown className="h-2.5 w-2.5" />ADMIN
                        </span>
                      )}
                      {isPlayerMod && (
                        <span className="shrink-0 flex items-center gap-0.5 rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">
                          <Shield className="h-2.5 w-2.5" />MOD
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-semibold ${isPlayerAdmin ? "text-amber-300" : isPlayerMod ? "text-sky-300" : "text-purple-300"}`}>
                      {new Intl.NumberFormat("de-DE").format(player.credits)} {currencyName}
                    </p>
                    {player.streakDays > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-400">
                        <Flame className="h-3 w-3" />{player.streakDays}
                      </span>
                    )}
                  </div>

                  {total === 0 ? (
                    <p className="text-xs text-zinc-600">Keine Items</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {RARITY_ORDER.map((rarity) => {
                        const count = player.rarityCounts[rarity];
                        if (count === 0) return null;
                        const style = RARITY_STYLES[rarity];
                        return (
                          <span
                            key={rarity}
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${style.border} ${style.bg} ${style.text}`}
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
