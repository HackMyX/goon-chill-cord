import {
  LayoutGrid,
  HardHat,
  Shirt,
  Footprints,
  Waves,
  Shield,
  Sparkles,
  Smile,
  User,
  PawPrint,
  Sword,
  Circle,
  Gem,
  type LucideIcon,
} from "lucide-react";

export interface WardrobeCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Value stored in items.type for this slot. "*" is the "Alle"
   * pseudo-category — no real item has this type, it's a sentinel the
   * wardrobe UI checks for to skip the type filter entirely. */
  dbType: string;
  /** Key used to look up this slot in the equippedByCategory map.
   * Only needed when a slot shares a dbType with another slot (ring2
   * shares dbType "ring" but lives at equippedByCategory["ring2"]). */
  slotKey?: string;
}

/** Shown first, ahead of every real slot — lets you browse/search the
 * whole inventory at once instead of having to pick a category first. */
export const ALL_CATEGORY: WardrobeCategory = {
  id: "all",
  label: "Alle",
  icon: LayoutGrid,
  dbType: "*",
};

export const WARDROBE_CATEGORIES: WardrobeCategory[] = [
  { id: "hat", label: "Helm", icon: HardHat, dbType: "hat" },
  { id: "jacket", label: "Jacke", icon: Shirt, dbType: "jacket" },
  { id: "pants", label: "Hose", icon: Footprints, dbType: "pants" },
  { id: "shoes", label: "Schuhe", icon: Footprints, dbType: "shoes" },
  { id: "trail", label: "Trail", icon: Waves, dbType: "trail" },
  { id: "shield", label: "Schild", icon: Shield, dbType: "shield_cosmetic" },
  { id: "aura", label: "Aura", icon: Sparkles, dbType: "aura" },
  { id: "face", label: "Gesicht", icon: Smile, dbType: "face" },
  // Hair is one unisex catalogue type now ("hair", not hair_m/hair_f) — the
  // same item shows up for every player regardless of gender, and renders
  // through a gender-adapted shape (item-variants.tsx HairVariant). That's
  // what makes hair tradeable/sellable as one listing instead of two
  // separate, gender-locked items with the same color.
  { id: "hair", label: "Haare", icon: User, dbType: "hair" },
  { id: "pet", label: "Haustier", icon: PawPrint, dbType: "pet" },
  { id: "weapon", label: "Waffe", icon: Sword, dbType: "weapon_cosmetic" },
  // Two ring slots — one per arm. Both share dbType "ring" (same item
  // catalogue), but map to distinct keys in equippedByCategory:
  //   "ring"  → right arm (slot 1, oldest-equipped ring)
  //   "ring2" → left arm  (slot 2, newest-equipped ring)
  { id: "ring", label: "Ring (rechts)", icon: Circle, dbType: "ring" },
  { id: "ring2", label: "Ring (links)", icon: Circle, dbType: "ring", slotKey: "ring2" },
  { id: "amulet", label: "Amulett", icon: Gem, dbType: "amulet" },
];

export function getCategoryByDbType(dbType: string): WardrobeCategory | undefined {
  return WARDROBE_CATEGORIES.find((c) => c.dbType === dbType);
}

/** Every category is gender-neutral now (including hair) — this used to
 * filter hair_m/hair_f by gender, but the catalogue itself is unisex these
 * days, so there's nothing left to filter. */
export function getCategories(): WardrobeCategory[] {
  return [ALL_CATEGORY, ...WARDROBE_CATEGORIES];
}
