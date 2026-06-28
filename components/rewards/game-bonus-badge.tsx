"use client";

import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { getMyGameBonusRemaining } from "@/lib/actions/rewards";

/**
 * Compact pill showing how many voucher-granted EXTRA plays the player has left
 * for this game. Hidden when zero. The bonus is spent automatically once the
 * player is over their normal hourly/daily cap — this just makes it visible.
 * Pass a changing `refreshKey` (e.g. after each play) to re-poll the count.
 */
export function GameBonusBadge({
  game, suffix, refreshKey = 0,
}: {
  game: "plinko" | "snake" | "don";
  suffix?: string;
  refreshKey?: number;
}) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    let active = true;
    getMyGameBonusRemaining(game).then((n) => { if (active) setRemaining(n); }).catch(() => undefined);
    return () => { active = false; };
  }, [game, refreshKey]);

  if (remaining <= 0) return null;

  return (
    <span
      title="Bonus-Spielzüge aus Gutscheinen — werden automatisch genutzt, sobald dein normales Limit erreicht ist."
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-black text-amber-300 shadow-[0_0_12px_-2px_rgba(245,158,11,0.55)]"
    >
      <Gift className="h-3 w-3" /> +{remaining} Bonus{suffix ? ` ${suffix}` : ""}
    </span>
  );
}
