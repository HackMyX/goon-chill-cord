/**
 * Kill-streak economy — config + pure reward/difficulty math shared by
 * the server actions (lib/actions/kill-streak.ts) and the admin config
 * panel, same "code defaults, DB overrides" pattern as lib/streak.ts.
 *
 * Deliberately separate from lib/streak.ts (the *login*-streak system,
 * `profiles.streak_days`/`streak_config`) — this tracks consecutive
 * monster kills within one World session
 * (`profiles.streak_kill_count`/`pending_streak_cr`), not consecutive
 * days logged in. The two have nothing to do with each other beyond
 * sharing the word "streak".
 */
export interface KillStreakConfig {
  /** CR multiplier grows by this much per kill already in the streak
   * (applied to the kill *about to be scored*, so the very first kill of
   * a session always pays the unmultiplied base reward). */
  multiplierPerKill: number;
  /** Hard cap so the multiplier doesn't grow forever. */
  maxMultiplier: number;
  /** Locally-spawned monsters get slightly stronger (health + attack
   * damage) the longer the *current player's* streak runs — see
   * lib/actions/kill-streak.ts' doc comment on why this is necessarily a
   * client-local effect, not a server-authoritative one. */
  mobScalePerKill: number;
  mobScaleMax: number;
}

/** `mobScalePerKill`/`mobScaleMax` were tuned so the difficulty ramp
 * plateaued at just 30 kills ((1.6 - 1) / 0.02) — at a realistic kill
 * pace, a session hit "as hard as it ever gets" within a few minutes and
 * then stayed flat no matter how much longer the player kept going,
 * directly undermining "monsters should keep getting harder over time".
 * Slower per-kill growth with a much higher cap means the ramp now keeps
 * climbing for a genuinely long session (~210 kills to cap, not 30)
 * instead of front-loading the entire difficulty curve into the first
 * couple of minutes — admin-tunable from here regardless (components/
 * admin/kill-streak-config-editor.tsx), this is just a saner out-of-the-
 * box default. */
export const DEFAULT_KILL_STREAK_CONFIG: KillStreakConfig = {
  multiplierPerKill: 0.04,
  maxMultiplier: 3,
  mobScalePerKill: 0.012,
  mobScaleMax: 3.5,
};

/** CR multiplier for the kill about to be scored, given how many kills
 * already happened this session (0 for the first kill). */
export function streakCrMultiplier(killsSoFar: number, config: KillStreakConfig): number {
  return Math.min(config.maxMultiplier, 1 + killsSoFar * config.multiplierPerKill);
}

/** Difficulty multiplier applied to a freshly-spawned monster's
 * health/attackDamage, given the current player's kill streak. */
export function streakMobScale(killsSoFar: number, config: KillStreakConfig): number {
  return Math.min(config.mobScaleMax, 1 + killsSoFar * config.mobScalePerKill);
}
