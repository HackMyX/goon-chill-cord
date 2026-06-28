import type { Rarity } from "@/lib/cases";

/**
 * Pure shop types + price math — not in the "use server" actions file
 * for the same reason as lib/auctions.ts: every export from a "use
 * server" module must itself be an async Server Action.
 */
export interface ShopSettings {
  autoGenerateEnabled: boolean;
  autoGenerateItemCount: number;
  autoGeneratePriceMultiplierMin: number;
  autoGeneratePriceMultiplierMax: number;
  autoGenerateItemTypes: string[];
  /** Konfigurierbare Seltenheits-Gewichte für die Automatik (höher = häufiger). */
  rarityWeights: Record<Rarity, number>;
  motd: string | null;
  motdEnabled: boolean;
}

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  autoGenerateEnabled: true,
  autoGenerateItemCount: 8,
  autoGeneratePriceMultiplierMin: 1.5,
  autoGeneratePriceMultiplierMax: 2.5,
  rarityWeights: { normal: 10, selten: 5, mythisch: 1.5, ultra: 0.4 },
  motd: null,
  motdEnabled: false,
  autoGenerateItemTypes: [
    "hat",
    "jacket",
    "pants",
    "shoes",
    "weapon_cosmetic",
    "pet",
    "aura",
    "trail",
    "ring",
    "amulet",
    "hair",
    "face",
    "shield_cosmetic",
  ],
};

export const ALL_SHOP_ITEM_TYPES = [
  "hat",
  "jacket",
  "pants",
  "shoes",
  "weapon",
  "weapon_cosmetic",
  "pet",
  "aura",
  "trail",
  "ring",
  "amulet",
  "hair",
  "face",
  "shield_cosmetic",
];

/** German display labels for `ALL_SHOP_ITEM_TYPES` — shared by the global
 * Automatik settings (components/admin/shop-tab.tsx) and the per-category
 * type-filter picker (components/admin/shop-category-manager.tsx). */
export const SHOP_ITEM_TYPE_LABELS: Record<string, string> = {
  hat: "Hüte",
  jacket: "Jacken",
  pants: "Hosen",
  shoes: "Schuhe",
  weapon: "Waffen",
  weapon_cosmetic: "Waffen-Skins",
  pet: "Pets",
  aura: "Auren",
  trail: "Trails",
  ring: "Ringe",
  amulet: "Amulette",
  hair: "Haare",
  face: "Gesichter",
  shield_cosmetic: "Schilde",
};

/** Rarer items get picked less often, but never zero chance — this is
 * what makes a Mythisch/Ultra item showing up in the shop feel like an
 * event instead of either "never happens" or "happens constantly". */
export const SHOP_RARITY_PICK_WEIGHT: Record<Rarity, number> = {
  normal: 10,
  selten: 5,
  mythisch: 1.5,
  ultra: 0.4,
};

/** Rounds an absurd markup to a "clean-looking" number — 1,234 CR reads
 * as a bug, 1,250 CR reads as an intentional price. */
export function roundToNicePrice(value: number): number {
  if (value < 500) return Math.round(value / 10) * 10;
  if (value < 5000) return Math.round(value / 50) * 50;
  return Math.round(value / 100) * 100;
}

/** UTC calendar-day string (YYYY-MM-DD) — the shop rotates at midnight
 * UTC, same canonical-day convention as lib/streak.ts's dateKey(). */
export function shopDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
