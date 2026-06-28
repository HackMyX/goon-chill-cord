"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Save, Plus, Trash2, ChevronUp, ChevronDown, Info, Search, X,
  Star, Settings, Package, Wand2, AlertTriangle, Eye, Gift,
  BookOpen, Coins, Percent, Layers, Sparkles, Boxes, ChevronRight, Dices, Zap,
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
import { getCaseDisplayConfig, updateCaseDisplayConfig } from "@/lib/actions/case-display";
import { DEFAULT_CASE_DISPLAY_CONFIG, type CaseDisplayConfig } from "@/lib/case-display-config";
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
  { value: "ability", label: "Fähigkeits-Gutschein" },
  { value: "badge", label: "Badge" },
  { value: "case_voucher", label: "Case-Gutschein" },
  { value: "game_bonus", label: "Spiel-Bonus" },
];
const EXTRA_KIND_LABEL: Record<CaseExtraDropKind, string> = {
  credits: "Credits", name_style: "Name-Style", ability: "Fähigkeits-Gutschein", badge: "Badge",
  case_voucher: "Case-Gutschein", game_bonus: "Spiel-Bonus",
};
const BONUS_GAME_OPTIONS: { value: "plinko" | "snake" | "don"; label: string }[] = [
  { value: "plinko", label: "Plinko-Bälle" }, { value: "snake", label: "Snake-Spiele" }, { value: "don", label: "DON-Spins" },
];

const NAME_STYLE_OPTIONS = Object.values(NAME_STYLES)
  .map((s) => ({ key: s.key, label: s.label, rarity: s.rarity }))
  .sort((a, b) => a.label.localeCompare(b.label));

function extraDropToSubject(d: CaseExtraDrop, abilities: AbilityLite[]): PreviewSubject {
  switch (d.kind) {
    case "credits":    return { kind: "credits", amount: d.amount ?? 0 };
    case "name_style": return { kind: "name_style", styleKey: d.styleKey ?? "default" };
    case "ability": {
      const a = abilities.find((x) => x.key === d.abilityKey);
      return { kind: "ability", abilityKey: d.abilityKey ?? "", name: d.label || a?.name || d.abilityKey || "Fähigkeits-Gutschein", icon: a?.icon, rarity: d.rarity };
    }
    case "badge":      return { kind: "badge", badgeKey: d.badgeKey ?? "", badgeText: d.badgeText || d.badgeKey || "" };
    case "case_voucher": return { kind: "case_voucher", mode: d.caseVoucherMode ?? "tier", label: d.label, tierLabel: d.caseVoucherTierId, rarityFloor: d.caseVoucherRarityFloor, durationHours: d.caseVoucherDurationHours };
    case "game_bonus": return { kind: "game_bonus", game: d.gameBonusGame ?? "don", amount: d.gameBonusAmount ?? 1, label: d.label, durationHours: d.gameBonusDurationHours };
  }
}

function extraDropDisplay(d: CaseExtraDrop, abilities: AbilityLite[]): string {
  if (d.label) return d.label;
  switch (d.kind) {
    case "credits":    return `${(d.amount ?? 0).toLocaleString("de-DE")} Credits`;
    case "name_style": return NAME_STYLES[d.styleKey ?? ""]?.label ?? d.styleKey ?? "Name-Style";
    case "ability":    return abilities.find((a) => a.key === d.abilityKey)?.name ?? d.abilityKey ?? "Fähigkeits-Gutschein";
    case "badge":      return d.badgeText || d.badgeKey || "Badge";
    case "case_voucher": return d.caseVoucherMode === "rarity" ? `Gratis-Case (mind. ${d.caseVoucherRarityFloor ?? "?"})` : "Gratis-Case";
    case "game_bonus": return `+${d.gameBonusAmount ?? 1} ${BONUS_GAME_OPTIONS.find((g) => g.value === d.gameBonusGame)?.label ?? "Bonus"}`;
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
  const [cvMode, setCvMode] = useState<"tier" | "rarity">("tier");
  const [cvTierId, setCvTierId] = useState("");
  const [cvRarityFloor, setCvRarityFloor] = useState<Rarity>("selten");
  const [cvDuration, setCvDuration] = useState(0);
  const [gbGame, setGbGame] = useState<"plinko" | "snake" | "don">("don");
  const [gbAmount, setGbAmount] = useState(5);
  const [gbDuration, setGbDuration] = useState(0);
  const [openCases, setOpenCases] = useState<{ tierId: string; label: string; groupTitle: string }[]>([]);
  useEffect(() => { void import("@/lib/actions/rewards").then((m) => m.getOpenableCases().then(setOpenCases).catch(() => undefined)); }, []);
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
    } else if (kind === "case_voucher") {
      base.caseVoucherMode = cvMode;
      if (cvMode === "tier") { if (!cvTierId) return; base.caseVoucherTierId = cvTierId; }
      else base.caseVoucherRarityFloor = cvRarityFloor;
      base.caseVoucherDurationHours = Math.max(0, cvDuration);
    } else if (kind === "game_bonus") {
      if (gbAmount <= 0) return;
      base.gameBonusGame = gbGame;
      base.gameBonusAmount = Math.max(1, gbAmount);
      base.gameBonusDurationHours = Math.max(0, gbDuration);
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
          EXTRA-DROPS — Nicht-Item-Belohnungen (Credits, Name-Styles, Fähigkeits-Gutscheine, Badges)
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
              Fähigkeits-Gutschein
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
          {kind === "case_voucher" && (
            <>
              <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                Modus
                <select value={cvMode} onChange={(e) => setCvMode(e.target.value as "tier" | "rarity")}
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60">
                  <option value="tier">Konkretes Case</option>
                  <option value="rarity">Nach Seltenheit</option>
                </select>
              </label>
              {cvMode === "tier" ? (
                <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                  Case
                  <select value={cvTierId} onChange={(e) => setCvTierId(e.target.value)}
                    className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60">
                    <option value="">— wählen —</option>
                    {openCases.map((c) => <option key={c.tierId} value={c.tierId}>{c.groupTitle} · {c.label}</option>)}
                  </select>
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                  Mind. Seltenheit
                  <select value={cvRarityFloor} onChange={(e) => setCvRarityFloor(e.target.value as Rarity)}
                    className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60">
                    {(["normal", "selten", "mythisch", "ultra"] as Rarity[]).map((r) => <option key={r} value={r}>{RARITY_LABELS[r] ?? r}</option>)}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                Ablauf (Std., 0=nie)
                <input type="number" min={0} value={cvDuration} onChange={(e) => setCvDuration(Math.max(0, Number(e.target.value) || 0))}
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60" />
              </label>
            </>
          )}
          {kind === "game_bonus" && (
            <>
              <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                Spiel
                <select value={gbGame} onChange={(e) => setGbGame(e.target.value as "plinko" | "snake" | "don")}
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60">
                  {BONUS_GAME_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                Anzahl extra
                <input type="number" min={1} value={gbAmount} onChange={(e) => setGbAmount(Math.max(1, Number(e.target.value) || 1))}
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60" />
              </label>
              <label className="flex flex-col gap-1 text-[10px] text-zinc-400">
                Ablauf (Std., 0=nie)
                <input type="number" min={0} value={gbDuration} onChange={(e) => setGbDuration(Math.max(0, Number(e.target.value) || 0))}
                  className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60" />
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

// ─── Display / sizing editor ────────────────────────────────────────────────

const DISPLAY_NUM_FIELDS: { key: keyof CaseDisplayConfig; label: string; hint: string; step: number }[] = [
  { key: "reelItemWidth",  label: "Reel — Item-Breite (px)",      hint: "Breite einer einzelnen Box in der Spin-Leiste. Größer = größere 3D-Items.", step: 5 },
  { key: "reelHeight",     label: "Reel — Höhe (px)",             hint: "Gesamthöhe der Spin-Leiste. Größer = mehr Platz für die 3D-Darstellung.", step: 5 },
  { key: "reelItemScale",  label: "3D-Zoom (überall)",            hint: "Kamera-Zoom für alle 3D-Items (Reel/Gewinn/Pool/Mehrfach). >1 = näher/größer.", step: 0.05 },
  { key: "revealScale",    label: "Gewinn-Anzeige — Größe",       hint: "Größe der Gewinn-Enthüllung nach dem Spin.", step: 0.05 },
  { key: "poolCardHeight", label: "Pool — Karten-3D-Höhe (px)",   hint: "Höhe der 3D-Vorschau auf jeder Pool-Karte im Popup.", step: 5 },
  { key: "poolMinColWidth",label: "Pool — Spaltenbreite (px)",    hint: "Mindestbreite einer Pool-Spalte. Kleiner = mehr Karten pro Reihe.", step: 5 },
  { key: "batchCardWidth", label: "Mehrfach — Kartenbreite (px)", hint: "Breite der Karten im Mehrfach-Öffnen-Ergebnis.", step: 5 },
  { key: "batchCardHeight",label: "Mehrfach — Karten-3D-Höhe (px)", hint: "Höhe der 3D-Vorschau auf den Mehrfach-Karten.", step: 5 },
  { key: "rotateSpeed",    label: "Rotationsgeschwindigkeit",     hint: "Wie schnell sich die 3D-Items drehen (0 = aus über die Auto-Rotation).", step: 0.05 },
];

function CaseDisplayConfigEditor() {
  const [cfg, setCfg] = useState<CaseDisplayConfig>(DEFAULT_CASE_DISPLAY_CONFIG);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const sound = useSoundManager();

  useEffect(() => {
    let active = true;
    getCaseDisplayConfig().then((c) => { if (active) setCfg(c); }).catch(() => {});
    return () => { active = false; };
  }, []);

  function setNum(key: keyof CaseDisplayConfig, v: number) {
    setCfg((c) => ({ ...c, [key]: v }));
  }

  async function save() {
    setSaving(true); setStatus("idle");
    const res = await updateCaseDisplayConfig(cfg);
    setSaving(false);
    setStatus(res.success ? "saved" : "error");
    if (res.success) sound.save(); else sound.error();
  }

  return (
    <CollapsibleAdminRow
      header={
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[180px]">
            <p className="font-semibold text-zinc-100">
              <Settings className="mr-1.5 inline-block h-4 w-4 text-purple-400" />
              Darstellung & Größen
            </p>
            <p className="text-[11px] text-zinc-500">Live für alle Spieler — Reel, Gewinn, Pool, Mehrfach</p>
          </div>
          <button
            onMouseEnter={sound.hover}
            onClick={(e) => { e.stopPropagation(); save(); }}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.4)] transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "…" : "Speichern"}
          </button>
          {status === "saved" && <span className="text-xs font-medium text-emerald-400">Gespeichert.</span>}
          {status === "error" && <span className="text-xs font-medium text-red-400">Fehler.</span>}
        </div>
      }
    >
      <div onClick={(e) => e.stopPropagation()} className="space-y-3">
        <InfoBox>
          Alle Größen wirken sofort live auf der Cases-Seite für alle Spieler. „3D-Zoom" macht die Items in allen
          Ansichten näher/größer. „Auto-Rotation" und „Charakter-Vorschau" steuern, ob sich Items drehen bzw. ob
          getragene Items (Haare, Gesicht, Helm, Jacke, Hose, Schuhe) auf einem Charakter gezeigt werden.
        </InfoBox>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DISPLAY_NUM_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-xs text-zinc-400">
              <span title={f.hint}>{f.label}</span>
              <input
                type="number"
                step={f.step}
                value={cfg[f.key] as number}
                onChange={(e) => setNum(f.key, Number(e.target.value) || 0)}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
              <Hint text={f.hint} />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={cfg.autoRotate} onChange={(e) => setCfg((c) => ({ ...c, autoRotate: e.target.checked }))} className="h-4 w-4 accent-purple-500" />
            Auto-Rotation der 3D-Items
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={cfg.useCharacterForWorn} onChange={(e) => setCfg((c) => ({ ...c, useCharacterForWorn: e.target.checked }))} className="h-4 w-4 accent-purple-500" />
            Getragene Items auf Charakter zeigen (Haare/Gesicht/Kleidung)
          </label>
        </div>
      </div>
    </CollapsibleAdminRow>
  );
}

// ─── Onboarding guide — "Wie das Case-System funktioniert" ───────────────────

/** One step in the 4-step build flow. */
function GuideStep({
  n, icon: StepIcon, title, accent, children,
}: {
  n: number;
  icon: typeof Package;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-black"
        style={{ background: `${accent}1f`, color: accent, border: `1px solid ${accent}40` }}
      >
        {n}
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-bold text-zinc-100">
          <StepIcon className="h-4 w-4" style={{ color: accent }} />
          {title}
        </p>
        <div className="mt-1 text-[11.5px] leading-relaxed text-zinc-400">{children}</div>
      </div>
    </div>
  );
}

/** A glossary chip: bold term + short plain-language definition. */
function GlossaryItem({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
      <p className="text-[11px] font-bold text-zinc-200">{term}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{children}</p>
    </div>
  );
}

function CaseGuide() {
  const [open, setOpen] = useState(true);
  const sound = useSoundManager();
  const { rarityLabels } = useSiteConfig();
  const rarityLabel = (r: Rarity) =>
    r === "normal" ? rarityLabels.normal
    : r === "selten" ? rarityLabels.selten
    : r === "mythisch" ? rarityLabels.mythisch
    : rarityLabels.ultra;

  return (
    <div className="overflow-hidden rounded-2xl border border-purple-400/25 bg-gradient-to-b from-purple-500/[0.07] to-fuchsia-500/[0.02]">
      {/* Header / toggle */}
      <button
        onMouseEnter={sound.hover}
        onClick={() => { sound.click(); setOpen((v) => !v); }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10">
          <BookOpen className="h-4 w-4 text-fuchsia-300" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-black tracking-tight text-zinc-50">
            So funktioniert das Case-System
          </p>
          <p className="text-[11px] text-zinc-400">
            Komplett-Anleitung: Gruppen, Tiers, Chancen, Pools, Extra-Drops &amp; Name-Styles — idiotensicher.
          </p>
        </div>
        <ChevronDown className={`h-5 w-5 flex-shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-5 border-t border-white/8 px-4 py-4">
          {/* 1 — Hierarchy flow */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-purple-300">
              Die Hierarchie auf einen Blick
            </p>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              {[
                { icon: Boxes,    label: "Gruppe",        desc: "Eine Case wie ein Cosmetics-Case. Erscheint als eigener Block auf der Seite.", hex: "#a855f7" },
                { icon: Layers,   label: "Tiers",         desc: "Varianten der Gruppe: Standard & Premium (oder mehr). Jeder mit eigenem Preis & Chancen.", hex: "#3898ff" },
                { icon: Percent,  label: "Rarität-Töpfe", desc: "Pro Tier: Chance pro Seltenheit. Summe = 100 %.", hex: "#f59e0b" },
                { icon: Package,  label: "Pool",          desc: "Welche Items/Belohnungen in jedem Topf liegen.", hex: "#e879f9" },
              ].map((s, i, arr) => (
                <div key={s.label} className="flex flex-1 items-center gap-2">
                  <div className="flex-1 rounded-xl border bg-black/25 p-3" style={{ borderColor: `${s.hex}33` }}>
                    <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color: s.hex }}>
                      <s.icon className="h-4 w-4" />
                      {s.label}
                    </p>
                    <p className="mt-1 text-[10.5px] leading-snug text-zinc-400">{s.desc}</p>
                  </div>
                  {i < arr.length - 1 && (
                    <ChevronRight className="hidden h-4 w-4 flex-shrink-0 text-zinc-600 sm:block" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 2 — 4 steps */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-purple-300">
              In 4 Schritten zur eigenen Case
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <GuideStep n={1} icon={Boxes} title="Gruppe erstellen" accent="#a855f7">
                Unten „<strong className="text-zinc-300">Neue Case-Gruppe erstellen</strong>" → Titel, Icon und
                Item-Typen wählen. Die Gruppe erscheint sofort auf der Cases-Seite (sofern aktiviert).
              </GuideStep>
              <GuideStep n={2} icon={Coins} title="Tiers & Preise einstellen" accent="#3898ff">
                Jede Gruppe hat einen <strong className="text-zinc-300">Standard</strong>- und einen{" "}
                <strong className="text-zinc-300">Premium</strong>-Tier. Pro Tier: Preis, „Sofort-Zeigen"-Gebühr und
                Mehrfach-Limit. Eigene Tiers lassen sich ergänzen.
              </GuideStep>
              <GuideStep n={3} icon={Percent} title="Chancen pro Rarität" accent="#f59e0b">
                Unter <strong className="text-zinc-300">CHANCEN</strong> setzt du die Wahrscheinlichkeit pro
                Seltenheit. Die Anzeige rechnet die Summe live — sie sollte{" "}
                <strong className="text-emerald-300">100 %</strong> ergeben.
              </GuideStep>
              <GuideStep n={4} icon={Package} title="Pool füllen" accent="#e879f9">
                Wähle <strong className="text-zinc-300">Item-Typen</strong> (ganze Kategorien) oder pro Rarität{" "}
                <strong className="text-zinc-300">exakte Items</strong>. Dazu optional{" "}
                <strong className="text-fuchsia-300">Extra-Drops</strong> (Credits, Name-Styles, Fähigkeits-Gutscheine, Badges).
              </GuideStep>
            </div>
          </div>

          {/* 3 — Probability model */}
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.04] p-3.5">
            <p className="mb-1.5 flex items-center gap-2 text-sm font-bold text-amber-200">
              <Dices className="h-4 w-4" />
              Wie ein Gewinn gezogen wird (genau so läuft es in der Datenbank)
            </p>
            <ol className="list-inside list-decimal space-y-1 text-[11.5px] leading-relaxed text-zinc-300">
              <li>
                <strong>Rarität auslosen:</strong> Zuerst entscheidet das Spiel anhand deiner CHANCEN-Gewichte,
                welche Seltenheit fällt (Gewichte werden automatisch auf 100 % normalisiert — du musst nicht exakt
                treffen, aber es ist sauberer).
              </li>
              <li>
                <strong>Aus dem Rarität-Topf ziehen:</strong> Innerhalb dieser Seltenheit wird gleichverteilt
                gezogen. Jedes Pool-Item = <strong>1 Los</strong>. Ein Extra-Drop zählt mit seinem{" "}
                <strong>Gewicht</strong> als so viele Lose (Gewicht 3 = 3× so wahrscheinlich wie ein einzelnes Item).
              </li>
              <li>
                <strong>Pool-Quelle:</strong> Hast du für die Rarität <em>exakte Items</em> gewählt, kommen nur die
                in den Topf. Sonst alle Items der gewählten Typen mit dieser Seltenheit.
              </li>
            </ol>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300/80">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Hat ein Rarität-Topf <strong>kein</strong> Item und <strong>keinen</strong> Extra-Drop, kann diese
              Seltenheit nie fallen — selbst wenn ihre Chance &gt; 0 ist. Die Chance verteilt sich dann auf die
              übrigen Töpfe.
            </p>
          </div>

          {/* 4 — Pool: types vs exact */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-blue-400/20 bg-blue-500/[0.04] p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-blue-200">
                <Layers className="h-4 w-4" /> Item-Typen (der einfache Weg)
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                Wähle Kategorien wie <code className="rounded bg-black/40 px-1">hat</code>,{" "}
                <code className="rounded bg-black/40 px-1">jacket</code>. <strong className="text-zinc-300">Alle</strong>{" "}
                Items dieser Typen (je Rarität) landen automatisch im Pool. Neue Items derselben Typen kommen später
                von selbst dazu.
              </p>
            </div>
            <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-200">
                <Star className="h-4 w-4" /> Exakte Items pro Rarität (volle Kontrolle)
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                Wähle für eine Seltenheit gezielt einzelne Items. Dann droppt{" "}
                <strong className="text-zinc-300">nur diese Auswahl</strong> — der Typen-Pool wird für diese Rarität
                ignoriert. Pro Seltenheit getrennt einstellbar.
              </p>
            </div>
          </div>

          {/* 5 — Extras & name styles */}
          <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-3.5">
            <p className="mb-1.5 flex items-center gap-2 text-sm font-bold text-fuchsia-200">
              <Sparkles className="h-4 w-4" /> Extra-Drops &amp; Name-Styles — wo was eingestellt wird
            </p>
            <ul className="space-y-1 text-[11.5px] leading-relaxed text-zinc-400">
              <li>
                <Gift className="mr-1 inline-block h-3.5 w-3.5 text-fuchsia-400" />
                <strong className="text-zinc-300">Extra-Drops</strong> (Credits, Name-Style, Fähigkeits-Gutschein, Badge) legst
                du direkt im Tier an. Sie mischen sich in den gewählten Rarität-Topf.
              </li>
              <li>
                <Wand2 className="mr-1 inline-block h-3.5 w-3.5 text-fuchsia-400" />
                <strong className="text-zinc-300">Name-Style Bonus-Drops</strong> sind ein separater Zusatz-Roll
                nach dem Öffnen. Drei Schalter greifen ineinander:
                <ul className="mt-1 list-inside list-disc pl-4 text-[11px] text-zinc-500">
                  <li><strong className="text-zinc-400">Im Tier:</strong> „Name-Style Bonus-Drops aktivieren" an/aus.</li>
                  <li><strong className="text-zinc-400">Name-Styles → Seltenheiten-Konfiguration:</strong> Chance pro Rarität.</li>
                  <li><strong className="text-zinc-400">Name-Styles → Style bearbeiten:</strong> „Aus Case gewinnbar" pro Style.</li>
                </ul>
              </li>
            </ul>
          </div>

          {/* 6 — Glossary */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-purple-300">
              Begriffe in einem Satz
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <GlossaryItem term="Tier">Eine kaufbare Variante einer Case (Standard / Premium / eigene).</GlossaryItem>
              <GlossaryItem term="Rarität-Topf">Alle möglichen Gewinne einer Seltenheit innerhalb eines Tiers.</GlossaryItem>
              <GlossaryItem term="Gewicht">Lose-Anzahl im Topf. Item = 1 Los, Extra-Drop = sein Gewicht.</GlossaryItem>
              <GlossaryItem term="Sofort-Zeigen">Optionale Gebühr, um die Spin-Animation zu überspringen.</GlossaryItem>
              <GlossaryItem term="Mehrfach-Open">Mehrere Cases auf einmal öffnen (2–10), Ergebnis als Raster.</GlossaryItem>
              <GlossaryItem term="Premium-Tier">Teurerer Tier, meist mit besseren Chancen / eigenem Pool.</GlossaryItem>
            </div>
          </div>

          {/* 7 — Rarity legend (exact SSOT colors) */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-purple-300">
              <Zap className="h-3.5 w-3.5" /> Seltenheits-Farben (projektweit identisch)
            </p>
            <div className="flex flex-wrap gap-2">
              {RARITY_ORDER.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold"
                  style={{ borderColor: `${RARITY_HEX[r]}55`, color: RARITY_HEX[r], background: `${RARITY_HEX[r]}12` }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: RARITY_HEX[r] }} />
                  {rarityLabel(r)}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[10.5px] text-zinc-500">
              Diese Farbwerte sind die zentrale Quelle (<code className="rounded bg-black/40 px-1">RARITY_HEX</code>) und
              gelten überall gleich: Cases, Shop, Garderobe, 3D-Welt, Battle-Pass.
            </p>
          </div>
        </div>
      )}
    </div>
  );
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
      {/* Display / sizing — live for all players */}
      <CaseDisplayConfigEditor />

      {/* Onboarding guide — full, idiot-proof "how cases work" explainer */}
      <CaseGuide />

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
