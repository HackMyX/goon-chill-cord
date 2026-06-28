import type { RewardSpec } from "@/lib/rewards-grant";
import { getBonusCardTheme } from "@/lib/bonus-card-themes";

export type VoucherRewardType = "credits" | "ability" | "badge" | "name_style" | "case_voucher" | "game_bonus";

/** Kept inline (no import) so this dependency-free module stays usable client-side. */
export type VoucherBonusGame = "plinko" | "snake" | "don";
export type VoucherRarity = "normal" | "selten" | "mythisch" | "ultra";

export interface VoucherRewardValue {
  amount?: number; // credits / game_bonus count
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
  amount?: number;          // credits — OR number of extra plays for game_bonus
  abilityKey?: string;      // ability
  /** Ability / case_voucher / game_bonus duration in hours (0 = permanent / no expiry). */
  durationHours?: number;
  badgeKey?: string;        // badge
  styleKey?: string;        // name_style
  // ── case_voucher ──
  caseMode?: "tier" | "rarity";
  caseTierId?: string;          // caseMode='tier'
  caseRarityFloor?: VoucherRarity; // caseMode='rarity'
  // ── game_bonus ──
  game?: VoucherBonusGame;
}

export interface RedemptionCode {
  code: string;
  label: string | null;
  /** Full reward bundle as canonical RewardSpec[] (old + new formats normalised in).
   *  Always ≥1 entry; legacy single-reward codes are mapped in. */
  rewards: RewardSpec[];
  maxUses: number; // 0 = unlimited
  /** How many times ONE user may redeem this code (default 1). */
  perUserLimit: number;
  /** When set, only these user IDs may redeem (targeted code). null = public. */
  targetUserIds: string[] | null;
  /** When set, the code only becomes redeemable at/after this time (scheduled). */
  startsAt: string | null;
  expiresAt: string | null;
  enabled: boolean;
  createdAt: string;
  /** Derived from redemption_claims (admin display only). */
  usedCount: number;
  /** Distinct users who redeemed (admin display only). */
  uniqueUsers?: number;
}

export const VOUCHER_REWARD_LABELS: Record<VoucherRewardType, string> = {
  credits: "Credits",
  ability: "Fähigkeits-Gutschein",
  badge: "Badge",
  name_style: "Name-Style",
  case_voucher: "Case-Gutschein",
  game_bonus: "Spiel-Bonus",
};

export const VOUCHER_REWARD_ICONS: Record<VoucherRewardType, string> = {
  credits: "💰",
  ability: "🔮",
  badge: "🏅",
  name_style: "🎨",
  case_voucher: "🎟️",
  game_bonus: "🎮",
};

export const VOUCHER_BONUS_GAME_LABELS: Record<VoucherBonusGame, string> = {
  plinko: "Plinko-Bälle",
  snake: "Snake-Spiele",
  don: "DON-Spins",
};

export const VOUCHER_RARITY_LABELS: Record<VoucherRarity, string> = {
  normal: "Normal",
  selten: "Selten",
  mythisch: "Mythisch",
  ultra: "Ultra",
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
      if (!["credits", "ability", "badge", "name_style", "case_voucher", "game_bonus"].includes(type)) continue;
      out.push({
        type,
        amount: typeof r.amount === "number" ? r.amount : undefined,
        abilityKey: typeof r.abilityKey === "string" ? r.abilityKey : undefined,
        durationHours: typeof r.durationHours === "number" ? r.durationHours : undefined,
        badgeKey: typeof r.badgeKey === "string" ? r.badgeKey : undefined,
        styleKey: typeof r.styleKey === "string" ? r.styleKey : undefined,
        caseMode: r.caseMode === "tier" || r.caseMode === "rarity" ? r.caseMode : undefined,
        caseTierId: typeof r.caseTierId === "string" ? r.caseTierId : undefined,
        caseRarityFloor: typeof r.caseRarityFloor === "string" ? (r.caseRarityFloor as VoucherRarity) : undefined,
        game: r.game === "plinko" || r.game === "snake" || r.game === "don" ? r.game : undefined,
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

// ─── RewardSpec bridge ────────────────────────────────────────────────────────
// Gutschein-Codes speichern ihre Belohnungen jetzt als kanonische RewardSpec[]
// (siehe lib/rewards-grant.ts, §9). Diese Helfer normalisieren BEIDE Formate —
// das ALTE VoucherReward-Format (game/caseMode/caseTierId/caseRarityFloor) UND
// das NEUE RewardSpec-Format (bonusGame/voucherMode/voucherTierId/voucherRarityFloor) —
// damit vor der Umstellung erstellte Codes weiterhin einlösbar bleiben.

/** Normalize EINE gespeicherte Belohnung (alt ODER neu) zu einer kanonischen RewardSpec.
 *  Unbekannter/ungültiger Typ → null. */
export function voucherRewardToSpec(raw: unknown): RewardSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = r.type;
  const KNOWN = ["credits", "xp", "item", "random_item", "ability", "name_style", "badge", "case_voucher", "game_bonus"];
  if (typeof type !== "string" || !KNOWN.includes(type)) return null;

  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
  const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

  // Alt → Neu Feld-Mapping (neue Felder haben Vorrang).
  const bonusGameRaw = r.bonusGame ?? r.game;
  const voucherModeRaw = r.voucherMode ?? r.caseMode;
  const voucherTierId = str(r.voucherTierId) ?? str(r.caseTierId);
  const voucherRarityRaw = r.voucherRarityFloor ?? r.caseRarityFloor;

  return {
    type: type as RewardSpec["type"],
    amount: num(r.amount),
    itemId: str(r.itemId),
    itemRarity: str(r.itemRarity),
    abilityKey: str(r.abilityKey),
    styleKey: str(r.styleKey),
    badgeKey: str(r.badgeKey),
    durationHours: num(r.durationHours),
    voucherMode: voucherModeRaw === "tier" || voucherModeRaw === "rarity" ? voucherModeRaw : undefined,
    voucherTierId,
    voucherRarityFloor:
      voucherRarityRaw === "normal" || voucherRarityRaw === "selten" || voucherRarityRaw === "mythisch" || voucherRarityRaw === "ultra"
        ? voucherRarityRaw
        : undefined,
    bonusGame: bonusGameRaw === "plinko" || bonusGameRaw === "snake" || bonusGameRaw === "don" ? bonusGameRaw : undefined,
  };
}

/** Coerce the DB `rewards` JSONB column into a clean RewardSpec[] (alt + neu). */
export function parseVoucherSpecs(rewardsJson: unknown): RewardSpec[] {
  if (!Array.isArray(rewardsJson)) return [];
  return rewardsJson
    .map((r) => voucherRewardToSpec(r))
    .filter((s): s is RewardSpec => s !== null);
}

/** Short human label for ANY of the 9 RewardSpec types (admin list + redeem result). */
export function describeRewardSpec(spec: RewardSpec): string {
  const dur = spec.durationHours ? ` ·${spec.durationHours}h` : "";
  switch (spec.type) {
    case "credits": return `💰 ${(spec.amount ?? 0).toLocaleString("de-DE")} Credits`;
    case "xp": return `✨ ${spec.amount ?? 0} XP`;
    case "item": return `📦 ${spec.amount && spec.amount > 1 ? `${spec.amount}× ` : ""}Item`;
    case "random_item": return `🎲 ${spec.amount && spec.amount > 1 ? `${spec.amount}× ` : ""}Zufalls-Item${spec.itemRarity ? ` (${spec.itemRarity})` : ""}`;
    case "ability": return `🔮 Fähigkeits-Gutschein ${spec.abilityKey ?? "?"}${dur}`;
    case "name_style": return `🎨 Style ${spec.styleKey ?? "?"}`;
    case "badge": return `🏅 Badge ${spec.badgeKey ?? "?"}`;
    case "case_voucher":
      return (spec.voucherMode ?? "rarity") === "rarity"
        ? `🎟️ Gratis-Case (mind. ${VOUCHER_RARITY_LABELS[spec.voucherRarityFloor ?? "normal"]})${dur}`
        : `🎟️ Gratis-Case${dur}`;
    case "game_bonus":
      return `🎮 +${spec.amount ?? 0} ${spec.bonusGame ? VOUCHER_BONUS_GAME_LABELS[spec.bonusGame] : "Spielzüge"}${dur} · Theme: ${getBonusCardTheme(spec.cardTheme).label}`;
  }
}

/** Short human label for one reward (admin list + redeem result). */
export function voucherRewardShort(r: VoucherReward): string {
  const dur = r.durationHours ? ` (${r.durationHours}h)` : "";
  switch (r.type) {
    case "credits": return `${(r.amount ?? 0).toLocaleString("de-DE")} Credits`;
    case "ability": return `Fähigkeits-Gutschein ${r.abilityKey ?? "?"}${dur}`;
    case "badge": return `Badge ${r.badgeKey ?? "?"}`;
    case "name_style": return `Style ${r.styleKey ?? "?"}`;
    case "case_voucher":
      return r.caseMode === "rarity"
        ? `🎟️ Gratis-Case (mind. ${VOUCHER_RARITY_LABELS[r.caseRarityFloor ?? "normal"]})${dur}`
        : `🎟️ Gratis-Case${dur}`;
    case "game_bonus":
      return `🎮 +${r.amount ?? 0} ${r.game ? VOUCHER_BONUS_GAME_LABELS[r.game] : "Spielzüge"}${dur}`;
  }
}
