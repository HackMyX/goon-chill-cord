"use client";

import { useState } from "react";
import { Save, RotateCcw, MessageCircleOff, MessageCircle } from "lucide-react";
import { updateUserCredits, updateUserRole, resetUser, setSupportBanned } from "@/lib/actions/admin";
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
  const sound = useSoundManager();

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
    } else {
      setStatus("error");
    }
  }

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    const [a, b] = await Promise.all([
      updateUserCredits(profile.id, credits),
      role !== profile.role ? updateUserRole(profile.id, role) : Promise.resolve({ success: true }),
    ]);
    setSaving(false);
    setStatus(a.success && b.success ? "saved" : "error");
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
    } else {
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
              onChange={(e) => setCredits(Number(e.target.value) || 0)}
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
              onChange={(e) => setRole(e.target.value as ProfileRole)}
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

          {status === "saved" && <span className="text-sm text-emerald-400">✓</span>}
          {status === "error" && <span className="text-sm text-red-400">Fehler</span>}
        </div>
      }
    >
      <UserDetailPanel userId={profile.id} />
    </CollapsibleAdminRow>
  );
}
