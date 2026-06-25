"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Coins, Package, Sparkles, ShieldCheck, Pencil, Check, X, Repeat, Eye, EyeOff, Loader2, Zap } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { isAdmin, isModerator } from "@/lib/admin";
import { updateUsername, updatePlayerSettings, type NotificationPrefs } from "@/lib/actions/account";
import { useSoundManager } from "@/lib/sound-manager";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";
import { NotificationPrefsSection } from "@/components/account/notification-prefs-section";
import { LevelBadge } from "@/components/ui/level-badge";
import { getLevelColor } from "@/lib/level-system";

interface AccountShellProps {
  username: string;
  avatarUrl: string | null;
  credits: number;
  streakDays: number;
  casesOpened: number;
  role: string;
  memberSince: string;
  inventoryCount: number;
  acceptsTrades: boolean;
  profileVisible: boolean;
  notificationPrefs: NotificationPrefs;
  level?: number;
  xp?: number;
  xpInLevel?: number;
  xpForLevel?: number;
  xpProgress?: number;
  equippedAbilityKey?: string | null;
  abilitiesCount?: number;
}

export function AccountShell({
  username,
  avatarUrl,
  credits,
  streakDays,
  casesOpened,
  role,
  memberSince,
  inventoryCount,
  acceptsTrades: initialAcceptsTrades,
  profileVisible: initialProfileVisible,
  notificationPrefs,
  level = 1,
  xp = 0,
  xpInLevel = 0,
  xpForLevel = 0,
  xpProgress = 0,
  equippedAbilityKey = null,
  abilitiesCount = 0,
}: AccountShellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(username);
  const [displayName, setDisplayName] = useState(username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveCredits, setLiveCredits] = useState(credits);
  const [liveRole, setLiveRole] = useState(role);
  const [acceptsTrades, setAcceptsTrades] = useState(initialAcceptsTrades);
  const [profileVisible, setProfileVisible] = useState(initialProfileVisible);
  const [acceptsTradesSaving, setAcceptsTradesSaving] = useState(false);
  const [profileVisibleSaving, setProfileVisibleSaving] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const sound = useSoundManager();

  async function handleToggleAcceptsTrades() {
    sound.click();
    setToggleError(null);
    setAcceptsTradesSaving(true);
    const next = !acceptsTrades;
    const res = await updatePlayerSettings({ acceptsTrades: next });
    setAcceptsTradesSaving(false);
    if (res.success) {
      setAcceptsTrades(next);
      sound.save();
    } else {
      sound.error();
      setToggleError(res.error ?? "Speichern fehlgeschlagen.");
    }
  }

  async function handleToggleProfileVisible() {
    sound.click();
    setToggleError(null);
    setProfileVisibleSaving(true);
    const next = !profileVisible;
    const res = await updatePlayerSettings({ profileVisible: next });
    setProfileVisibleSaving(false);
    if (res.success) {
      setProfileVisible(next);
      sound.save();
    } else {
      sound.error();
      setToggleError(res.error ?? "Speichern fehlgeschlagen.");
    }
  }

  // Admin-driven changes (credits set, role changed) reach this tab the
  // instant they happen, no reload needed — see lib/use-realtime-profile.ts.
  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setLiveCredits(row.credits);
    if (typeof row.role === "string") setLiveRole(row.role);
  });

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await updateUsername(draft);
    setSaving(false);
    if (!res.success) {
      sound.error();
      setError(res.error ?? "Fehler.");
      return;
    }
    sound.save();
    setDisplayName(draft);
    setEditing(false);
  }

  const joinedLabel = new Date(memberSince).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={liveCredits} streakDays={streakDays} inventoryCount={inventoryCount} isAdmin={isAdmin({ role: liveRole })} isModerator={isModerator({ role: liveRole })} />

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

        <div className="glow-box flex items-center gap-4 rounded-2xl border border-purple-500/20 bg-black/30 p-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-purple-400/40 bg-purple-600/30 text-2xl font-bold text-purple-200 shadow-[0_0_18px_rgba(168,85,247,0.4)]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>

          <div className="flex-1">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                  className="w-40 rounded-lg border border-purple-400/50 bg-black/40 px-2 py-1 text-lg font-bold text-zinc-100 outline-none"
                />
                <button
                  onMouseEnter={sound.hover}
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-full bg-emerald-600/80 p-1.5 text-white hover:bg-emerald-500"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onMouseEnter={sound.hover}
                  onClick={() => {
                    sound.click();
                    setEditing(false);
                    setDraft(displayName);
                    setError(null);
                  }}
                  className="rounded-full bg-white/10 p-1.5 text-zinc-300 hover:bg-white/20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <h1 className="glow-text flex items-center gap-2 text-2xl font-extrabold text-zinc-50">
                {displayName}
                <button
                  onMouseEnter={sound.hover}
                  onClick={() => {
                    sound.click();
                    setEditing(true);
                  }}
                  className="text-zinc-500 transition-colors hover:text-purple-300"
                  title="Namen bearbeiten"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {liveRole === "admin" && (
                  <span className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                    <ShieldCheck className="h-3 w-3" />
                    Admin
                  </span>
                )}
              </h1>
            )}
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
            <p className="mt-1 text-sm text-zinc-500">Mitglied seit {joinedLabel}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-purple-500/20 bg-white/[0.02] px-4 py-4 text-center">
            <Coins className="mx-auto h-5 w-5 text-purple-300" />
            <p className="glow-text mt-2 text-xl font-extrabold text-purple-300">
              {liveCredits.toLocaleString("de-DE")}
            </p>
            <p className="text-xs text-zinc-500">Credits</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-white/[0.02] px-4 py-4 text-center">
            <Sparkles className="mx-auto h-5 w-5 text-amber-300" />
            <p className="mt-2 text-xl font-extrabold text-amber-300">{casesOpened}</p>
            <p className="text-xs text-zinc-500">Cases geöffnet</p>
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-white/[0.02] px-4 py-4 text-center">
            <Package className="mx-auto h-5 w-5 text-blue-300" />
            <p className="mt-2 text-xl font-extrabold text-blue-300">{inventoryCount}</p>
            <p className="text-xs text-zinc-500">Items im Inventar</p>
          </div>
        </div>

        {/* Level & XP Card */}
        <div className="mt-4 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-900/10 to-purple-900/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-bold text-zinc-200">Level &amp; XP</span>
            </div>
            <LevelBadge level={level} size="sm" />
          </div>

          {/* XP Progress bar */}
          <div className="mb-2">
            <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
              <span>{xpInLevel.toLocaleString("de-DE")} / {xpForLevel.toLocaleString("de-DE")} XP</span>
              <span className={`font-bold ${getLevelColor(level)}`}>{Math.round(xpProgress)}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-purple-500 transition-all duration-700"
                style={{ width: `${Math.min(100, xpProgress)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 text-xs text-zinc-500">
            <span>Gesamt: <span className="font-semibold text-zinc-300">{xp.toLocaleString("de-DE")} XP</span></span>
            {abilitiesCount > 0 && (
              <span>
                Fähigkeit: <span className="font-semibold text-amber-300">{equippedAbilityKey ?? "keine"}</span>
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/garderobe"
            onMouseEnter={sound.hover}
            onClick={sound.click}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(147,51,234,0.5)] transition-transform hover:scale-105"
          >
            Garderobe
          </Link>
          <Link
            href="/#case-opening"
            onMouseEnter={sound.hover}
            onClick={sound.click}
            className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/30"
          >
            Case Opening
          </Link>
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">Einstellungen</h2>
          {toggleError && (
            <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{toggleError}</p>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-3">
                <Repeat className="h-5 w-5 shrink-0 text-cyan-300" />
                <div>
                  <p className="text-sm font-semibold text-zinc-200">Trade-Anfragen annehmen</p>
                  <p className="text-xs text-zinc-500">Wenn deaktiviert, können andere Spieler dir keine Trades mehr anbieten.</p>
                </div>
              </div>
              <button
                onMouseEnter={sound.hover}
                onClick={handleToggleAcceptsTrades}
                disabled={acceptsTradesSaving}
                role="switch"
                aria-checked={acceptsTrades}
                className="shrink-0 rounded-full outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900"
              >
                <span
                  className={`relative block h-6 w-11 overflow-hidden rounded-full transition-colors duration-200 ${
                    acceptsTrades ? "bg-purple-600" : "bg-white/10"
                  }`}
                >
                  {acceptsTradesSaving ? (
                    <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-zinc-300" />
                  ) : (
                    <span
                      className={`absolute left-0 top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        acceptsTrades ? "translate-x-[22px]" : "translate-x-[2px]"
                      }`}
                    />
                  )}
                </span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-3">
                {profileVisible ? (
                  <Eye className="h-5 w-5 shrink-0 text-emerald-300" />
                ) : (
                  <EyeOff className="h-5 w-5 shrink-0 text-zinc-500" />
                )}
                <div>
                  <p className="text-sm font-semibold text-zinc-200">Auf Bestenliste &amp; Spieler-Liste sichtbar sein</p>
                  <p className="text-xs text-zinc-500">Wenn deaktiviert, taucht dein Profil für andere nirgendwo öffentlich auf.</p>
                </div>
              </div>
              <button
                onMouseEnter={sound.hover}
                onClick={handleToggleProfileVisible}
                disabled={profileVisibleSaving}
                role="switch"
                aria-checked={profileVisible}
                className="shrink-0 rounded-full outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900"
              >
                <span
                  className={`relative block h-6 w-11 overflow-hidden rounded-full transition-colors duration-200 ${
                    profileVisible ? "bg-purple-600" : "bg-white/10"
                  }`}
                >
                  {profileVisibleSaving ? (
                    <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-zinc-300" />
                  ) : (
                    <span
                      className={`absolute left-0 top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        profileVisible ? "translate-x-[22px]" : "translate-x-[2px]"
                      }`}
                    />
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>

        <NotificationPrefsSection initialPrefs={notificationPrefs} role={liveRole} />
      </main>
    </div>
  );
}
