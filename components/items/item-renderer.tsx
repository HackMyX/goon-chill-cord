"use client";

import { createElement } from "react";
import { motion } from "framer-motion";
import { Sparkle } from "lucide-react";
import { RARITY_STYLES, type Rarity } from "@/lib/cases";
import { getItemIcon, hasItemIcon } from "@/lib/item-icons";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-10 w-10",
  xl: "h-16 w-16",
} as const;

interface ItemRendererProps {
  type: string;
  rarity: Rarity;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

/**
 * Single source of truth for turning an `items.type` + rarity into a visual.
 * Unmapped types render a floating, glowing placeholder instead of a blank/
 * broken icon, so the catalogue can scale to hundreds of items without
 * crashing or showing text errors while assets are still being imported.
 */
export function ItemRenderer({ type, rarity, size = "md", className }: ItemRendererProps) {
  const sizeClass = SIZE_CLASSES[size];
  const style = RARITY_STYLES[rarity];

  if (!hasItemIcon(type)) {
    return (
      <div className={cn("relative flex items-center justify-center", sizeClass, className)}>
        <div
          className="absolute inset-0 -m-2 rounded-full opacity-70 blur-md"
          style={{
            background:
              "radial-gradient(circle, rgba(168,85,247,0.45) 0%, rgba(168,85,247,0) 70%)",
          }}
        />
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          className="relative"
        >
          <Sparkle className={cn(sizeClass, "text-purple-200/80")} />
        </motion.div>
      </div>
    );
  }

  const Icon = getItemIcon(type);

  return createElement(Icon, {
    className: cn(
      sizeClass,
      style.rainbow
        ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.85)]"
        : `${style.text} drop-shadow-[0_0_6px_currentColor]`,
      className
    ),
  });
}
