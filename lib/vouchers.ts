export type VoucherRewardType = "credits" | "ability" | "badge" | "name_style";

export interface VoucherRewardValue {
  amount?: number; // credits
  abilityKey?: string; // ability
  badgeKey?: string; // badge
  styleKey?: string; // name_style
}

export interface RedemptionCode {
  code: string;
  label: string | null;
  rewardType: VoucherRewardType;
  rewardValue: VoucherRewardValue;
  abilityDurationHours: number;
  maxUses: number; // 0 = unlimited
  expiresAt: string | null;
  enabled: boolean;
  createdAt: string;
  /** Derived from redemption_claims (admin display only). */
  usedCount: number;
}

export const VOUCHER_REWARD_LABELS: Record<VoucherRewardType, string> = {
  credits: "Credits",
  ability: "Fähigkeit",
  badge: "Badge",
  name_style: "Name-Style",
};

/** Normalize a user-entered code: trim, uppercase, collapse internal spaces. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}
