// ─── Game Abilities (Fähigkeiten) — Types ─────────────────────────────────────

export type AbilityCategory = "mine" | "snake" | "plinko" | "don" | "world" | "global";

export type AbilityEffectType =
  // Mine
  | "mine_cr_bonus"           // multiplier on earned credits
  | "mine_double_chance"      // chance (0-1) for double credits
  | "mine_speed"              // reduce effective collection interval
  | "mine_storage_hours"      // add flat hours to storage
  | "mine_upgrade_discount"   // reduce upgrade cost
  // Snake
  | "snake_cr_per_apple"      // flat bonus CR per apple
  | "snake_gold_apple_rate"   // increase golden apple spawn rate
  // Plinko
  | "plinko_loss_recovery"    // recover % of bet on worst slot
  | "plinko_multiplier_boost" // small boost to all multipliers
  // DON
  | "don_bonus_flips"         // extra daily flips
  | "don_daily_shield"        // once per day: ignore a loss
  // World
  | "world_damage_boost"      // % damage increase
  | "world_hp_regen"          // % hp regen increase
  | "world_xp_boost"          // % more XP from world kills
  // Global
  | "xp_boost"                // % global XP multiplier
  | "credit_bonus"            // % all credit earnings
  | "streak_grace_hours";     // extra grace period hours for streak

export type AbilityRarity = "selten" | "mythisch" | "ultra";

export interface AbilityEffectConfig {
  storage_bonus?: number;   // for mine_cr_bonus: also adds storage %
  double_chance?: number;   // for mine_cr_bonus: also has double chance
  upgrade_discount?: number;// for mine_cr_bonus: also has upgrade discount
  [key: string]: number | undefined;
}

export interface AbilityDefinition {
  key: string;
  name: string;
  description: string;
  category: AbilityCategory;
  effectType: AbilityEffectType;
  effectValue: number;
  effectConfig: AbilityEffectConfig;
  rarity: AbilityRarity;
  icon: string;
  shopPriceCr: number;
  availableInShop: boolean;
  canDropFromCases: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface UserAbility {
  id: string;
  userId: string;
  abilityKey: string;
  source: string;
  sourceDetail: string | null;
  acquiredAt: string;
  expiresAt: string | null;
  definition?: AbilityDefinition;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

export const ABILITY_CATEGORY_LABELS: Record<AbilityCategory, string> = {
  mine: "Mine",
  snake: "Snake",
  plinko: "Plinko",
  don: "DON",
  world: "Welt",
  global: "Global",
};

export const ABILITY_CATEGORY_COLORS: Record<AbilityCategory, string> = {
  mine:   "text-amber-400 bg-amber-500/10 border-amber-500/30",
  snake:  "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  plinko: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  don:    "text-orange-400 bg-orange-500/10 border-orange-500/30",
  world:  "text-red-400 bg-red-500/10 border-red-500/30",
  global: "text-purple-400 bg-purple-500/10 border-purple-500/30",
};

export const ABILITY_RARITY_COLORS: Record<AbilityRarity, string> = {
  selten:   "text-blue-300 bg-blue-500/10 border-blue-500/30",
  mythisch: "text-purple-300 bg-purple-500/10 border-purple-500/30",
  ultra:    "text-amber-300 bg-amber-500/10 border-amber-500/30",
};

export const ABILITY_RARITY_LABELS: Record<AbilityRarity, string> = {
  selten:   "Selten",
  mythisch: "Mythisch",
  ultra:    "Ultra",
};
