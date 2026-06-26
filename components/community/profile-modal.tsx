"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Canvas, useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Loader2, ShieldCheck, BadgeCheck, Package,
  Calendar, Coins, Flame, Star, Copy, Check,
  AlertTriangle, Crown, Shield, User, Ban,
} from "lucide-react";
import {
  modWarnUser, modTempBan, modLiftBan, modAddCredits, getMyEffectivePermissions,
} from "@/lib/actions/mod";
import type { ModPermissions } from "@/lib/mod";
import { CharacterModel } from "@/components/world/character-model";
import { RARITY_LABELS, RARITY_ORDER, RARITY_STYLES, type Rarity } from "@/lib/cases";
import { RarityChip } from "@/components/ui/rarity-chip";
import { getPublicProfile, type PublicProfile } from "@/lib/actions/community";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { StyledUsername } from "@/components/ui/styled-username";
import { getBadgeStyle } from "@/lib/badges";
import { PrioBadgeRow } from "@/components/ui/prio-badge-row";
import { LevelBadge } from "@/components/ui/level-badge";
import { subscribeToPresence } from "@/lib/presence-client";
import type { EquippedItem } from "@/lib/rarity-colors";

// ── Helpers ────────────────────────────────────────────────────────────────────

interface ProfileModalProps {
  userId: string;
  onClose: () => void;
}

function fmt(n: number) { return new Intl.NumberFormat("de-DE").format(n); }

function totalItems(counts: Record<Rarity, number>): number {
  return RARITY_ORDER.reduce((sum, r) => sum + counts[r], 0);
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", moderator: "Moderator", user: "Spieler",
};
const ROLE_COLOR: Record<string, string> = {
  admin:     "text-amber-300 border-amber-500/40 bg-amber-500/10",
  moderator: "text-sky-300   border-sky-500/40   bg-sky-500/10",
  user:      "text-zinc-400  border-zinc-700/40  bg-zinc-800/40",
};

// ── Rotating 3D character ──────────────────────────────────────────────────────

function SpinGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.55; });
  return <group ref={ref}>{children}</group>;
}

function ProfileCharacter({ gender, equipped }: {
  gender: "m" | "w";
  equipped: Record<string, EquippedItem | undefined>;
}) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 1.6, 3.4], fov: 42 }}>
      <Suspense fallback={null}>
        <color attach="background" args={["#07021a"]} />
        <ambientLight intensity={0.85} color="#c4b5fd" />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <directionalLight position={[-2, 2, -2]} intensity={0.3} color="#818cf8" />
        <SpinGroup>
          <group position={[0, -1.35, 0]}>
            <CharacterModel equippedByCategory={equipped} gender={gender} />
          </group>
        </SpinGroup>
      </Suspense>
    </Canvas>
  );
}

// ── Rarity bar chart ───────────────────────────────────────────────────────────

const RARITY_BAR_COLOR: Record<Rarity, string> = {
  normal:   "#6366f1",
  selten:   "#a855f7",
  mythisch: "#f59e0b",
  ultra:    "#e879f9",
};

function RarityBars({ counts }: { counts: Record<Rarity, number> }) {
  const total = totalItems(counts);
  if (total === 0) return <p className="text-xs text-zinc-600">Keine Items</p>;
  return (
    <div className="space-y-2">
      {RARITY_ORDER.map((rarity) => {
        const count = counts[rarity];
        if (count === 0) return null;
        const pct = Math.round((count / total) * 100);
        const style = RARITY_STYLES[rarity];
        const barColor = RARITY_BAR_COLOR[rarity];
        return (
          <div key={rarity} className="flex items-center gap-2">
            <RarityChip rarity={rarity} className="w-[68px] shrink-0 justify-center text-center px-2">
              {RARITY_LABELS[rarity]}
            </RarityChip>
            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
              {style.rainbow ? (
                <motion.div
                  className="h-full rounded-full rainbow-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                />
              ) : (
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: barColor, boxShadow: `0 0 8px ${barColor}80` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                />
              )}
            </div>
            <span className="w-7 text-right text-[10px] font-bold text-zinc-400">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Moderation panel (elevated viewers only) ───────────────────────────────────

const BAN_HOUR_OPTIONS = [1, 6, 12, 24, 48, 72] as const;

function ModPanel({ profile }: { profile: PublicProfile }) {
  const [perms, setPerms] = useState<ModPermissions | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [warnReason, setWarnReason] = useState("");
  const [banHours, setBanHours] = useState<number>(24);
  const [banReason, setBanReason] = useState("");
  const [creditAmount, setCreditAmount] = useState<number>(0);
  const [creditReason, setCreditReason] = useState("");
  const [localBanUntil, setLocalBanUntil] = useState<string | null | undefined>(undefined);

  const effectiveBanUntil = localBanUntil !== undefined ? localBanUntil : profile.tempBannedUntil;
  const isBanned = !!effectiveBanUntil && new Date(effectiveBanUntil) > new Date();

  useEffect(() => {
    getMyEffectivePermissions().then(setPerms);
  }, []);

  function feedback(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  }

  async function doAction(key: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(key);
    try {
      const res = await fn();
      feedback(res.error ?? (res.success ? "Erfolgreich." : "Fehler"), res.success);
      return res.success;
    } finally {
      setBusy(null);
    }
  }

  const availableHours = BAN_HOUR_OPTIONS.filter((h) => !perms || h <= (perms.maxTempBanHours || 24));
  const hasAnyPerm = perms && (perms.canWarnUsers || perms.canTempBanUsers || perms.canAddCredits);

  return (
    <div className="rounded-2xl border border-red-900/40 bg-red-950/15 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-red-400" />
        <p className="text-xs font-bold uppercase tracking-widest text-red-400">Moderations-Panel</p>
      </div>

      {!perms ? (
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Lade Berechtigungen…
        </div>
      ) : !hasAnyPerm ? (
        <p className="text-xs text-zinc-600">Keine Moderations-Aktionen verfügbar.</p>
      ) : (
        <div className="space-y-3">

          {/* ── Warn ── */}
          {perms.canWarnUsers && (
            <div className="rounded-xl border border-orange-900/30 bg-orange-950/20 p-3 space-y-2">
              <p className="text-[11px] font-bold text-orange-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Verwarnung
              </p>
              <input
                type="text"
                placeholder="Grund"
                value={warnReason}
                maxLength={200}
                onChange={(e) => setWarnReason(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-orange-400/50"
              />
              <button
                type="button"
                disabled={!!busy || !warnReason.trim()}
                onClick={async () => {
                  const ok = await doAction("warn", () => modWarnUser(profile.id, warnReason.trim()));
                  if (ok) setWarnReason("");
                }}
                className="flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-300 hover:bg-orange-500/20 transition-colors disabled:opacity-40"
              >
                {busy === "warn" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                Verwarnen
              </button>
            </div>
          )}

          {/* ── Temp ban / lift ── */}
          {perms.canTempBanUsers && (
            <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-3 space-y-2">
              <p className="text-[11px] font-bold text-red-400 flex items-center gap-1.5">
                <Ban className="h-3.5 w-3.5" />
                Temporärer Bann
              </p>
              {isBanned ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-red-300">
                    Gebannt bis {new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(effectiveBanUntil!))}
                  </p>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={async () => {
                      const ok = await doAction("lift", () => modLiftBan(profile.id));
                      if (ok) setLocalBanUntil(null);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                  >
                    {busy === "lift" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Bann aufheben
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-1 flex-wrap">
                    {availableHours.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setBanHours(h)}
                        className={`rounded px-2 py-0.5 text-xs font-bold transition-colors ${banHours === h ? "bg-red-500/20 text-red-300 border border-red-500/40" : "text-zinc-600 hover:text-zinc-400 border border-transparent"}`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Grund"
                    value={banReason}
                    maxLength={200}
                    onChange={(e) => setBanReason(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-red-400/50"
                  />
                  <button
                    type="button"
                    disabled={!!busy || !banReason.trim()}
                    onClick={async () => {
                      const expiresAt = new Date();
                      expiresAt.setHours(expiresAt.getHours() + banHours);
                      const ok = await doAction("ban", () => modTempBan(profile.id, banHours, banReason.trim()));
                      if (ok) { setBanReason(""); setLocalBanUntil(expiresAt.toISOString()); }
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                  >
                    {busy === "ban" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                    {banHours}h Bann verhängen
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Credits ── */}
          {perms.canAddCredits && (
            <div className="rounded-xl border border-amber-900/30 bg-amber-950/20 p-3 space-y-2">
              <p className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5" />
                Credits anpassen
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(Number(e.target.value))}
                  className="w-24 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-amber-400/50"
                  placeholder="±Credits"
                />
                <input
                  type="text"
                  placeholder="Grund"
                  value={creditReason}
                  maxLength={200}
                  onChange={(e) => setCreditReason(e.target.value)}
                  className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-400/50"
                />
              </div>
              <button
                type="button"
                disabled={!!busy || creditAmount === 0 || !creditReason.trim()}
                onClick={async () => {
                  const ok = await doAction("credits", () => modAddCredits(profile.id, creditAmount, creditReason.trim()));
                  if (ok) { setCreditAmount(0); setCreditReason(""); }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-40"
              >
                {busy === "credits" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />}
                {creditAmount > 0 ? `+${creditAmount}` : creditAmount} Credits
              </button>
            </div>
          )}

          {/* ── Action feedback ── */}
          {msg && (
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${msg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
              {msg.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
              {msg.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal content ──────────────────────────────────────────────────────────────

function ModalContent({ userId, onClose }: ProfileModalProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const { currencyName } = useSiteConfig();

  useEffect(() => {
    let active = true;
    getPublicProfile(userId).then((res) => {
      if (!active) return;
      if (res.success && res.profile) setProfile(res.profile);
      else setError(res.error ?? "Profil konnte nicht geladen werden.");
    });
    return () => { active = false; };
  }, [userId]);

  // Delay canvas mount so modal animation doesn't stutter on low-end devices
  useEffect(() => {
    const t = setTimeout(() => setCanvasReady(true), 280);
    return () => clearTimeout(t);
  }, []);

  // Subscribe to presence to show real online status
  useEffect(() => {
    if (!profile?.id) return;
    const profileId = profile.id;
    return subscribeToPresence((onlineIds) => {
      setIsOnline(onlineIds.has(profileId));
    });
  }, [profile?.id]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const handleCopyId = () => {
    if (!profile) return;
    navigator.clipboard.writeText(profile.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const total = profile ? totalItems(profile.rarityCounts) : 0;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      {/* Card */}
      <motion.div
        className="relative z-10 w-full sm:max-w-3xl overflow-hidden rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#08050f] shadow-[0_32px_96px_rgba(0,0,0,0.95)] max-h-[96dvh]"
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
          aria-label="Schließen"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Loading / error state */}
        {!profile ? (
          <div className="flex h-72 flex-col items-center justify-center gap-4">
            {error
              ? <p className="max-w-xs text-center text-sm text-zinc-500">{error}</p>
              : <>
                  <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                  <p className="text-xs text-zinc-600">Lade Profil…</p>
                </>
            }
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[96dvh]" style={{ scrollbarWidth: "thin" }}>
            {/* ── Header gradient band ── */}
            <div className="relative h-20 overflow-hidden shrink-0">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-900/70 via-[#08050f]/20 to-indigo-900/50" />
              <div className="absolute inset-0" style={{
                backgroundImage: "radial-gradient(ellipse at 10% 60%, rgba(124,58,237,0.5) 0%, transparent 55%), radial-gradient(ellipse at 85% 15%, rgba(59,130,246,0.35) 0%, transparent 50%)",
              }} />
              {/* Subtle grid */}
              <svg className="absolute inset-0 opacity-[0.07]" width="100%" height="100%">
                <defs>
                  <pattern id="pm-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                    <path d="M 28 0 L 0 0 0 28" fill="none" stroke="white" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#pm-grid)" />
              </svg>
            </div>

            {/* ── 2-col layout ── */}
            <div className="flex flex-col sm:flex-row">

              {/* ── Left column: avatar + 3D character ── */}
              <div className="flex flex-col items-center gap-4 px-5 pb-5 sm:w-56 sm:shrink-0 sm:border-r sm:border-white/5">
                {/* Avatar overlapping the header */}
                <div className="-mt-10 flex flex-col items-center gap-3">
                  <div className="relative">
                    {profile.discordAvatarUrl ? (
                      <Image
                        src={profile.discordAvatarUrl}
                        alt=""
                        width={76}
                        height={76}
                        unoptimized
                        className="h-[76px] w-[76px] rounded-full border-[3px] border-[#08050f] object-cover shadow-2xl ring-2 ring-purple-500/30"
                      />
                    ) : (
                      <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-[3px] border-[#08050f] bg-gradient-to-br from-purple-500/40 to-indigo-600/40 text-2xl font-black text-purple-200 shadow-2xl ring-2 ring-purple-500/30">
                        {profile.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {isOnline && (
                      <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-[#08050f] bg-emerald-500 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
                    )}
                  </div>

                  {/* Name + verified icon */}
                  <div className="flex flex-col items-center gap-1 text-center">
                    <div className="flex items-center gap-1.5 flex-wrap justify-center">
                      <StyledUsername name={profile.username} styleKey={profile.nameStyleKey} size="xl" disablePopup />
                      {profile.role === "admin" && (
                        <ShieldCheck className="h-4 w-4 shrink-0 text-amber-400 drop-shadow-[0_0_7px_rgba(251,191,36,0.6)]" />
                      )}
                      {profile.verified && profile.role !== "admin" && (
                        <BadgeCheck className="h-4 w-4 shrink-0 text-blue-400 drop-shadow-[0_0_7px_rgba(59,130,246,0.6)]" />
                      )}
                    </div>
                    {profile.discordName && (
                      <p className="text-[11px] text-zinc-500">Discord: {profile.discordName}</p>
                    )}
                    {/* Role pill */}
                    <div className={`mt-0.5 flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-[11px] font-bold ${ROLE_COLOR[profile.role] ?? ROLE_COLOR.user}`}>
                      {profile.role === "admin" ? <Crown className="h-3 w-3" /> : profile.role === "moderator" ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {ROLE_LABEL[profile.role] ?? "Spieler"}
                    </div>
                    {/* Level badge */}
                    {profile.level > 0 && (
                      <LevelBadge level={profile.level} size="sm" />
                    )}
                  </div>
                </div>

                {/* 3D character */}
                <div className="w-full overflow-hidden rounded-2xl border border-white/5 bg-[#07021a]" style={{ height: 200 }}>
                  {canvasReady && (
                    <ProfileCharacter
                      gender={profile.gender}
                      equipped={profile.equippedByCategory as Record<string, EquippedItem | undefined>}
                    />
                  )}
                </div>

                {/* Prio Badges */}
                {profile.prioBadges && profile.prioBadges.length > 0 && (
                  <div className="w-full">
                    <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-600">Prio-Badges</p>
                    <PrioBadgeRow badgeKeys={profile.prioBadges} size="sm" max={2} />
                  </div>
                )}

                {/* Badges */}
                {profile.badges.length > 0 && (
                  <div className="w-full">
                    <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-600">Abzeichen</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.badges.map((ub) => {
                        const bs = getBadgeStyle(ub.badgeKey);
                        return (
                          <span
                            key={ub.id}
                            title={ub.badge.description ?? ub.badge.label}
                            className="rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-all hover:brightness-125"
                            style={{ background: bs.bg, color: bs.text, borderColor: bs.border, boxShadow: `0 0 8px ${bs.glow}` }}
                          >
                            {ub.badge.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Plain username (visible to all) + warning strikes + UUID copy (elevated only) */}
                <div className="w-full space-y-2">
                  {profile.viewerIsElevated && profile.warningStrikes > 0 && (
                    <div className="flex items-center gap-1.5 rounded-xl border border-red-800/40 bg-red-950/30 px-3 py-2 text-[11px] text-red-400">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {profile.warningStrikes} Verwarnung{profile.warningStrikes !== 1 ? "en" : ""}
                    </div>
                  )}
                  <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-zinc-200">{profile.username}</span>
                      {profile.viewerIsElevated && (
                        <button
                          onClick={handleCopyId}
                          className="rounded p-0.5 text-zinc-600 transition-colors hover:text-zinc-300"
                          title="UUID kopieren"
                        >
                          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Right column: stats + inventory ── */}
              <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-4 sm:pt-5">

                {/* Key stats */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Credits",   value: fmt(profile.credits),       icon: Coins,   color: "text-amber-300",  glow: "rgba(245,158,11,0.3)"  },
                    { label: "Streak",    value: `${profile.streakDays}T`,   icon: Flame,   color: "text-orange-400", glow: "rgba(251,146,60,0.3)"  },
                    { label: "Cases",     value: fmt(profile.casesOpened),   icon: Package, color: "text-purple-400", glow: "rgba(168,85,247,0.3)"  },
                    { label: "Items",     value: fmt(total),                 icon: Star,    color: "text-blue-400",   glow: "rgba(96,165,250,0.3)"  },
                  ].map(({ label, value, icon: Icon, color, glow }, i) => (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="flex flex-col items-center gap-1 rounded-xl border border-white/8 bg-white/[0.02] py-3"
                      style={{ boxShadow: `inset 0 0 30px ${glow}` }}
                    >
                      <Icon className={`h-4 w-4 ${color}`} />
                      <span className={`text-lg font-black leading-none ${color}`}>{value}</span>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">{label}</span>
                    </motion.div>
                  ))}
                </div>

                {/* Member since */}
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  Mitglied seit {new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(new Date(profile.memberSince))}
                </div>

                {/* Rarity breakdown */}
                <div className="rounded-2xl border border-white/8 bg-white/[0.015] p-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                    Item-Sammlung <span className="normal-case text-zinc-500">({fmt(total)} gesamt)</span>
                  </p>
                  <RarityBars counts={profile.rarityCounts} />
                </div>

                {/* Equipped items */}
                {Object.keys(profile.equippedByCategory).length > 0 && (
                  <div className="rounded-2xl border border-white/8 bg-white/[0.015] p-4">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Ausgerüstet</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(profile.equippedByCategory).map(([, item]) => {
                        if (!item) return null;
                        return (
                          <RarityChip key={item.id} rarity={item.rarity as Rarity}>
                            {item.name}
                          </RarityChip>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Moderation panel (mods/admins only) */}
                {profile.viewerIsElevated && (
                  <ModPanel profile={profile} />
                )}

                {/* Currency label */}
                <p className="mt-auto text-[10px] text-zinc-700">
                  Credits werden in <span className="text-zinc-500">{currencyName}</span> angezeigt
                </p>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Portal wrapper ─────────────────────────────────────────────────────────────

export function ProfileModal({ userId, onClose }: ProfileModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      <ModalContent key={userId} userId={userId} onClose={onClose} />
    </AnimatePresence>,
    document.body,
  );
}
