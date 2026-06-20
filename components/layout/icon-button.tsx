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
}

export function IconButton({
  icon: Icon,
  label,
  badge,
  href,
  onClick,
  className,
}: IconButtonProps) {
  const sound = useSoundManager();

  const sharedClassName = cn(
    "relative flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-zinc-300 transition-colors hover:bg-purple-500/20 hover:text-purple-300",
    className
  );

  const content = (
    <>
      <Icon className="h-5 w-5" />
      {typeof badge === "number" && badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-purple-600 px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <MotionLink
        href={href}
        title={label}
        onMouseEnter={sound.hover}
        onClick={sound.click}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className={sharedClassName}
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
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      className={sharedClassName}
    >
      {content}
    </motion.button>
  );
}
