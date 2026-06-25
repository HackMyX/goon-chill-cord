import { Package, Swords, Gem, Star, Shield, Zap, Crown, Flame, Trophy, Gift, Sparkles, type LucideIcon } from "lucide-react";
import type { CaseIconName } from "@/lib/cases";

/**
 * Resolves a serializable `CaseIconName` to an actual Lucide icon. Lives in
 * its own module (not lib/cases.ts) so the icon components themselves never
 * end up on a type that's passed as a prop from a Server Component — only
 * client code ever imports this file and calls the resolver locally.
 */
const CASE_ICONS: Record<CaseIconName, LucideIcon> = {
  package:  Package,
  swords:   Swords,
  gem:      Gem,
  star:     Star,
  shield:   Shield,
  zap:      Zap,
  crown:    Crown,
  flame:    Flame,
  trophy:   Trophy,
  gift:     Gift,
  sparkles: Sparkles,
};

export function getCaseIcon(name: CaseIconName): LucideIcon {
  return CASE_ICONS[name] ?? Package;
}
