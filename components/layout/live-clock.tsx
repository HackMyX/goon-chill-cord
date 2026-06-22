"use client";

import { useEffect, useState } from "react";
import { Flame, Gift, Loader2 } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { getClaimStatus, claimDailyReward } from "@/lib/actions/streak";
import { DEFAULT_STREAK_CONFIG } from "@/lib/streak";
import { StreakInfoPopover } from "@/components/layout/streak-info-popover";
import { useSoundManager } from "@/lib/sound-manager";
import { debugLog, debugWarn } from "@/lib/debug";
import { useSiteConfig } from "@/components/layout/site-config-provider";

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

interface LiveClockProps {
  streakDays?: number;
  /** Lets the host page sync its own credits state immediately instead of
   * waiting for a full server refresh (same pattern as DashboardShell's
   * handleCreditsChange for case-opening) — optional since most pages
   * just pass `credits` straight through to TopBar with no local state to
   * sync. */
  onClaimed?: (newCredits: number) => void;
}

/**
 * The streak counter used to be a pure display value — `streak_days` was
 * never actually written anywhere, so it just sat frozen at whatever the
 * profile happened to have. This is now also the daily-claim control: a
 * "Claim" button appears whenever lib/actions/streak.ts says today's
 * reward hasn't been picked up yet, and claiming it is what actually
 * grows the streak (see lib/streak.ts for the reward curve + grace-period
 * logic, admin-configurable from /admin).
 */
export function LiveClock({ streakDays: initialStreakDays = 0, onClaimed }: LiveClockProps) {
  const hydrated = useHydrated();
  const [time, setTime] = useState("--:--:--");
  const [streakDays, setStreakDays] = useState(initialStreakDays);
  const [bestStreakDays, setBestStreakDays] = useState(0);
  const [streakConfig, setStreakConfig] = useState(DEFAULT_STREAK_CONFIG);
  const [canClaim, setCanClaim] = useState(false);
  const [previewReward, setPreviewReward] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [justClaimed, setJustClaimed] = useState<number | null>(null);
  const { currencyName } = useSiteConfig();
  const sound = useSoundManager();

  useEffect(() => {
    if (!hydrated) return;
    const tick = () => setTime(getMidnightCountdown());
    const timeout = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    getClaimStatus().then((status) => {
      if (!active) return;
      setCanClaim(status.canClaim);
      setPreviewReward(status.previewReward);
      setStreakDays(status.streakDays);
      setBestStreakDays(status.bestStreakDays);
      setStreakConfig(status.config);
    });
    return () => {
      active = false;
    };
  }, [hydrated]);

  async function handleClaim() {
    if (!canClaim || claiming) return;
    setClaiming(true);
    sound.click();
    debugLog("Streak", "claim attempt");
    const res = await claimDailyReward();
    setClaiming(false);
    if (res.success) {
      sound.win();
      setCanClaim(false);
      setStreakDays(res.newStreak ?? streakDays);
      setBestStreakDays((best) => Math.max(best, res.newStreak ?? 0));
      setJustClaimed(res.reward ?? null);
      debugLog("Streak", "claim success", res);
      if (res.newCredits !== undefined) onClaimed?.(res.newCredits);
      setTimeout(() => setJustClaimed(null), 4000);
    } else {
      sound.error();
      debugWarn("Streak", "claim failed", res.error);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-center rounded-2xl bg-white/5 px-6 py-2">
        <span className="font-mono text-sm tabular-nums text-zinc-200">{time}</span>
        <span className="flex items-center gap-1 text-xs text-orange-400">
          <Flame className="h-3 w-3" />
          Streak: {streakDays} Tage
          {hydrated && (
            <StreakInfoPopover streakDays={streakDays} bestStreakDays={bestStreakDays} config={streakConfig} />
          )}
        </span>
      </div>

      {hydrated && canClaim && (
        <button
          onMouseEnter={sound.hover}
          onClick={handleClaim}
          disabled={claiming}
          title={`Tägliche Belohnung abholen (+${previewReward.toLocaleString("de-DE")} ${currencyName})`}
          className="flex items-center gap-1.5 rounded-2xl border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.35)] transition-all hover:bg-emerald-500/25 disabled:opacity-60"
        >
          {claiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}
          +{previewReward.toLocaleString("de-DE")} {currencyName}
        </button>
      )}

      {justClaimed !== null && (
        <span className="animate-pulse rounded-2xl bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-300">
          +{justClaimed.toLocaleString("de-DE")} {currencyName} erhalten!
        </span>
      )}
    </div>
  );
}
