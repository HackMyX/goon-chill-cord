"use client";

import { useEffect, useState } from "react";
import { Flame, Gift, Loader2, Sparkles, Zap } from "lucide-react";
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
  return [hours, minutes, seconds].map((n) => n.toString().padStart(2, "0")).join(":");
}

function flameSize(days: number): string {
  if (days >= 30) return "text-2xl";
  if (days >= 14) return "text-xl";
  if (days >= 7)  return "text-lg";
  return "text-base";
}

function streakColor(days: number): string {
  if (days >= 30) return "text-rose-400";
  if (days >= 14) return "text-orange-400";
  if (days >= 7)  return "text-amber-400";
  return "text-orange-300";
}

function streakGlow(days: number): string {
  if (days >= 30) return "shadow-[0_0_20px_rgba(251,113,133,0.6)]";
  if (days >= 14) return "shadow-[0_0_16px_rgba(251,146,60,0.55)]";
  if (days >= 7)  return "shadow-[0_0_14px_rgba(245,158,11,0.5)]";
  return "shadow-[0_0_10px_rgba(251,146,60,0.35)]";
}

interface LiveClockProps {
  streakDays?: number;
  onClaimed?: (newCredits: number) => void;
}

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
  const [claimPulse, setClaimPulse] = useState(false);
  const { currencyName } = useSiteConfig();
  const sound = useSoundManager();

  useEffect(() => {
    if (!hydrated) return;
    const tick = () => setTime(getMidnightCountdown());
    const timeout = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
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
    return () => { active = false; };
  }, [hydrated]);

  // Pulse animation trigger when canClaim becomes true
  useEffect(() => {
    if (canClaim) {
      const interval = setInterval(() => setClaimPulse((p) => !p), 2000);
      return () => clearInterval(interval);
    }
    setClaimPulse(false);
  }, [canClaim]);

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
      setTimeout(() => setJustClaimed(null), 4500);
    } else {
      sound.error();
      debugWarn("Streak", "claim failed", res.error);
    }
  }

  const showCountdown = streakConfig.showCountdown;
  const showStreakCounter = streakConfig.showStreakCounter;
  const showBox = showCountdown || showStreakCounter;
  const isMilestoneDay = streakConfig.milestoneInterval > 0 &&
    ((streakDays + 1) % streakConfig.milestoneInterval === 0);

  return (
    <div className="flex items-center gap-2">
      {/* Streak + countdown box — hidden while reward is claimable to prevent layout overflow */}
      {showBox && !(hydrated && canClaim) && (
        <div className={`hidden sm:flex [@media(max-height:600px)]:hidden flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 sm:px-5 sm:py-2 transition-all ${
          streakDays >= 7
            ? `bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent border border-orange-500/20 ${streakGlow(streakDays)}`
            : "bg-white/5 border border-white/5"
        }`}>
          {showCountdown && (
            <span className="font-mono text-[11px] tabular-nums text-zinc-400">{time}</span>
          )}
          {showStreakCounter && (
            <span className={`flex items-center gap-1 text-xs font-bold ${streakColor(streakDays)}`}>
              <span className={`${flameSize(streakDays)} leading-none ${streakDays >= 7 ? "animate-[wiggle_1.5s_ease-in-out_infinite]" : ""}`}
                style={{ filter: streakDays >= 7 ? `drop-shadow(0 0 6px rgba(251,146,60,0.8))` : undefined }}>
                🔥
              </span>
              <span className="tabular-nums">{streakDays}</span>
              <span className="hidden sm:inline font-normal text-[10px] opacity-70">Tage</span>
              {hydrated && (
                <StreakInfoPopover streakDays={streakDays} bestStreakDays={bestStreakDays} config={streakConfig} />
              )}
            </span>
          )}
        </div>
      )}

      {/* Claim button */}
      {hydrated && canClaim && (
        <button
          onMouseEnter={sound.hover}
          onClick={handleClaim}
          disabled={claiming}
          title={`Tägliche Belohnung: +${previewReward.toLocaleString("de-DE")} ${currencyName}${isMilestoneDay ? " 🏆 MILESTONE!" : ""}`}
          className={`relative flex items-center gap-1.5 overflow-hidden rounded-xl border px-3 py-1.5 text-xs font-bold transition-all duration-300 disabled:opacity-60 sm:rounded-2xl sm:px-4 sm:py-2 ${
            isMilestoneDay
              ? "border-amber-400/60 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-200 shadow-[0_0_24px_rgba(245,158,11,0.5)]"
              : "border-emerald-400/50 bg-gradient-to-r from-emerald-500/15 to-teal-500/10 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.4)]"
          } hover:scale-105 hover:shadow-[0_0_30px_rgba(52,211,153,0.65)] active:scale-95`}
          style={{
            animation: claimPulse ? undefined : "none",
          }}
        >
          {/* Shimmer sweep */}
          <span className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_2.5s_ease-in-out_infinite]" />

          {claiming ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isMilestoneDay ? (
            <Sparkles className="h-3.5 w-3.5 text-amber-300 drop-shadow-[0_0_4px_rgba(245,158,11,0.9)]" />
          ) : (
            <Gift className={`h-3.5 w-3.5 ${canClaim ? "animate-[bounce_1.5s_ease-in-out_infinite]" : ""}`} />
          )}

          <span className="hidden sm:inline">
            {isMilestoneDay && <span className="mr-1 text-amber-300">🏆</span>}
            +{previewReward.toLocaleString("de-DE")} {currencyName}
          </span>
          <span className="sm:hidden">
            +{previewReward >= 1000 ? `${(previewReward / 1000).toFixed(previewReward % 1000 === 0 ? 0 : 1)}K` : previewReward}
          </span>
        </button>
      )}

      {/* Post-claim celebration */}
      {justClaimed !== null && (
        <span className="relative flex items-center gap-1.5 overflow-hidden rounded-xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500/20 to-teal-500/15 px-3 py-1.5 text-xs font-black text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,0.5)] sm:rounded-2xl sm:px-4 sm:py-2 animate-[fadeInDown_0.4s_ease-out]">
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent" />
          <Zap className="h-3.5 w-3.5 text-emerald-300" />
          <span className="hidden sm:inline">+{justClaimed.toLocaleString("de-DE")} {currencyName} erhalten!</span>
          <span className="sm:hidden">+{justClaimed >= 1000 ? `${Math.round(justClaimed / 1000)}K` : justClaimed} ✓</span>
        </span>
      )}

      <style>{`
        @keyframes shimmer { 0% { transform: translateX(-100%); } 60%, 100% { transform: translateX(200%); } }
        @keyframes wiggle { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
