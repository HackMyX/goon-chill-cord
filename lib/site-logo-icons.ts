import {
  Gamepad2,
  Sword,
  Swords,
  Shield,
  ShieldHalf,
  Crown,
  Zap,
  Flame,
  Trophy,
  Star,
  Rocket,
  Skull,
  Ghost,
  Joystick,
  Dice5,
  Target,
  Heart,
  Gem,
  Sparkles,
  Crosshair,
  Axe,
  Bomb,
  Bot,
  Dna,
  Flag,
  Hexagon,
  Infinity,
  Moon,
  Puzzle,
  Wand2,
  type LucideIcon,
} from "lucide-react";

/**
 * Curated icon choices for the admin Branding tab's logo picker
 * (components/admin/site-config-editor.tsx) — this project has no file-
 * upload/storage pipeline, so "choose from many" means picking one of
 * these built-in icons rather than uploading an image. A custom-URL field
 * stays available alongside this for anyone who wants a real image
 * instead. Exported as a name→component map (not the components
 * themselves) so lib/site-config.ts (a plain data file, no JSX) can store
 * just the string name, and both the admin picker and the actual render
 * sites (components/layout/top-bar.tsx, app/page.tsx) resolve through
 * this same lookup — one place to add a new option later.
 */
export const SITE_LOGO_ICONS: Record<string, LucideIcon> = {
  Gamepad2,
  Sword,
  Swords,
  Shield,
  ShieldHalf,
  Crown,
  Zap,
  Flame,
  Trophy,
  Star,
  Rocket,
  Skull,
  Ghost,
  Joystick,
  Dice5,
  Target,
  Heart,
  Gem,
  Sparkles,
  Crosshair,
  Axe,
  Bomb,
  Bot,
  Dna,
  Flag,
  Hexagon,
  Infinity,
  Moon,
  Puzzle,
  Wand2,
};

export type SiteLogoIconName = keyof typeof SITE_LOGO_ICONS;

export const DEFAULT_SITE_LOGO_ICON: SiteLogoIconName = "Gamepad2";

/** Resolves a stored icon name to its component, falling back to the
 * default if the name is missing/unrecognized (e.g. a future code change
 * removes an icon that was once picked). */
export function resolveSiteLogoIcon(name: string | null | undefined): LucideIcon {
  if (name && name in SITE_LOGO_ICONS) return SITE_LOGO_ICONS[name];
  return SITE_LOGO_ICONS[DEFAULT_SITE_LOGO_ICON];
}
