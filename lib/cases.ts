export type Rarity = "normal" | "selten" | "mythisch" | "ultra";

/** Name-based icon reference — never the actual component. `CaseGroup` is
 * resolved server-side (lib/cases-config.ts) and passed as a prop into the
 * client tree (DashboardShell); only plain, JSON-serializable data may cross
 * that Server -> Client boundary. The string is resolved to a real Lucide
 * icon client-side via `getCaseIcon()` in lib/case-icons.ts. */
export type CaseIconName =
  | "package"
  | "swords"
  | "gem"
  | "star"
  | "shield"
  | "zap"
  | "crown"
  | "flame"
  | "trophy"
  | "gift"
  | "sparkles";

export const CASE_ICON_OPTIONS: { value: CaseIconName; label: string }[] = [
  { value: "package",  label: "Paket" },
  { value: "swords",   label: "Schwerter" },
  { value: "gem",      label: "Edelstein" },
  { value: "star",     label: "Stern" },
  { value: "shield",   label: "Schild" },
  { value: "zap",      label: "Blitz" },
  { value: "crown",    label: "Krone" },
  { value: "flame",    label: "Flamme" },
  { value: "trophy",   label: "Pokal" },
  { value: "gift",     label: "Geschenk" },
  { value: "sparkles", label: "Glitzer" },
];

export const RARITY_ORDER: Rarity[] = ["normal", "selten", "mythisch", "ultra"];

export const RARITY_LABELS: Record<Rarity, string> = {
  normal: "Normal",
  selten: "Selten",
  mythisch: "Mythisch",
  ultra: "Ultra",
};

/**
 * Text + glow colors used for badges, bars and item-box accents.
 *
 * `hoverRing`/`hoverGlow` are full literal `hover:`-prefixed class strings
 * (not built via runtime string concatenation) so Tailwind's content
 * scanner — which matches raw text, not evaluated JS — can actually see and
 * generate them. `pulseGlow` is a standalone "glow-only" box-shadow class
 * meant for a separate layer *behind* an item, never on the item itself, so
 * the pulse never desaturates the icon/text it sits behind.
 */
export const RARITY_STYLES: Record<
  Rarity,
  {
    text: string;
    border: string;
    bg: string;
    glow: string;
    barBg: string;
    hoverRing: string;
    hoverGlow: string;
    pulseGlow?: string;
    /** Ultra is the animated RGB tier — text/border use .rainbow-* classes instead. */
    rainbow?: boolean;
  }
> = {
  normal: {
    text: "text-blue-300",
    border: "border-blue-400/60",
    bg: "bg-blue-500/15",
    glow: "shadow-[0_0_10px_rgba(59,130,246,0.5)]",
    barBg: "bg-blue-600",
    hoverRing: "hover:ring-2 hover:ring-blue-400/70",
    hoverGlow: "hover:shadow-[0_0_30px_rgba(59,130,246,0.55)]",
  },
  selten: {
    text: "text-purple-300",
    border: "border-purple-400/60",
    bg: "bg-purple-500/15",
    glow: "shadow-[0_0_10px_rgba(168,85,247,0.6)]",
    barBg: "bg-purple-600",
    hoverRing: "hover:ring-2 hover:ring-purple-400/70",
    hoverGlow: "hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]",
  },
  mythisch: {
    text: "text-amber-300",
    border: "border-amber-400/60",
    bg: "bg-amber-500/15",
    glow: "shadow-[0_0_10px_rgba(245,158,11,0.6)]",
    barBg: "bg-amber-500",
    hoverRing: "hover:ring-2 hover:ring-amber-400/70",
    hoverGlow: "hover:shadow-[0_0_30px_rgba(245,158,11,0.6)]",
    pulseGlow: "animate-pulse shadow-[0_0_22px_rgba(245,158,11,0.55)]",
  },
  ultra: {
    text: "text-fuchsia-300",
    border: "border-fuchsia-400/60",
    bg: "bg-fuchsia-500/10",
    glow: "shadow-[0_0_14px_rgba(217,70,239,0.55)]",
    barBg: "rainbow-fill",
    hoverRing: "hover:ring-2 hover:ring-fuchsia-400/70",
    hoverGlow: "hover:shadow-[0_0_30px_rgba(217,70,239,0.55)]",
    pulseGlow: "animate-pulse shadow-[0_0_24px_rgba(217,70,239,0.6)]",
    rainbow: true,
  },
};

/**
 * Returns the correct Tailwind text class for a rarity — `rainbow-text` for
 * ultra (animated RGB gradient), the static text class for all others.
 */
export function rarityTextClass(rarity: Rarity): string {
  return RARITY_STYLES[rarity].rainbow ? "rainbow-text" : RARITY_STYLES[rarity].text;
}

/**
 * Returns the correct Tailwind background class for a rarity progress bar —
 * `rainbow-fill` for ultra, the static barBg class for all others.
 */
export function rarityBarBgClass(rarity: Rarity): string {
  return RARITY_STYLES[rarity].rainbow ? "rainbow-fill" : RARITY_STYLES[rarity].barBg;
}

/** Non-item things a case can drop alongside its item pool. The visual /
 * granting infrastructure already exists app-wide (UniversalPreviewModal,
 * Battle-Pass grant logic), so cases reuse it. */
export type CaseExtraDropKind = "credits" | "name_style" | "ability" | "badge" | "case_voucher" | "game_bonus";

export interface CaseExtraDrop {
  /** Stable local id (for admin editing + React keys). */
  id: string;
  kind: CaseExtraDropKind;
  /** Which rarity bucket this drop competes in (uses the tier's rarityWeights). */
  rarity: Rarity;
  /** Drop weight = number of "tickets" in that rarity bucket; each pool item = 1 ticket. */
  weight: number;
  amount?: number;     // credits
  styleKey?: string;   // name_style
  abilityKey?: string; // ability
  badgeKey?: string;   // badge
  badgeText?: string;  // badge display text
  // ── case_voucher ──
  caseVoucherMode?: "tier" | "rarity";
  caseVoucherTierId?: string;
  caseVoucherRarityFloor?: Rarity;
  caseVoucherDurationHours?: number;
  // ── game_bonus ──
  gameBonusGame?: "plinko" | "snake" | "don";
  gameBonusAmount?: number;
  gameBonusDurationHours?: number;
  /** Optional display-name override (falls back to a sensible per-kind default). */
  label?: string;
}

const EXTRA_DROP_KINDS: CaseExtraDropKind[] = ["credits", "name_style", "ability", "badge", "case_voucher", "game_bonus"];

/** Validates/normalizes a raw jsonb value into a clean CaseExtraDrop[]. Never throws. */
export function normalizeExtraDrops(raw: unknown): CaseExtraDrop[] {
  if (!Array.isArray(raw)) return [];
  const out: CaseExtraDrop[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const kind = o.kind as CaseExtraDropKind;
    const rarity = o.rarity as Rarity;
    if (!EXTRA_DROP_KINDS.includes(kind)) continue;
    if (!RARITY_ORDER.includes(rarity)) continue;
    const drop: CaseExtraDrop = {
      id: typeof o.id === "string" && o.id ? o.id : `${kind}-${out.length}`,
      kind,
      rarity,
      weight: Math.max(0, Number(o.weight) || 0),
    };
    if (typeof o.amount === "number") drop.amount = Math.max(0, Math.round(o.amount));
    if (typeof o.styleKey === "string") drop.styleKey = o.styleKey;
    if (typeof o.abilityKey === "string") drop.abilityKey = o.abilityKey;
    if (typeof o.badgeKey === "string") drop.badgeKey = o.badgeKey;
    if (typeof o.badgeText === "string") drop.badgeText = o.badgeText;
    if (o.caseVoucherMode === "tier" || o.caseVoucherMode === "rarity") drop.caseVoucherMode = o.caseVoucherMode;
    if (typeof o.caseVoucherTierId === "string") drop.caseVoucherTierId = o.caseVoucherTierId;
    if (RARITY_ORDER.includes(o.caseVoucherRarityFloor as Rarity)) drop.caseVoucherRarityFloor = o.caseVoucherRarityFloor as Rarity;
    if (typeof o.caseVoucherDurationHours === "number") drop.caseVoucherDurationHours = Math.max(0, Math.round(o.caseVoucherDurationHours));
    if (o.gameBonusGame === "plinko" || o.gameBonusGame === "snake" || o.gameBonusGame === "don") drop.gameBonusGame = o.gameBonusGame;
    if (typeof o.gameBonusAmount === "number") drop.gameBonusAmount = Math.max(1, Math.round(o.gameBonusAmount));
    if (typeof o.gameBonusDurationHours === "number") drop.gameBonusDurationHours = Math.max(0, Math.round(o.gameBonusDurationHours));
    if (typeof o.label === "string") drop.label = o.label;
    // Drop entries that are missing their required target are ignored entirely.
    if (drop.kind === "credits" && !drop.amount) continue;
    if (drop.kind === "name_style" && !drop.styleKey) continue;
    if (drop.kind === "ability" && !drop.abilityKey) continue;
    if (drop.kind === "badge" && !drop.badgeKey) continue;
    if (drop.kind === "case_voucher" && drop.caseVoucherMode === "tier" && !drop.caseVoucherTierId) continue;
    if (drop.kind === "case_voucher" && drop.caseVoucherMode === "rarity" && !drop.caseVoucherRarityFloor) continue;
    if (drop.kind === "case_voucher" && !drop.caseVoucherMode) continue;
    if (drop.kind === "game_bonus" && (!drop.gameBonusGame || !drop.gameBonusAmount)) continue;
    out.push(drop);
  }
  return out;
}

export interface CaseTier {
  id: string;
  label: string;
  sublabel?: string;
  price: number;
  rarityWeights: Partial<Record<Rarity, number>>;
  /** Defaults to true. Set to false via the admin panel to take a tier offline live. */
  enabled?: boolean;
  /** Overrides the parent group's itemTypes when set via the admin panel. */
  itemTypes?: string[];
  /** Legacy: when set, this case draws only from these exact item IDs (all rarities).
   * Prefer perRarityItemIds for new configurations. */
  itemIds?: string[];
  /** Per-rarity item overrides. For each rarity: null/missing = use type pool,
   * string[] = use only these specific items for that rarity. */
  perRarityItemIds?: Partial<Record<Rarity, string[] | null>>;
  /** Whether this case tier can also drop name styles (configured via Name-Styles → Rarität-Konfiguration). */
  nameStylesEligible?: boolean;
  /** Configurable non-item drops (credits, name styles, abilities, badges) mixed into the rarity buckets. */
  extraDrops?: CaseExtraDrop[];
  /** Sort position within the group (0 = standard/first, 1 = premium/second, etc.) */
  sortOrder?: number;
  /** Group-level display label stored on the standard tier row. */
  groupLabel?: string;
  /** Group-level subtitle stored on the standard tier row. */
  groupSubtitle?: string;
  /** Credits charged when the player clicks "Sofort anzeigen" (skip animation). 0 = free. */
  previewCost?: number;
  /** Max number of cases that can be opened simultaneously (2–10). */
  multiOpenMax?: number;
}

/** Every dbType currently in circulation — shown to the admin as the known
 * universe of valid item types when editing a tier's pool or a catalogue
 * item (lib/item-icons.ts maps each of these to a real icon). */
export const ALL_ITEM_TYPES = [
  "hat",
  "jacket",
  "pants",
  "shoes",
  "trail",
  "shield_cosmetic",
  "aura",
  "face",
  "hair",
  "pet",
  "weapon_cosmetic",
  "ring",
  "amulet",
] as const;

/** Human-readable category label per dbType — shown next to item names
 * (case-win reveal, admin item rows) so it's clear what slot/category an
 * item belongs to, not just its rarity. Unknown future types fall back to
 * a capitalized version of the raw string instead of nothing. */
const TYPE_LABELS: Record<string, string> = {
  hat: "Helm",
  jacket: "Jacke",
  pants: "Hose",
  shoes: "Schuhe",
  trail: "Spur",
  shield_cosmetic: "Schild",
  aura: "Aura",
  face: "Maske",
  hair: "Haare",
  pet: "Haustier",
  weapon_cosmetic: "Waffe",
  ring: "Ring",
  amulet: "Amulett",
};

export function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

/** A single entry shown in the case "pool" gallery — an item OR an extra drop. */
export interface CasePoolEntry {
  rarity: Rarity;
  type: string;
  name: string;
  /** Present when this entry is a non-item extra drop. */
  extra?: {
    kind: CaseExtraDropKind;
    styleKey?: string;
    abilityKey?: string;
    abilityIcon?: string;
    badgeKey?: string;
    badgeText?: string;
    amount?: number;
  };
}

export interface CaseGroup {
  id: string;
  title: string;
  subtitle?: string;
  iconName: CaseIconName;
  /** items.type values that belong to this case's pool. */
  itemTypes: string[];
  /** Optional accent colour for the case card (CSS colour string). */
  accentColor?: string;
  /** Sort position for display ordering. Lower = shown first. */
  displayOrder?: number;
  /** true for admin-created groups (can be deleted), false for seeded defaults. */
  isCustom?: boolean;
  /** All tiers for this group in sort order. `standard` and `premium` are
   * backward-compat aliases to `tiers[0]` and `tiers[1]`. */
  tiers: CaseTier[];
  /** First tier — convenience alias for tiers[0]. */
  standard: CaseTier;
  /** Second tier — convenience alias for tiers[1]. */
  premium: CaseTier;
}

function mkGroup(base: Omit<CaseGroup, "tiers">): CaseGroup {
  return { ...base, tiers: [base.standard, base.premium] };
}

export const CASE_GROUPS: CaseGroup[] = [
  mkGroup({
    id: "cosmetics",
    title: "Case Opening",
    iconName: "package",
    itemTypes: [
      "hat",
      "jacket",
      "pants",
      "shoes",
      "trail",
      "shield_cosmetic",
      "aura",
      "face",
      "hair",
      "pet",
      "ring",
      "amulet",
    ],
    standard: {
      id: "cosmetics-standard",
      label: "CASE ÖFFNEN",
      price: 5000,
      rarityWeights: { normal: 86.9, selten: 10, mythisch: 3, ultra: 0.1 },
    },
    premium: {
      id: "cosmetics-premium",
      label: "PREMIUM",
      sublabel: "NOCH MEHR CHANCE",
      price: 25000,
      rarityWeights: { normal: 78, selten: 14, mythisch: 7.5, ultra: 0.5 },
    },
  }),
  mkGroup({
    id: "weapons",
    title: "Waffen Case",
    subtitle: "Gewinne Waffen für den 3D-World-Kampf — ab 30.000 CR",
    iconName: "swords",
    itemTypes: ["weapon_cosmetic"],
    standard: {
      id: "weapons-standard",
      label: "WAFFEN CASE",
      price: 30000,
      rarityWeights: { normal: 91.95, selten: 6, mythisch: 2, ultra: 0.05 },
    },
    premium: {
      id: "weapons-premium",
      label: "PREMIUM WAFFE",
      sublabel: "ULTRA SELTENE WAFFEN",
      price: 150000,
      rarityWeights: { normal: 84.8, selten: 9, mythisch: 6, ultra: 0.2 },
    },
  }),
];

export function findCaseTier(
  tierId: string,
  groups: CaseGroup[] = CASE_GROUPS
): { group: CaseGroup; tier: CaseTier } | undefined {
  for (const group of groups) {
    const tier = group.tiers.find((t) => t.id === tierId);
    if (tier) return { group, tier };
  }
  return undefined;
}

export function pickRarity(weights: Partial<Record<Rarity, number>>): Rarity {
  const entries = Object.entries(weights) as [Rarity, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;

  for (const [rarity, weight] of entries) {
    if (roll < weight) return rarity;
    roll -= weight;
  }

  return entries[entries.length - 1][0];
}
