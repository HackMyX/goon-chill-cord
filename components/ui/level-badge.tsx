"use client";

import { getLevelColor, getLevelBgColor, type UserLevelInfo } from "@/lib/level-system";

interface LevelBadgeProps {
  level: number;
  xp?: number;
  levelInfo?: UserLevelInfo | null;
  showXpBar?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
}

export function LevelBadge({
  level,
  xp,
  levelInfo,
  showXpBar = false,
  size = "sm",
  className = "",
}: LevelBadgeProps) {
  const colorClass = getLevelColor(level);
  const bgClass = getLevelBgColor(level);

  const sizeClass =
    size === "xs" ? "px-1.5 py-0.5 text-[10px]" :
    size === "sm" ? "px-2 py-0.5 text-xs" :
    "px-2.5 py-1 text-sm";

  return (
    <div className={`inline-flex flex-col gap-1 ${className}`}>
      <span
        className={`inline-flex items-center gap-0.5 rounded-md border font-bold tabular-nums ${bgClass} ${colorClass} ${sizeClass}`}
        title={levelInfo?.currentLevelDef?.title ? `${levelInfo.currentLevelDef.title} — ${xp ?? levelInfo?.xp ?? 0} XP` : `Level ${level}`}
      >
        <span className="opacity-60">Lv.</span>
        {level}
      </span>
      {showXpBar && levelInfo && levelInfo.xpForCurrentLevel > 0 && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${
              level >= 50 ? "bg-amber-400" :
              level >= 40 ? "bg-purple-400" :
              level >= 30 ? "bg-cyan-400" :
              level >= 20 ? "bg-emerald-400" :
              level >= 10 ? "bg-blue-400" :
              "bg-zinc-400"
            }`}
            style={{ width: `${levelInfo.progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
