"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Loader2, ShieldCheck, BadgeCheck, Flame, Crown, Shield,
  Copy, Check, ExternalLink, Calendar, AlertTriangle, ChevronDown,
  Ban, Ticket, Swords, ShieldAlert, UserPlus, UserCheck, Clock, UserX,
  MicOff, Volume2,
} from "lucide-react";
import { PrioBadgeRow } from "@/components/ui/prio-badge-row";
import { getMinimalProfile, type MinimalProfile } from "@/lib/actions/community";
import {
  getPopupModSummary, getMyEffectivePermissions, modMuteChat, modUnmuteChat,
  type PopupModSummary,
} from "@/lib/actions/mod";
import type { ModPermissions } from "@/lib/mod";
import { subscribeToPresence } from "@/lib/presence-client";
import { useSoundManager } from "@/lib/sound-manager";
import {
  getRelationshipTo, sendFriendRequest, respondFriendRequest, blockUser, unblockUser,
  type RelationshipKind,
} from "@/lib/actions/friends";

// ── Context ─────────────────────────────────────────────────────────────────────

interface PopupState {
  userId: string;
  anchorRect: DOMRect | null;
}

interface ProfilePopupContextValue {
  openPopup: (userId: string, anchor?: HTMLElement) => void;
  closePopup: () => void;
}

const ProfilePopupContext = createContext<ProfilePopupContextValue>({
  openPopup: () => undefined,
  closePopup: () => undefined,
});

export function useProfilePopup() {
  return useContext(ProfilePopupContext);
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  admin:     "Admin",
  moderator: "Mod",
  user:      "User",
};
const ROLE_BADGE_CLASS: Record<string, string> = {
  admin:     "text-amber-300 bg-amber-500/15 border-amber-500/30",
  moderator: "text-sky-300   bg-sky-500/15   border-sky-500/30",
  user:      "text-zinc-400  bg-zinc-800     border-zinc-700/40",
};
const ROLE_ICON: Record<string, typeof Crown> = {
  admin: Crown,
  moderator: Shield,
  user: Shield,
};

const POPUP_W = 320;
const POPUP_H = 480;

function calcPosition(anchor: DOMRect | null): CSSProperties {
  if (!anchor) {
    return { position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)" };
  }
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let left = anchor.left;
  if (left + POPUP_W + 12 > vw) left = vw - POPUP_W - 12;
  if (left < 12) left = 12;
  const spaceBelow = vh - anchor.bottom;
  const top = spaceBelow >= POPUP_H + 12 ? anchor.bottom + 8 : anchor.top - POPUP_H - 8;
  return {
    position: "fixed",
    left,
    top: Math.max(12, Math.min(top, vh - POPUP_H - 12)),
    zIndex: 300,
  };
}

// ── Popup card content ───────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  warn: "Verwarnung",
  temp_ban: "Temp-Ban",
  ban: "Ban",
  unban: "Entsperrt",
  credits_add: "Credits ±",
  chat_clear: "Chat geleert",
  note_add: "Notiz",
};

// ── Social: relationship-aware friend button ─────────────────────────────────────

function FriendButton({ userId }: { userId: string }) {
  // Default "none": der „Freund hinzufügen"-Button ist sofort sichtbar, auch
  // während getRelationshipTo noch lädt oder fehlschlägt. Lädt die echte
  // Beziehung → ersetzt den Default; nur "self"/"blocked_by" blenden aus.
  const [rel, setRel] = useState<{ kind: RelationshipKind; requestId?: string }>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const sound = useSoundManager();

  const load = useCallback(() => {
    getRelationshipTo(userId)
      .then((r) => { if (r.ok) setRel({ kind: r.kind, requestId: r.requestId }); })
      .catch(() => undefined);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  if (rel.kind === "self" || rel.kind === "blocked_by") return null;

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    sound.click();
    try {
      const res = await fn();
      if (!res.ok) sound.error();
      load();
    } finally { setBusy(false); }
  };

  const Spinner = <Loader2 className="h-3.5 w-3.5 animate-spin" />;

  // Primary action varies by relationship; a small block/unblock sits beside it.
  let primary: ReactNode;
  switch (rel.kind) {
    case "friends":
      primary = (
        <span className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
          <UserCheck className="h-3.5 w-3.5" /> Befreundet
        </span>
      );
      break;
    case "outgoing":
      primary = (
        <span className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-400">
          <Clock className="h-3.5 w-3.5" /> Anfrage gesendet
        </span>
      );
      break;
    case "incoming":
      primary = (
        <button
          onClick={() => rel.requestId && act(() => respondFriendRequest(rel.requestId!, true))}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500/90 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-400 disabled:opacity-60"
        >
          {busy ? Spinner : <><Check className="h-3.5 w-3.5" /> Anfrage annehmen</>}
        </button>
      );
      break;
    case "blocked":
      primary = (
        <button
          onClick={() => act(() => unblockUser(userId))}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-300 transition-colors hover:bg-emerald-500/15 hover:text-emerald-300 disabled:opacity-60"
        >
          {busy ? Spinner : <><ShieldCheck className="h-3.5 w-3.5" /> Blockierung aufheben</>}
        </button>
      );
      break;
    default: // none
      primary = (
        <button
          onClick={() => act(() => sendFriendRequest(userId))}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-600/90 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
        >
          {busy ? Spinner : <><UserPlus className="h-3.5 w-3.5" /> Freund hinzufügen</>}
        </button>
      );
  }

  return (
    <div className="mx-4 mb-2 flex items-center gap-2">
      {primary}
      {rel.kind !== "blocked" && (
        <button
          onClick={() => act(() => blockUser(userId))}
          disabled={busy}
          title="Blockieren"
          className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-500 transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:opacity-60"
        >
          <UserX className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Mod: kompakte Chat-Stummschaltung ────────────────────────────────────────────

const MUTE_HOUR_OPTIONS = [1, 6, 12, 24, 48, 72, 168] as const;

function ModMuteButton({ userId, mutedUntil }: { userId: string; mutedUntil: string | null }) {
  const [perms, setPerms] = useState<ModPermissions | null>(null);
  const [isSelf, setIsSelf] = useState(false);
  const [localMutedUntil, setLocalMutedUntil] = useState<string | null | undefined>(undefined);
  const [hours, setHours] = useState<number>(24);
  const [busy, setBusy] = useState(false);
  const sound = useSoundManager();

  useEffect(() => {
    getMyEffectivePermissions().then(setPerms).catch(() => undefined);
    getRelationshipTo(userId)
      .then((r) => { if (r.ok && r.kind === "self") setIsSelf(true); })
      .catch(() => undefined);
  }, [userId]);

  // Standard-Dauer an die erlaubte Höchstgrenze anpassen.
  useEffect(() => {
    if (!perms) return;
    const max = perms.maxChatMuteHours || 1;
    setHours((h) => (h <= max ? h : max));
  }, [perms]);

  if (!perms?.canMuteChat || isSelf) return null;

  const effectiveMutedUntil = localMutedUntil !== undefined ? localMutedUntil : mutedUntil;
  const isMuted = !!effectiveMutedUntil && new Date(effectiveMutedUntil) > new Date();
  const availableHours = MUTE_HOUR_OPTIONS.filter((h) => h <= (perms.maxChatMuteHours || 1));

  const act = async (fn: () => Promise<{ success: boolean; error?: string }>, nextMuted: string | null) => {
    setBusy(true);
    sound.click();
    try {
      const res = await fn();
      if (res.success) setLocalMutedUntil(nextMuted);
      else sound.error();
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-4 mb-2 flex items-center gap-2">
      {isMuted ? (
        <button
          onClick={() => act(() => modUnmuteChat(userId), null)}
          disabled={busy}
          title={`Stummgeschaltet bis ${new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(effectiveMutedUntil!))}`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Volume2 className="h-3.5 w-3.5" /> Stumm aufheben</>}
        </button>
      ) : (
        <>
          <button
            onClick={() => act(() => modMuteChat(userId, hours, ""), new Date(Date.now() + hours * 3_600_000).toISOString())}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><MicOff className="h-3.5 w-3.5" /> Chat stumm ({hours}h)</>}
          </button>
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            disabled={busy}
            title="Dauer"
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-xs font-bold text-amber-300 outline-none focus:border-amber-400/50 disabled:opacity-60"
          >
            {availableHours.map((h) => (
              <option key={h} value={h} className="bg-[#09090f] text-zinc-200">{h}h</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

function PopupCard({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<MinimalProfile | null>(null);
  const [isElevated, setIsElevated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [modOpen, setModOpen] = useState(false);
  const [modDetails, setModDetails] = useState<PopupModSummary | null>(null);
  const [modLoading, setModLoading] = useState(false);

  useEffect(() => {
    let active = true;
    getMinimalProfile(userId).then((res) => {
      if (!active) return;
      if (res.ok && res.profile) {
        setProfile(res.profile);
        setIsElevated(res.viewerIsElevated);
      } else {
        setError(res.error ?? "Profil nicht geladen.");
      }
    });
    return () => { active = false; };
  }, [userId]);

  // Subscribe to realtime presence to determine if user is online
  useEffect(() => {
    const unsubscribe = subscribeToPresence((onlineIds) => {
      setIsOnline(onlineIds.has(userId));
    });
    return unsubscribe;
  }, [userId]);

  // Lazy-load mod details when section is expanded
  useEffect(() => {
    if (!modOpen || modDetails !== null || modLoading) return;
    setModLoading(true);
    getPopupModSummary(userId)
      .then((data) => setModDetails(data))
      .catch(() => setModDetails({ recentActions: [], openTicketCount: 0 }))
      .finally(() => setModLoading(false));
  }, [modOpen, modDetails, modLoading, userId]);

  const handleCopyId = () => {
    if (!profile) return;
    navigator.clipboard.writeText(profile.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const RoleIcon = profile ? (ROLE_ICON[profile.role] ?? Shield) : Shield;

  return (
    <div
      className="relative w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#09090f]/96 shadow-[0_24px_72px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-2.5 top-2.5 z-10 rounded-full border border-white/10 bg-white/5 p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
        aria-label="Schließen"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {!profile ? (
        <div className="flex h-40 items-center justify-center">
          {error
            ? <p className="px-6 text-center text-xs text-zinc-500">{error}</p>
            : <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
          }
        </div>
      ) : (
        <>
          {/* ── Gradient header ──────────────────────────────────────────── */}
          <div className="relative h-16 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-800/50 via-[#09090f]/20 to-blue-900/40" />
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "radial-gradient(ellipse at 20% 50%, #7c3aed 0%, transparent 65%), radial-gradient(ellipse at 85% 20%, #3b82f6 0%, transparent 55%)",
              }}
            />
          </div>

          {/* ── Avatar overlapping header ─────────────────────────────────── */}
          <div className="-mt-9 flex items-end gap-3 px-4 pb-2">
            <div className="relative shrink-0">
              {profile.discordAvatarUrl ? (
                <Image
                  src={profile.discordAvatarUrl}
                  alt=""
                  width={52}
                  height={52}
                  unoptimized
                  className="h-[52px] w-[52px] rounded-full border-[2.5px] border-[#09090f] object-cover shadow-xl"
                />
              ) : (
                <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[2.5px] border-[#09090f] bg-purple-500/30 text-xl font-black text-purple-200 shadow-xl">
                  {profile.username.charAt(0).toUpperCase()}
                </div>
              )}
              <span
                title={isOnline ? "Online" : "Offline"}
                className={`absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-[2px] border-[#09090f] transition-colors ${
                  isOnline
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(52,211,153,0.7)]"
                    : "bg-zinc-600"
                }`}
              />
            </div>

            {/* Role badge */}
            <div
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${ROLE_BADGE_CLASS[profile.role] ?? ROLE_BADGE_CLASS.user}`}
            >
              <RoleIcon className="h-2.5 w-2.5 shrink-0" />
              {ROLE_LABEL[profile.role] ?? "User"}
              {profile.verified && (
                <BadgeCheck className="h-2.5 w-2.5 text-blue-400" />
              )}
            </div>
          </div>

          {/* ── Name — plain only in the small popup ────────────────────────── */}
          <div className="flex items-center gap-1.5 px-4 pb-1">
            <span className="text-base font-black text-white leading-tight truncate">
              {profile.username}
            </span>
            {profile.role === "admin" && (
              <ShieldCheck className="h-4 w-4 shrink-0 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
            )}
          </div>

          {/* ── Prio Badges ─────────────────────────────────────────────────── */}
          {profile.prioBadges && profile.prioBadges.length > 0 && (
            <div className="px-4 pb-2">
              <PrioBadgeRow badgeKeys={profile.prioBadges} size="sm" max={2} />
            </div>
          )}

          {/* ── Stats ───────────────────────────────────────────────────────── */}
          <div className="mx-4 mb-3 grid grid-cols-3 gap-1.5">
            {[
              { label: "Credits", value: profile.credits.toLocaleString("de-DE"), color: "text-purple-300" },
              { label: "Streak",  value: <span className="flex items-center gap-0.5"><Flame className="h-3 w-3 text-orange-400" />{profile.streakDays}T</span>, color: "text-orange-300" },
              { label: "Cases",   value: profile.casesOpened.toLocaleString("de-DE"), color: "text-zinc-300" },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex flex-col items-center rounded-xl bg-white/[0.03] py-2">
                <span className="text-[9px] uppercase tracking-widest text-zinc-600">{label}</span>
                <span className={`mt-0.5 text-[11px] font-bold ${color}`}>{value}</span>
              </div>
            ))}
          </div>

          {/* ── Member since ──────────────────────────────────────────────── */}
          <div className="mx-4 mb-2.5 flex items-center gap-1.5 text-[10px] text-zinc-600">
            <Calendar className="h-3 w-3" />
            Dabei seit{" "}
            {new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(profile.memberSince))}
          </div>

          {/* ── Mod-Interface — elevated only ─────────────────────────────── */}
          {isElevated && (
            <div className="mx-4 mb-2">
              {/* Collapsible header */}
              <button
                onClick={() => setModOpen((o) => !o)}
                className="flex w-full items-center gap-1.5 rounded-lg border border-violet-900/40 bg-violet-950/20 px-3 py-1.5 text-[10px] font-bold text-violet-400 transition-colors hover:bg-violet-950/35"
                title="Mod-Details anzeigen/verbergen"
              >
                <ShieldAlert className="h-3 w-3 shrink-0" />
                <span className="flex-1 text-left">Mod-Interface</span>
                {/* Quick badges: warnings + ban */}
                {profile.warningStrikes > 0 && (
                  <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
                    {profile.warningStrikes}×⚠
                  </span>
                )}
                {profile.tempBannedUntil && new Date(profile.tempBannedUntil) > new Date() && (
                  <span className="rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-bold text-orange-400">
                    Gebannt
                  </span>
                )}
                <ChevronDown
                  className={`h-3 w-3 shrink-0 transition-transform ${modOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Expanded mod details */}
              <AnimatePresence>
                {modOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1 space-y-1.5 rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                      {/* Internal ID */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700">ID</span>
                        <span className="flex-1 truncate font-mono text-[9px] text-amber-600/80">{profile.id}</span>
                        <button
                          onClick={handleCopyId}
                          className="shrink-0 rounded p-0.5 text-amber-700/70 transition-colors hover:text-amber-400"
                          title="ID kopieren"
                        >
                          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>

                      {/* Stat row: warnings, tickets, ban */}
                      <div className="flex items-center gap-2">
                        <div className="flex flex-1 items-center gap-1 rounded-lg bg-white/[0.03] px-2 py-1.5">
                          <AlertTriangle className="h-2.5 w-2.5 text-red-400 shrink-0" />
                          <span className="text-[9px] text-zinc-500">Verwarnungen</span>
                          <span className="ml-auto text-[10px] font-bold text-red-400">{profile.warningStrikes}</span>
                        </div>
                        <div className="flex flex-1 items-center gap-1 rounded-lg bg-white/[0.03] px-2 py-1.5">
                          <Ticket className="h-2.5 w-2.5 text-sky-400 shrink-0" />
                          <span className="text-[9px] text-zinc-500">Tickets</span>
                          <span className="ml-auto text-[10px] font-bold text-sky-400">
                            {modLoading ? "…" : (modDetails?.openTicketCount ?? "—")}
                          </span>
                        </div>
                      </div>

                      {/* Ban status */}
                      {profile.tempBannedUntil ? (
                        <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] ${
                          new Date(profile.tempBannedUntil) > new Date()
                            ? "border border-orange-800/40 bg-orange-950/30 text-orange-400"
                            : "border border-zinc-800/40 bg-zinc-900/20 text-zinc-500"
                        }`}>
                          <Ban className="h-3 w-3 shrink-0" />
                          {new Date(profile.tempBannedUntil) > new Date()
                            ? `Gebannt bis ${new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(profile.tempBannedUntil))}`
                            : `Temp-Ban abgelaufen (${new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(new Date(profile.tempBannedUntil))})`
                          }
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-900/20 bg-emerald-950/10 px-2.5 py-1.5 text-[10px] text-emerald-600">
                          <Shield className="h-3 w-3 shrink-0" />
                          Kein aktiver Ban
                        </div>
                      )}

                      {/* Recent mod actions */}
                      {modLoading ? (
                        <div className="flex items-center justify-center gap-1.5 py-2 text-[10px] text-zinc-600">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Lade Aktionen…
                        </div>
                      ) : modDetails && modDetails.recentActions.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Letzte Aktionen</p>
                          {modDetails.recentActions.map((a) => (
                            <div key={a.id} className="flex items-start gap-1.5 rounded-lg bg-white/[0.02] px-2 py-1">
                              <Swords className="mt-0.5 h-2.5 w-2.5 shrink-0 text-zinc-600" />
                              <div className="min-w-0 flex-1">
                                <span className="text-[9px] font-semibold text-zinc-400">
                                  {ACTION_LABEL[a.actionType] ?? a.actionType}
                                </span>
                                {a.reason && (
                                  <span className="ml-1 text-[9px] text-zinc-600 truncate">— {a.reason}</span>
                                )}
                              </div>
                              <span className="shrink-0 text-[8px] text-zinc-700 tabular-nums">
                                {new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(new Date(a.createdAt))}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (modDetails && modDetails.recentActions.length === 0) ? (
                        <p className="text-center text-[9px] text-zinc-700 py-1">Keine Mod-Aktionen vorhanden</p>
                      ) : null}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── Mod: kompakte Chat-Stummschaltung (nur erhöhte Betrachter) ── */}
          {isElevated && (
            <ModMuteButton userId={userId} mutedUntil={profile.chatMutedUntil} />
          )}

          {/* ── Social: Freund-Aktion ─────────────────────────────────────── */}
          <FriendButton userId={userId} />

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <div className="border-t border-white/5 px-4 py-2.5">
            <a
              href={`/community?u=${userId}`}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-purple-600/20 px-3 py-2 text-xs font-semibold text-purple-300 transition-all hover:bg-purple-600/30 hover:text-purple-200"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Vollständiges Profil ansehen
            </a>
          </div>
        </>
      )}
    </div>
  );
}

// ── Provider ─────────────────────────────────────────────────────────────────────

export function ProfilePopupProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const openPopup = useCallback((userId: string, anchor?: HTMLElement) => {
    const anchorRect = anchor?.getBoundingClientRect() ?? null;
    setPopup({ userId, anchorRect });
  }, []);

  const closePopup = useCallback(() => setPopup(null), []);

  // Globale Event-Bridge: die 3D-Welt (R3F-Canvas hat keinen Zugriff auf diesen
  // React-Context) öffnet das Profil-Popup per window-CustomEvent.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId?: string } | undefined;
      if (detail?.userId) openPopup(detail.userId);
    };
    window.addEventListener("gnc:open-profile-popup", onOpen as EventListener);
    return () => window.removeEventListener("gnc:open-profile-popup", onOpen as EventListener);
  }, [openPopup]);

  // Close on Escape
  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePopup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup, closePopup]);

  const positionStyle = useMemo(
    () => (popup ? calcPosition(popup.anchorRect) : {}),
    [popup],
  );

  return (
    <ProfilePopupContext.Provider value={{ openPopup, closePopup }}>
      {children}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {popup && (
              <>
                {/* Invisible click-away backdrop */}
                <div
                  key="backdrop"
                  className="fixed inset-0 z-[299]"
                  onClick={closePopup}
                />
                {/* Animated popup */}
                <motion.div
                  key={`popup-${popup.userId}`}
                  style={positionStyle}
                  initial={{ opacity: 0, scale: 0.9, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.88, y: -6 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                >
                  <PopupCard userId={popup.userId} onClose={closePopup} />
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </ProfilePopupContext.Provider>
  );
}
