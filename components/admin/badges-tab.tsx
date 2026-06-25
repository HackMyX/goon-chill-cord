"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Crown,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  Check,
  Star,
  Shield,
  Zap,
  Gift,
  Users,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { useSoundManager } from "@/lib/sound-manager";
import {
  getBadgeDefinitions,
  getUserBadges,
  adminGrantBadge,
  adminRevokeBadge,
  adminCreateBadgeDefinition,
  adminUpdateBadgeDefinition,
  adminDeleteBadgeDefinition,
  adminGetAllUserBadges,
} from "@/lib/actions/badges";
import type { BadgeDefinition, UserBadge } from "@/lib/badges";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ProfileRow = {
  id: string;
  username: string;
  role: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function BadgePill({
  badge,
  onRemove,
  removing,
}: {
  badge: BadgeDefinition;
  onRemove?: () => void;
  removing?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium"
      style={{
        background: badge.color + "22",
        borderColor: badge.color + "50",
        color: badge.color,
      }}
    >
      <span>{badge.icon}</span>
      <span>{badge.label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="ml-1 rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100 disabled:opacity-30"
          style={{ color: badge.color }}
        >
          {removing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
        </button>
      )}
    </span>
  );
}

const PRESET_COLORS = [
  "#a855f7",
  "#3b82f6",
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#f97316",
  "#d946ef",
  "#06b6d4",
  "#eab308",
  "#ec4899",
];

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Badge-Definitionen
// ─────────────────────────────────────────────────────────────────────────────

function BadgeDefinitionsSection({
  definitions,
  onRefresh,
}: {
  definitions: BadgeDefinition[];
  onRefresh: () => void;
}) {
  const sound = useSoundManager();

  // Editing state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<BadgeDefinition>>({});
  const [saving, setSaving] = useState(false);

  // Delete state
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Create state
  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    key: "",
    label: "",
    color: "#a855f7",
    icon: "⭐",
    description: "",
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function startEdit(def: BadgeDefinition) {
    sound.click();
    setEditingKey(def.key);
    setEditDraft({
      label: def.label,
      color: def.color,
      icon: def.icon,
      description: def.description ?? "",
    });
    setConfirmDeleteKey(null);
  }

  function cancelEdit() {
    sound.click();
    setEditingKey(null);
    setEditDraft({});
  }

  async function handleSaveEdit(key: string) {
    sound.click();
    setSaving(true);
    const res = await adminUpdateBadgeDefinition(key, {
      label: editDraft.label,
      color: editDraft.color,
      icon: editDraft.icon,
      description: editDraft.description ?? "",
    });
    setSaving(false);
    if (res.success) {
      sound.save();
      setEditingKey(null);
      setEditDraft({});
      onRefresh();
    } else {
      sound.error();
    }
  }

  async function handleDelete(key: string) {
    sound.click();
    setDeleting(true);
    const res = await adminDeleteBadgeDefinition(key);
    setDeleting(false);
    if (res.success) {
      sound.save();
      setConfirmDeleteKey(null);
      onRefresh();
    } else {
      sound.error();
    }
  }

  async function handleCreate() {
    setCreateError(null);
    if (!createDraft.key.trim() || !createDraft.label.trim()) {
      setCreateError("Key und Label sind Pflichtfelder.");
      return;
    }
    sound.click();
    setCreating(true);
    const res = await adminCreateBadgeDefinition({
      key: createDraft.key.trim().toLowerCase().replace(/\s+/g, "-"),
      label: createDraft.label.trim(),
      color: createDraft.color,
      icon: createDraft.icon.trim() || "⭐",
      description: createDraft.description.trim(),
    });
    setCreating(false);
    if (res.success) {
      sound.save();
      setShowCreate(false);
      setCreateDraft({ key: "", label: "", color: "#a855f7", icon: "⭐", description: "" });
      onRefresh();
    } else {
      sound.error();
      setCreateError(res.error ?? "Fehler beim Erstellen.");
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <Crown className="h-4 w-4 text-purple-400" />
          Badge-Definitionen
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-500">
            {definitions.length}
          </span>
        </h3>
        <button
          type="button"
          onClick={() => {
            sound.click();
            setShowCreate((v) => !v);
            setCreateError(null);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors hover:border-purple-400/50 hover:bg-purple-500/20"
        >
          <Plus className="h-3.5 w-3.5" />
          Neues Badge
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-4 rounded-xl border border-purple-400/30 bg-purple-500/5 p-4">
          <p className="mb-3 text-xs font-semibold text-purple-300">Neues Badge erstellen</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Key (Slug) *</label>
              <input
                type="text"
                value={createDraft.key}
                onChange={(e) => setCreateDraft((d) => ({ ...d, key: e.target.value }))}
                placeholder="z.B. og-member"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-purple-400/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Label *</label>
              <input
                type="text"
                value={createDraft.label}
                onChange={(e) => setCreateDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="z.B. OG-Mitglied"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-purple-400/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Icon (Emoji)</label>
              <input
                type="text"
                value={createDraft.icon}
                onChange={(e) => setCreateDraft((d) => ({ ...d, icon: e.target.value }))}
                placeholder="⭐"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-purple-400/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Farbe</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={createDraft.color}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, color: e.target.value }))}
                  className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
                />
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCreateDraft((d) => ({ ...d, color: c }))}
                      className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        background: c,
                        borderColor: createDraft.color === c ? "white" : "transparent",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-zinc-500">Beschreibung</label>
              <input
                type="text"
                value={createDraft.description}
                onChange={(e) => setCreateDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Kurze Beschreibung des Badges..."
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-purple-400/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Preview */}
          {createDraft.label && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-zinc-500">Vorschau:</span>
              <BadgePill
                badge={{
                  key: createDraft.key || "preview",
                  label: createDraft.label || "Label",
                  color: createDraft.color,
                  icon: createDraft.icon || "⭐",
                  description: createDraft.description || null,
                }}
              />
            </div>
          )}

          {createError && (
            <p className="mt-2 text-xs text-red-400">{createError}</p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Erstellen
            </button>
            <button
              type="button"
              onClick={() => { sound.click(); setShowCreate(false); setCreateError(null); }}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-xs text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {definitions.length === 0 && (
          <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-6 text-center text-sm text-zinc-600">
            Keine Badge-Definitionen vorhanden.
          </p>
        )}
        {definitions.map((def) => (
          <CollapsibleAdminRow
            key={def.key}
            header={
              <div className="flex items-center gap-3">
                <BadgePill badge={def} />
                {def.description && (
                  <span className="hidden truncate text-xs text-zinc-500 sm:block">
                    {def.description}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); startEdit(def); }}
                    className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-purple-400/30 hover:text-purple-300"
                  >
                    <Edit2 className="h-3 w-3" />
                    Bearbeiten
                  </button>
                  {confirmDeleteKey === def.key ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs text-red-400">Sicher?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(def.key)}
                        disabled={deleting}
                        className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/20"
                      >
                        {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Ja
                      </button>
                      <button
                        type="button"
                        onClick={() => { sound.click(); setConfirmDeleteKey(null); }}
                        className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        Nein
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); sound.click(); setConfirmDeleteKey(def.key); setEditingKey(null); }}
                      className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-500 transition-colors hover:border-red-500/30 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            }
          >
            {editingKey === def.key && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Label</label>
                    <input
                      type="text"
                      value={editDraft.label ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-purple-400/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Icon (Emoji)</label>
                    <input
                      type="text"
                      value={editDraft.icon ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, icon: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-purple-400/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Farbe</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editDraft.color ?? "#a855f7"}
                        onChange={(e) => setEditDraft((d) => ({ ...d, color: e.target.value }))}
                        className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditDraft((d) => ({ ...d, color: c }))}
                            className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                            style={{
                              background: c,
                              borderColor: editDraft.color === c ? "white" : "transparent",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Beschreibung</label>
                    <input
                      type="text"
                      value={editDraft.description ?? ""}
                      onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-purple-400/50 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Preview */}
                {editDraft.label && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Vorschau:</span>
                    <BadgePill
                      badge={{
                        key: def.key,
                        label: editDraft.label ?? def.label,
                        color: editDraft.color ?? def.color,
                        icon: editDraft.icon ?? def.icon,
                        description: editDraft.description ?? def.description,
                      }}
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(def.key)}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Speichern
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    <X className="h-3.5 w-3.5" />
                    Abbrechen
                  </button>
                </div>
              </div>
            )}
          </CollapsibleAdminRow>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Badges vergeben
// ─────────────────────────────────────────────────────────────────────────────

function BadgesVergabeSection({
  profiles,
  definitions,
}: {
  profiles: ProfileRow[];
  definitions: BadgeDefinition[];
}) {
  const sound = useSoundManager();

  const [search, setSearch] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<ProfileRow | null>(null);
  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [loadingUserBadges, setLoadingUserBadges] = useState(false);
  const [selectedBadgeKey, setSelectedBadgeKey] = useState("");
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null); // badgeKey being revoked
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const filteredProfiles = profiles.filter((p) => {
    const q = search.toLowerCase();
    return p.username.toLowerCase().includes(q);
  });

  async function selectProfile(p: ProfileRow) {
    sound.click();
    setSelectedProfile(p);
    setSearch(p.username);
    setFeedback(null);
    setLoadingUserBadges(true);
    const badges = await getUserBadges(p.id);
    setUserBadges(badges);
    setLoadingUserBadges(false);
  }

  async function handleGrant() {
    if (!selectedProfile || !selectedBadgeKey) return;
    sound.click();
    setGranting(true);
    setFeedback(null);
    const res = await adminGrantBadge(selectedProfile.id, selectedBadgeKey);
    setGranting(false);
    if (res.success) {
      sound.save();
      setFeedback({ type: "ok", msg: "Badge vergeben." });
      const badges = await getUserBadges(selectedProfile.id);
      setUserBadges(badges);
      setSelectedBadgeKey("");
    } else {
      sound.error();
      setFeedback({ type: "err", msg: res.error ?? "Fehler beim Vergeben." });
    }
  }

  async function handleRevoke(badgeKey: string) {
    if (!selectedProfile) return;
    sound.click();
    setRevoking(badgeKey);
    setFeedback(null);
    const res = await adminRevokeBadge(selectedProfile.id, badgeKey);
    setRevoking(null);
    if (res.success) {
      sound.save();
      setFeedback({ type: "ok", msg: "Badge entzogen." });
      setUserBadges((prev) => prev.filter((b) => b.badgeKey !== badgeKey));
    } else {
      sound.error();
      setFeedback({ type: "err", msg: res.error ?? "Fehler beim Entziehen." });
    }
  }

  // Badges the user doesn't have yet
  const grantableBadges = definitions.filter(
    (d) => !userBadges.some((ub) => ub.badgeKey === d.key)
  );

  const showDropdown = search.length > 0 && !selectedProfile && filteredProfiles.length > 0;

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
        <Gift className="h-4 w-4 text-purple-400" />
        Badges vergeben
      </h3>

      {/* User search */}
      <div className="relative mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (selectedProfile && e.target.value !== selectedProfile.username) {
              setSelectedProfile(null);
              setUserBadges([]);
              setFeedback(null);
            }
          }}
          placeholder="Nutzer suchen..."
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-purple-400/50 focus:outline-none"
        />
        {showDropdown && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-[#0e0b18] shadow-xl">
            {filteredProfiles.slice(0, 20).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectProfile(p)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-white/5"
              >
                <span className="font-medium text-white">{p.username}</span>
                <span className="ml-auto text-xs text-zinc-600">{p.role}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedProfile && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-zinc-500" />
            <span className="text-sm font-semibold text-white">{selectedProfile.username}</span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-500">
              {selectedProfile.role}
            </span>
          </div>

          {/* Current badges */}
          <div className="mb-4">
            <p className="mb-2 text-xs text-zinc-500">Aktuelle Badges:</p>
            {loadingUserBadges ? (
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Lade...
              </div>
            ) : userBadges.length === 0 ? (
              <p className="text-xs text-zinc-600">Keine Badges vergeben.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {userBadges.map((ub) => (
                  <BadgePill
                    key={ub.badgeKey}
                    badge={ub.badge}
                    onRemove={() => handleRevoke(ub.badgeKey)}
                    removing={revoking === ub.badgeKey}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Grant new badge */}
          <div className="flex items-center gap-2">
            <select
              value={selectedBadgeKey}
              onChange={(e) => setSelectedBadgeKey(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-[#0e0b18] px-3 py-2 text-sm text-white focus:border-purple-400/50 focus:outline-none"
            >
              <option value="">-- Badge auswählen --</option>
              {grantableBadges.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.icon} {d.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleGrant}
              disabled={!selectedBadgeKey || granting}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
            >
              {granting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Vergeben
            </button>
          </div>

          {feedback && (
            <p
              className={`mt-2 flex items-center gap-1.5 text-xs ${
                feedback.type === "ok" ? "text-green-400" : "text-red-400"
              }`}
            >
              {feedback.type === "ok" ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {feedback.msg}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Alle Badge-Träger
// ─────────────────────────────────────────────────────────────────────────────

function AlleBadgeTraegerSection({
  profiles,
  definitions,
}: {
  profiles: ProfileRow[];
  definitions: BadgeDefinition[];
}) {
  const sound = useSoundManager();
  const [allUserBadges, setAllUserBadges] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedBadge, setExpandedBadge] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await adminGetAllUserBadges();
    setAllUserBadges(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Build a map: badgeKey -> array of userIds
  const badgeToUsers: Record<string, string[]> = {};
  for (const [userId, keys] of Object.entries(allUserBadges)) {
    for (const key of keys) {
      if (!badgeToUsers[key]) badgeToUsers[key] = [];
      badgeToUsers[key].push(userId);
    }
  }

  // Build a profile lookup
  const profileById: Record<string, ProfileRow> = {};
  for (const p of profiles) {
    profileById[p.id] = p;
  }

  // Only show definitions that exist in the db AND in our definitions list
  const badgesWithUsers = definitions.filter((d) => badgeToUsers[d.key]?.length > 0);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <Users className="h-4 w-4 text-purple-400" />
          Alle Badge-Träger
        </h3>
        <button
          type="button"
          onClick={() => { sound.click(); load(); }}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-300 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
          Aktualisieren
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lade Badge-Daten...
        </div>
      ) : badgesWithUsers.length === 0 ? (
        <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-6 text-center text-sm text-zinc-600">
          Noch keine Badges vergeben.
        </p>
      ) : (
        <div className="space-y-2">
          {badgesWithUsers.map((def) => {
            const userIds = badgeToUsers[def.key] ?? [];
            const isExpanded = expandedBadge === def.key;

            return (
              <div
                key={def.key}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-3 transition-all hover:border-purple-400/20"
              >
                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setExpandedBadge(isExpanded ? null : def.key);
                  }}
                  className="flex w-full items-center gap-3"
                >
                  <BadgePill badge={def} />
                  <span className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
                    <Users className="h-3.5 w-3.5" />
                    {userIds.length} Träger
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </span>
                </button>

                {isExpanded && (
                  <div className="mt-3 border-t border-white/5 pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {userIds.map((uid) => {
                        const profile = profileById[uid];
                        return (
                          <span
                            key={uid}
                            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300"
                          >
                            {profile ? profile.username : uid.slice(0, 8) + "…"}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function BadgesTab({ profiles }: { profiles: ProfileRow[] }) {
  const [definitions, setDefinitions] = useState<BadgeDefinition[]>([]);
  const [loadingDefs, setLoadingDefs] = useState(true);

  const loadDefinitions = useCallback(async () => {
    setLoadingDefs(true);
    const defs = await getBadgeDefinitions();
    setDefinitions(defs);
    setLoadingDefs(false);
  }, []);

  useEffect(() => {
    loadDefinitions();
  }, [loadDefinitions]);

  return (
    <div className="space-y-8">
      {loadingDefs ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Badge-Definitionen werden geladen...
        </div>
      ) : (
        <>
          <BadgeDefinitionsSection
            definitions={definitions}
            onRefresh={loadDefinitions}
          />

          <div className="border-t border-white/5" />

          <BadgesVergabeSection profiles={profiles} definitions={definitions} />

          <div className="border-t border-white/5" />

          <AlleBadgeTraegerSection profiles={profiles} definitions={definitions} />
        </>
      )}
    </div>
  );
}
