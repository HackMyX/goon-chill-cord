export type VoucherRewardType = "credits" | "ability" | "badge" | "name_style";

export interface VoucherRewardValue {
  amount?: number; // credits
  abilityKey?: string; // ability
  badgeKey?: string; // badge
  styleKey?: string; // name_style
}

/**
 * A SINGLE reward inside a voucher bundle. A code can carry several of these, so
 * one code can grant e.g. a 48h mining boost + a snake boost + an XP boost at once.
 */
export interface VoucherReward {
  type: VoucherRewardType;
  amount?: number;          // credits
  abilityKey?: string;      // ability
  /** Ability duration in hours (0 / undefined = permanent). Per-reward. */
  durationHours?: number;
  badgeKey?: string;        // badge
  styleKey?: string;        // name_style
}

export interface RedemptionCode {
  code: string;
  label: string | null;
  /** Full reward bundle. Always ≥1 entry (legacy single-reward codes are mapped in). */
  rewards: VoucherReward[];
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

export const VOUCHER_REWARD_ICONS: Record<VoucherRewardType, string> = {
  credits: "💰",
  ability: "🔮",
  badge: "🏅",
  name_style: "🎨",
};

/** Normalize a user-entered code: trim, uppercase, collapse internal spaces. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Coerce arbitrary JSON (DB `rewards` column, or legacy single-reward fields) into
 *  a clean VoucherReward[]. Always returns at least the provided legacy fallback. */
export function parseVoucherRewards(
  rewardsJson: unknown,
  legacy?: { rewardType?: VoucherRewardType; rewardValue?: VoucherRewardValue; abilityDurationHours?: number }
): VoucherReward[] {
  const out: VoucherReward[] = [];
  if (Array.isArray(rewardsJson)) {
    for (const r of rewardsJson as Record<string, unknown>[]) {
      if (!r || typeof r !== "object") continue;
      const type = r.type as VoucherRewardType;
      if (!["credits", "ability", "badge", "name_style"].includes(type)) continue;
      out.push({
        type,
        amount: typeof r.amount === "number" ? r.amount : undefined,
        abilityKey: typeof r.abilityKey === "string" ? r.abilityKey : undefined,
        durationHours: typeof r.durationHours === "number" ? r.durationHours : undefined,
        badgeKey: typeof r.badgeKey === "string" ? r.badgeKey : undefined,
        styleKey: typeof r.styleKey === "string" ? r.styleKey : undefined,
      });
    }
  }
  if (out.length === 0 && legacy?.rewardType) {
    const v = legacy.rewardValue ?? {};
    out.push({
      type: legacy.rewardType,
      amount: v.amount,
      abilityKey: v.abilityKey,
      durationHours: legacy.abilityDurationHours || undefined,
      badgeKey: v.badgeKey,
      styleKey: v.styleKey,
    });
  }
  return out;
}

/** Short human label for one reward (admin list + redeem result). */
export function voucherRewardShort(r: VoucherReward): string {
  switch (r.type) {
    case "credits": return `${(r.amount ?? 0).toLocaleString("de-DE")} Credits`;
    case "ability": return `Fähigkeit ${r.abilityKey ?? "?"}${r.durationHours ? ` (${r.durationHours}h)` : ""}`;
    case "badge": return `Badge ${r.badgeKey ?? "?"}`;
    case "name_style": return `Style ${r.styleKey ?? "?"}`;
  }
}
