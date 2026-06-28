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

export type LevelRewardDisplay = "3d" | "icon";

/** One colour tier on the Level Road (admin-editable). Levels ≥ minLevel use this
 *  tier's accent/glow; the highest matching tier wins. */
export interface LevelRoadTier {
  minLevel: number;
  accent: string; // hex, e.g. "#f59e0b"
  glow: string;   // rgba, e.g. "rgba(245,158,11,0.45)"
}

export interface LevelRoadConfig {
  tiers: LevelRoadTier[];
  showXp: boolean;
  showTitles: boolean;
  /** Every Nth level is a celebrated "milestone" (crown, glow, tag). 0 = off. */
  milestoneEvery?: number;
  /** Animated ambient backdrop (aurora orbs + drifting particles) in the menu. */
  ambientFx?: boolean;
  /** Show the milestone celebration banner in the level-menu header. */
  celebrateMilestones?: boolean;
  /** Permanent XP bonus (%) granted per prestige level. e.g. 5 = +5% XP each. */
  prestigeXpBonusPercent?: number;
}

export const DEFAULT_LEVEL_ROAD_CONFIG: LevelRoadConfig = {
  tiers: [
    { minLevel: 50, accent: "#f59e0b", glow: "rgba(245,158,11,0.45)" },
    { minLevel: 40, accent: "#a78bfa", glow: "rgba(167,139,250,0.45)" },
    { minLevel: 30, accent: "#67e8f9", glow: "rgba(103,232,249,0.45)" },
    { minLevel: 20, accent: "#34d399", glow: "rgba(52,211,153,0.45)" },
    { minLevel: 10, accent: "#60a5fa", glow: "rgba(96,165,250,0.45)" },
    { minLevel: 1,  accent: "#94a3b8", glow: "rgba(148,163,184,0.35)" },
  ],
  showXp: true,
  showTitles: true,
  milestoneEvery: 10,
  ambientFx: true,
  celebrateMilestones: true,
  prestigeXpBonusPercent: 5,
};

/** Is this level a celebrated milestone per the road config? */
export function isMilestoneLevel(level: number, cfg: LevelRoadConfig): boolean {
  const every = cfg.milestoneEvery ?? 10;
  return every > 0 && level > 0 && level % every === 0;
}

/** Resolve a level's accent/glow from the road config (highest matching tier wins). */
export function resolveLevelRoadTier(level: number, cfg: LevelRoadConfig): LevelRoadTier {
  const sorted = [...cfg.tiers].sort((a, b) => b.minLevel - a.minLevel);
  return sorted.find((t) => level >= t.minLevel) ?? sorted[sorted.length - 1] ?? DEFAULT_LEVEL_ROAD_CONFIG.tiers[5];
}

export interface XpConfig {
  levels: LevelDefinition[];
  sources: XpSourceConfig;
  abilitySlotCount: number;
  /** How level rewards render on the Level Road (admin-global default). */
  levelRewardDisplay: LevelRewardDisplay;
  /** Per-tier colours + layout toggles for the Level Road. */
  levelRoadConfig: LevelRoadConfig;
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
  /** How many times the player has prestiged (reset for a permanent XP boost). */
  prestige: number;
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
  // Defensive sort by xpRequired — the loop breaks at the first unreached level,
  // so an out-of-order config (e.g. after a manual admin edit) must not yield the
  // wrong level. Cheap for ≤50 levels.
  const sorted = [...levels].sort((a, b) => a.xpRequired - b.xpRequired);
  let currentLevel = 1;
  for (const def of sorted) {
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
  levels: LevelDefinition[],
  prestige = 0
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
    prestige,
    equippedAbilityKey,
    currentLevelDef,
    nextLevelDef,
    xpInCurrentLevel,
    xpForCurrentLevel,
    progressPercent,
  };
}

/** XP gain multiplier from prestige: +bonusPercent per prestige level. */
export function prestigeXpMultiplier(prestige: number, bonusPercent: number): number {
  const p = Math.max(0, prestige || 0);
  const b = Math.max(0, bonusPercent || 0);
  return 1 + p * (b / 100);
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
