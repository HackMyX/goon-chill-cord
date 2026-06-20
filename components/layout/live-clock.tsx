"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";

function getMidnightCountdown() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();

  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  return [hours, minutes, seconds]
    .map((n) => n.toString().padStart(2, "0"))
    .join(":");
}

export function LiveClock({ streakDays = 2 }: { streakDays?: number }) {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setTime(getMidnightCountdown());
    const timeout = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex flex-col items-center rounded-2xl bg-white/5 px-6 py-2">
      <span className="font-mono text-sm tabular-nums text-zinc-200">
        {time ?? "--:--:--"}
      </span>
      <span className="flex items-center gap-1 text-xs text-orange-400">
        <Flame className="h-3 w-3" />
        Streak: {streakDays} Tage
      </span>
    </div>
  );
}
