"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, Flame, Trophy, Calendar, Snowflake, Sparkles } from "lucide-react";
import { computeStreakReward, type StreakConfig } from "@/lib/streak";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";

interface StreakInfoPopoverProps {
  streakDays: number;
  bestStreakDays: number;
  config: StreakConfig;
}

/**
 * "Wie verhält sich meine Streak?" — a read-only explainer popover so
 * players don't have to guess at the grace period / milestone / weekend
 * rules. Shares lib/streak.ts's computeStreakReward with the claim button
 * and the admin preview, so what's shown here is guaranteed to match what
 * actually happens on the next claim, not a hand-written description that
 * can drift out of sync with the real formula.
 */
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
      setCoords({ top: rect.bottom + 8, left: Math.max(8, rect.left - 140) });
    }
    setOpen((o) => !o);
  }

  const next7 = Array.from({ length: 7 }, (_, i) => streakDays + i + 1);

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={sound.hover}
        onClick={toggle}
        title="Wie funktioniert die Streak?"
        className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-purple-300"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />
            <div
              style={{ top: coords.top, left: coords.left }}
              className="fixed z-[100] w-80 rounded-xl border border-purple-500/20 bg-[#0b0814] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
            >
              <div className="mb-3 flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-400" />
                <span className="text-sm font-bold text-zinc-100">Deine Streak</span>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                  <p className="text-lg font-extrabold text-orange-300">{streakDays}</p>
                  <p className="text-[10px] text-zinc-500">Aktuelle Streak</p>
                </div>
                <div className="rounded-lg bg-white/5 px-3 py-2 text-center">
                  <p className="flex items-center justify-center gap-1 text-lg font-extrabold text-amber-300">
                    <Trophy className="h-3.5 w-3.5" />
                    {bestStreakDays}
                  </p>
                  <p className="text-[10px] text-zinc-500">Bestwert</p>
                </div>
              </div>

              <p className="mb-2 text-[11px] font-semibold text-zinc-400">Nächste 7 Tage</p>
              <div className="mb-3 flex gap-1.5 overflow-x-auto">
                {next7.map((day) => {
                  const result = computeStreakReward(day, config);
                  return (
                    <div
                      key={day}
                      className={`flex min-w-[44px] flex-col items-center gap-0.5 rounded-md border px-1.5 py-1.5 ${
                        result.isMilestone
                          ? "border-amber-400/50 bg-amber-500/10"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                    >
                      <span className="text-[9px] text-zinc-500">T{day}</span>
                      <span className="text-[11px] font-bold text-purple-300">{result.totalCredits}</span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5 text-[11px] text-zinc-400">
                <p className="flex items-start gap-1.5">
                  <Calendar className="mt-0.5 h-3 w-3 shrink-0 text-zinc-500" />
                  Jeder weitere Tag erhöht deinen Reward um {config.dailyIncrement} {currencyName}, bis maximal{" "}
                  {config.maxReward} {currencyName}.
                </p>
                {config.milestoneInterval > 0 && (
                  <p className="flex items-start gap-1.5">
                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                    Jeder {config.milestoneInterval}. Tag gibt zusätzlich +{config.milestoneBonus} {currencyName} Bonus.
                  </p>
                )}
                {config.weekendMultiplier !== 1 && (
                  <p className="flex items-start gap-1.5">
                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-pink-400" />
                    Samstag &amp; Sonntag: {config.weekendMultiplier}x Reward.
                  </p>
                )}
                <p className="flex items-start gap-1.5">
                  <Snowflake className="mt-0.5 h-3 w-3 shrink-0 text-sky-400" />
                  Verpasst du einen Tag, hast du {config.gracePeriodHours}h Gnadenfrist danach, bevor die
                  Streak {config.resetOnMiss ? "auf 1 zurückgesetzt" : "eingefroren"} wird.
                </p>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
