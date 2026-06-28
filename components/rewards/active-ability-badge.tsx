"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { getMyEquippedAbility } from "@/lib/actions/abilities";
import { ABILITY_EFFECT_META, type AbilityDefinition } from "@/lib/abilities";

const RARITY_COL: Record<string, string> = {
  selten: "#60a5fa", mythisch: "#c084fc", ultra: "#fbbf24",
};

/**
 * Compact pill showing the player's currently EQUIPPED ability while they play —
 * so an active boost is always visible (mirrors GameBonusBadge). Hidden when no
 * ability is equipped. Pass a changing `refreshKey` to re-poll.
 */
export function ActiveAbilityBadge({ refreshKey = 0 }: { refreshKey?: number }) {
  const [a, setA] = useState<AbilityDefinition | null>(null);

  useEffect(() => {
    let on = true;
    getMyEquippedAbility().then((v) => { if (on) setA(v); }).catch(() => undefined);
    return () => { on = false; };
  }, [refreshKey]);

  if (!a) return null;
  const col = RARITY_COL[a.rarity] ?? "#a78bfa";
  const effectLabel = ABILITY_EFFECT_META[a.effectType]?.label ?? a.effectType;

  return (
    <span
      title={`Aktiver Fähigkeits-Gutschein: ${effectLabel}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-black"
      style={{ borderColor: `${col}66`, background: `${col}1f`, color: col, boxShadow: `0 0 12px -3px ${col}` }}
    >
      <Sparkles className="h-3 w-3" /> {a.name}
    </span>
  );
}
