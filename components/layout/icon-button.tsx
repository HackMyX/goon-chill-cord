"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  badge?: number;
  onClick?: () => void;
  className?: string;
}

export function IconButton({
  icon: Icon,
  label,
  badge,
  onClick,
  className,
}: IconButtonProps) {
  return (
    <motion.button
      type="button"
      title={label}
      onClick={onClick}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-zinc-300 transition-colors hover:bg-purple-500/20 hover:text-purple-300",
        className
      )}
    >
      <Icon className="h-5 w-5" />
      {typeof badge === "number" && badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-purple-600 px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </motion.button>
  );
}
