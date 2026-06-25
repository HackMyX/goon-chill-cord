"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Edit2, Trash2, Zap, Eye, EyeOff, ChevronDown, ChevronUp,
  Save, X, CheckCircle, Gift, Coins, Check, Star, AlertTriangle, Copy, ExternalLink,
} from "lucide-react";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { useSoundManager } from "@/lib/sound-manager";
import {
  adminListBattlePasses, adminCreateBattlePass, adminUpdateBattlePass,
  adminDeleteBattlePass, adminSetPassActive, adminUpsertBpTier,
  type AdminPassInput, type AdminTierInput,
} from "@/lib/actions/battle-pass";
import type { BattlePass, BattlePassTier, BpRewardType } from "@/lib/battle-pass";

const REWARD_ICONS: Record<string, string> = {
  credits: "💰", item: "📦", badge: "🏆",
};

const TIER_EMOJIS = ["🎁","💰","⚡","🔥","🌟","💎","👑","🎯","🎲","🚀","✨","🎪","🌈","💫","🛡️","⚔️","🎭","🎨","🎵","🎮"];

// ── Tier preview track ────────────────────────────────────────────────────────

function TierPreview({ pass }: { pass: BattlePass }) {
  const tierMap = new Map(pass.tiers.map((t) => [t.tierNumber, t]));

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-zinc-100">{pass.name}</h3>
          <p className="text-xs text-zinc-500">{pass.seasonLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">
            {pass.priceCr.toLocaleString("de-DE")} CR
          </span>
          {pass.spinChanceBoost > 0 && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              +{(pass.spinChanceBoost * 100).toFixed(1)}% Spin
            </span>
          )}
        </div>
      </div>
      <div
        className="flex gap-1.5 overflow-x-auto pb-2"
        style={{ scrollbarWidth: "thin" }}
      >
        {Array.from({ length: pass.tierCount }, (_, i) => i + 1).map((n) => {
          const tier = tierMap.get(n);
          return (
            <div
              key={n}
              className={`shrink-0 flex flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 ${
                tier?.isPremium === false
                  ? "border-purple-400/40 bg-purple-500/10"
                  : tier
                    ? "border-amber-400/30 bg-amber-500/10"
                    : "border-white/10 bg-white/[0.02]"
              }`}
              style={{ minWidth: "48px" }}
            >
              <span className="text-[11px] text-zinc-500">{n}</span>
              <span className="text-base leading-none">{tier?.icon ?? "·"}</span>
              {tier && (
                <span className={`text-[8px] font-bold ${tier.isPremium ? "text-amber-400" : "text-purple-300"}`}>
                  {tier.isPremium ? "PRO" : "FREE"}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-4 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded border border-purple-400/40 bg-purple-500/10" />
          Kostenlos
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded border border-amber-400/30 bg-amber-500/10" />
          Premium
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded border border-white/10 bg-white/[0.02]" />
          Nicht konfiguriert
        </span>
      </div>
    </div>
  );
}

// ── Tier editor modal ─────────────────────────────────────────────────────────

function TierEditorModal({
  passId,
  tierNumber,
  existing,
  onClose,
  onSaved,
}: {
  passId: string;
  tierNumber: number;
  existing: BattlePassTier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? `Tier ${tierNumber}`);
  const [icon, setIcon] = useState(existing?.icon ?? "🎁");
  const [isPremium, setIsPremium] = useState(existing?.isPremium ?? true);
  const [rewardType, setRewardType] = useState<BpRewardType>(existing?.rewardType ?? "credits");
  const [rewardCredits, setRewardCredits] = useState(existing?.rewardCredits ?? 100);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();

  async function handleSave() {
    setSaving(true);
    setError(null);
    const input: AdminTierInput = {
      tierNumber,
      name: name.trim() || `Tier ${tierNumber}`,
      isPremium,
      rewardType,
      rewardCredits: rewardType === "credits" ? rewardCredits : null,
      icon: icon.trim() || "🎁",
    };
    const res = await adminUpsertBpTier(passId, input);
    setSaving(false);
    if (res.success) {
      sound.save();
      onSaved();
      onClose();
    } else {
      sound.error();
      setError(res.error ?? "Fehler");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0e0b18] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-zinc-100">Tier {tierNumber} bearbeiten</h3>
          <button onClick={onClose} className="rounded-full p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Icon (Emoji)
            <div className="flex gap-2">
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-20 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xl outline-none focus:border-purple-400/60"
                maxLength={4}
              />
              <div className="flex flex-wrap gap-1">
                {TIER_EMOJIS.slice(0, 10).map((e) => (
                  <button
                    key={e}
                    onClick={() => setIcon(e)}
                    className={`rounded border px-1.5 py-1 text-sm transition-colors ${icon === e ? "border-purple-400/60 bg-purple-500/20" : "border-white/10 hover:border-white/30"}`}
                  >{e}</button>
                ))}
              </div>
            </div>
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => setIsPremium(false)}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${!isPremium ? "border-purple-400/60 bg-purple-500/20 text-purple-200" : "border-white/10 text-zinc-400 hover:border-white/30"}`}
            >
              Kostenlos (Alle)
            </button>
            <button
              onClick={() => setIsPremium(true)}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${isPremium ? "border-amber-400/60 bg-amber-500/20 text-amber-200" : "border-white/10 text-zinc-400 hover:border-white/30"}`}
            >
              Premium
            </button>
          </div>

          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Belohnungstyp
            <select
              value={rewardType}
              onChange={(e) => setRewardType(e.target.value as BpRewardType)}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            >
              <option value="credits">Credits</option>
              <option value="item">Item (geplant)</option>
              <option value="badge">Badge (geplant)</option>
            </select>
          </label>

          {rewardType === "credits" && (
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Credits-Betrag
              <input
                type="number"
                value={rewardCredits}
                onChange={(e) => setRewardCredits(Number(e.target.value) || 0)}
                min={1}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-zinc-400 hover:border-white/30 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? "…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pass editor ───────────────────────────────────────────────────────────────

function PassEditor({
  pass,
  onSaved,
  onDelete,
}: {
  pass: BattlePass;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(pass.name);
  const [seasonLabel, setSeasonLabel] = useState(pass.seasonLabel);
  const [description, setDescription] = useState(pass.description ?? "");
  const [priceCr, setPriceCr] = useState(pass.priceCr);
  const [enabled, setEnabled] = useState(pass.enabled);
  const [startDate, setStartDate] = useState(pass.startDate ?? "");
  const [endDate, setEndDate] = useState(pass.endDate ?? "");
  const [tierCount, setTierCount] = useState(pass.tierCount);
  const [spinBoost, setSpinBoost] = useState(pass.spinChanceBoost);
  const [bannerColor, setBannerColor] = useState(pass.bannerColor);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saved">("idle");
  const [activating, setActivating] = useState(false);
  const [editingTier, setEditingTier] = useState<{ num: number; existing: BattlePassTier | null } | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const sound = useSoundManager();
  const router = useRouter();

  async function handleSave() {
    setSaving(true);
    setError(null);
    const input: AdminPassInput = {
      name: name.trim(),
      seasonLabel: seasonLabel.trim(),
      description,
      priceCr,
      enabled,
      startDate: startDate || null,
      endDate: endDate || null,
      tierCount,
      spinChanceBoost: spinBoost,
      bannerColor,
    };
    const res = await adminUpdateBattlePass(pass.id, input);
    setSaving(false);
    if (res.success) {
      sound.save();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
      onSaved();
      router.refresh();
    } else {
      sound.error();
      setError(res.error ?? "Fehler");
    }
  }

  async function handleToggleActive() {
    setActivating(true);
    const res = await adminSetPassActive(pass.id, !pass.isActive);
    setActivating(false);
    if (res.success) {
      sound.save();
      onSaved();
      router.refresh();
    } else {
      sound.error();
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 4000);
      return;
    }
    setDeleting(true);
    const res = await adminDeleteBattlePass(pass.id);
    setDeleting(false);
    if (res.success) {
      sound.save();
      onDelete();
      router.refresh();
    } else {
      sound.error();
    }
  }

  const tierMap = new Map(pass.tiers.map((t) => [t.tierNumber, t]));

  return (
    <div className="space-y-4">
      {/* Pass header info */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Pass-Name
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Season-Label (z.B. "Woche 3")
          <input value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Preis (CR)
          <input type="number" value={priceCr} onChange={(e) => setPriceCr(Number(e.target.value) || 0)} min={0}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Tiers (1–30)
          <input type="number" value={tierCount} onChange={(e) => setTierCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} min={1} max={30}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Startdatum
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Enddatum
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Spin-Boost (0.0–0.5)
          <div className="flex items-center gap-2">
            <input type="number" value={spinBoost} step={0.005} min={0} max={0.5}
              onChange={(e) => setSpinBoost(Math.min(0.5, Math.max(0, Number(e.target.value))))}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
            <span className="shrink-0 text-xs text-emerald-400">+{(spinBoost * 100).toFixed(1)}%</span>
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Banner-Farbe
          <div className="flex items-center gap-2">
            <input type="color" value={bannerColor} onChange={(e) => setBannerColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded-lg border border-white/10 bg-black/30 p-1" />
            <span className="text-sm text-zinc-300">{bannerColor}</span>
          </div>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Beschreibung
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60 resize-none" />
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setEnabled((e) => !e)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
            enabled ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200" : "border-white/10 text-zinc-400 hover:border-white/30"
          }`}
        >
          {enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {enabled ? "Sichtbar" : "Versteckt"}
        </button>

        <button
          onClick={handleToggleActive}
          disabled={activating}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
            pass.isActive
              ? "border-purple-400/70 bg-purple-500/20 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.3)]"
              : "border-white/10 text-zinc-400 hover:border-purple-400/40 hover:text-purple-300"
          }`}
        >
          <Zap className="h-4 w-4" />
          {activating ? "…" : pass.isActive ? "Aktiver Pass" : "Aktivieren"}
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors shadow-[0_0_10px_rgba(147,51,234,0.4)]"
        >
          <Save className="h-4 w-4" />
          {saving ? "…" : "Speichern"}
        </button>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
            deleteConfirm ? "border-red-400/70 bg-red-500/20 text-red-200" : "border-red-500/30 text-red-400 hover:border-red-400/60"
          }`}
        >
          <Trash2 className="h-4 w-4" />
          {deleting ? "…" : deleteConfirm ? "Sicher?" : "Löschen"}
        </button>

        {status === "saved" && <span className="text-sm font-semibold text-emerald-400">✓ Gespeichert</span>}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>

      {/* Tier preview */}
      <div>
        <button
          className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
          onClick={() => setShowPreview((p) => !p)}
        >
          {showPreview ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Pass-Vorschau
        </button>
        {showPreview && <TierPreview pass={pass} />}
      </div>

      {/* Tier grid editor */}
      <div>
        <p className="mb-2 text-xs font-semibold text-zinc-400">Tiers bearbeiten — klicke einen Tier an</p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: tierCount }, (_, i) => i + 1).map((n) => {
            const tier = tierMap.get(n);
            return (
              <button
                key={n}
                onClick={() => setEditingTier({ num: n, existing: tier ?? null })}
                className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-center transition-all hover:scale-105 ${
                  tier?.isPremium === false
                    ? "border-purple-400/40 bg-purple-500/10 hover:border-purple-400/70"
                    : tier
                      ? "border-amber-400/30 bg-amber-500/10 hover:border-amber-400/60"
                      : "border-white/10 bg-white/[0.02] hover:border-white/30"
                }`}
                style={{ minWidth: "48px" }}
              >
                <span className="text-[9px] text-zinc-500">{n}</span>
                <span className="text-base leading-none">{tier?.icon ?? "+"}</span>
                {tier && (
                  <span className={`text-[8px] font-bold ${tier.isPremium ? "text-amber-400" : "text-purple-300"}`}>
                    {tier.isPremium ? "PRO" : "FREE"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {editingTier && (
        <TierEditorModal
          passId={pass.id}
          tierNumber={editingTier.num}
          existing={editingTier.existing}
          onClose={() => setEditingTier(null)}
          onSaved={() => { onSaved(); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ── Create form ───────────────────────────────────────────────────────────────

function CreatePassForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("Battle Pass");
  const [seasonLabel, setSeasonLabel] = useState("Season 1");
  const [priceCr, setPriceCr] = useState(2000);
  const [tierCount, setTierCount] = useState(20);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();
  const router = useRouter();

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    const res = await adminCreateBattlePass({
      name,
      seasonLabel,
      description: "",
      priceCr,
      enabled: true,
      startDate: null,
      endDate: null,
      tierCount,
      spinChanceBoost: 0.02,
      bannerColor: "#7c3aed",
    });
    setCreating(false);
    if (res.success) {
      sound.save();
      onCreated();
      router.refresh();
    } else {
      sound.error();
      setError(res.error ?? "Fehler");
    }
  }

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] p-4">
      <h3 className="mb-3 text-sm font-bold text-zinc-200">Neuen Battle Pass erstellen</h3>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Season-Label
          <input value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Preis (CR)
          <input type="number" value={priceCr} onChange={(e) => setPriceCr(Number(e.target.value) || 0)} min={0}
            className="w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Anzahl Tiers
          <input type="number" value={tierCount} onChange={(e) => setTierCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} min={1} max={30}
            className="w-24 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <div className="flex items-end">
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors shadow-[0_0_10px_rgba(147,51,234,0.4)]"
          >
            <Plus className="h-4 w-4" />
            {creating ? "Erstelle…" : "Erstellen"}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

const MIGRATION_SQL = `-- In Supabase SQL Editor ausführen:

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS don_upgrade_tier integer NOT NULL DEFAULT 0;

ALTER TABLE don_config
  ADD COLUMN IF NOT EXISTS upgrade_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upgrade_tiers jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS battle_passes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  season_label text NOT NULL DEFAULT 'Pass',
  description text,
  price_cr integer NOT NULL DEFAULT 2000,
  enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT false,
  start_date date, end_date date,
  tier_count integer NOT NULL DEFAULT 20,
  spin_chance_boost numeric(4,3) NOT NULL DEFAULT 0.020,
  banner_color text NOT NULL DEFAULT '#7c3aed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS battle_pass_tiers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  pass_id text NOT NULL REFERENCES battle_passes(id) ON DELETE CASCADE,
  tier_number integer NOT NULL,
  name text NOT NULL DEFAULT 'Belohnung',
  is_premium boolean NOT NULL DEFAULT true,
  reward_type text NOT NULL DEFAULT 'credits',
  reward_credits integer DEFAULT 100,
  reward_item_id text, reward_badge_key text,
  icon text NOT NULL DEFAULT '🎁',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pass_id, tier_number)
);

CREATE TABLE IF NOT EXISTS user_battle_passes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL,
  pass_id text NOT NULL REFERENCES battle_passes(id) ON DELETE CASCADE,
  has_premium boolean NOT NULL DEFAULT false,
  progress_days integer NOT NULL DEFAULT 0,
  purchased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, pass_id)
);

CREATE TABLE IF NOT EXISTS user_bp_tier_claims (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL,
  pass_id text NOT NULL,
  tier_id text NOT NULL REFERENCES battle_pass_tiers(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tier_id)
);

CREATE INDEX IF NOT EXISTS idx_ubp_user ON user_battle_passes(user_id);
CREATE INDEX IF NOT EXISTS idx_ubp_pass ON user_battle_passes(pass_id);
CREATE INDEX IF NOT EXISTS idx_ubtc_user ON user_bp_tier_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_bpt_pass_num ON battle_pass_tiers(pass_id, tier_number);

ALTER TABLE battle_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_pass_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_battle_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bp_tier_claims ENABLE ROW LEVEL SECURITY;`;

function MigrationBanner() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(MIGRATION_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.07] p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-200 mb-1">Datenbank-Migration erforderlich</p>
          <p className="text-xs text-amber-400/80 mb-3">
            Die Battle-Pass-Tabellen existieren noch nicht in deiner Supabase-Datenbank.
            Führe die SQL-Migration aus, bevor du Pässe erstellen kannst.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Kopiert!" : "SQL kopieren"}
            </button>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:border-white/30 hover:text-zinc-200 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Supabase SQL-Editor öffnen
            </a>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-amber-400/60 hover:text-amber-400 transition-colors">SQL anzeigen</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/40 p-3 text-[10px] leading-relaxed text-zinc-400 whitespace-pre-wrap">{MIGRATION_SQL}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}

export function BattlePassTab({ initialPasses, migrationNeeded = false }: { initialPasses: BattlePass[]; migrationNeeded?: boolean }) {
  const [passes, setPasses] = useState(initialPasses);
  const [showMigration, setShowMigration] = useState(migrationNeeded);
  const sound = useSoundManager();
  const router = useRouter();

  const reload = useCallback(async () => {
    const fresh = await adminListBattlePasses();
    setPasses(fresh);
  }, []);

  const activePass = passes.find((p) => p.isActive);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="mb-1 text-base font-bold text-zinc-100">Battle Pass System</h2>
        <p className="text-xs text-zinc-500">
          Erstelle wöchentliche oder saisonale Pässe mit Tier-Belohnungen. Premium-Käufer schalten alle Tiers
          frei und erhalten einen Spin-Bonus. Nur ein Pass kann gleichzeitig aktiv sein.
        </p>
      </div>

      {showMigration && <MigrationBanner />}

      {activePass && (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/[0.06] p-4">
          <div className="mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-bold text-purple-200">Aktiver Pass: {activePass.name}</span>
            <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">
              {activePass.seasonLabel}
            </span>
          </div>
          <TierPreview pass={activePass} />
        </div>
      )}

      <CreatePassForm onCreated={reload} />

      {passes.length === 0 ? (
        <p className="rounded-xl border border-white/10 px-4 py-6 text-center text-sm text-zinc-500">
          Noch keine Battle Pässe erstellt.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {passes.map((pass) => (
            <CollapsibleAdminRow
              key={pass.id}
              header={
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    {pass.isActive && (
                      <span className="h-2 w-2 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.8)]" />
                    )}
                    <span className="font-semibold text-zinc-100">{pass.name}</span>
                    <span className="text-xs text-zinc-500">{pass.seasonLabel}</span>
                  </div>
                  <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                    {pass.priceCr.toLocaleString("de-DE")} CR
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
                    {pass.tiers.length}/{pass.tierCount} Tiers
                  </span>
                  {pass.isActive ? (
                    <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">AKTIV</span>
                  ) : !pass.enabled ? (
                    <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-[10px] text-zinc-500">AUS</span>
                  ) : null}
                </div>
              }
            >
              <PassEditor
                pass={pass}
                onSaved={reload}
                onDelete={reload}
              />
            </CollapsibleAdminRow>
          ))}
        </div>
      )}
    </div>
  );
}
