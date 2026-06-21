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
  { id: "hat", label: "Mütze", icon: HardHat, dbType: "hat" },
  { id: "jacket", label: "Jacke", icon: Shirt, dbType: "jacket" },
  { id: "pants", label: "Hose", icon: Footprints, dbType: "pants" },
  { id: "shoes", label: "Schuhe", icon: Footprints, dbType: "shoes" },
  { id: "trail", label: "Trail", icon: Waves, dbType: "trail" },
  { id: "shield", label: "Schild", icon: Shield, dbType: "shield_cosmetic" },
  { id: "aura", label: "Aura", icon: Sparkles, dbType: "aura" },
  { id: "face", label: "Gesicht", icon: Smile, dbType: "face" },
  { id: "hair_m", label: "Haare", icon: User, dbType: "hair_m" },
  { id: "hair_f", label: "Haare", icon: User, dbType: "hair_f" },
  { id: "pet", label: "Haustier", icon: PawPrint, dbType: "pet" },
  { id: "weapon", label: "Waffe", icon: Sword, dbType: "weapon_cosmetic" },
  { id: "ring", label: "Ring", icon: Circle, dbType: "ring" },
  { id: "amulet", label: "Amulett", icon: Gem, dbType: "amulet" },
];

export function getCategoryByDbType(dbType: string): WardrobeCategory | undefined {
  return WARDROBE_CATEGORIES.find((c) => c.dbType === dbType);
}

/** Hair is gender-locked at the data level (hair_m vs hair_f are different
 * dbTypes, and CharacterModel only ever reads one of them per gender) — so
 * the category list shown to the player should only ever offer the slot
 * that's actually relevant to their selected gender, never both at once. */
export function getCategoriesForGender(gender: "m" | "w"): WardrobeCategory[] {
  return [
    ALL_CATEGORY,
    ...WARDROBE_CATEGORIES.filter((c) => {
      if (c.dbType === "hair_m") return gender === "m";
      if (c.dbType === "hair_f") return gender === "w";
      return true;
    }),
  ];
}
