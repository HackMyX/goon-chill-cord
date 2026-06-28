import type { Rarity } from "@/lib/cases";

export type BpRewardType = "credits" | "item" | "random_item" | "badge" | "xp_boost" | "name_style" | "ability" | "case_voucher" | "game_bonus";

// ── Visual config (per-pass) ──────────────────────────────────────────────────

export type BpLayoutMode = "carousel" | "grid" | "list";

export interface BpVisualConfig {
  tileScale: number;
  tileOffsetX: number;
  tileOffsetY: number;
  normalTileWidth: number;
  normalTileHeight: number;
  milestoneTileWidth: number;
  milestoneTileHeight: number;
  enableTiltEffect: boolean;
  glassmorphismIntensity: number;
  containerGap: number;
  showTileAnimations: boolean;
  showParticleField: boolean;
  milestoneGlowIntensity: number;
  trackGlowIntensity: number;
  rarityColorOverrides: {
    normal?: string;
    selten?: string;
    mythisch?: string;
    ultra?: string;
  };
  layoutMode: BpLayoutMode;
}

export const DEFAULT_BP_VISUAL_CONFIG: BpVisualConfig = {
  tileScale: 1.0,
  tileOffsetX: 0,
  tileOffsetY: 0,
  normalTileWidth: 140,
  normalTileHeight: 228,
  milestoneTileWidth: 172,
  milestoneTileHeight: 284,
  enableTiltEffect: true,
  glassmorphismIntensity: 0.5,
  containerGap: 8,
  showTileAnimations: true,
  showParticleField: true,
  milestoneGlowIntensity: 0.6,
  trackGlowIntensity: 0.5,
  rarityColorOverrides: {},
  layoutMode: "carousel",
};
export type BpProgressionType = "days" | "xp";
export type QuestDifficulty = "easy" | "medium" | "hard" | "legendary";
export type QuestFrequency = "daily" | "weekly" | "seasonal" | "once";
export type QuestType = "count" | "accumulate" | "reach";

export interface BpQuestDefinition {
  id: string;
  key: string;
  label: string;
  description: string | null;
  questType: QuestType;
  targetAction: string;
  defaultTarget: number;
  defaultBpXpReward: number;
  difficulty: QuestDifficulty;
  frequency: QuestFrequency;
  icon: string;
  enabled: boolean;
}

export interface BpQuest {
  id: string;
  passId: string;
  definitionId: string | null;
  label: string;
  description: string | null;
  questType: QuestType;
  targetAction: string;
  targetValue: number;
  bpXpReward: number;
  difficulty: QuestDifficulty;
  frequency: QuestFrequency;
  icon: string;
  sortOrder: number;
  enabled: boolean;
}

export interface UserBpQuestProgress {
  questId: string;
  currentValue: number;
  completed: boolean;
  bpXpAwarded: boolean;
  completedAt: string | null;
}

export interface BpQuestWithProgress extends BpQuest {
  progress: UserBpQuestProgress | null;
}
export type BpTheme = "default" | "gold" | "neon" | "fire" | "ice";
export type BpShopPosition = "top" | "below_motd" | "below_featured" | "between_categories" | "bottom";
export type BpShopBannerSize = "card" | "banner" | "hero";

export type BpTileDisplayMode = "auto" | "3d" | "icon";

export interface BattlePassTier {
  id: string;
  passId: string;
  tierNumber: number;
  name: string;
  isPremium: boolean;
  rewardType: BpRewardType;
  rewardCredits: number | null;
  rewardItemId: string | null;
  rewardItemName: string | null;
  rewardItemType: string | null;
  rewardBadgeKey: string | null;
  rewardBadgeText: string | null;
  rewardItemRarity: Rarity | null;
  rewardXpBoost: number | null;
  rewardNameStyleKey: string | null;
  rewardAbilityKey: string | null;
  rewardAbilityName: string | null;
  // ── case_voucher ──
  rewardCaseVoucherMode: "tier" | "rarity" | null;
  rewardCaseVoucherTierId: string | null;
  rewardCaseVoucherRarityFloor: Rarity | null;
  rewardCaseVoucherDurationHours: number;
  // ── game_bonus ──
  rewardGameBonusGame: "plinko" | "snake" | "don" | null;
  rewardGameBonusAmount: number;
  rewardGameBonusDurationHours: number;
  /** Enriched item combat stats (set server-side for item rewards) so the UI can show values. */
  rewardItemStats?: {
    damage: number | null;
    armor: number | null;
    perkType: string | null;
    perkMagnitude: number | null;
    shieldHp: number | null;
    shieldRegenCooldownSec: number | null;
  } | null;
  rewardQuantity: number;
  highlightTier: boolean;
  description: string | null;
  icon: string;
  bpXpRequired: number | null;
  displayMode: BpTileDisplayMode;
  showTierName: boolean;
  showTierDescription: boolean;
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
  theme: BpTheme;
  accentColor: string;
  bannerImageUrl: string | null;
  showInShop: boolean;
  showOnDashboard: boolean;
  shopSortOrder: number;
  shopPosition: BpShopPosition;
  shopBannerSize: BpShopBannerSize;
  customBuyText: string | null;
  highlightColor: string | null;
  showTierCountInShop: boolean;
  showCountdown: boolean;
  passIcon: string;
  incompatibleWith: string[];
  tiers: BattlePassTier[];
  createdAt: string;
  progressionType: BpProgressionType;
  bpXpPerTier: number;
  bpXpCapPerDay: number;
  visualConfig: BpVisualConfig;
}

export interface UserBpStatus {
  passId: string;
  hasPremium: boolean;
  progressDays: number;
  claimedTierIds: string[];
  bpXp: number;
}

export interface ActiveBpView {
  pass: BattlePass;
  userStatus: UserBpStatus | null;
}

export const BP_THEMES: Record<BpTheme, { label: string; gradient: string; accent: string; glow: string }> = {
  default: {
    label: "Klassisch Lila",
    gradient: "linear-gradient(135deg, #7c3aed22 0%, #0b081480 100%)",
    accent: "#7c3aed",
    glow: "rgba(124,58,237,0.4)",
  },
  gold: {
    label: "Gold Season",
    gradient: "linear-gradient(135deg, #f59e0b22 0%, #78350f30 100%)",
    accent: "#f59e0b",
    glow: "rgba(245,158,11,0.4)",
  },
  neon: {
    label: "Neon Cyber",
    gradient: "linear-gradient(135deg, #06b6d422 0%, #0e749030 100%)",
    accent: "#06b6d4",
    glow: "rgba(6,182,212,0.4)",
  },
  fire: {
    label: "Feuer",
    gradient: "linear-gradient(135deg, #ef444422 0%, #7f1d1d30 100%)",
    accent: "#ef4444",
    glow: "rgba(239,68,68,0.4)",
  },
  ice: {
    label: "Eis & Frost",
    gradient: "linear-gradient(135deg, #818cf822 0%, #1e1b4b30 100%)",
    accent: "#818cf8",
    glow: "rgba(129,140,248,0.4)",
  },
};

// ── Auto-fill config ──────────────────────────────────────────────────────────

export interface BpAutoFillConfig {
  creditMin: number;
  creditMax: number;
  milestoneTierInterval: number;
  rewardMixCredits: number;
  rewardMixRandomItem: number;
  rewardMixXpBoost: number;
  rewardMixBadge: number;
  freeRatio: number;
  rarityProgression: boolean;
  creditProgression: boolean;
  /** Default visual display mode applied to every generated tier. */
  defaultDisplayMode: BpTileDisplayMode;
  /** Whether milestone tiers (every N) get 3D display mode regardless of defaultDisplayMode. */
  milestoneAlways3D: boolean;
  /** Resolve "random item" slots to a CONCRETE item already at generation time (shows the real
   *  3D model). When false, slots stay as random_item type (item is rolled at claim — surprise). */
  resolveRandomItems: boolean;
}

export const DEFAULT_AUTOFILL_CONFIG: BpAutoFillConfig = {
  creditMin: 1000,
  creditMax: 25000,
  milestoneTierInterval: 5,
  rewardMixCredits: 25,
  rewardMixRandomItem: 50,
  rewardMixXpBoost: 15,
  rewardMixBadge: 10,
  freeRatio: 45,
  rarityProgression: true,
  creditProgression: true,
  defaultDisplayMode: "3d",
  milestoneAlways3D: true,
  resolveRandomItems: true,
};
