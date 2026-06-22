import {
  Tag,
  Shirt,
  Footprints,
  Crown,
  Gem,
  Sparkles,
  Sword,
  Shield,
  PawPrint,
  Wind,
  Eye,
  Smile,
  Flame,
  Star,
  Gift,
  type LucideIcon,
} from "lucide-react";

/**
 * Curated icon choices for shop categories (components/admin/shop-
 * category-manager.tsx) — same name→component lookup pattern as
 * lib/site-logo-icons.ts, for the same reason: only the string name is
 * stored (shop_categories.icon), and both the admin picker and the
 * player-facing shop resolve through this one map.
 */
export const SHOP_CATEGORY_ICONS: Record<string, LucideIcon> = {
  Tag,
  Shirt,
  Footprints,
  Crown,
  Gem,
  Sparkles,
  Sword,
  Shield,
  PawPrint,
  Wind,
  Eye,
  Smile,
  Flame,
  Star,
  Gift,
};

export const DEFAULT_SHOP_CATEGORY_ICON = "Tag";

export function resolveShopCategoryIcon(name: string | null | undefined): LucideIcon {
  if (name && name in SHOP_CATEGORY_ICONS) return SHOP_CATEGORY_ICONS[name];
  return SHOP_CATEGORY_ICONS[DEFAULT_SHOP_CATEGORY_ICON];
}

/** Small fixed palette — stored as a key (e.g. "purple"), resolved to
 * Tailwind classes app-side so the DB never holds raw class strings. */
export const SHOP_CATEGORY_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  purple: { text: "text-purple-300", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  cyan: { text: "text-cyan-300", bg: "bg-cyan-500/10", border: "border-cyan-500/30" },
  amber: { text: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  emerald: { text: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  rose: { text: "text-rose-300", bg: "bg-rose-500/10", border: "border-rose-500/30" },
  sky: { text: "text-sky-300", bg: "bg-sky-500/10", border: "border-sky-500/30" },
  orange: { text: "text-orange-300", bg: "bg-orange-500/10", border: "border-orange-500/30" },
};

export const DEFAULT_SHOP_CATEGORY_COLOR = "purple";

export function resolveShopCategoryColor(name: string | null | undefined) {
  if (name && name in SHOP_CATEGORY_COLORS) return SHOP_CATEGORY_COLORS[name];
  return SHOP_CATEGORY_COLORS[DEFAULT_SHOP_CATEGORY_COLOR];
}
