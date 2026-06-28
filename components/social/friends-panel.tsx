"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, X, UserPlus, UserX, Star, Clock,
  Check, Loader2, ShieldX, Inbox, Send, Crown, Shield, Gamepad2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToPresence } from "@/lib/presence-client";
import { useSoundManager } from "@/lib/sound-manager";
import { useProfilePopup } from "@/components/ui/profile-popup-provider";
import {
  getFriendData, respondFriendRequest, cancelFriendRequest, removeFriend,
  toggleFavorite, unblockUser,
  type FriendData, type FriendSummary, type PendingRequest, type BlockedSummary,
} from "@/lib/actions/friends";

const EMPTY: FriendData = { ok: false, friends: [], incoming: [], outgoing: [], blocked: [] };

type Tab = "friends" | "requests" | "blocked";

// ── Helpers ─────────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "noch nie online";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std`;
  const d = Math.floor(h / 24);
  if (d < 30) return `vor ${d} ${d === 1 ? "Tag" : "Tagen"}`;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(iso));
}

const ROLE_ICON: Record<string, typeof Crown> = { admin: Crown, moderator: Shield };
const ROLE_TINT: Record<string, string> = {
  admin: "text-amber-300",
  moderator: "text-sky-300",
};

function Avatar({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={{ width: size, height: size }}
      className="rounded-full border border-white/10 object-cover"
    />
  ) : (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-full border border-white/10 bg-purple-500/25 font-black text-purple-200"
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function StatusDot({ online, inWorld }: { online: boolean; inWorld: boolean }) {
  return (
    <span
      title={inWorld ? "In der Welt" : online ? "Online" : "Offline"}
      className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0a0a12] transition-colors ${
        inWorld
          ? "bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.9)]"
          : online
            ? "bg-emerald-500 shadow-[0_0_7px_rgba(52,211,153,0.8)]"
            : "bg-zinc-600"
      }`}
    />
  );
}

// ── Friend row ────────────────────────────────────────────────────────────────

function FriendRow({
  f, online, busy, onOpen, onFav, onRemove,
}: {
  f: FriendSummary;
  online: boolean;
  busy: boolean;
  onOpen: (id: string, el: HTMLElement) => void;
  onFav: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const RoleIcon = ROLE_ICON[f.role];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="group flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2 transition-colors hover:border-violet-500/25 hover:bg-violet-500/[0.06]"
    >
      <button
        onClick={(e) => onOpen(f.userId, e.currentTarget)}
        className="relative shrink-0"
        title="Profil ansehen"
      >
        <Avatar url={f.avatarUrl} name={f.username} />
        <StatusDot online={online} inWorld={f.inWorld} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => onOpen(f.userId, e.currentTarget)}
            className={`truncate text-sm font-bold text-white hover:underline ${ROLE_TINT[f.role] ?? ""}`}
          >
            {f.username}
          </button>
          {RoleIcon && <RoleIcon className={`h-3 w-3 shrink-0 ${ROLE_TINT[f.role]}`} />}
          {f.level > 0 && (
            <span className="shrink-0 rounded-full bg-purple-500/15 px-1.5 text-[9px] font-bold text-purple-300">
              Lv {f.level}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
          {f.inWorld ? (
            <span className="flex items-center gap-1 font-semibold text-fuchsia-300">
              <Gamepad2 className="h-2.5 w-2.5" /> Spielt gerade in der Welt
            </span>
          ) : online ? (
            <span className="font-semibold text-emerald-400">Online</span>
          ) : (
            <span className="flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> {relativeTime(f.lastSeen)}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onFav(f.userId)}
          disabled={busy}
          title={f.favorite ? "Favorit entfernen" : "Als Favorit anpinnen"}
          className={`rounded-lg p-1.5 transition-colors ${
            f.favorite ? "text-amber-400 hover:bg-amber-500/15" : "text-zinc-500 hover:bg-white/5 hover:text-amber-300"
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${f.favorite ? "fill-amber-400" : ""}`} />
        </button>
        <button
          onClick={() => onRemove(f.userId)}
          disabled={busy}
          title="Freund entfernen"
          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
        >
          <UserX className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────────

function FriendsPanel({
  data, onlineIds, loading, onClose, onAction,
}: {
  data: FriendData;
  onlineIds: Set<string>;
  loading: boolean;
  onClose: () => void;
  onAction: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("friends");
  const [busyId, setBusyId] = useState<string | null>(null);
  const sound = useSoundManager();
  const { openPopup } = useProfilePopup();

  const onlineCount = data.friends.filter((f) => onlineIds.has(f.userId) || f.inWorld).length;

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusyId(id);
    sound.click();
    try { await onAction(fn); } finally { setBusyId(null); }
  };

  const TABS: { key: Tab; label: string; icon: typeof Users; count: number }[] = [
    { key: "friends", label: "Freunde", icon: Users, count: data.friends.length },
    { key: "requests", label: "Anfragen", icon: Inbox, count: data.incoming.length },
    { key: "blocked", label: "Blockiert", icon: ShieldX, count: data.blocked.length },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="fixed right-3 top-[64px] z-[140] flex max-h-[min(82vh,720px)] w-[min(94vw,400px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a12]/95 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Aurora glow */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-50"
        style={{ background: "radial-gradient(ellipse at 20% 0%, #7c3aed55 0%, transparent 60%), radial-gradient(ellipse at 90% 10%, #db277755 0%, transparent 55%)" }}
      />

      {/* Header */}
      <div className="relative flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
          <Users className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-black tracking-tight text-white">Freunde</h2>
          <p className="text-[10px] text-zinc-500">
            {onlineCount} online · {data.friends.length} gesamt
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-white/10 bg-white/5 p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
          aria-label="Schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="relative flex gap-1 border-b border-white/[0.06] px-2 py-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); sound.tabSwitch(); }}
              className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
                active ? "bg-violet-500/15 text-violet-200" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.count > 0 && (
                <span className={`rounded-full px-1.5 text-[9px] ${
                  t.key === "requests" ? "bg-emerald-500 text-white" : "bg-white/10 text-zinc-300"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-y-auto px-3 py-3">
        {loading && data.friends.length === 0 && data.incoming.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
          </div>
        ) : tab === "friends" ? (
          data.friends.length === 0 ? (
            <EmptyState icon={Users} text="Noch keine Freunde. Öffne ein Profil und schick eine Anfrage!" />
          ) : (
            <div className="space-y-1.5">
              <AnimatePresence mode="popLayout">
                {data.friends.map((f) => (
                  <FriendRow
                    key={f.userId}
                    f={f}
                    online={onlineIds.has(f.userId)}
                    busy={busyId === f.userId}
                    onOpen={(id, el) => { onClose(); openPopup(id, el); }}
                    onFav={(id) => run(id, () => toggleFavorite(id))}
                    onRemove={(id) => run(id, () => removeFriend(id))}
                  />
                ))}
              </AnimatePresence>
            </div>
          )
        ) : tab === "requests" ? (
          <RequestsTab data={data} busyId={busyId} run={run} openPopup={(id, el) => { onClose(); openPopup(id, el); }} />
        ) : (
          data.blocked.length === 0 ? (
            <EmptyState icon={ShieldX} text="Du hast niemanden blockiert." />
          ) : (
            <div className="space-y-1.5">
              {data.blocked.map((b: BlockedSummary) => (
                <div key={b.userId} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                  <Avatar url={b.avatarUrl} name={b.username} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-zinc-300">{b.username}</p>
                    <p className="text-[10px] text-zinc-600">Blockiert {relativeTime(b.blockedAt)}</p>
                  </div>
                  <button
                    onClick={() => run(b.userId, () => unblockUser(b.userId))}
                    disabled={busyId === b.userId}
                    className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-zinc-300 transition-colors hover:bg-emerald-500/15 hover:text-emerald-300"
                  >
                    Entsperren
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </motion.div>
  );
}

function RequestsTab({
  data, busyId, run, openPopup,
}: {
  data: FriendData;
  busyId: string | null;
  run: (id: string, fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
  openPopup: (id: string, el: HTMLElement) => void;
}) {
  if (data.incoming.length === 0 && data.outgoing.length === 0) {
    return <EmptyState icon={Inbox} text="Keine offenen Anfragen." />;
  }
  return (
    <div className="space-y-4">
      {data.incoming.length > 0 && (
        <div>
          <SectionLabel icon={Inbox} text={`Eingehend (${data.incoming.length})`} />
          <div className="space-y-1.5">
            {data.incoming.map((r: PendingRequest) => (
              <div key={r.requestId} className="flex items-center gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] px-3 py-2">
                <button onClick={(e) => openPopup(r.userId, e.currentTarget)} className="shrink-0">
                  <Avatar url={r.avatarUrl} name={r.username} size={38} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{r.username}</p>
                  <p className="text-[10px] text-zinc-500">möchte dich hinzufügen · {relativeTime(r.createdAt)}</p>
                </div>
                <button
                  onClick={() => run(r.requestId, () => respondFriendRequest(r.requestId, true))}
                  disabled={busyId === r.requestId}
                  title="Annehmen"
                  className="rounded-lg bg-emerald-500/90 p-2 text-white transition-colors hover:bg-emerald-400"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => run(r.requestId, () => respondFriendRequest(r.requestId, false))}
                  disabled={busyId === r.requestId}
                  title="Ablehnen"
                  className="rounded-lg border border-white/10 bg-white/5 p-2 text-zinc-400 transition-colors hover:bg-red-500/15 hover:text-red-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.outgoing.length > 0 && (
        <div>
          <SectionLabel icon={Send} text={`Gesendet (${data.outgoing.length})`} />
          <div className="space-y-1.5">
            {data.outgoing.map((r: PendingRequest) => (
              <div key={r.requestId} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                <button onClick={(e) => openPopup(r.userId, e.currentTarget)} className="shrink-0">
                  <Avatar url={r.avatarUrl} name={r.username} size={36} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-zinc-300">{r.username}</p>
                  <p className="text-[10px] text-zinc-600">ausstehend · {relativeTime(r.createdAt)}</p>
                </div>
                <button
                  onClick={() => run(r.requestId, () => cancelFriendRequest(r.requestId))}
                  disabled={busyId === r.requestId}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-zinc-400 transition-colors hover:bg-red-500/15 hover:text-red-400"
                >
                  Zurückziehen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
      <Icon className="h-3 w-3" /> {text}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Users; text: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.03] text-zinc-600">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-xs text-zinc-500">{text}</p>
    </div>
  );
}

// ── Live toast (new incoming request) ────────────────────────────────────────────

function RequestToast({ req, onOpen, onDismiss }: { req: PendingRequest; onOpen: () => void; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className="pointer-events-auto flex items-center gap-3 overflow-hidden rounded-2xl border border-violet-500/30 bg-[#0c0a16]/95 p-3 shadow-[0_18px_60px_rgba(124,58,237,0.45)] backdrop-blur-xl"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: "radial-gradient(ellipse at 0% 0%, #7c3aed 0%, transparent 60%)" }} />
      <div className="relative">
        <Avatar url={req.avatarUrl} name={req.username} size={40} />
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white shadow-lg">
          <UserPlus className="h-2.5 w-2.5" />
        </span>
      </div>
      <div className="relative min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">Freundschaftsanfrage</p>
        <p className="truncate text-sm font-bold text-white">{req.username}</p>
      </div>
      <button
        onClick={onOpen}
        className="relative shrink-0 rounded-lg bg-violet-500 px-3 py-1.5 text-[11px] font-black text-white transition-colors hover:bg-violet-400"
      >
        Ansehen
      </button>
      <button onClick={onDismiss} className="relative shrink-0 rounded-md p-1 text-zinc-500 hover:text-zinc-300">
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

// ── Trigger (Topbar slot) ─────────────────────────────────────────────────────

export function FriendsTrigger({ userId }: { userId?: string }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<FriendData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<PendingRequest | null>(null);
  const seenIncoming = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);
  const sound = useSoundManager();

  useEffect(() => { setMounted(true); }, []);

  const refetch = useCallback(async () => {
    try {
      const d = await getFriendData();
      setData(d);
      // Neue eingehende Anfrage → Live-Popup (nur nach dem ersten Laden).
      const fresh = d.incoming.filter((r) => !seenIncoming.current.has(r.requestId));
      d.incoming.forEach((r) => seenIncoming.current.add(r.requestId));
      if (!firstLoad.current && fresh.length > 0) {
        setToast(fresh[0]);
        sound.notificationPing();
      }
      firstLoad.current = false;
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [sound]);

  // Initial + Realtime (broadcastLive("friends:<uid>") feuert "changed").
  useEffect(() => {
    if (!userId) return;
    void refetch();
    const supabase = createClient();
    const channel = supabase
      .channel(`friends:${userId}`)
      .on("broadcast", { event: "changed" }, () => { void refetch(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refetch]);

  // Presence-Sync für die Online-Dots.
  useEffect(() => subscribeToPresence((ids) => setOnlineIds(ids)), []);

  // Cross-link: aus dem Profil-Popup heraus öffnen.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("gn:open-friends", onOpen);
    return () => window.removeEventListener("gn:open-friends", onOpen);
  }, []);

  // Auto-dismiss des Toasts.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleAction = useCallback(async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const res = await fn();
    if (!res.ok && res.error) sound.error();
    await refetch();
  }, [refetch, sound]);

  if (!userId) return null;

  const badge = data.incoming.length;

  return (
    <>
      {mounted && createPortal(
        <>
          <AnimatePresence>
            {open && (
              <>
                <div key="bg" className="fixed inset-0 z-[139]" onClick={() => setOpen(false)} />
                <FriendsPanel
                  data={data}
                  onlineIds={onlineIds}
                  loading={loading}
                  onClose={() => setOpen(false)}
                  onAction={handleAction}
                />
              </>
            )}
          </AnimatePresence>
          {/* Live-Popup oben mittig */}
          <div className="pointer-events-none fixed left-1/2 top-3 z-[200] w-[min(92vw,380px)] -translate-x-1/2">
            <AnimatePresence>
              {toast && (
                <RequestToast
                  key={toast.requestId}
                  req={toast}
                  onOpen={() => { setToast(null); setOpen(true); }}
                  onDismiss={() => setToast(null)}
                />
              )}
            </AnimatePresence>
          </div>
        </>,
        document.body,
      )}

      <button
        onClick={() => { setOpen((o) => !o); sound.click(); }}
        onMouseEnter={sound.hover}
        title="Freunde"
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
          badge > 0
            ? "border-violet-500/50 bg-violet-500/10 text-violet-300 shadow-[0_0_14px_-2px_rgba(124,58,237,0.6)]"
            : "border-white/[0.08] bg-zinc-900/80 text-zinc-400 hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-400"
        }`}
      >
        <Users className="h-4.5 w-4.5" />
        {badge > 0 && (
          <>
            <span aria-hidden className="absolute -top-1 -right-1 inline-flex h-4 w-4 animate-ping rounded-full bg-violet-500/60" />
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[9px] font-black text-white"
            >
              {badge}
            </motion.span>
          </>
        )}
      </button>
    </>
  );
}
