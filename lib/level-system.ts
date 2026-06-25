// ─── Level + XP System — Types & Helpers ──────────────────────────────────────

export type LevelRewardType = "credits" | "ability" | "badge" | "name_style";

export interface LevelReward {
  type: LevelRewardType;
  amount?: number;         // credits
  abilityKey?: string;
  badgeKey?: string;
  nameStyleKey?: string;
}

export interface LevelDefinition {
  level: number;
  xpRequired: number;
  title: string;
  rewards: LevelReward[];
}

export type XpSource =
  | "mine_collect"
  | "streak_claim"
  | "snake_game"
  | "plinko_drop"
  | "don_flip"
  | "case_open"
  | "world_kill"
  | "pvp_kill"
  | "bp_tier_claim"
  | "admin_grant";

export interface XpSourceConfig {
  mine_collect_per_100cr: number;
  streak_per_day: number;
  snake_per_score_point: number;
  plinko_per_drop: number;
  don_win: number;
  case_open: number;
  world_kill: number;
  bp_tier_claim: number;
  pvp_kill: number;
}

export interface XpConfig {
  levels: LevelDefinition[];
  sources: XpSourceConfig;
  abilitySlotCount: number;
}

export interface XpEvent {
  id: string;
  userId: string;
  amount: number;
  source: string;
  sourceDetail: string | null;
  createdAt: string;
}

export interface UserLevelInfo {
  xp: number;
  level: number;
  equippedAbilityKey: string | null;
  currentLevelDef: LevelDefinition | null;
  nextLevelDef: LevelDefinition | null;
  xpInCurrentLevel: number;
  xpForCurrentLevel: number;
  progressPercent: number;
}

export interface AwardXpResult {
  newXp: number;
  newLevel: number;
  leveledUp: boolean;
  levelsGained: number;
  rewards: LevelReward[];
}

// ─── Default config ────────────────────────────────────────────────────────────

export const DEFAULT_XP_SOURCES: XpSourceConfig = {
  mine_collect_per_100cr: 1,
  streak_per_day: 8,
  snake_per_score_point: 0.5,
  plinko_per_drop: 5,
  don_win: 20,
  case_open: 30,
  world_kill: 10,
  bp_tier_claim: 50,
  pvp_kill: 25,
};

export const LEVEL_TITLES: Record<number, string> = {
  1: "Neuling", 2: "Neuling", 3: "Neuling", 4: "Neuling",
  5: "Anfänger", 6: "Anfänger", 7: "Anfänger", 8: "Anfänger", 9: "Anfänger",
  10: "Rookie", 11: "Rookie", 12: "Rookie", 13: "Rookie", 14: "Rookie",
  15: "Spieler", 16: "Spieler", 17: "Spieler", 18: "Spieler", 19: "Spieler",
  20: "Veteran", 21: "Veteran", 22: "Veteran", 23: "Veteran", 24: "Veteran",
  25: "Experte", 26: "Experte", 27: "Experte", 28: "Experte", 29: "Experte",
  30: "Elite", 31: "Elite", 32: "Elite", 33: "Elite", 34: "Elite",
  35: "Meister", 36: "Meister", 37: "Meister", 38: "Meister", 39: "Meister",
  40: "Großmeister", 41: "Großmeister", 42: "Großmeister", 43: "Großmeister", 44: "Großmeister",
  45: "Legende", 46: "Legende", 47: "Legende", 48: "Legende", 49: "Legende",
  50: "Mythisch",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Given total XP, returns which level that corresponds to. */
export function calculateLevel(totalXp: number, levels: LevelDefinition[]): number {
  if (!levels || levels.length === 0) return 1;
  let currentLevel = 1;
  for (const def of levels) {
    if (totalXp >= def.xpRequired) {
      currentLevel = def.level;
    } else {
      break;
    }
  }
  return currentLevel;
}

/** Returns UserLevelInfo for a given total XP + equipped ability key. */
export function buildLevelInfo(
  xp: number,
  level: number,
  equippedAbilityKey: string | null,
  levels: LevelDefinition[]
): UserLevelInfo {
  const currentLevelDef = levels.find((l) => l.level === level) ?? null;
  const nextLevelDef = levels.find((l) => l.level === level + 1) ?? null;

  const xpStartOfCurrentLevel = currentLevelDef?.xpRequired ?? 0;
  const xpStartOfNextLevel = nextLevelDef?.xpRequired ?? null;

  const xpInCurrentLevel = xp - xpStartOfCurrentLevel;
  const xpForCurrentLevel = xpStartOfNextLevel !== null
    ? xpStartOfNextLevel - xpStartOfCurrentLevel
    : 0;

  const progressPercent = xpForCurrentLevel > 0
    ? Math.min(100, Math.floor((xpInCurrentLevel / xpForCurrentLevel) * 100))
    : 100;

  return {
    xp,
    level,
    equippedAbilityKey,
    currentLevelDef,
    nextLevelDef,
    xpInCurrentLevel,
    xpForCurrentLevel,
    progressPercent,
  };
}

/** Level color gradient by tier. */
export function getLevelColor(level: number): string {
  if (level >= 50) return "text-amber-300";
  if (level >= 40) return "text-purple-300";
  if (level >= 30) return "text-cyan-300";
  if (level >= 20) return "text-emerald-300";
  if (level >= 10) return "text-blue-300";
  return "text-zinc-400";
}

export function getLevelBgColor(level: number): string {
  if (level >= 50) return "bg-amber-500/20 border-amber-500/40";
  if (level >= 40) return "bg-purple-500/20 border-purple-500/40";
  if (level >= 30) return "bg-cyan-500/20 border-cyan-500/40";
  if (level >= 20) return "bg-emerald-500/20 border-emerald-500/40";
  if (level >= 10) return "bg-blue-500/20 border-blue-500/40";
  return "bg-zinc-500/20 border-zinc-500/40";
}
