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
  Copy, Check, ExternalLink, Calendar, AlertTriangle,
} from "lucide-react";
import { StyledUsername } from "@/components/ui/styled-username";
import { PrioBadgeRow } from "@/components/ui/prio-badge-row";
import { getMinimalProfile, type MinimalProfile } from "@/lib/actions/community";

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
const POPUP_H = 390;

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
              <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-[2px] border-[#09090f] bg-emerald-500 shadow" />
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

          {/* ── Name ────────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 px-4 pb-1">
            <StyledUsername
              name={profile.username}
              styleKey={profile.nameStyleKey}
              size="lg"
            />
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

          {/* ── Warning strikes — elevated only ───────────────────────────── */}
          {isElevated && profile.warningStrikes > 0 && (
            <div className="mx-4 mb-2 flex items-center gap-1.5 rounded-lg border border-red-800/40 bg-red-950/30 px-3 py-1.5 text-[10px] text-red-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {profile.warningStrikes} Verwarnung{profile.warningStrikes !== 1 ? "en" : ""}
            </div>
          )}

          {/* ── Internal ID — admin/mod only ──────────────────────────────── */}
          {isElevated && (
            <div className="mx-4 mb-3 flex items-center gap-1.5 rounded-lg border border-amber-900/30 bg-amber-950/20 px-2.5 py-1.5">
              <span className="mr-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-700">ID</span>
              <span className="flex-1 truncate font-mono text-[9px] text-amber-600/80">{profile.id}</span>
              <button
                onClick={handleCopyId}
                className="shrink-0 rounded p-0.5 text-amber-700/70 transition-colors hover:text-amber-400"
                title="ID kopieren"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          )}

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
