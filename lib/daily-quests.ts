// Daily Quest System — types

export type QuestDifficulty = "easy" | "medium" | "hard" | "legendary";
export type QuestRewardType = "credits" | "xp" | "bp_xp" | "item" | "mixed";

export interface DailyQuestTemplate {
  key: string;
  label: string;
  description: string;
  targetAction: string;
  baseTarget: number;
  difficulty: QuestDifficulty;
  minLevel: number;
  maxLevel: number;
  rewardType: QuestRewardType;
  baseRewardCredits: number;
  baseRewardXp: number;
  baseRewardBpXp: number;
  rewardItemRarity: string | null;
  icon: string;
  category: string;
  enabled: boolean;
  sortOrder: number;
}

export interface DailyQuestConfig {
  enabled: boolean;
  questsPerDay: number;
  refreshHourUtc: number;
  autoGenerate: boolean;
  manualTemplateKeys: string[];
  levelScaleTargets: boolean;
  levelScaleRewards: boolean;
  xpRewardMultiplier: number;
  creditsRewardMultiplier: number;
  bpXpRewardMultiplier: number;
}

export const DEFAULT_DAILY_QUEST_CONFIG: DailyQuestConfig = {
  enabled: true,
  questsPerDay: 3,
  refreshHourUtc: 0,
  autoGenerate: true,
  manualTemplateKeys: [],
  levelScaleTargets: true,
  levelScaleRewards: true,
  xpRewardMultiplier: 1.0,
  creditsRewardMultiplier: 1.0,
  bpXpRewardMultiplier: 1.0,
};

export interface UserDailyQuest {
  id: string;
  userId: string;
  templateKey: string | null;
  questDate: string;
  label: string;
  description: string;
  targetAction: string;
  targetValue: number;
  currentValue: number;
  completed: boolean;
  difficulty: QuestDifficulty;
  rewardType: QuestRewardType;
  rewardCredits: number;
  rewardXp: number;
  rewardBpXp: number;
  rewardItemRarity: string | null;
  rewardClaimed: boolean;
  claimedAt: string | null;
  createdAt: string;
}

export const DIFFICULTY_LABELS: Record<QuestDifficulty, string> = {
  easy: "Leicht",
  medium: "Mittel",
  hard: "Schwer",
  legendary: "Legendär",
};

export const DIFFICULTY_COLORS: Record<QuestDifficulty, string> = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-orange-500",
  legendary: "text-fuchsia-400",
};

export const DIFFICULTY_BG: Record<QuestDifficulty, string> = {
  easy: "bg-emerald-500/15 border-emerald-500/25",
  medium: "bg-amber-500/15 border-amber-500/25",
  hard: "bg-orange-500/15 border-orange-500/25",
  legendary: "bg-fuchsia-500/15 border-fuchsia-500/25",
};

export const REWARD_TYPE_LABELS: Record<QuestRewardType, string> = {
  credits: "Credits",
  xp: "XP",
  bp_xp: "Battle Pass XP",
  item: "Item",
  mixed: "Gemischt",
};

/** Scale factor applied to target/reward based on player level */
export function levelScaleFactor(level: number): number {
  if (level <= 5)  return 1.0;
  if (level <= 10) return 1.2;
  if (level <= 20) return 1.5;
  if (level <= 35) return 2.0;
  if (level <= 50) return 2.5;
  return 3.0;
}
