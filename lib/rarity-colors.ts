import type { Rarity } from "@/lib/cases";

/**
 * Raw hex values for rarity tints — shared between the 2D SVG avatar
 * (components/avatar/avatar-renderer.tsx) and the 3D world character
 * (components/world/player.tsx) so an equipped item reads as the exact same
 * color everywhere, regardless of which renderer is drawing it.
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
}

export function rarityColorFor(item: EquippedItem | undefined, fallback: string): string {
  return item ? RARITY_HEX[item.rarity] : fallback;
}
