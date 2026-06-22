import type { Rarity } from "@/lib/cases";

/**
 * Raw hex values for rarity tints — shared between the Garderobe's 3D
 * preview (components/wardrobe/character-preview-3d.tsx) and the 3D world
 * character (components/world/player.tsx) so an equipped item reads as the
 * exact same color everywhere, regardless of which renderer is drawing it.
 */
export const RARITY_HEX: Record<Rarity, string> = {
  normal: "#3b82f6",
  selten: "#a855f7",
  mythisch: "#f59e0b",
  ultra: "#ff3b3b",
};

export interface EquippedItem {
  name: string;
  rarity: Rarity;
  /** Inventory row id — optional because CharacterModel/Player only need
   * name+rarity for rendering, but UI that offers an unequip action
   * (the Garderobe's equipped-summary list) needs it to call toggleEquip. */
  id?: string;
  /** Weapon power, see lib/combat.ts — `undefined`/`null` for every
   * non-weapon item (and for weapon skins an admin hasn't priced yet,
   * which still fall back to fist damage rather than reading as 0). */
  damage?: number | null;
  /** Flat damage-reduction points — see lib/combat.ts's
   * `applyArmorReduction`. `undefined`/0 for every item that isn't actually
   * armor (the vast majority of the cosmetic catalogue). */
  armor?: number | null;
  /** Amulet/ring perk, see lib/combat.ts's `PerkType` — `"none"`/undefined
   * for every item without one. */
  perk_type?: "none" | "speed_boost" | "jump_boost" | "hp_regen_boost" | null;
  /** Perk strength, a multiplier added on top of 1.0 — only meaningful
   * alongside a non-`"none"` `perk_type`. */
  perk_magnitude?: number | null;
  /** Shield HP this item's aura absorbs before breaking — 0/undefined for
   * a shield_cosmetic row that's purely decorative. */
  shield_hp?: number | null;
  /** Seconds after breaking before the shield can absorb again. */
  shield_regen_cooldown_sec?: number | null;
}

/**
 * German color adjectives used by scripts/generate-all-items.js's color
 * matrix (Rote/Roter, Blaue/Blauer, ...) mapped to the actual hex they must
 * render as. Matched against the *stem*, not the full inflected word, so
 * both the feminine ("Rote Jacke") and masculine ("Roter Helm") forms hit
 * the same entry. Order doesn't matter — every stem is distinct, no two
 * colors can both match the same name.
 *
 * This existing without ever being read was the root cause of "item name
 * says rot but it renders blue/purple/whatever" — every item used to be
 * tinted purely by rarity, completely ignoring its own name.
 */
const NAMED_COLOR_HEX: [RegExp, string][] = [
  [/Rot/, "#ef4444"],
  [/Blau/, "#3b82f6"],
  [/Grün/, "#22c55e"],
  [/Gelb/, "#eab308"],
  [/Lila/, "#a855f7"],
  [/Orange/, "#f97316"],
  [/Cyan/, "#06b6d4"],
  [/Rosa/, "#ec4899"],
  [/Weiß/, "#e4e4e7"],
  [/Schwarz/, "#3f3f46"],
  [/Braun/, "#92400e"],
  [/Türkis/, "#14b8a6"],
];

export function namedColorFor(name: string): string | undefined {
  for (const [pattern, hex] of NAMED_COLOR_HEX) {
    if (pattern.test(name)) return hex;
  }
  return undefined;
}

/**
 * The color a piece of equipment must render in: its own name's color word
 * if it has one ("Roter Helm" -> red, always, regardless of rarity), else
 * the rarity tint as before (curated names like "Voidhose" or "Donnerhammer"
 * have no color word and were never meant to be color-matrix items).
 */
export function rarityColorFor(item: EquippedItem | undefined, fallback: string): string {
  if (!item) return fallback;
  return namedColorFor(item.name) ?? RARITY_HEX[item.rarity];
}
