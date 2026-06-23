"use client";

import { Badge } from "@/components/ui/badge";
import { RARITY_STYLES, type Rarity } from "@/lib/cases";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { cn } from "@/lib/utils";

interface RarityBadgeProps {
  rarity: Rarity;
  className?: string;
}

export function RarityBadge({ rarity, className }: RarityBadgeProps) {
  const style = RARITY_STYLES[rarity];
  const { rarityLabels } = useSiteConfig();
  const label = rarityLabels[rarity] ?? rarity;

  if (style.rainbow) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "relative overflow-hidden border-transparent bg-black/40 font-bold uppercase tracking-wide",
          className
        )}
      >
        <span aria-hidden className="rainbow-border" />
        <span className="rainbow-text">{label}</span>
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "border font-bold uppercase tracking-wide",
        style.text,
        style.border,
        style.bg,
        style.glow,
        className
      )}
    >
      {label}
    </Badge>
  );
}
