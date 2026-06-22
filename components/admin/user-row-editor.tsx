"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { updateUserCredits, updateUserRole } from "@/lib/actions/admin";
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
  const sound = useSoundManager();

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
          {status === "saved" && <span className="text-sm text-emerald-400">✓</span>}
          {status === "error" && <span className="text-sm text-red-400">Fehler</span>}
        </div>
      }
    >
      <UserDetailPanel userId={profile.id} />
    </CollapsibleAdminRow>
  );
}
