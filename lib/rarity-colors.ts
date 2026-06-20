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
}

export function rarityColorFor(item: EquippedItem | undefined, fallback: string): string {
  return item ? RARITY_HEX[item.rarity] : fallback;
}
