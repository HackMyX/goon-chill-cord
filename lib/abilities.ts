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
  | "streak_grace_hours"      // extra grace period hours for streak
  // ── NEW (V-ABILITIES-POWER) ──
  | "mine_storage_multiplier" // % more max storage capacity (multiplies hours)
  | "mine_jackpot_chance"     // chance (0-1) a collection pays 3×
  | "snake_score_multiplier"  // % more credits from a snake run
  | "plinko_min_multiplier"   // guarantees the result multiplier is at least this value
  | "plinko_loss_cushion"     // refund % of the bet on ANY losing drop
  | "don_loss_refund"         // refund % of the stake whenever a flip is lost
  | "case_luck"               // chance (0-1) a case roll is bumped up one rarity tier
  | "streak_reward_multiplier";// % more credits from the daily streak reward

export type AbilityRarity = "selten" | "mythisch" | "ultra";

export interface AbilityEffectConfig {
  storage_bonus?: number;   // for mine_cr_bonus: also adds storage %
  double_chance?: number;   // for mine_cr_bonus: also has double chance
  upgrade_discount?: number;// for mine_cr_bonus: also has upgrade discount
  [key: string]: number | undefined;
}

export interface EquippedEffect {
  effectType: string;
  effectValue: number;
  effectConfig: Record<string, number>;
}

/**
 * Effektiver Wert eines Effekt-Typs für die ausgerüstete Fähigkeit — gelesen aus
 * dem PRIMÄR-Effekt (wenn `effectType` passt) PLUS dem Kombo-Wert in
 * `effectConfig[type]`. So kann EINE Fähigkeit mehrere Effekte über mehrere
 * Spiele tragen (Kombo). Rein additiv: bei leerer effectConfig identisch zum
 * bisherigen Primär-Verhalten — bricht also nichts.
 *
 * Erlaubte effectConfig-Keys = Effekt-Typ-Namen (z.B. `plinko_min_multiplier`,
 * `snake_score_multiplier`, `case_luck`, `streak_reward_multiplier`, `credit_bonus`).
 */
export function equippedEffectValue(eff: EquippedEffect | null, type: string): number {
  if (!eff) return 0;
  const primary = eff.effectType === type ? (Number(eff.effectValue) || 0) : 0;
  const combo = Number(eff.effectConfig?.[type] ?? 0) || 0;
  return primary + combo;
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

/** How the admin should read/enter `effectValue` for a given effect type. */
export type AbilityEffectUnit =
  | "percent"   // 0.25 = +25 %
  | "chance"    // 0.25 = 25 % chance (0–1)
  | "value"     // raw number (e.g. multiplier floor, refund fraction)
  | "flat"      // flat amount (e.g. extra flips, CR per apple)
  | "hours"     // hours
  | "flag";     // 1 = on, 0 = off

/** Single source of truth for every effect type: human label, help text, the
 *  category it belongs to, and how to read its effectValue. The admin editor
 *  renders directly from this, so a NEW effect type only has to be added here +
 *  to the AbilityEffectType union + wired into its game's grant/apply logic. */
export const ABILITY_EFFECT_META: Record<AbilityEffectType, {
  label: string; description: string; category: AbilityCategory; unit: AbilityEffectUnit;
}> = {
  // Mine
  mine_cr_bonus:          { label: "Mine: Credit-Bonus", description: "Multipliziert die in der Mine verdienten Credits.", category: "mine", unit: "percent" },
  mine_double_chance:     { label: "Mine: Doppel-Chance", description: "Chance, dass eine Abholung doppelt zahlt.", category: "mine", unit: "chance" },
  mine_speed:             { label: "Mine: Tempo", description: "Verkürzt das Sammel-Intervall der Mine.", category: "mine", unit: "percent" },
  mine_storage_hours:     { label: "Mine: Lager (Stunden)", description: "Erhöht die Lager-Kapazität um feste Stunden.", category: "mine", unit: "hours" },
  mine_upgrade_discount:  { label: "Mine: Upgrade-Rabatt", description: "Senkt die Upgrade-Kosten der Mine.", category: "mine", unit: "percent" },
  mine_storage_multiplier:{ label: "Mine: Lager-Multiplikator", description: "Erhöht die maximale Lager-Kapazität prozentual.", category: "mine", unit: "percent" },
  mine_jackpot_chance:    { label: "Mine: Jackpot-Chance", description: "Chance, dass eine Abholung das 3-fache zahlt.", category: "mine", unit: "chance" },
  // Snake
  snake_cr_per_apple:     { label: "Snake: CR pro Apfel", description: "Flacher Bonus-CR pro gegessenem Apfel.", category: "snake", unit: "flat" },
  snake_gold_apple_rate:  { label: "Snake: Goldapfel-Rate", description: "Verkürzt das Intervall, in dem goldene Äpfel erscheinen.", category: "snake", unit: "percent" },
  snake_score_multiplier: { label: "Snake: Score-Multiplikator", description: "Multipliziert die Credits eines Snake-Laufs.", category: "snake", unit: "percent" },
  // Plinko
  plinko_loss_recovery:   { label: "Plinko: Verlust-Rückgabe (Worst)", description: "Erstattet einen Teil des Einsatzes nur im schlechtesten Feld.", category: "plinko", unit: "value" },
  plinko_multiplier_boost:{ label: "Plinko: Multiplikator-Boost", description: "Erhöht alle Plinko-Multiplikatoren leicht.", category: "plinko", unit: "percent" },
  plinko_min_multiplier:  { label: "Plinko: Mindest-Multiplikator", description: "Garantiert, dass der Ergebnis-Multiplikator mindestens dieser Wert ist.", category: "plinko", unit: "value" },
  plinko_loss_cushion:    { label: "Plinko: Verlust-Polster", description: "Erstattet einen Teil des Einsatzes bei JEDEM Verlust-Wurf.", category: "plinko", unit: "value" },
  // DON
  don_bonus_flips:        { label: "DON: Extra-Flips", description: "Zusätzliche Flips über dem Tages-/Stundenlimit.", category: "don", unit: "flat" },
  don_daily_shield:       { label: "DON: Tages-Schild", description: "Einmal pro Tag wird ein Verlust ignoriert.", category: "don", unit: "flag" },
  don_loss_refund:        { label: "DON: Verlust-Rückgabe", description: "Erstattet bei jedem verlorenen Flip einen Teil des Einsatzes.", category: "don", unit: "value" },
  // World
  world_damage_boost:     { label: "Welt: Schaden +", description: "Erhöht deinen Kampfschaden in der Welt.", category: "world", unit: "percent" },
  world_hp_regen:         { label: "Welt: HP-Regen +", description: "Erhöht deine HP-Regeneration in der Welt.", category: "world", unit: "percent" },
  world_xp_boost:         { label: "Welt: XP +", description: "Mehr XP aus Welt-Kills.", category: "world", unit: "percent" },
  // Global / Cross-Game
  xp_boost:               { label: "Global: XP-Multiplikator", description: "Mehr XP aus ALLEN Quellen.", category: "global", unit: "percent" },
  credit_bonus:           { label: "Global: Credit-Bonus", description: "Mehr Credits aus allen Spiel-Erträgen.", category: "global", unit: "percent" },
  streak_grace_hours:     { label: "Streak: Gnaden-Stunden", description: "Zusätzliche Kulanzzeit, bevor der Streak bricht.", category: "global", unit: "hours" },
  case_luck:              { label: "Cases: Glück", description: "Chance, dass eine Case-Auslosung eine Seltenheitsstufe höher ausfällt.", category: "global", unit: "chance" },
  streak_reward_multiplier:{ label: "Streak: Belohnungs-Multiplikator", description: "Multipliziert die tägliche Streak-Belohnung.", category: "global", unit: "percent" },
};

export const ABILITY_EFFECT_UNIT_HINT: Record<AbilityEffectUnit, string> = {
  percent: "Wert als Anteil: 0.25 = +25 %",
  chance:  "Chance 0–1: 0.25 = 25 %",
  value:   "Wert (z.B. Multiplikator-Untergrenze oder Anteil 0–1)",
  flat:    "Feste Zahl (z.B. Anzahl)",
  hours:   "Stunden",
  flag:    "1 = an, 0 = aus",
};
