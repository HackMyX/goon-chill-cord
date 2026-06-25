"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, RotateCcw, MessageCircleOff, MessageCircle, BadgeCheck } from "lucide-react";
import { updateUserCredits, updateUserRole, resetUser, setSupportBanned, setUserVerified } from "@/lib/actions/admin";
import { UserDetailPanel } from "@/components/admin/user-detail-panel";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { useSoundManager } from "@/lib/sound-manager";
import type { ProfileRole } from "@/lib/admin";
import type { ProfileRow } from "@/components/admin/admin-shell";

const ROLES: ProfileRole[] = ["user", "moderator", "admin"];

export function UserRowEditor({ profile }: { profile: ProfileRow }) {
  const [credits, setCredits] = useState(profile.credits);
  const [role, setRole] = useState<ProfileRole>(profile.role as ProfileRole);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [supportBanned, setSupportBannedState] = useState(!!profile.support_banned);
  const [supportBanToggling, setSupportBanToggling] = useState(false);
  const [verified, setVerifiedState] = useState(!!profile.verified);
  const [verifyToggling, setVerifyToggling] = useState(false);
  const sound = useSoundManager();
  const router = useRouter();

  // Track whether the admin is actively editing — don't overwrite their
  // in-progress values if a realtime/router.refresh update arrives mid-edit.
  const editingRef = useRef(false);

  // Sync local display state from props when external changes arrive
  // (realtime profile updates or parent router.refresh), but only when we're
  // not currently saving (to avoid overwriting values mid-flight).
  useEffect(() => {
    if (!saving && !editingRef.current) {
      setCredits(profile.credits);
      setRole(profile.role as ProfileRole);
      setSupportBannedState(!!profile.support_banned);
      setVerifiedState(!!profile.verified);
    }
  }, [profile.credits, profile.role, profile.support_banned, profile.verified, saving]);

  async function handleToggleVerified(e: React.MouseEvent) {
    e.stopPropagation();
    sound.click();
    setVerifyToggling(true);
    const next = !verified;
    const res = await setUserVerified(profile.id, next);
    setVerifyToggling(false);
    if (res.success) {
      setVerifiedState(next);
      setStatus("saved");
      sound.save();
      router.refresh();
    } else {
      sound.error();
      setStatus("error");
    }
  }

  async function handleToggleSupportBan(e: React.MouseEvent) {
    e.stopPropagation();
    sound.click();
    setSupportBanToggling(true);
    const next = !supportBanned;
    const res = await setSupportBanned(profile.id, next);
    setSupportBanToggling(false);
    if (res.success) {
      setSupportBannedState(next);
      setStatus("saved");
      sound.save();
      router.refresh();
    } else {
      sound.error();
      setStatus("error");
    }
  }

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    editingRef.current = false;
    sound.click();

    const [a, b] = await Promise.all([
      updateUserCredits(profile.id, credits),
      updateUserRole(profile.id, role),
    ]);

    setSaving(false);

    if (a.success && b.success) {
      setStatus("saved");
      sound.save();
      // Refresh server data so parent's profiles list reflects the change
      // and any other admin's view on the same page stays in sync.
      router.refresh();
      setTimeout(() => setStatus("idle"), 2500);
    } else {
      sound.error();
      setStatus("error");
    }
  }

  async function handleReset(e: React.MouseEvent) {
    e.stopPropagation();
    sound.click();
    if (!resetConfirm) {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 4000);
      return;
    }
    setResetting(true);
    setResetConfirm(false);
    const result = await resetUser(profile.id);
    setResetting(false);
    if (result.success) {
      setCredits(0);
      setStatus("saved");
      router.refresh();
      setTimeout(() => setStatus("idle"), 2500);
    } else {
      sound.error();
      setStatus("error");
    }
  }

  return (
    <CollapsibleAdminRow
      header={
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-[140px] flex-1">
            <span className="block font-semibold text-zinc-100">{profile.username}</span>
            <span className="block text-xs text-zinc-500">{profile.cases_opened} Cases geöffnet</span>
          </span>

          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Credits
            <input
              type="number"
              value={credits}
              onChange={(e) => {
                editingRef.current = true;
                setCredits(Number(e.target.value) || 0);
              }}
              onBlur={() => { editingRef.current = false; }}
              onClick={(e) => e.stopPropagation()}
              className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Rolle
            <select
              value={role}
              onMouseEnter={sound.hover}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                editingRef.current = true;
                setRole(e.target.value as ProfileRole);
              }}
              onBlur={() => { editingRef.current = false; }}
              className="w-32 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <button
            onMouseEnter={sound.hover}
            onClick={(e) => {
              e.stopPropagation();
              handleSave();
            }}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.5)] transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "..." : "Speichern"}
          </button>

          <button
            onMouseEnter={sound.hover}
            onClick={handleReset}
            disabled={resetting}
            title="Account auf Erstzustand zurücksetzen — Credits, Stats und Inventar werden gelöscht"
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              resetConfirm
                ? "border-red-400/70 bg-red-500/20 text-red-200 shadow-[0_0_10px_rgba(239,68,68,0.4)]"
                : "border-red-500/30 bg-red-500/10 text-red-400 hover:border-red-400/60 hover:text-red-300"
            }`}
          >
            <RotateCcw className="h-4 w-4" />
            {resetting ? "..." : resetConfirm ? "Sicher?" : "Reset"}
          </button>

          <button
            onMouseEnter={sound.hover}
            onClick={handleToggleSupportBan}
            disabled={supportBanToggling}
            title={
              supportBanned
                ? "Support-Button für diesen User wieder freigeben"
                : "Support-Button für diesen User sperren (z.B. bei Spam)"
            }
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              supportBanned
                ? "border-red-400/60 bg-red-500/20 text-red-300 hover:border-red-400/80"
                : "border-white/10 text-zinc-400 hover:border-white/30"
            }`}
          >
            {supportBanned ? <MessageCircleOff className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
            {supportBanToggling ? "..." : supportBanned ? "Support gesperrt" : "Support sperren"}
          </button>

          <button
            onMouseEnter={sound.hover}
            onClick={handleToggleVerified}
            disabled={verifyToggling}
            title={verified ? "Verifikation entfernen" : "Blaues Häkchen verleihen"}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              verified
                ? "border-blue-400/60 bg-blue-500/20 text-blue-300 hover:border-blue-400/80 shadow-[0_0_8px_rgba(59,130,246,0.3)]"
                : "border-white/10 text-zinc-400 hover:border-blue-400/40 hover:text-blue-300"
            }`}
          >
            <BadgeCheck className="h-4 w-4" />
            {verifyToggling ? "..." : verified ? "Verifiziert" : "Verifizieren"}
          </button>

          {status === "saved" && <span className="text-sm font-semibold text-emerald-400">✓ Gespeichert</span>}
          {status === "error" && <span className="text-sm font-semibold text-red-400">Fehler</span>}
        </div>
      }
    >
      <UserDetailPanel userId={profile.id} />
    </CollapsibleAdminRow>
  );
}
