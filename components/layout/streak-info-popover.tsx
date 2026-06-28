"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Flame, Trophy, Calendar, Snowflake, Sparkles, Star, Zap, Info } from "lucide-react";
import { computeStreakReward, type StreakConfig } from "@/lib/streak";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";

interface StreakInfoPopoverProps {
  streakDays: number;
  bestStreakDays: number;
  config: StreakConfig;
}

function ProgressRing({ pct, color, size = 52, stroke = 5 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct, 1));
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke="rgba(255,255,255,0.07)" fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke}
        stroke={color} fill="none" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

function DayPill({
  day, result, isToday, isMilestone, isWeekend,
}: {
  day: number;
  result: ReturnType<typeof computeStreakReward>;
  isToday: boolean;
  isMilestone: boolean;
  isWeekend: boolean;
}) {
  return (
    <div className={`relative flex min-w-[48px] flex-col items-center gap-1 rounded-xl border px-2 py-2 transition-all ${
      isMilestone
        ? "border-amber-400/60 bg-gradient-to-b from-amber-500/20 to-amber-500/5 shadow-[0_0_12px_rgba(245,158,11,0.35)]"
        : isToday
        ? "border-purple-400/50 bg-purple-500/15 shadow-[0_0_10px_rgba(168,85,247,0.3)]"
        : isWeekend
        ? "border-pink-500/30 bg-pink-500/8"
        : "border-white/8 bg-white/[0.03]"
    }`}>
      {isMilestone && (
        <Star className="absolute -top-2 left-1/2 -translate-x-1/2 h-3.5 w-3.5 text-amber-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.8)]" />
      )}
      <span className={`text-[9px] font-bold ${isToday ? "text-purple-300" : isMilestone ? "text-amber-400" : isWeekend ? "text-pink-400" : "text-zinc-500"}`}>
        T{day}
      </span>
      <span className={`text-[11px] font-extrabold ${
        isMilestone ? "text-amber-200" : isToday ? "text-purple-200" : isWeekend ? "text-pink-300" : "text-zinc-200"
      }`}>
        {result.totalCredits >= 1000
          ? `${(result.totalCredits / 1000).toFixed(result.totalCredits % 1000 === 0 ? 0 : 1)}K`
          : result.totalCredits}
      </span>
      {isWeekend && !isMilestone && (
        <span className="text-[8px] text-pink-400/70 font-bold">2×</span>
      )}
    </div>
  );
}

/** Kurz-Label einer Meilenstein-Givable-Belohnung (RewardSpec) für die Anzeige. */
function streakRewardLabel(spec: StreakConfig["milestoneRewards"][number]): string {
  switch (spec.type) {
    case "credits": return spec.amount ? `${spec.amount.toLocaleString("de-DE")} CR` : "";
    case "xp": return spec.amount ? `+${spec.amount} XP` : "";
    case "item": case "random_item": return "Item";
    case "ability": return "Fähigkeit";
    case "name_style": return "Name-Style";
    case "badge": return "Badge";
    case "case_voucher": return "Gratis-Case";
    case "game_bonus": return `+${spec.amount ?? 1} ${spec.bonusGame ?? "Spiel"}`;
    default: return "";
  }
}

export function StreakInfoPopover({ streakDays, bestStreakDays, config }: StreakInfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sound = useSoundManager();
  const { currencyName } = useSiteConfig();

  useEffect(() => {
    const timeout = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timeout);
  }, []);

  function toggle() {
    sound.click();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const panelW = 360;
      const left = Math.max(8, Math.min(rect.left - panelW / 2 + 10, window.innerWidth - panelW - 8));
      setCoords({ top: rect.bottom + 10, left });
    }
    setOpen((o) => !o);
  }

  // Compute next milestone
  const nextMilestone = config.milestoneInterval > 0
    ? Math.ceil((streakDays + 1) / config.milestoneInterval) * config.milestoneInterval
    : null;
  const milestoneProgress = nextMilestone && config.milestoneInterval > 0
    ? (streakDays % config.milestoneInterval) / config.milestoneInterval
    : 0;
  const daysToMilestone = nextMilestone ? nextMilestone - streakDays : null;

  // Today's reward
  const todayResult = computeStreakReward(Math.max(1, streakDays), config);

  // Next 7 days
  const next7 = Array.from({ length: 7 }, (_, i) => {
    const day = streakDays + i + 1;
    const date = new Date();
    date.setDate(date.getDate() + i + 1);
    const dayOfWeek = date.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const result = computeStreakReward(day, config, date);
    const isMilestone = config.milestoneInterval > 0 && day % config.milestoneInterval === 0;
    return { day, result, isMilestone, isWeekend };
  });

  // Flame tier
  const flameTier = streakDays >= 30 ? 4 : streakDays >= 14 ? 3 : streakDays >= 7 ? 2 : streakDays >= 1 ? 1 : 0;
  const flameColors = ["#52525b", "#f97316", "#f59e0b", "#ef4444", "#f43f5e"];
  const tierLabels = ["Kein Streak", "Auf Kurs 🔥", "Woche geschafft! 🔥🔥", "Halbmonat! 🔥🔥🔥", "Meister! 🔥🔥🔥🔥"];

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={sound.hover}
        onClick={toggle}
        title="Streak-Details"
        className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-white/10 hover:text-purple-300"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {mounted && open && createPortal(
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setOpen(false)} />
          <div
            style={{ top: coords.top, left: coords.left, width: 360 }}
            className="fixed z-[200] overflow-hidden rounded-2xl border border-white/10 bg-[#080512] shadow-[0_16px_60px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)]"
          >
            {/* Header glow band */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-orange-500/5 to-transparent pointer-events-none" />

            {/* Hero: streak circle */}
            <div className="flex items-center gap-4 px-5 pt-5 pb-4">
              <div className="relative shrink-0">
                <ProgressRing
                  pct={nextMilestone ? milestoneProgress : streakDays > 0 ? 1 : 0}
                  color={flameColors[flameTier]}
                  size={64}
                  stroke={5}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="text-2xl leading-none"
                    style={{ filter: `drop-shadow(0 0 8px ${flameColors[flameTier]})` }}
                  >
                    🔥
                  </span>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xl font-black text-white leading-none">
                  {streakDays} <span className="text-sm font-semibold text-zinc-400">Tage</span>
                </p>
                <p className="mt-0.5 text-[11px] font-bold" style={{ color: flameColors[flameTier] }}>
                  {tierLabels[flameTier]}
                </p>
                {nextMilestone && (
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Noch <span className="font-bold text-amber-400">{daysToMilestone}d</span> bis Meilenstein T{nextMilestone} · +{config.milestoneBonus.toLocaleString("de-DE")} Bonus
                  </p>
                )}
              </div>

              {/* Best streak badge */}
              <div className="shrink-0 flex flex-col items-center gap-0.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2">
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
                <p className="text-base font-black text-amber-300">{bestStreakDays}</p>
                <p className="text-[8px] text-zinc-600 uppercase tracking-widest">Rekord</p>
              </div>
            </div>

            {/* Divider */}
            <div className="mx-5 h-px bg-white/5" />

            {/* Today's reward */}
            <div className="mx-5 my-3 flex items-center justify-between rounded-xl border border-purple-500/20 bg-purple-500/8 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-400" />
                <div>
                  <p className="text-[10px] text-zinc-500">Heutiger Reward</p>
                  <p className="text-sm font-extrabold text-purple-200">{todayResult.totalCredits.toLocaleString("de-DE")} {currencyName}</p>
                </div>
              </div>
              {config.specialEventEnabled && (
                <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-2 py-0.5 text-[9px] font-black text-fuchsia-300 uppercase tracking-wider">
                  {config.specialEventLabel ?? "Event"} {config.specialEventMultiplier}×
                </span>
              )}
            </div>

            {/* Next 7 days calendar */}
            <div className="px-5 pb-1">
              <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                <Calendar className="h-3 w-3" />
                Nächste 7 Tage
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {next7.map(({ day, result, isMilestone, isWeekend }) => (
                  <DayPill key={day} day={day} result={result} isToday={false} isMilestone={isMilestone} isWeekend={isWeekend} />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-3 text-[9px] text-zinc-600">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm border border-amber-400/50 bg-amber-500/15" />Meilenstein</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm border border-pink-500/30 bg-pink-500/8" />Wochenende 2×</span>
              </div>
            </div>

            {/* Rules */}
            <div className="mx-5 mt-3 mb-4 space-y-1.5 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-[11px] text-zinc-500">
              <p className="flex items-start gap-1.5">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-purple-400" />
                Jeder Tag +{config.dailyIncrement} {currencyName}, max. {config.maxReward.toLocaleString("de-DE")} {currencyName}/Tag.
              </p>
              {config.milestoneInterval > 0 && (
                <p className="flex items-start gap-1.5">
                  <Star className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                  Alle {config.milestoneInterval} Tage: +{config.milestoneBonus.toLocaleString("de-DE")} Bonus.
                </p>
              )}
              {config.milestoneRewards && config.milestoneRewards.length > 0 && (
                <p className="flex items-start gap-1.5">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-fuchsia-400" />
                  Meilenstein-Extras: {config.milestoneRewards.map(streakRewardLabel).filter(Boolean).join(" · ")}
                </p>
              )}
              {config.weekendMultiplier !== 1 && (
                <p className="flex items-start gap-1.5">
                  <Flame className="mt-0.5 h-3 w-3 shrink-0 text-pink-400" />
                  Wochenende: {config.weekendMultiplier}× Reward.
                </p>
              )}
              <p className="flex items-start gap-1.5">
                <Snowflake className="mt-0.5 h-3 w-3 shrink-0 text-sky-400" />
                {config.gracePeriodHours}h Gnadenfrist — danach Streak {config.resetOnMiss ? "zurückgesetzt" : "eingefroren"}.
              </p>
            </div>

            {/* Bottom glow */}
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
          </div>
        </>,
        document.body
      )}
    </>
  );
}
