export type Rarity = "normal" | "selten" | "mythisch" | "ultra";

/** Name-based icon reference — never the actual component. `CaseGroup` is
 * resolved server-side (lib/cases-config.ts) and passed as a prop into the
 * client tree (DashboardShell); only plain, JSON-serializable data may cross
 * that Server -> Client boundary. The string is resolved to a real Lucide
 * icon client-side via `getCaseIcon()` in lib/case-icons.ts. */
export type CaseIconName = "package" | "swords";

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
    text: "text-red-400",
    border: "border-red-500/60",
    bg: "bg-red-500/15",
    glow: "shadow-[0_0_14px_rgba(255,60,200,0.55)]",
    barBg: "bg-red-600",
    hoverRing: "hover:ring-2 hover:ring-red-400/70",
    hoverGlow: "hover:shadow-[0_0_30px_rgba(239,68,68,0.6)]",
    pulseGlow: "animate-pulse shadow-[0_0_24px_rgba(239,68,68,0.6)]",
    rainbow: true,
  },
};

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
  "weapon",
  "shield",
  "helmet",
  "armor",
  "cape",
  "ring",
  "amulet",
] as const;

/** Human-readable category label per dbType — shown next to item names
 * (case-win reveal, admin item rows) so it's clear what slot/category an
 * item belongs to, not just its rarity. Unknown future types fall back to
 * a capitalized version of the raw string instead of nothing. */
const TYPE_LABELS: Record<string, string> = {
  hat: "Mütze",
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
  weapon: "Waffe",
  shield: "Schild",
  helmet: "Helm",
  armor: "Rüstung",
  cape: "Umhang",
  ring: "Ring",
  amulet: "Amulett",
};

export function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

export interface CaseGroup {
  id: string;
  title: string;
  subtitle?: string;
  iconName: CaseIconName;
  /** items.type values that belong to this case's pool. */
  itemTypes: string[];
  standard: CaseTier;
  premium: CaseTier;
}

export const CASE_GROUPS: CaseGroup[] = [
  {
    id: "cosmetics",
    title: "Case Opening",
    iconName: "package",
    // Every wardrobe-cosmetic dbType (lib/wardrobe.ts) plus the small set of
    // legacy RPG accessory types — this is the pool that actually contains
    // ~95% of the 900+ generated items, so it has to cover all of them or
    // almost nothing is ever reachable from this case.
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
      "helmet",
      "armor",
      "cape",
    ],
    // Both tiers' weights now sum to a clean 100, and premium (5x the
    // price of standard) consistently buys a 5x better shot at Ultra in
    // both case groups — with the in-between rarities improving by a
    // smaller, still-meaningful multiplier. Rarer tier = bigger relative
    // payoff for paying the premium price, which is the whole point of a
    // premium tier existing at all.
    // Matches the original site's published odds exactly (Normal 87% /
    // Selten 10% / Mythisch 3% / Ultra 0.1% standard, 78/14/7.5/0.5
    // premium) — normal is shaved by the rounding remainder (86.9/91.95
    // below) purely so each tier sums to exactly 100, not 100.05-100.1;
    // it still displays as the same rounded percentage.
    standard: {
      id: "cosmetics-standard",
      label: "CASE ÖFFNEN",
      price: 100,
      rarityWeights: { normal: 86.9, selten: 10, mythisch: 3, ultra: 0.1 },
    },
    premium: {
      id: "cosmetics-premium",
      label: "PREMIUM",
      sublabel: "NOCH MEHR CHANCE",
      price: 500,
      rarityWeights: { normal: 78, selten: 14, mythisch: 7.5, ultra: 0.5 },
    },
  },
  {
    id: "weapons",
    title: "Waffen Case",
    subtitle: "Gewinne Waffen für den 3D-World-Kampf — ab 2.000 CR",
    iconName: "swords",
    itemTypes: ["weapon", "shield", "weapon_cosmetic"],
    // Same "matches the original site's published odds exactly" note as
    // the cosmetics group above (92/6/2/0.05 standard, 84.8/9/6/0.2
    // premium, normal shaved by the rounding remainder so each tier sums
    // to exactly 100).
    standard: {
      id: "weapons-standard",
      label: "WAFFEN CASE",
      price: 2000,
      rarityWeights: { normal: 91.95, selten: 6, mythisch: 2, ultra: 0.05 },
    },
    premium: {
      id: "weapons-premium",
      label: "PREMIUM WAFFE",
      sublabel: "ULTRA SELTENE WAFFEN",
      price: 10000,
      rarityWeights: { normal: 84.8, selten: 9, mythisch: 6, ultra: 0.2 },
    },
  },
];

export function findCaseTier(
  tierId: string,
  groups: CaseGroup[] = CASE_GROUPS
): { group: CaseGroup; tier: CaseTier } | undefined {
  for (const group of groups) {
    if (group.standard.id === tierId) return { group, tier: group.standard };
    if (group.premium.id === tierId) return { group, tier: group.premium };
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
