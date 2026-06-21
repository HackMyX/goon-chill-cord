/**
 * Daily login-streak reward system — config + pure reward math shared by
 * the claim server action (lib/actions/streak.ts) and the admin config
 * panel (components/admin/streak-config-editor.tsx), same "code defaults,
 * DB overrides" pattern as lib/cases.ts / lib/cases-config.ts.
 */
export interface StreakConfig {
  enabled: boolean;
  /** Reward on day 1 of a streak. */
  baseReward: number;
  /** Reward grows by this much per additional consecutive day. */
  dailyIncrement: number;
  /** Hard cap on the per-day reward — without this the curve grows
   * forever and trivializes the economy for anyone with a long streak. */
  maxReward: number;
  /** Hours of slack *past* midnight a player still has to claim "today"
   * before their streak is considered broken — a player who logs in at
   * 00:30 shouldn't lose a 40-day streak over a half-hour technicality. */
  gracePeriodHours: number;
  /** Every Nth consecutive day grants a one-time bonus on top of the
   * regular reward (e.g. every 7 days). 0 disables milestones. */
  milestoneInterval: number;
  milestoneBonus: number;
  /** If false, missing a day just freezes the streak at its current value
   * instead of resetting to 1 — a deliberately gentler mode admins can
   * flip on. */
  resetOnMiss: boolean;
  /** Multiplies the *day's reward* (not the milestone bonus) on Saturday
   * and Sunday — a standing "weekend event" admins can tune or disable
   * (1.0 = off) without having to remember to flip anything manually. */
  weekendMultiplier: number;
}

export const DEFAULT_STREAK_CONFIG: StreakConfig = {
  enabled: true,
  baseReward: 100,
  dailyIncrement: 25,
  maxReward: 600,
  gracePeriodHours: 4,
  milestoneInterval: 7,
  milestoneBonus: 500,
  resetOnMiss: true,
  weekendMultiplier: 1.5,
};

export interface StreakRewardResult {
  /** Streak length (in days) *after* this claim. */
  newStreak: number;
  /** Base + growth reward for that streak length, before the milestone
   * bonus. */
  reward: number;
  isMilestone: boolean;
  milestoneBonus: number;
  /** reward + milestoneBonus, the actual amount credited. */
  totalCredits: number;
}

/** Pure function — no DB/IO — so it's trivially unit-testable and reused
 * identically by the claim action and any admin "preview this curve"
 * panel. `newStreak` is 1-indexed (day 1 = first ever claim / first claim
 * after a reset). `now` only matters for the weekend multiplier — defaults
 * to the actual current time, but the admin preview panel passes an
 * explicit day so it can show what *would* happen on a Saturday. */
export function computeStreakReward(
  newStreak: number,
  config: StreakConfig,
  now: Date = new Date()
): StreakRewardResult {
  const growth = config.dailyIncrement * Math.max(0, newStreak - 1);
  const baseReward = Math.min(config.baseReward + growth, config.maxReward);
  const isWeekend = now.getUTCDay() === 0 || now.getUTCDay() === 6;
  const reward = isWeekend ? Math.round(baseReward * config.weekendMultiplier) : baseReward;
  const isMilestone = config.milestoneInterval > 0 && newStreak % config.milestoneInterval === 0;
  const milestoneBonus = isMilestone ? config.milestoneBonus : 0;
  return {
    newStreak,
    reward,
    isMilestone,
    milestoneBonus,
    totalCredits: reward + milestoneBonus,
  };
}

/** UTC calendar-day string (YYYY-MM-DD) — claims are gated per calendar
 * day, not per rolling 24h, so this is the canonical "what day is it"
 * used everywhere streak logic compares dates. */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface StreakDecision {
  /** Whether this claim continues an existing streak (vs. resetting to 1
   * or freezing, depending on `resetOnMiss`). */
  continues: boolean;
  newStreak: number;
}

/**
 * Decides what happens to the streak counter for a claim happening "now",
 * given the player's last claim date and current streak. Grace period is
 * measured from midnight of the day *after* the last claim — e.g. with a
 * 4h grace period, claiming by 04:00 two days after the last claim still
 * counts as "the next day".
 */
export function decideStreak(
  lastClaimDate: string | null,
  currentStreak: number,
  now: Date,
  config: StreakConfig
): StreakDecision {
  if (!lastClaimDate) return { continues: true, newStreak: 1 };

  const last = new Date(`${lastClaimDate}T00:00:00.000Z`);
  const daysSince = Math.round((now.getTime() - last.getTime()) / 86_400_000);

  if (daysSince <= 1) {
    // Claimed yesterday (or, in theory, today — but the action itself
    // already blocks a same-day double-claim before this ever runs).
    return { continues: true, newStreak: currentStreak + 1 };
  }

  if (daysSince === 2) {
    // One full day missed — still salvageable within the grace window
    // measured from midnight of *that* missed day.
    const graceDeadline = new Date(last.getTime() + 86_400_000 * 2 + config.gracePeriodHours * 3_600_000);
    if (now.getTime() <= graceDeadline.getTime()) {
      return { continues: true, newStreak: currentStreak + 1 };
    }
  }

  return {
    continues: false,
    newStreak: config.resetOnMiss ? 1 : currentStreak,
  };
}
