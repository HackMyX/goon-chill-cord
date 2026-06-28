"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Search, Loader2, UserPlus, Check, Clock, UserCheck,
  ShieldCheck, Users, Inbox, ShieldX, Ban,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { useProfilePopup } from "@/components/ui/profile-popup-provider";
import { createClient } from "@/lib/supabase/client";
import { subscribeToPresence } from "@/lib/presence-client";
import { useSoundManager } from "@/lib/sound-manager";
import {
  Avatar, FriendRow, RequestsTab, relativeTime,
} from "@/components/social/friends-panel";
import {
  getFriendData, searchAddableUsers, sendFriendRequest, respondFriendRequest,
  unblockUser, toggleFavorite, removeFriend,
  type FriendData, type AddableUserResult,
} from "@/lib/actions/friends";

const EMPTY: FriendData = { ok: false, friends: [], incoming: [], outgoing: [], blocked: [] };

interface FriendsPageShellProps {
  userId: string;
  credits: number;
  streakDays: number;
  inventoryCount: number;
  isAdmin: boolean;
  isModerator: boolean;
  initialData: FriendData;
}

type ActionFn = () => Promise<{ ok: boolean; error?: string }>;

export function FriendsPageShell({
  userId, credits, streakDays, inventoryCount, isAdmin, isModerator, initialData,
}: FriendsPageShellProps) {
  const [data, setData] = useState<FriendData>(initialData ?? EMPTY);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const sound = useSoundManager();
  const { openPopup } = useProfilePopup();

  // ── Search state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddableUserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchBusyId, setSearchBusyId] = useState<string | null>(null);
  const lastQuery = useRef("");

  const refetch = useCallback(async () => {
    try {
      const d = await getFriendData();
      setData(d);
    } catch { /* silent */ }
  }, []);

  // Realtime: broadcastLive("friends:<uid>") feuert "changed" bei jeder Aktion.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`friends:${userId}`)
      .on("broadcast", { event: "changed" }, () => { void refetch(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refetch]);

  // Presence für die Online-Dots.
  useEffect(() => subscribeToPresence((ids) => setOnlineIds(ids)), []);

  // Debounced Spieler-Suche (~300ms).
  useEffect(() => {
    const q = query.trim();
    lastQuery.current = q;
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchAddableUsers(q);
        if (lastQuery.current === q) setResults(r);
      } catch {
        if (lastQuery.current === q) setResults([]);
      } finally {
        if (lastQuery.current === q) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    try {
      const r = await searchAddableUsers(q);
      if (lastQuery.current === q) setResults(r);
    } catch { /* silent */ }
  }, [query]);

  // Aktion im Listen-Bereich (Freunde/Anfragen/Blockiert).
  const run = useCallback(async (id: string, fn: ActionFn) => {
    setBusyId(id);
    sound.click();
    try {
      const res = await fn();
      if (!res.ok && res.error) sound.error();
      await refetch();
    } finally { setBusyId(null); }
  }, [refetch, sound]);

  // Aktion im Such-Bereich: nach Erfolg Liste UND Suche neu laden.
  const runSearchAction = useCallback(async (id: string, fn: ActionFn) => {
    setSearchBusyId(id);
    sound.click();
    try {
      const res = await fn();
      if (!res.ok && res.error) sound.error();
      await Promise.all([refetch(), runSearch()]);
    } finally { setSearchBusyId(null); }
  }, [refetch, runSearch, sound]);

  const onlineCount = data.friends.filter((f) => onlineIds.has(f.userId) || f.inWorld).length;

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        credits={credits}
        streakDays={streakDays}
        inventoryCount={inventoryCount}
        isAdmin={isAdmin}
        isModerator={isModerator}
      />

      <main className="mx-auto w-full max-w-2xl flex-1 px-3 py-4 sm:px-4 sm:py-8">
        <Link
          href="/"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Link>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">Freunde</h1>
            <p className="text-xs text-zinc-500">
              {onlineCount} online · {data.friends.length} gesamt
            </p>
          </div>
        </div>

        {/* ── Spieler-Suche ──────────────────────────────────────────────── */}
        <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Spieler suchen…"
              className="w-full rounded-lg border border-white/10 bg-black/30 py-2.5 pl-9 pr-9 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-violet-500/40"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-violet-400" />
            )}
          </div>

          {query.trim().length >= 2 && (
            <div className="mt-3 space-y-1.5">
              {!searching && results.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-zinc-500">
                  Keine Spieler gefunden.
                </p>
              ) : (
                results.map((u) => (
                  <SearchResultRow
                    key={u.id}
                    u={u}
                    online={onlineIds.has(u.id)}
                    busy={searchBusyId === u.id}
                    onOpen={openPopup}
                    onAdd={() => runSearchAction(u.id, () => sendFriendRequest(u.id))}
                    onAccept={() => runSearchAction(u.id, () =>
                      u.requestId
                        ? respondFriendRequest(u.requestId, true)
                        : sendFriendRequest(u.id),
                    )}
                    onUnblock={() => runSearchAction(u.id, () => unblockUser(u.id))}
                  />
                ))
              )}
            </div>
          )}
        </section>

        {/* ── Freunde-Liste ──────────────────────────────────────────────── */}
        <SectionTitle icon={Users} text={`Freunde (${data.friends.length})`} />
        {data.friends.length === 0 ? (
          <EmptyBlock text="Noch keine Freunde. Such oben nach Spielern und schick eine Anfrage!" />
        ) : (
          <div className="mb-6 space-y-1.5">
            <AnimatePresence mode="popLayout">
              {data.friends.map((f) => (
                <FriendRow
                  key={f.userId}
                  f={f}
                  online={onlineIds.has(f.userId)}
                  busy={busyId === f.userId}
                  onOpen={(id, el) => openPopup(id, el)}
                  onFav={(id) => run(id, () => toggleFavorite(id))}
                  onRemove={(id) => run(id, () => removeFriend(id))}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* ── Anfragen ───────────────────────────────────────────────────── */}
        <SectionTitle
          icon={Inbox}
          text={`Anfragen (${data.incoming.length + data.outgoing.length})`}
        />
        <div className="mb-6">
          <RequestsTab
            data={data}
            busyId={busyId}
            run={run}
            openPopup={(id, el) => openPopup(id, el)}
          />
        </div>

        {/* ── Blockiert ──────────────────────────────────────────────────── */}
        <SectionTitle icon={ShieldX} text={`Blockiert (${data.blocked.length})`} />
        {data.blocked.length === 0 ? (
          <EmptyBlock text="Du hast niemanden blockiert." />
        ) : (
          <div className="space-y-1.5">
            {data.blocked.map((b) => (
              <div
                key={b.userId}
                className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2"
              >
                <Avatar url={b.avatarUrl} name={b.username} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-zinc-300">{b.username}</p>
                  <p className="text-[10px] text-zinc-600">Blockiert {relativeTime(b.blockedAt)}</p>
                </div>
                <button
                  onClick={() => run(b.userId, () => unblockUser(b.userId))}
                  disabled={busyId === b.userId}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-zinc-300 transition-colors hover:bg-emerald-500/15 hover:text-emerald-300 disabled:opacity-60"
                >
                  Entsperren
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Suchergebnis-Zeile ────────────────────────────────────────────────────────

function SearchResultRow({
  u, online, busy, onOpen, onAdd, onAccept, onUnblock,
}: {
  u: AddableUserResult;
  online: boolean;
  busy: boolean;
  onOpen: (id: string, el: HTMLElement) => void;
  onAdd: () => void;
  onAccept: () => void;
  onUnblock: () => void;
}) {
  const Spinner = <Loader2 className="h-3.5 w-3.5 animate-spin" />;

  let action: React.ReactNode;
  switch (u.relationship) {
    case "friends":
      action = (
        <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300">
          <UserCheck className="h-3.5 w-3.5" /> Befreundet
        </span>
      );
      break;
    case "outgoing":
      action = (
        <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-zinc-400">
          <Clock className="h-3.5 w-3.5" /> Angefragt
        </span>
      );
      break;
    case "incoming":
      action = (
        <button
          onClick={onAccept}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-500/90 px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-emerald-400 disabled:opacity-60"
        >
          {busy ? Spinner : <><Check className="h-3.5 w-3.5" /> Annehmen</>}
        </button>
      );
      break;
    case "blocked":
      action = (
        <button
          onClick={onUnblock}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-zinc-300 transition-colors hover:bg-emerald-500/15 hover:text-emerald-300 disabled:opacity-60"
        >
          {busy ? Spinner : <><ShieldCheck className="h-3.5 w-3.5" /> Entsperren</>}
        </button>
      );
      break;
    case "blocked_by":
      action = (
        <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-zinc-500">
          <Ban className="h-3.5 w-3.5" /> Nicht möglich
        </span>
      );
      break;
    default: // none
      action = (
        <button
          onClick={onAdd}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600/90 px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
        >
          {busy ? Spinner : <><UserPlus className="h-3.5 w-3.5" /> Hinzufügen</>}
        </button>
      );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2"
    >
      <button onClick={(e) => onOpen(u.id, e.currentTarget)} className="relative shrink-0" title="Profil ansehen">
        <Avatar url={u.avatarUrl} name={u.username} size={38} />
        <span
          title={online ? "Online" : "Offline"}
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0a0a12] ${
            online ? "bg-emerald-500" : "bg-zinc-600"
          }`}
        />
      </button>
      <button
        onClick={(e) => onOpen(u.id, e.currentTarget)}
        className="min-w-0 flex-1 truncate text-left text-sm font-bold text-white hover:underline"
      >
        {u.username}
      </button>
      <div className="shrink-0">{action}</div>
    </motion.div>
  );
}

// ── Kleine UI-Helfer ──────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
      <Icon className="h-3.5 w-3.5" /> {text}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="mb-6 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-6 text-center text-xs text-zinc-500">
      {text}
    </div>
  );
}
