"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useSoundManager } from "@/lib/sound-manager";
import type { LucideIcon } from "lucide-react";

const MotionLink = motion.create(Link);

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  badge?: number;
  href?: string;
  onClick?: () => void;
  className?: string;
  /** When true: renders as icon + text pill. Default: icon-only circle. */
  showLabel?: boolean;
}

export function IconButton({
  icon: Icon,
  label,
  badge,
  href,
  onClick,
  className,
  showLabel = false,
}: IconButtonProps) {
  const sound = useSoundManager();

  const pillClass = cn(
    "relative flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 transition-all hover:border-purple-400/30 hover:bg-purple-500/15 hover:text-purple-200",
    className
  );
  const iconClass = cn(
    "relative flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] text-zinc-300 transition-all hover:bg-purple-500/20 hover:text-purple-300",
    className
  );

  const badgeEl =
    typeof badge === "number" && badge > 0 ? (
      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-600 px-1 text-[9px] font-bold text-white">
        {badge > 99 ? "99+" : badge}
      </span>
    ) : null;

  const content = showLabel ? (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="leading-none">{label}</span>
      {badgeEl}
    </>
  ) : (
    <>
      <Icon className="h-5 w-5" />
      {badgeEl}
    </>
  );

  if (href) {
    return (
      <MotionLink
        href={href}
        title={label}
        onMouseEnter={sound.hover}
        onClick={sound.click}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={showLabel ? pillClass : iconClass}
      >
        {content}
      </MotionLink>
    );
  }

  return (
    <motion.button
      type="button"
      title={label}
      onMouseEnter={sound.hover}
      onClick={() => {
        sound.click();
        onClick?.();
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={showLabel ? pillClass : iconClass}
    >
      {content}
    </motion.button>
  );
}
