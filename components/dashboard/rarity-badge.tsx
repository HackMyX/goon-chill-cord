import { Badge } from "@/components/ui/badge";
import { RARITY_LABELS, RARITY_STYLES, type Rarity } from "@/lib/cases";
import { cn } from "@/lib/utils";

interface RarityBadgeProps {
  rarity: Rarity;
  className?: string;
}

export function RarityBadge({ rarity, className }: RarityBadgeProps) {
  const style = RARITY_STYLES[rarity];

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
        <span className="rainbow-text">{RARITY_LABELS[rarity]}</span>
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
      {RARITY_LABELS[rarity]}
    </Badge>
  );
}
