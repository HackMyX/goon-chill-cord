export type BpRewardType = "credits" | "item" | "badge";

export interface BattlePassTier {
  id: string;
  passId: string;
  tierNumber: number;
  name: string;
  isPremium: boolean;
  rewardType: BpRewardType;
  rewardCredits: number | null;
  rewardItemId: string | null;
  rewardBadgeKey: string | null;
  icon: string;
}

export interface BattlePass {
  id: string;
  name: string;
  seasonLabel: string;
  description: string | null;
  priceCr: number;
  enabled: boolean;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  tierCount: number;
  spinChanceBoost: number;
  bannerColor: string;
  tiers: BattlePassTier[];
  createdAt: string;
}

export interface UserBpStatus {
  passId: string;
  hasPremium: boolean;
  progressDays: number;
  claimedTierIds: string[];
}

export interface ActiveBpView {
  pass: BattlePass;
  userStatus: UserBpStatus | null;
}
