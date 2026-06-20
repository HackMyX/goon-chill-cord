import {
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
  type LucideIcon,
} from "lucide-react";

export interface WardrobeCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Value stored in items.type for this slot. */
  dbType: string;
}

export const WARDROBE_CATEGORIES: WardrobeCategory[] = [
  { id: "hat", label: "Mütze", icon: HardHat, dbType: "hat" },
  { id: "jacket", label: "Jacke", icon: Shirt, dbType: "jacket" },
  { id: "pants", label: "Hose", icon: Footprints, dbType: "pants" },
  { id: "shoes", label: "Schuhe", icon: Footprints, dbType: "shoes" },
  { id: "trail", label: "Trail", icon: Waves, dbType: "trail" },
  { id: "shield", label: "Schild", icon: Shield, dbType: "shield_cosmetic" },
  { id: "aura", label: "Aura", icon: Sparkles, dbType: "aura" },
  { id: "face", label: "Gesicht", icon: Smile, dbType: "face" },
  { id: "hair_m", label: "Haare ♂", icon: User, dbType: "hair_m" },
  { id: "hair_f", label: "Haare ♀", icon: User, dbType: "hair_f" },
  { id: "pet", label: "Haustier", icon: PawPrint, dbType: "pet" },
  { id: "weapon", label: "Waffe", icon: Sword, dbType: "weapon_cosmetic" },
];

export function getCategoryByDbType(dbType: string): WardrobeCategory | undefined {
  return WARDROBE_CATEGORIES.find((c) => c.dbType === dbType);
}
