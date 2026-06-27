"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Save, Plus, Trash2, ChevronUp, ChevronDown, Info, Search, X,
  Star, Settings, Package, Wand2, ArrowUpDown, AlertTriangle, Eye, Gift,
} from "lucide-react";
import { updateCaseTier, type UpdateCaseTierInput } from "@/lib/actions/admin";
import {
  createCaseGroup, updateCaseGroup, deleteCaseGroup, reorderCaseGroups,
  createCaseTier, deleteCaseTier, type CreateCaseGroupInput,
} from "@/lib/actions/cases-admin";
import {
  RARITY_LABELS, RARITY_ORDER, RARITY_STYLES, ALL_ITEM_TYPES,
  CASE_ICON_OPTIONS, normalizeExtraDrops,
  type Rarity, type CaseIconName, type CaseExtraDrop, type CaseExtraDropKind,
} from "@/lib/cases";
import { getCaseIcon } from "@/lib/case-icons";
import { NAME_STYLES } from "@/lib/name-styles";
import { ALL_BADGE_KEYS, getBadgeStyle } from "@/lib/badges";
import { getAllAbilityDefinitions } from "@/lib/actions/abilities";
import { UniversalPreviewModal, type PreviewSubject } from "@/components/ui/universal-preview-modal";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { RARITY_HEX } from "@/lib/rarity-colors";
import type { CaseTierRow, CaseGroupRow, ItemRow } from "@/components/admin/admin-shell";

/** Lightweight ability catalog entry used by the extra-drop picker. */
export interface AbilityLite { key: string; name: string; icon: string; rarity: string }

// ─── helpers ──────────────────────────────────────────────────────────────────

const RARITY_DOT: Record<Rarity, string> = {
  normal: "bg-blue-400", selten: "bg-purple-400",
  mythisch: "bg-amber-400", ultra: "bg-fuchsia-400",
};

function Hint({ text }: { text: string }) {
  return (
    <span className="mt-0.5 text-[10px] leading-snug text-zinc-600" title={text}>
      <Info className="mr-0.5 inline-block h-3 w-3 align-text-bottom" />
      {text}
    </span>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-blue-400/20 bg-blue-500/5 px-3 py-2 text-[11px] leading-relaxed text-blue-200/80">
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-400/60" />
      <div>{children}</div>
    </div>
  );
}

// ─── Extra (non-item) drops ─────────────────────────────────────────────────────

const EXTRA_KIND_OPTIONS: { value: CaseExtraDropKind; label: string }[] = [
  { value: "credits", label: "Credits" },
  { value: "name_style", label: "Name-Style" },
  { value: "ability", label: "Fähigkeit" },
  { value: "badge", label: "Badge" },
];
const EXTRA_KIND_LABEL: Record<CaseExtraDropKind, string> = {
  credits: "Credits", name_style: "Name-Style", ability: "Fähigkeit", badge: "Badge",
};

const NAME_STYLE_OPTIONS = Object.values(NAME_STYLES)
  .map((s) => ({ key: s.key, label: s.label, rarity: s.rarity }))
  .sort((a, b) => a.label.localeCompare(b.label));

function extraDropToSubject(d: CaseExtraDrop, abilities: AbilityLite[]): PreviewSubject {
  switch (d.kind) {
    case "credits":    return { kind: "credits", amount: d.amount ?? 0 };
    case "name_style": return { kind: "name_style", styleKey: d.styleKey ?? "default" };
    case "ability": {
      const a = abilities.find((x) => x.key === d.abilityKey);
      return { kind: "ability", abilityKey: d.abilityKey ?? "", name: d.label || a?.name || d.abilityKey || "Fähigkeit", icon: a?.icon, rarity: d.rarity };
    }
    case "badge":      return { kind: "badge", badgeKey: d.badgeKey ?? "", badgeText: d.badgeText || d.badgeKey || "" };
  }
}

function extraDropDisplay(d: CaseExtraDrop, abilities: AbilityLite[]): string {
  if (d.label) return d.label;
  switch (d.kind) {
    case "credits":    return `${(d.amount ?? 0).toLocaleString("de-DE")} Credits`;
    case "name_style": return NAME_STYLES[d.styleKey ?? ""]?.label ?? d.styleKey ?? "Name-Style";
    case "ability":    return abilities.find((a) => a.key === d.abilityKey)?.name ?? d.abilityKey ?? "Fähigkeit";
    case "badge":      return d.badgeText || d.badgeKey || "Badge";
  }
}

function newDropId(): string {
  try { return crypto.randomUUID(); } catch { return `drop-${Date.now()}-${Math.floor(Math.random() * 1e6)}`; }
}

function ExtraDropsEditor({
  drops, setDrops, abilities,
}: {
  drops: CaseExtraDrop[];
  setDrops: (d: CaseExtraDrop[]) => void;
  abilities: AbilityLite[];
}) {
  const sound = useSoundManager();
  const [kind, setKind] = useState<CaseExtraDropKind>("credits");
  const [rarity, setRarity] = useState<Rarity>("selten");
  const [weight, setWeight] = useState(1);
  const [amount, setAmount] = useState(50000);
  const [styleKey, setStyleKey] = useState(NAME_STYLE_OPTIONS[0]?.key ?? "default");
  const [abilityKey, setAbilityKey] = useState("");
  const [badgeKey, setBadgeKey] = useState(ALL_BADGE_KEYS[0] ?? "");
  const [badgeText, setBadgeText] = useState("");
  const [label, setLabel] = useState("");
  const [preview, setPreview] = useState<PreviewSubject | null>(null);

  function addDrop() {
    const base: CaseExtraDrop = { id: newDropId(), kind, rarity, weight: Math.max(1, weight) };
    if (label.trim()) base.label = label.trim();
    if (kind === "credits") {
      if (amount <= 0) return;
      base.amount = Math.round(amount);
    } else if (kind === "name_style") {
      if (!styleKey) return;
      base.styleKey = styleKey;
    } else if (kind === "ability") {
      if (!abilityKey) return;
      base.abilityKey = abilityKey;
    } else if (kind === "badge") {
      if (!badgeKey) return;
      base.badgeKey = badgeKey;
      if (badgeText.trim()) base.badgeText = badgeText.trim();
    }
    setDrops([...drops, base]);
    setLabel("");
    sound.click();
  }

  function removeDrop(id: string) {
    setDrops(drops.filter((d) => d.id !== id));
    sound.click();
  }

  function setDropWeight(id: string, w: number) {
    setDrops(drops.map((d) => (d.id === id ? { ...d, weight: Math.max(1, w) } : d)));
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-[11px] font-semibold tracking-wide text-zinc-400">
          <Gift className="mr-1 inline-block h-3.5 w-3.5 text-fuchsia-400" />
          EXTRA-DROPS — Nicht-Item-Belohnungen (Credits, Name-Styles, Fähigkeiten, Badges)
        </p>
        <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-300">Neu</span>
      </div>
      <InfoBox>
        Extra-Drops mischen sich in den passenden <strong>Rarität-Topf</strong>. Das <strong>Gewicht</strong> ist die
        Anzahl „Lose": jedes Pool-Item zählt als 1 Los. Gewicht 1 = gleiche Chance wie ein einzelnes Item dieser
        Rarität; höheres Gewicht = häufiger. Die Rarität-Chance selbst steuerst du oben unter CHANCEN. Klicke auf
        das Auge für eine 3D-/Hero-Vorschau.
      </InfoBox>

      {/* Existing drops */}
      {drops.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {drops.map((d) => {
            const hex = RARITY_HEX[d.rarity];
            return (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5"
              >
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ borderColor: `${hex}55`, color: hex }}>
                  {EXTRA_KIND_LABEL[d.kind]}
                </span>
                <span className="flex-1 truncate text-xs text-zinc-200">{extraDropDisplay(d, abilities)}</span>
                <span className="text-[10px] font-semibold" style={{ color: hex }}>{RARITY_LABELS[d.rarity]}</span>
                <label className="flex items-center gap-1 text-[10px] text-zinc-500" title="Gewicht (Lose im Rarität-Topf)">
                  ×
                  <input
                    type="number"
                    min={1}
                    value={d.weight}
                    onChange={(e) => setDropWeight(d.id, Number(e.target.value) || 1)}
                    className="w-12 rounded border border-white/10 bg-black/30 px-1 py-0.5 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60"
                  />
                </label>
                <button
                  onMouseEnter={sound.hover}
                  onClick={() => { sound.click(); setPreview(extraDropToSubject(d, abilities)); }}
                  className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:text-fuchsia-300"
                  title="3D-/Hero-Vorschau"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <button
                  onMouseEnter={sound.hover}
                  onClick={() => removeDrop(d.id)}
                  className="flex h-6 w-6 items-center justify-center rounded text-zinc-600 hover:text-red-400"
                  title="Entfernen"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add new drop */}
      <div className="mt-3 rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
            Typ
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as CaseExtraDropKind)}
              className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60"
            >
              {EXTRA_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
            Rarität-Topf
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value as Rarity)}
              className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60"
            >
              {RARITY_ORDER.map((r) => <option key={r} value={r}>{RARITY_LABELS[r]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-zinc-400" title="Lose im Rarität-Topf (Item = 1 Los)">
            Gewicht
            <input
              type="number"
              min={1}
              value={weight}
              onChange={(e) => setWeight(Math.max(1, Number(e.target.value) || 1))}
              className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60"
            />
          </label>

          {/* Kind-specific target */}
          {kind === "credits" && (
            <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
              Betrag
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-amber-400/60"
              />
            </label>
          )}
          {kind === "name_style" && (
            <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
              Name-Style
              <select
                value={styleKey}
                onChange={(e) => setStyleKey(e.target.value)}
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60"
              >
                {NAME_STYLE_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label} ({RARITY_LABELS[s.rarity as Rarity] ?? s.rarity})</option>)}
              </select>
            </label>
          )}
          {kind === "ability" && (
            <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
              Fähigkeit
              <select
                value={abilityKey}
                onChange={(e) => setAbilityKey(e.target.value)}
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60"
              >
                <option value="">— wählen —</option>
                {abilities.map((a) => <option key={a.key} value={a.key}>{a.icon} {a.name}</option>)}
              </select>
            </label>
          )}
          {kind === "badge" && (
            <>
              <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                Badge
                <select
                  value={badgeKey}
                  onChange={(e) => setBadgeKey(e.target.value)}
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60"
                >
                  {ALL_BADGE_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                Badge-Text (optional)
                <input
                  type="text"
                  value={badgeText}
                  onChange={(e) => setBadgeText(e.target.value)}
                  placeholder="Anzeigetext"
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60"
                />
              </label>
            </>
          )}

          <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
            Anzeige-Name (optional)
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="leer = automatisch"
              className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60"
            />
          </label>
        </div>
        <button
          onMouseEnter={sound.hover}
          onClick={addDrop}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-200 transition-colors hover:bg-fuchsia-500/25"
        >
          <Plus className="h-3.5 w-3.5" /> Extra-Drop hinzufügen
        </button>
      </div>

      {preview && <UniversalPreviewModal subject={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ─── Per-rarity item picker ────────────────────────────────────────────────────

interface RarityItemPickerProps {
  rarity: Rarity;
  enabled: boolean;
  selectedIds: string[];
  allItems: ItemRow[];
  activeTypes: string[];
  onToggle: (id: string) => void;
  onClearAll: () => void;
}

function RarityItemPicker({
  rarity, enabled, selectedIds, allItems, activeTypes, onToggle, onClearAll,
}: RarityItemPickerProps) {
  const [search, setSearch] = useState("");
  const [showSelected, setShowSelected] = useState(false);
  const sound = useSoundManager();
  const rs = RARITY_STYLES[rarity];

  // Items of this rarity that match the active type filter
  const basePool = allItems.filter(
    (it) => it.rarity === rarity && (activeTypes.length === 0 || activeTypes.includes(it.type))
  );
  const filtered = basePool.filter((it) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return it.name.toLowerCase().includes(q) || it.type.toLowerCase().includes(q);
  }).filter((it) => !showSelected || selectedIds.includes(it.id));

  if (!enabled) return null;

  return (
    <div className={`rounded-lg border ${rs.border} bg-black/20 p-3`}>
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-xs font-bold ${rs.text}`}>
          {RARITY_LABELS[rarity]} — Item-Auswahl
          <span className="ml-2 text-zinc-500 font-normal">
            {selectedIds.length > 0 ? `${selectedIds.length} von ${basePool.length} ausgewählt` : `${basePool.length} Items im Pool`}
          </span>
        </p>
        {selectedIds.length > 0 && (
          <button
            onClick={() => { sound.click(); onClearAll(); }}
            className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-red-400"
          >
            <X className="h-3 w-3" /> Alle abwählen
          </button>
        )}
      </div>
      <p className="mb-2 text-[10px] text-zinc-500">
        {selectedIds.length > 0
          ? "Nur diese Items droppen für diese Seltenheit. Haken entfernen → wieder Pool nutzen."
          : "Aktuell: gesamter Typ-Pool wird genutzt. Items auswählen, um nur bestimmte Items zu erlauben."}
      </p>
      <div className="mb-1.5 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${RARITY_LABELS[rarity]}-Items suchen…`}
            className="w-full rounded-md border border-white/10 bg-black/30 py-1 pl-6 pr-2 text-[11px] text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </div>
        {selectedIds.length > 0 && (
          <button
            onClick={() => { sound.click(); setShowSelected((v) => !v); }}
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
              showSelected ? `${rs.bg} ${rs.border} ${rs.text}` : "border-white/10 text-zinc-500"
            }`}
          >
            Nur Ausgewählte
          </button>
        )}
      </div>
      <div className="max-h-40 overflow-y-auto rounded-md border border-white/5 bg-black/20">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-zinc-600">
            {basePool.length === 0 ? "Keine Items für diese Seltenheit + Typ-Filter." : "Keine Ergebnisse."}
          </p>
        ) : (
          filtered.map((item) => {
            const sel = selectedIds.includes(item.id);
            return (
              <button
                key={item.id}
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); onToggle(item.id); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors ${
                  sel ? `${rs.bg} ${rs.text}` : "text-zinc-400 hover:bg-white/5"
                }`}
              >
                <span className={`h-2 w-2 flex-shrink-0 rounded-full border ${sel ? `${RARITY_DOT[rarity]} border-transparent` : "border-zinc-700"}`} />
                <span className="flex-1 truncate">{item.name}</span>
                <span className="text-zinc-600">{item.type}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Tier editor ──────────────────────────────────────────────────────────────

interface TierEditorProps {
  tier: CaseTierRow;
  items: ItemRow[];
  groupItemTypes: string[];
  isStandard: boolean;
  isCustomGroup: boolean;
  abilities: AbilityLite[];
  onDeleted?: () => void;
}

function TierEditor({ tier, items, groupItemTypes, isStandard, isCustomGroup, abilities, onDeleted }: TierEditorProps) {
  const [price, setPrice] = useState(tier.price);
  const [weights, setWeights] = useState<Partial<Record<Rarity, number>>>(tier.rarity_weights);
  const [enabled, setEnabled] = useState(tier.enabled);
  const [itemTypes, setItemTypes] = useState<string[]>(tier.item_types ?? groupItemTypes);
  const [itemIds, setItemIds] = useState<string[]>(tier.item_ids ?? []);
  const [perRarityIds, setPerRarityIds] = useState<Partial<Record<Rarity, string[]>>>(
    () => {
      const raw = tier.per_rarity_item_ids as Partial<Record<Rarity, string[] | null>> | null;
      if (!raw) return {};
      const out: Partial<Record<Rarity, string[]>> = {};
      for (const r of RARITY_ORDER) {
        const v = raw[r];
        if (Array.isArray(v) && v.length > 0) out[r] = v;
      }
      return out;
    }
  );
  const [groupLabel, setGroupLabel] = useState(tier.group_label ?? "");
  const [groupSubtitle, setGroupSubtitle] = useState(tier.group_subtitle ?? "");
  const [tierSublabel, setTierSublabel] = useState(tier.tier_sublabel ?? "");
  const [previewCost, setPreviewCost] = useState(tier.preview_cost ?? 0);
  const [multiOpenMax, setMultiOpenMax] = useState(tier.multi_open_max ?? 10);
  const [nameStylesEligible, setNameStylesEligible] = useState(tier.name_styles_eligible ?? false);
  const [extraDrops, setExtraDrops] = useState<CaseExtraDrop[]>(() => normalizeExtraDrops(tier.extra_drops));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [deleting, setDeleting] = useState(false);
  const [, startTransition] = useTransition();
  const sound = useSoundManager();
  const { currencyName } = useSiteConfig();

  function toggleType(type: string) {
    setItemTypes((curr) => curr.includes(type) ? curr.filter((t) => t !== type) : [...curr, type]);
  }

  function togglePerRarityId(rarity: Rarity, id: string) {
    setPerRarityIds((prev) => {
      const curr = prev[rarity] ?? [];
      return {
        ...prev,
        [rarity]: curr.includes(id) ? curr.filter((i) => i !== id) : [...curr, id],
      };
    });
  }

  function clearPerRarityIds(rarity: Rarity) {
    setPerRarityIds((prev) => ({ ...prev, [rarity]: [] }));
  }

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    const perRarityPayload: Partial<Record<Rarity, string[] | null>> = {};
    for (const r of RARITY_ORDER) {
      const ids = perRarityIds[r];
      perRarityPayload[r] = ids && ids.length > 0 ? ids : null;
    }
    const input: UpdateCaseTierInput = {
      tierId: tier.id,
      price,
      rarityWeights: weights,
      enabled,
      itemTypes,
      itemIds: itemIds.length > 0 ? itemIds : null,
      perRarityItemIds: perRarityPayload,
      groupLabel: isStandard ? (groupLabel.trim() || null) : null,
      groupSubtitle: isStandard ? (groupSubtitle.trim() || null) : null,
      tierSublabel: tierSublabel.trim() || null,
      previewCost: Math.max(0, previewCost),
      multiOpenMax: Math.min(10, Math.max(2, multiOpenMax)),
      nameStylesEligible,
      extraDrops,
    };
    const res = await updateCaseTier(input);
    setSaving(false);
    setStatus(res.success ? "saved" : "error");
    if (res.success) sound.save();
    else sound.error();
  }

  async function handleDelete() {
    if (!confirm(`Tier "${tier.label}" (${tier.id}) wirklich löschen?`)) return;
    setDeleting(true);
    const res = await deleteCaseTier(tier.id);
    if (res.success) {
      onDeleted?.();
    } else {
      alert(res.error ?? "Fehler beim Löschen.");
    }
    setDeleting(false);
  }

  const totalWeight = Object.values(weights).reduce((s, v) => s + (v ?? 0), 0);
  const weightOk = Math.abs(totalWeight - 100) < 0.5;

  return (
    <CollapsibleAdminRow
      header={
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[150px]">
            <p className="font-semibold text-zinc-100">{tier.label}</p>
            <p className="text-[10px] text-zinc-500">{tier.id}</p>
          </div>
          <button
            onMouseEnter={sound.hover}
            onClick={(e) => { e.stopPropagation(); sound.click(); setEnabled((v) => !v); }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              enabled ? "border-emerald-400/50 text-emerald-300" : "border-red-400/50 text-red-300"
            }`}
          >
            {enabled ? "Aktiv" : "Deaktiviert"}
          </button>
          {nameStylesEligible && (
            <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-300">
              <Wand2 className="mr-1 inline-block h-3 w-3" />Name-Styles
            </span>
          )}
          <button
            onMouseEnter={sound.hover}
            onClick={(e) => { e.stopPropagation(); handleSave(); }}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.4)] transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "…" : "Speichern"}
          </button>
          {status === "saved" && <span className="text-xs font-medium text-emerald-400">Gespeichert.</span>}
          {status === "error" && <span className="text-xs font-medium text-red-400">Fehler.</span>}
          {!isStandard && isCustomGroup && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              disabled={deleting}
              className="ml-auto flex items-center gap-1 text-[11px] text-zinc-600 hover:text-red-400"
            >
              <Trash2 className="h-3 w-3" />
              {deleting ? "…" : "Tier löschen"}
            </button>
          )}
        </div>
      }
    >
      <div onClick={(e) => e.stopPropagation()} className="space-y-5">
        {/* Group title/subtitle — only on the standard tier */}
        {isStandard && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-zinc-400">
              GRUPPEN-ANZEIGE — sichtbarer Name auf der Cases-Seite
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Gruppen-Titel (leer = Standard)
                <input
                  type="text"
                  value={groupLabel}
                  onChange={(e) => setGroupLabel(e.target.value)}
                  placeholder="z.B. Cosmetics Case"
                  className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Gruppen-Untertitel (leer = kein)
                <input
                  type="text"
                  value={groupSubtitle}
                  onChange={(e) => setGroupSubtitle(e.target.value)}
                  placeholder="z.B. Alle Cosmetics ab 5.000 CR"
                  className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
              </label>
            </div>
          </div>
        )}

        {/* Tier label + sublabel */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-zinc-400">
            TIER-LABEL — wird auf dem Öffnen-Button angezeigt
          </p>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Sublabel (leer = kein)
            <input
              type="text"
              value={tierSublabel}
              onChange={(e) => setTierSublabel(e.target.value)}
              placeholder='z.B. "MEHR CHANCE"'
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
            />
            <Hint text="Kleiner Text unterhalb des Button-Labels (z.B. 'MEHR CHANCE' beim Premium-Tier)." />
          </label>
        </div>

        {/* Price + skip fee + batch */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-zinc-400">
            PREISE & LIMITS
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Preis ({currencyName})
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
              <Hint text="Kosten pro Case-Öffnung." />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Sofort-Zeigen ({currencyName}, 0 = gratis)
              <input
                type="number"
                min={0}
                value={previewCost}
                onChange={(e) => setPreviewCost(Math.max(0, Number(e.target.value) || 0))}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
              />
              <Hint text='Kosten um die Animation zu überspringen ("Sofort anzeigen"). 0 = kostenlos.' />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Max. Batch-Open (2–10)
              <input
                type="number"
                min={2}
                max={10}
                value={multiOpenMax}
                onChange={(e) => setMultiOpenMax(Math.min(10, Math.max(2, Number(e.target.value) || 2)))}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-blue-400/60"
              />
              <Hint text="Wie viele Cases können auf einmal geöffnet werden (Multi-Open)." />
            </label>
          </div>
        </div>

        {/* Rarity weights */}
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <p className="text-[11px] font-semibold tracking-wide text-zinc-400">CHANCEN</p>
            <span className={`text-[10px] font-semibold ${weightOk ? "text-emerald-400" : "text-amber-400"}`}>
              Summe: {totalWeight.toFixed(2)}% {!weightOk && "(sollte 100% sein)"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RARITY_ORDER.map((rarity) => (
              <label key={rarity} className="flex flex-col gap-1 text-xs text-zinc-400">
                <span className={RARITY_STYLES[rarity].text}>{RARITY_LABELS[rarity]} (%)</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={weights[rarity] ?? 0}
                  onChange={(e) => setWeights((w) => ({ ...w, [rarity]: Number(e.target.value) || 0 }))}
                  className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
              </label>
            ))}
          </div>
          <Hint text="Summe aller Rarität-Chancen sollte exakt 100% ergeben. Das Spiel normalisiert automatisch wenn nötig." />
        </div>

        {/* Name styles eligible */}
        <div className="rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/5 p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={nameStylesEligible}
              onChange={(e) => { sound.click(); setNameStylesEligible(e.target.checked); }}
              className="mt-0.5 h-4 w-4 accent-fuchsia-500"
            />
            <div>
              <p className="text-sm font-semibold text-fuchsia-200">
                <Wand2 className="mr-1.5 inline-block h-4 w-4" />
                Name-Style Bonus-Drops aktivieren
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                Wenn aktiviert, können Spieler nach dem Öffnen dieses Tiers zusätzlich einen Name-Style gewinnen.
                Wo alles eingestellt wird:
              </p>
              <ul className="mt-1 list-inside list-disc text-[11px] leading-relaxed text-zinc-500">
                <li><strong className="text-zinc-300">Hier (Tier-Einstellung):</strong> Ob dieser Case-Tier überhaupt Name-Styles droppen kann.</li>
                <li><strong className="text-zinc-300">Admin → Name-Styles → Seltenheiten-Konfiguration:</strong> Wahrscheinlichkeit pro Rarität (z.B. 2% bei Mythisch).</li>
                <li><strong className="text-zinc-300">Admin → Name-Styles → Style bearbeiten:</strong> Ob ein bestimmter Style aus Cases gewinnbar ist (Einstellung "Aus Case gewinnbar").</li>
              </ul>
            </div>
          </label>
        </div>

        {/* Item type pool */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-zinc-400">
            ITEM-TYPEN — welche Kategorien in den Pool kommen
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_ITEM_TYPES.map((type) => (
              <button
                key={type}
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); toggleType(type); }}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  itemTypes.includes(type)
                    ? "border-purple-400/60 bg-purple-500/15 text-purple-200"
                    : "border-white/10 text-zinc-500 hover:border-white/30"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <Hint text="Items aus gewählten Typen landen im Pool — außer du definierst unten spezifische Items pro Rarität." />
        </div>

        {/* Per-rarity item picker */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[11px] font-semibold tracking-wide text-zinc-400">
              ITEMS PRO RARITÄT — eigene Auswahl statt gesamter Pool
            </p>
            <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-300">
              Neu
            </span>
          </div>
          <InfoBox>
            <strong>So funktioniert die Item-Auswahl:</strong> Für jede Rarität kannst du unten spezifische Items
            auswählen. Wenn du Items auswählst, droppen bei dieser Rarität nur noch diese — der Typen-Pool oben
            wird für diese Rarität ignoriert. Wenn keine Items ausgewählt sind (Standard), wird der Typen-Pool
            wie gewohnt genutzt. Du kannst pro Rarität unterschiedliche Listen definieren.
          </InfoBox>
          <div className="mt-3 space-y-3">
            {RARITY_ORDER.map((rarity) => (
              <RarityItemPicker
                key={rarity}
                rarity={rarity}
                enabled={(weights[rarity] ?? 0) > 0}
                selectedIds={perRarityIds[rarity] ?? []}
                allItems={items}
                activeTypes={itemTypes}
                onToggle={(id) => togglePerRarityId(rarity, id)}
                onClearAll={() => clearPerRarityIds(rarity)}
              />
            ))}
            {RARITY_ORDER.every((r) => (weights[r] ?? 0) === 0) && (
              <p className="text-[11px] text-zinc-600">Keine Rarität hat Gewicht &gt; 0 — wähle oben Chancen, dann erscheinen die Item-Listen.</p>
            )}
          </div>
        </div>

        {/* Extra (non-item) drops */}
        <ExtraDropsEditor drops={extraDrops} setDrops={setExtraDrops} abilities={abilities} />

        {/* Legacy global pin */}
        {itemIds.length > 0 && (
          <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
              <p className="text-xs font-semibold text-amber-300">
                Globale Item-Pins (Altformat) — {itemIds.length} gepinnt
              </p>
              <button
                onClick={() => { sound.click(); setItemIds([]); }}
                className="ml-auto text-[10px] text-zinc-500 hover:text-red-400"
              >
                <X className="mr-0.5 inline-block h-3 w-3" />Alle entfernen
              </button>
            </div>
            <p className="text-[10px] text-zinc-500">
              Diese globalen Pins überschreiben für ALLE Seltenheiten den Typen-Pool. Bevorzuge die neue
              Rarität-Auswahl oben — sie gibt dir mehr Kontrolle pro Seltenheit. Zum Entfernen: "Alle entfernen" klicken.
            </p>
          </div>
        )}
      </div>
    </CollapsibleAdminRow>
  );
}

// ─── Group editor ─────────────────────────────────────────────────────────────

interface GroupEditorProps {
  group: CaseGroupRow;
  tiers: CaseTierRow[];
  items: ItemRow[];
  abilities: AbilityLite[];
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDeleted: () => void;
  onTierCreated: () => void;
}

function GroupEditor({
  group, tiers, items, abilities, isFirst, isLast, onMoveUp, onMoveDown, onDeleted, onTierCreated,
}: GroupEditorProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [subtitle, setSubtitle] = useState(group.subtitle ?? "");
  const [iconName, setIconName] = useState<CaseIconName>(group.icon_name as CaseIconName);
  const [itemTypes, setItemTypes] = useState<string[]>(group.item_types ?? []);
  const [accentColor, setAccentColor] = useState(group.accent_color ?? "");
  const [enabled, setEnabled] = useState(group.enabled);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [deleting, setDeleting] = useState(false);
  const [addingTier, setAddingTier] = useState(false);
  const [newTierLabel, setNewTierLabel] = useState("");
  const [newTierPrice, setNewTierPrice] = useState(5000);
  const [, startTransition] = useTransition();
  const sound = useSoundManager();

  const groupTiers = tiers
    .filter((t) => t.group_id === group.id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const GroupIcon = getCaseIcon(iconName);

  function toggleType(type: string) {
    setItemTypes((curr) => curr.includes(type) ? curr.filter((t) => t !== type) : [...curr, type]);
  }

  async function handleSaveGroup() {
    setSaving(true);
    setSaveStatus("idle");
    const res = await updateCaseGroup({
      id: group.id,
      title: title.trim() || group.title,
      subtitle: subtitle.trim() || undefined,
      iconName,
      itemTypes,
      accentColor: accentColor.trim() || undefined,
      enabled,
    });
    setSaving(false);
    setSaveStatus(res.success ? "saved" : "error");
    if (res.success) { sound.save(); setEditOpen(false); }
    else sound.error();
  }

  async function handleDeleteGroup() {
    if (!confirm(`Case-Gruppe "${group.title}" und alle ihre Tiers wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    setDeleting(true);
    const res = await deleteCaseGroup(group.id);
    if (res.success) onDeleted();
    else { alert(res.error ?? "Fehler beim Löschen."); setDeleting(false); }
  }

  async function handleAddTier() {
    if (!newTierLabel.trim()) return;
    const res = await createCaseTier({
      groupId: group.id,
      label: newTierLabel.trim(),
      price: newTierPrice,
    });
    if (res.success) {
      setNewTierLabel("");
      setNewTierPrice(5000);
      setAddingTier(false);
      onTierCreated();
    } else {
      alert(res.error ?? "Fehler beim Erstellen.");
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
      {/* Group header */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/15"
          style={accentColor ? { borderColor: `${accentColor}40`, backgroundColor: `${accentColor}15` } : undefined}
        >
          <GroupIcon className="h-5 w-5 text-zinc-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-zinc-100 truncate">{group.title}</p>
            {!group.enabled && (
              <span className="rounded-full border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-300">DEAKTIVIERT</span>
            )}
            {group.is_custom && (
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">Custom</span>
            )}
          </div>
          <p className="text-[10px] text-zinc-500">{group.id} · {groupTiers.length} Tier{groupTiers.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onMouseEnter={sound.hover} onClick={onMoveUp} disabled={isFirst} className="rounded-md p-1.5 text-zinc-500 hover:bg-white/8 hover:text-zinc-200 disabled:opacity-20" title="Nach oben">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button onMouseEnter={sound.hover} onClick={onMoveDown} disabled={isLast} className="rounded-md p-1.5 text-zinc-500 hover:bg-white/8 hover:text-zinc-200 disabled:opacity-20" title="Nach unten">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); setEditOpen((v) => !v); }}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${editOpen ? "border-purple-400/60 bg-purple-500/15 text-purple-200" : "border-white/10 text-zinc-400 hover:border-white/30"}`}
          >
            <Settings className="h-3.5 w-3.5" />
            Gruppe
          </button>
          {group.is_custom && (
            <button
              onMouseEnter={sound.hover}
              onClick={handleDeleteGroup}
              disabled={deleting}
              className="rounded-lg border border-red-400/20 px-2.5 py-1.5 text-xs font-semibold text-red-400/70 transition-colors hover:border-red-400/60 hover:text-red-300 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Group settings panel */}
      {editOpen && (
        <div className="border-b border-white/10 bg-black/20 p-4 space-y-4">
          <p className="text-[11px] font-semibold tracking-wide text-zinc-400">GRUPPEN-EINSTELLUNGEN</p>
          <InfoBox>
            Diese Einstellungen gelten für die gesamte Gruppe (alle Tiers). Den Anzeige-Namen des
            Standard-Tiers kannst du auch im jeweiligen Tier unten überschreiben.
          </InfoBox>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Titel *
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Untertitel (optional)
              <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Kurze Beschreibung…" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Icon
              <select
                value={iconName}
                onChange={(e) => setIconName(e.target.value as CaseIconName)}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              >
                {CASE_ICON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Akzentfarbe (CSS-Farbe, z.B. #7c3aed)
              <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#7c3aed" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
            </label>
          </div>

          <div>
            <p className="mb-1.5 text-xs text-zinc-400">Standard-Typen für neue Tiers dieser Gruppe</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_ITEM_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => { sound.click(); toggleType(type); }}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    itemTypes.includes(type) ? "border-purple-400/60 bg-purple-500/15 text-purple-200" : "border-white/10 text-zinc-500 hover:border-white/30"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => { sound.click(); setEnabled(e.target.checked); }}
              className="h-4 w-4 accent-purple-500"
            />
            Gruppe aktiviert (auf der Cases-Seite sichtbar)
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveGroup}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.4)] hover:bg-purple-500 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Speichere…" : "Gruppe speichern"}
            </button>
            {saveStatus === "saved" && <span className="text-xs font-medium text-emerald-400">Gespeichert.</span>}
            {saveStatus === "error" && <span className="text-xs font-medium text-red-400">Fehler.</span>}
          </div>
        </div>
      )}

      {/* Tiers */}
      <div className="divide-y divide-white/5">
        {groupTiers.map((tier, idx) => (
          <div key={tier.id} className="p-3">
            <TierEditor
              tier={tier}
              items={items}
              groupItemTypes={group.item_types ?? []}
              isStandard={idx === 0}
              isCustomGroup={group.is_custom}
              abilities={abilities}
              onDeleted={onTierCreated}
            />
          </div>
        ))}

        {groupTiers.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">
            Noch keine Tiers. Erstelle unten einen neuen Tier.
          </div>
        )}
      </div>

      {/* Add tier footer */}
      <div className="border-t border-white/5 p-3">
        {addingTier ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Label (Öffnen-Button)
              <input
                type="text"
                value={newTierLabel}
                onChange={(e) => setNewTierLabel(e.target.value)}
                placeholder='z.B. "ELITE TIER"'
                autoFocus
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60 w-48"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Startpreis (CR)
              <input
                type="number"
                min={0}
                value={newTierPrice}
                onChange={(e) => setNewTierPrice(Math.max(0, Number(e.target.value) || 0))}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60 w-32"
              />
            </label>
            <button onClick={handleAddTier} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">
              <Plus className="h-3.5 w-3.5" /> Tier erstellen
            </button>
            <button onClick={() => setAddingTier(false)} className="text-xs text-zinc-500 hover:text-zinc-300">
              Abbrechen
            </button>
          </div>
        ) : (
          <button
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); setAddingTier(true); }}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-purple-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Weiteren Tier hinzufügen
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Create group form ────────────────────────────────────────────────────────

function CreateGroupForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [iconName, setIconName] = useState<CaseIconName>("package");
  const [itemTypes, setItemTypes] = useState<string[]>(["hat", "jacket", "pants", "shoes"]);
  const [accentColor, setAccentColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();

  function toggleType(type: string) {
    setItemTypes((curr) => curr.includes(type) ? curr.filter((t) => t !== type) : [...curr, type]);
  }

  async function handleCreate() {
    if (!title.trim()) { setError("Titel ist Pflichtfeld."); return; }
    const safeId = (id.trim() || title.trim().toLowerCase().replace(/[^a-z0-9]/g, "-")).replace(/-+/g, "-").slice(0, 40);
    setSaving(true);
    setError(null);
    const input: CreateCaseGroupInput = {
      id: safeId,
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      iconName,
      itemTypes,
      accentColor: accentColor.trim() || undefined,
    };
    const res = await createCaseGroup(input);
    setSaving(false);
    if (res.success) {
      setOpen(false);
      setId(""); setTitle(""); setSubtitle(""); setAccentColor("");
      setItemTypes(["hat", "jacket", "pants", "shoes"]);
      setIconName("package");
      onCreated();
      sound.save();
    } else {
      setError(res.error ?? "Fehler beim Erstellen.");
      sound.error();
    }
  }

  if (!open) {
    return (
      <button
        onMouseEnter={sound.hover}
        onClick={() => { sound.click(); setOpen(true); }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/10 py-5 text-sm font-semibold text-zinc-400 transition-colors hover:border-purple-400/40 hover:text-purple-300"
      >
        <Plus className="h-5 w-5" />
        Neue Case-Gruppe erstellen
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-purple-400/30 bg-purple-500/5 p-5 space-y-4">
      <p className="font-bold text-purple-200">
        <Plus className="mr-1.5 inline-block h-4 w-4" />
        Neue Case-Gruppe
      </p>

      <InfoBox>
        Eine Gruppe enthält mehrere Tiers (Standard + Premium standardmäßig). Wähle Typen — das bestimmt welche
        Items in den Pool kommen. Jeder Tier lässt sich danach individuell einstellen.
      </InfoBox>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Titel *
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mein neues Case" autoFocus className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          ID (auto wenn leer)
          <input type="text" value={id} onChange={(e) => setId(e.target.value)} placeholder="mein-neues-case" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
          <Hint text="Einmalige interne ID (Kleinbuchstaben, Bindestriche). Wird automatisch aus dem Titel generiert wenn leer." />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Untertitel (optional)
          <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Kurze Beschreibung…" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Icon
          <select value={iconName} onChange={(e) => setIconName(e.target.value as CaseIconName)} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60">
            {CASE_ICON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-zinc-400">Item-Typen im Pool *</p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_ITEM_TYPES.map((type) => (
            <button key={type} onClick={() => { sound.click(); toggleType(type); }} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${itemTypes.includes(type) ? "border-purple-400/60 bg-purple-500/15 text-purple-200" : "border-white/10 text-zinc-500 hover:border-white/30"}`}>
              {type}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={handleCreate} disabled={saving || !title.trim()} className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.4)] hover:bg-purple-500 disabled:opacity-50">
          <Plus className="h-4 w-4" />
          {saving ? "Erstelle…" : "Gruppe erstellen"}
        </button>
        <button onClick={() => { sound.click(); setOpen(false); }} className="text-sm text-zinc-500 hover:text-zinc-300">Abbrechen</button>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface CasesAdminTabProps {
  caseGroups: CaseGroupRow[];
  caseTiers: CaseTierRow[];
  items: ItemRow[];
}

export function CasesAdminTab({ caseGroups: initialGroups, caseTiers: initialTiers, items }: CasesAdminTabProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [abilities, setAbilities] = useState<AbilityLite[]>([]);
  const [, startTransition] = useTransition();
  const sound = useSoundManager();

  // Load the ability catalog once for the extra-drop picker (best-effort).
  useEffect(() => {
    let active = true;
    getAllAbilityDefinitions()
      .then((defs) => {
        if (!active) return;
        setAbilities(defs.map((d) => ({ key: d.key, name: d.name, icon: d.icon, rarity: d.rarity })));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // We need a refresh mechanism: after any CRUD, re-fetch via router.refresh or
  // just reload the page. For simplicity, we trigger a page reload signal via
  // the router (works within Next.js Server Component hierarchy).
  function refresh() {
    // Force a page reload to get fresh data from the server
    window.location.reload();
  }

  async function handleReorder(fromIdx: number, direction: "up" | "down") {
    const toIdx = direction === "up" ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= groups.length) return;
    const next = [...groups];
    [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
    setGroups(next);
    sound.click();
    const res = await reorderCaseGroups(next.map((g) => g.id));
    if (!res.success) {
      setGroups(groups); // revert
      sound.error();
    }
  }

  if (initialGroups.length === 0 && initialTiers.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <p className="font-semibold">Keine Cases in der DB gefunden.</p>
          <p className="mt-1 text-xs">
            Führe einmalig{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5">node scripts/seed-case-tiers.mjs</code> aus
            um die Standard-Cases anzulegen, dann{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5">node scripts/add-case-groups.cjs</code>
            für das neue dynamische System.
          </p>
        </div>
        <CreateGroupForm onCreated={refresh} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Help overview */}
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <ArrowUpDown className="h-4 w-4 text-purple-400" />
          Cases & Tiers verwalten
        </p>
        <div className="grid gap-2 text-[11px] leading-relaxed text-zinc-400 sm:grid-cols-3">
          <div>
            <p className="mb-0.5 font-semibold text-zinc-300">Wie Cases funktionieren</p>
            Jede Case-Gruppe hat mehrere Tiers (z.B. Standard + Premium). Spieler wählen welchen Tier
            sie öffnen. Du kannst beliebig viele Gruppen erstellen — jede erscheint automatisch auf der Cases-Seite.
          </div>
          <div>
            <p className="mb-0.5 font-semibold text-zinc-300">Item-Pool</p>
            Wähle Typen → Items dieser Typen landen im Pool. Oder wähle pro Rarität spezifische Items für
            noch mehr Kontrolle. Ein Tier hat immer genau einen Pool — Typen ODER spezifische Items (letztere
            haben Vorrang wenn ausgewählt).
          </div>
          <div>
            <p className="mb-0.5 font-semibold text-zinc-300">Name-Styles aus Cases</p>
            Aktiviere "Name-Styles Bonus-Drops" pro Tier. Wahrscheinlichkeit einstellbar unter{" "}
            <strong className="text-zinc-200">Name-Styles → Seltenheiten-Konfiguration</strong>.
            Welche Styles gewinnbar sind: <strong className="text-zinc-200">Name-Styles → Style bearbeiten → "Aus Case gewinnbar"</strong>.
          </div>
        </div>
      </div>

      {/* Migration notice */}
      {initialGroups.length === 0 && initialTiers.length > 0 && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-200">
          <Info className="mr-1.5 inline-block h-3.5 w-3.5" />
          Tiers gefunden aber keine Gruppen — führe{" "}
          <code className="rounded bg-black/40 px-1 py-0.5">node scripts/add-case-groups.cjs</code>
          {" "}aus um das neue System zu aktivieren. Die Tiers werden weiterhin angezeigt.
        </div>
      )}

      {/* Fallback: show flat tier list if no groups */}
      {initialGroups.length === 0 && initialTiers.length > 0 && (
        <div className="space-y-3">
          {initialTiers.map((tier) => (
            <TierEditor
              key={tier.id}
              tier={tier}
              items={items}
              groupItemTypes={[]}
              isStandard={tier.id.endsWith("-standard")}
              isCustomGroup={false}
              abilities={abilities}
            />
          ))}
        </div>
      )}

      {/* Full group UI */}
      {groups.length > 0 && (
        <div className="space-y-4">
          {groups.map((group, idx) => (
            <GroupEditor
              key={group.id}
              group={group}
              tiers={initialTiers}
              items={items}
              abilities={abilities}
              isFirst={idx === 0}
              isLast={idx === groups.length - 1}
              onMoveUp={() => handleReorder(idx, "up")}
              onMoveDown={() => handleReorder(idx, "down")}
              onDeleted={refresh}
              onTierCreated={refresh}
            />
          ))}
        </div>
      )}

      <CreateGroupForm onCreated={refresh} />
    </div>
  );
}
