// ─── Economy Synergy — cross-system progression layer ─────────────────────────
// One central, fully admin-configurable layer that ties Level ↔ Battle Pass ↔
// Daily Quests ↔ the whole economy together. It is applied at the two hot hooks
// every reward flows through (awardXp for XP, applyCreditBonus for credits), so
// turning a knob here ripples across mining, snake, plinko, DON, world, cases,
// quests — everything — at once.

export interface EconomySynergyConfig {
  /** Master switch. When false, no synergy multipliers/cross-flow are applied. */
  enabled: boolean;

  // ── Level-Staffelung — höheres Spieler-Level = mehr ──────────────────────────
  /** +X % credits per player level (e.g. 0.4 → level 50 = +20%). */
  levelCreditBonusPercentPerLevel: number;
  /** Hard cap on the total % the level-scaling can add to credits. */
  levelCreditBonusCapPercent: number;
  /** +X % XP per player level. CAUTION: a snowball — keep small or 0. */
  levelXpBonusPercentPerLevel: number;
  levelXpBonusCapPercent: number;

  // ── XP-Querfluss Level → Battle Pass ─────────────────────────────────────────
  /** % of every earned Level-XP that is ALSO granted as Battle-Pass XP. So every
   *  XP source on the whole site fills the battle pass too. 0 = off. */
  bpXpFromLevelXpPercent: number;

  // ── Zeit-Boosts (Serverzeit) ─────────────────────────────────────────────────
  /** Days that count as "weekend" (0=So … 6=Sa). */
  weekendDays: number[];
  weekendXpMultiplier: number;     // 1 = off
  weekendCreditMultiplier: number; // 1 = off
  happyHourEnabled: boolean;
  happyHourStartHour: number;      // 0–23 server local time
  happyHourDurationHours: number;
  happyHourXpMultiplier: number;
  happyHourCreditMultiplier: number;

  // ── Daily-Quest-Synergie ─────────────────────────────────────────────────────
  /** +X % on daily-quest XP/credit/BP rewards per player level (applied at claim). */
  dailyQuestRewardPercentPerLevel: number;
  dailyQuestRewardCapPercent: number;

  /** Optional banner label shown when a time-boost is live (e.g. "Happy Hour!"). */
  eventLabel: string;
}

export const DEFAULT_SYNERGY_CONFIG: EconomySynergyConfig = {
  enabled: true,
  levelCreditBonusPercentPerLevel: 0.4,
  levelCreditBonusCapPercent: 40,
  levelXpBonusPercentPerLevel: 0,
  levelXpBonusCapPercent: 25,
  bpXpFromLevelXpPercent: 30,
  weekendDays: [0, 6],
  weekendXpMultiplier: 1.25,
  weekendCreditMultiplier: 1.25,
  happyHourEnabled: false,
  happyHourStartHour: 19,
  happyHourDurationHours: 2,
  happyHourXpMultiplier: 1.5,
  happyHourCreditMultiplier: 1.5,
  dailyQuestRewardPercentPerLevel: 0.5,
  dailyQuestRewardCapPercent: 50,
  eventLabel: "Boost aktiv!",
};

/** Merge a partial (DB-stored) config over the defaults so new fields are safe. */
export function mergeSynergyConfig(partial: Partial<EconomySynergyConfig> | null | undefined): EconomySynergyConfig {
  const p = partial ?? {};
  return {
    ...DEFAULT_SYNERGY_CONFIG,
    ...p,
    weekendDays: Array.isArray(p.weekendDays) ? p.weekendDays : DEFAULT_SYNERGY_CONFIG.weekendDays,
  };
}

function levelBonus(level: number, perLevel: number, capPercent: number): number {
  const raw = Math.max(0, level) * Math.max(0, perLevel);
  return Math.min(Math.max(0, capPercent), raw) / 100; // → fraction
}

/** Is a time-boost window (weekend / happy-hour) currently live? */
export function happyHourActive(cfg: EconomySynergyConfig, now: Date): boolean {
  if (!cfg.happyHourEnabled || cfg.happyHourDurationHours <= 0) return false;
  const h = now.getHours();
  const start = ((cfg.happyHourStartHour % 24) + 24) % 24;
  const end = start + cfg.happyHourDurationHours;
  // window may wrap past midnight
  return end <= 24 ? h >= start && h < end : h >= start || h < end - 24;
}

export function isWeekend(cfg: EconomySynergyConfig, now: Date): boolean {
  return (cfg.weekendDays ?? []).includes(now.getDay());
}

export interface SynergyMultipliers {
  xpMult: number;
  creditMult: number;
  bpXpFromLevelXpPercent: number;
  timeBoostActive: boolean;
}

/** Compute the combined XP + credit multipliers for a player at a moment in time.
 *  Level-scaling and time-boosts (weekend × happy-hour) multiply together. */
export function computeSynergyMultipliers(cfg: EconomySynergyConfig, level: number, now: Date): SynergyMultipliers {
  if (!cfg.enabled) {
    return { xpMult: 1, creditMult: 1, bpXpFromLevelXpPercent: 0, timeBoostActive: false };
  }
  let xpMult = 1 + levelBonus(level, cfg.levelXpBonusPercentPerLevel, cfg.levelXpBonusCapPercent);
  let creditMult = 1 + levelBonus(level, cfg.levelCreditBonusPercentPerLevel, cfg.levelCreditBonusCapPercent);

  const weekend = isWeekend(cfg, now);
  const happy = happyHourActive(cfg, now);
  if (weekend) { xpMult *= Math.max(0, cfg.weekendXpMultiplier || 1); creditMult *= Math.max(0, cfg.weekendCreditMultiplier || 1); }
  if (happy) { xpMult *= Math.max(0, cfg.happyHourXpMultiplier || 1); creditMult *= Math.max(0, cfg.happyHourCreditMultiplier || 1); }

  return {
    xpMult,
    creditMult,
    bpXpFromLevelXpPercent: Math.max(0, cfg.bpXpFromLevelXpPercent || 0),
    timeBoostActive: weekend || happy,
  };
}

/** Daily-quest reward scaling fraction for a player level (applied on top of the
 *  quest's own base reward). */
export function dailyQuestLevelScale(cfg: EconomySynergyConfig, level: number): number {
  if (!cfg.enabled) return 1;
  return 1 + levelBonus(level, cfg.dailyQuestRewardPercentPerLevel, cfg.dailyQuestRewardCapPercent);
}
