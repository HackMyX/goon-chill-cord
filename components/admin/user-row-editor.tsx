"use client";

import { useState } from "react";
import { Save, ChevronDown, ChevronUp } from "lucide-react";
import { updateUserCredits, updateUserRole } from "@/lib/actions/admin";
import { UserDetailPanel } from "@/components/admin/user-detail-panel";
import { useSoundManager } from "@/lib/sound-manager";
import type { ProfileRole } from "@/lib/admin";
import type { ProfileRow } from "@/components/admin/admin-shell";

const ROLES: ProfileRole[] = ["user", "moderator", "admin"];

export function UserRowEditor({ profile }: { profile: ProfileRow }) {
  const [credits, setCredits] = useState(profile.credits);
  const [role, setRole] = useState<ProfileRole>(profile.role as ProfileRole);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [expanded, setExpanded] = useState(false);
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
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition-all duration-200 hover:border-purple-400/30 hover:shadow-[0_0_24px_rgba(168,85,247,0.12)]">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onMouseEnter={sound.hover}
          onClick={() => {
            sound.click();
            setExpanded((v) => !v);
          }}
          className="flex min-w-[140px] flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          )}
          <span>
            <span className="block font-semibold text-zinc-100">{profile.username}</span>
            <span className="block text-xs text-zinc-500">{profile.cases_opened} Cases geöffnet</span>
          </span>
        </button>

        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Credits
          <input
            type="number"
            value={credits}
            onChange={(e) => setCredits(Number(e.target.value) || 0)}
            className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Rolle
          <select
            value={role}
            onMouseEnter={sound.hover}
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
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.5)] transition-colors hover:bg-purple-500 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "..." : "Speichern"}
        </button>
        {status === "saved" && <span className="text-sm text-emerald-400">✓</span>}
        {status === "error" && <span className="text-sm text-red-400">Fehler</span>}
      </div>

      {expanded && (
        <div className="mt-3">
          <UserDetailPanel userId={profile.id} />
        </div>
      )}
    </div>
  );
}
