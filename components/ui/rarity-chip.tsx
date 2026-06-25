"use client";

import { cn } from "@/lib/utils";
import { RARITY_STYLES, type Rarity } from "@/lib/cases";

/**
 * Rarity badge chip — handles the animated rainbow style for Ultra
 * automatically. Replaces the manual `${style.border} ${style.bg} ${style.text}`
 * pattern that shows red for ultra.
 */
export function RarityChip({
  rarity,
  children,
  className,
}: {
  rarity: Rarity;
  children: React.ReactNode;
  className?: string;
}) {
  const style = RARITY_STYLES[rarity];

  if (style.rainbow) {
    return (
      <span
        className={cn(
          "relative inline-flex items-center overflow-hidden rounded-full bg-black/40 px-2.5 py-0.5 text-[10px] font-bold",
          className
        )}
      >
        <span aria-hidden className="rainbow-border" />
        <span className="rainbow-text">{children}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[10px] font-bold",
        style.border,
        style.bg,
        style.text,
        className
      )}
    >
      {children}
    </span>
  );
}
