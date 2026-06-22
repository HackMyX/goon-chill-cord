import {
  Sword,
  Shield,
  HardHat,
  Shirt,
  Gem,
  Footprints,
  Sparkles,
  Smile,
  User,
  PawPrint,
  Waves,
  type LucideIcon,
} from "lucide-react";

const ITEM_TYPE_ICONS: Record<string, LucideIcon> = {
  ring: Gem,
  amulet: Gem,
  // Wardrobe (cosmetic) items
  hat: HardHat,
  jacket: Shirt,
  pants: Footprints,
  shoes: Footprints,
  trail: Waves,
  shield_cosmetic: Shield,
  aura: Sparkles,
  face: Smile,
  hair: User,
  pet: PawPrint,
  weapon_cosmetic: Sword,
};

/** Whether `type` has a deliberate icon mapping, vs. falling back to a placeholder. */
export function hasItemIcon(type: string): boolean {
  return type in ITEM_TYPE_ICONS;
}

/** Every `type` string with a real icon — shown to admins creating/editing
 * items so it's obvious which types render a real icon vs. the floating
 * placeholder (see ItemRenderer). */
export const KNOWN_ICON_TYPES = Object.keys(ITEM_TYPE_ICONS).sort();

export function getItemIcon(type: string): LucideIcon {
  return ITEM_TYPE_ICONS[type] ?? Gem;
}
