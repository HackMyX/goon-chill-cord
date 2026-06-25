"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import type { MineLevel } from "@/lib/mine-config";
import type { Rarity } from "@/lib/cases";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BalanceItemStats {
  rarity: Rarity;
  count: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
}

export interface BalanceMonsterRow {
  id: string;
  name: string;
  hp: number;
  atk_dmg: number;
  move_speed: number;
  credits_reward: number;
  reward_min: number;
  reward_max: number;
  spawn_weight: number;
}

export interface BalanceNameStyleRow {
  rarity: string;
  base_shop_price_cr: number;
  max_shop_price_cr: number;
  case_drop_weight: number;
  case_drop_enabled: boolean;
}

export interface BalanceCaseTierRow {
  id: string;
  label: string;
  price: number;
  rarity_weights: Partial<Record<Rarity, number>>;
  group_id: string;
}

export interface BalanceStudioData {
  // Site
  startingCredits: number;
  currencyName: string;
  // Mine
  mineLevels: MineLevel[];
  // Streak
  streakBase: number;
  streakIncrement: number;
  streakMax: number;
  streakMilestoneBonus: number;
  streakMilestoneInterval: number;
  streakWeekendMultiplier: number;
  // DON
  donDailyFlipLimit: number;
  donMinBet: number;
  donQuickAmounts: number[];
  donUpgradeEnabled: boolean;
  donUpgradeTiers: Array<{ tier: number; name: string; bonusHourlyFlips: number; costCr: number }>;
  // Snake modes
  snakeModes: Record<string, {
    creditsPerApple: number;
    dailyCrLimit: number;
    bonusCrFlat: number;
    goldenAppleCrMultiplier: number;
    dailyGameLimit: number | null;
  }>;
  // Plinko
  plinkoBallCost: number;
  plinkoHourlyLimit: number;
  plinkoQuickBets: number[];
  plinkoRiskLevels: Record<string, { multipliers: number[] }>;
  // World spawn
  worldMaxAliveMonsters: number;
  worldSpawnIntervalMin: number;
  worldSpawnIntervalMax: number;
  worldAliveCapMax: number;
  worldAliveCapPerPlayer: number;
  // Character / combat
  characterAttackCooldown: number;
  characterHpRegenPerSec: number;
  characterHpRegenDelay: number;
  characterPvpDamageMultiplier: number;
  characterPerkMultiplierCap: number;
  characterFistDamage: number;
  characterMoveSpeed: number;
  characterSprintMultiplier: number;
  characterSprintDamageMultiplier: number;
  // Kill streak
  killStreakMultiplierPerKill: number;
  killStreakMaxMultiplier: number;
  // Monsters
  monsters: BalanceMonsterRow[];
  // Cases
  caseTiers: BalanceCaseTierRow[];
  // Name styles
  nameStyles: BalanceNameStyleRow[];
  // Shop
  shopMultiplierMin: number;
  shopMultiplierMax: number;
  // Item stats (for health panel, readonly)
  itemStats: BalanceItemStats[];
}

// ─── Fetch all ────────────────────────────────────────────────────────────────

export async function getBalanceStudioData(): Promise<BalanceStudioData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return null;

  const [
    siteRow, mineRow, streakRow, donRow, snakeRow, plinkoRow,
    worldRow, charRow, killRow, monsterRows, caseRows, nameStyleRows,
    shopRow, itemStatsRows,
  ] = await Promise.all([
    admin.from("site_config").select("starting_credits, currency_name").eq("id", "default").single(),
    admin.from("mine_config").select("levels").eq("id", "default").single(),
    admin.from("streak_config").select("base_reward,daily_increment,max_reward,milestone_bonus,milestone_interval,weekend_multiplier").eq("id", "default").single(),
    admin.from("don_config").select("daily_flip_limit,min_bet,quick_amounts,upgrade_enabled,upgrade_tiers").eq("id", "default").single(),
    admin.from("snake_config").select("modes_config").eq("id", "default").single(),
    admin.from("plinko_config").select("ball_cost_cr,hourly_ball_limit,quick_bet_amounts,risk_levels").eq("id", "default").single(),
    admin.from("world_config").select("max_alive_monsters,spawn_interval_min_sec,spawn_interval_max_sec,alive_cap_max,alive_cap_per_extra_player").eq("id", "default").single(),
    admin.from("character_config").select("attack_cooldown,hp_regen_per_sec,hp_regen_delay_after_hit_sec,pvp_damage_multiplier,perk_multiplier_cap,fist_damage,move_speed,sprint_multiplier,sprint_damage_multiplier").eq("id", "default").single(),
    admin.from("kill_streak_config").select("multiplier_per_kill,max_multiplier").eq("id", "default").single(),
    admin.from("monster_types").select("id,name,hp,atk_dmg,move_speed,credits_reward,reward_min,reward_max,spawn_weight").order("spawn_weight", { ascending: false }),
    admin.from("case_tiers").select("id,label,price,rarity_weights,group_id").order("group_id").order("price"),
    admin.from("name_style_rarity_config").select("rarity,base_shop_price_cr,max_shop_price_cr,case_drop_weight,case_drop_enabled").order("base_shop_price_cr"),
    admin.from("shop_settings").select("auto_generate_price_multiplier_min,auto_generate_price_multiplier_max").eq("id", "default").single(),
    admin.from("items").select("rarity, price_cr").then((res) => {
      if (!res.data) return { data: [] as BalanceItemStats[] };
      const map: Record<string, { count: number; sum: number; min: number; max: number }> = {};
      for (const row of res.data as { rarity: string; price_cr: number }[]) {
        if (!map[row.rarity]) map[row.rarity] = { count: 0, sum: 0, min: Infinity, max: -Infinity };
        map[row.rarity].count++;
        map[row.rarity].sum += row.price_cr;
        if (row.price_cr < map[row.rarity].min) map[row.rarity].min = row.price_cr;
        if (row.price_cr > map[row.rarity].max) map[row.rarity].max = row.price_cr;
      }
      const stats: BalanceItemStats[] = (["normal", "selten", "mythisch", "ultra"] as Rarity[]).map((r) => ({
        rarity: r,
        count: map[r]?.count ?? 0,
        minPrice: map[r]?.min ?? 0,
        maxPrice: map[r]?.max ?? 0,
        avgPrice: map[r] ? Math.round(map[r].sum / map[r].count) : 0,
      }));
      return { data: stats };
    }),
  ]);

  const site = siteRow.data;
  const mine = mineRow.data;
  const streak = streakRow.data;
  const don = donRow.data;
  const snake = snakeRow.data;
  const plinko = plinkoRow.data;
  const world = worldRow.data;
  const char = charRow.data;
  const kill = killRow.data;
  const shop = shopRow.data;

  if (!site || !mine || !streak || !don || !snake || !plinko || !world || !char || !kill || !shop) {
    return null;
  }

  const modes = snake.modes_config as Record<string, Record<string, unknown>>;
  const snakeModes: BalanceStudioData["snakeModes"] = {};
  for (const [k, v] of Object.entries(modes)) {
    snakeModes[k] = {
      creditsPerApple: Number(v.creditsPerApple ?? 0),
      dailyCrLimit: Number(v.dailyCrLimit ?? 0),
      bonusCrFlat: Number(v.bonusCrFlat ?? 0),
      goldenAppleCrMultiplier: Number(v.goldenAppleCrMultiplier ?? 1),
      dailyGameLimit: v.dailyGameLimit != null ? Number(v.dailyGameLimit) : null,
    };
  }

  return {
    startingCredits: Number(site.starting_credits ?? 0),
    currencyName: (site.currency_name as string) ?? "CR",
    mineLevels: (mine.levels as MineLevel[]) ?? [],
    streakBase: Number(streak.base_reward),
    streakIncrement: Number(streak.daily_increment),
    streakMax: Number(streak.max_reward),
    streakMilestoneBonus: Number(streak.milestone_bonus),
    streakMilestoneInterval: Number(streak.milestone_interval),
    streakWeekendMultiplier: Number(streak.weekend_multiplier),
    donDailyFlipLimit: Number(don.daily_flip_limit),
    donMinBet: Number(don.min_bet),
    donQuickAmounts: (don.quick_amounts as number[]) ?? [],
    donUpgradeEnabled: Boolean(don.upgrade_enabled),
    donUpgradeTiers: (don.upgrade_tiers as BalanceStudioData["donUpgradeTiers"]) ?? [],
    snakeModes,
    plinkoBallCost: Number(plinko.ball_cost_cr),
    plinkoHourlyLimit: Number(plinko.hourly_ball_limit),
    plinkoQuickBets: (plinko.quick_bet_amounts as number[]) ?? [],
    plinkoRiskLevels: (plinko.risk_levels as Record<string, { multipliers: number[] }>) ?? {},
    worldMaxAliveMonsters: Number(world.max_alive_monsters),
    worldSpawnIntervalMin: Number(world.spawn_interval_min_sec),
    worldSpawnIntervalMax: Number(world.spawn_interval_max_sec),
    worldAliveCapMax: Number(world.alive_cap_max),
    worldAliveCapPerPlayer: Number(world.alive_cap_per_extra_player),
    characterAttackCooldown: Number(char.attack_cooldown),
    characterHpRegenPerSec: Number(char.hp_regen_per_sec),
    characterHpRegenDelay: Number(char.hp_regen_delay_after_hit_sec),
    characterPvpDamageMultiplier: Number(char.pvp_damage_multiplier),
    characterPerkMultiplierCap: Number(char.perk_multiplier_cap),
    characterFistDamage: Number(char.fist_damage),
    characterMoveSpeed: Number(char.move_speed),
    characterSprintMultiplier: Number(char.sprint_multiplier),
    characterSprintDamageMultiplier: Number(char.sprint_damage_multiplier),
    killStreakMultiplierPerKill: Number(kill.multiplier_per_kill),
    killStreakMaxMultiplier: Number(kill.max_multiplier),
    monsters: ((monsterRows.data ?? []) as BalanceMonsterRow[]),
    caseTiers: ((caseRows.data ?? []) as BalanceCaseTierRow[]),
    nameStyles: ((nameStyleRows.data ?? []) as BalanceNameStyleRow[]),
    shopMultiplierMin: Number(shop.auto_generate_price_multiplier_min),
    shopMultiplierMax: Number(shop.auto_generate_price_multiplier_max),
    itemStats: (itemStatsRows.data ?? []) as BalanceItemStats[],
  };
}

// ─── Save sections ────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt.");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) throw new Error("Kein Admin.");
  return admin;
}

export async function saveEconomySettings(data: {
  startingCredits: number;
  mineLevels: MineLevel[];
  streakBase: number;
  streakIncrement: number;
  streakMax: number;
  streakMilestoneBonus: number;
  streakMilestoneInterval: number;
  streakWeekendMultiplier: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();
    await Promise.all([
      admin.from("site_config").update({ starting_credits: data.startingCredits }).eq("id", "default"),
      admin.from("mine_config").update({ levels: data.mineLevels }).eq("id", "default"),
      admin.from("streak_config").update({
        base_reward: data.streakBase,
        daily_increment: data.streakIncrement,
        max_reward: data.streakMax,
        milestone_bonus: data.streakMilestoneBonus,
        milestone_interval: data.streakMilestoneInterval,
        weekend_multiplier: data.streakWeekendMultiplier,
      }).eq("id", "default"),
    ]);
    revalidatePath("/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function saveGamesSettings(data: {
  donDailyFlipLimit: number;
  donMinBet: number;
  donQuickAmounts: number[];
  donUpgradeEnabled: boolean;
  snakeModes: BalanceStudioData["snakeModes"];
  plinkoBallCost: number;
  plinkoHourlyLimit: number;
  plinkoQuickBets: number[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();
    // Snake: merge updated snakeModes back into the modes_config JSONB
    const { data: snakeRow } = await admin.from("snake_config").select("modes_config").eq("id", "default").single();
    const currentModes = (snakeRow?.modes_config ?? {}) as Record<string, Record<string, unknown>>;
    for (const [key, vals] of Object.entries(data.snakeModes)) {
      if (currentModes[key]) {
        currentModes[key].creditsPerApple = vals.creditsPerApple;
        currentModes[key].dailyCrLimit = vals.dailyCrLimit;
        currentModes[key].bonusCrFlat = vals.bonusCrFlat;
        currentModes[key].goldenAppleCrMultiplier = vals.goldenAppleCrMultiplier;
        if (vals.dailyGameLimit !== null) currentModes[key].dailyGameLimit = vals.dailyGameLimit;
      }
    }
    await Promise.all([
      admin.from("don_config").update({
        daily_flip_limit: data.donDailyFlipLimit,
        min_bet: data.donMinBet,
        quick_amounts: data.donQuickAmounts,
        upgrade_enabled: data.donUpgradeEnabled,
      }).eq("id", "default"),
      admin.from("snake_config").update({ modes_config: currentModes }).eq("id", "default"),
      admin.from("plinko_config").update({
        ball_cost_cr: data.plinkoBallCost,
        hourly_ball_limit: data.plinkoHourlyLimit,
        quick_bet_amounts: data.plinkoQuickBets,
        min_bet_cr: data.plinkoBallCost,
      }).eq("id", "default"),
    ]);
    revalidatePath("/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function saveItemSettings(data: {
  caseTiers: Array<{ id: string; price: number; rarity_weights: Partial<Record<Rarity, number>> }>;
  nameStyles: Array<{ rarity: string; base_shop_price_cr: number; max_shop_price_cr: number }>;
  shopMultiplierMin: number;
  shopMultiplierMax: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();
    await Promise.all([
      ...data.caseTiers.map((t) =>
        admin.from("case_tiers").update({ price: t.price, rarity_weights: t.rarity_weights }).eq("id", t.id)
      ),
      ...data.nameStyles.map((ns) =>
        admin.from("name_style_rarity_config").update({
          base_shop_price_cr: ns.base_shop_price_cr,
          max_shop_price_cr: ns.max_shop_price_cr,
        }).eq("rarity", ns.rarity)
      ),
      admin.from("shop_settings").update({
        auto_generate_price_multiplier_min: data.shopMultiplierMin,
        auto_generate_price_multiplier_max: data.shopMultiplierMax,
      }).eq("id", "default"),
    ]);
    revalidatePath("/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function applyItemPriceMultipliers(multipliers: Partial<Record<Rarity, number>>): Promise<{ success: boolean; error?: string; updated: number }> {
  try {
    const admin = await requireAdmin();
    let total = 0;
    for (const [rarity, mult] of Object.entries(multipliers)) {
      if (!mult || mult === 1) continue;
      const { data } = await admin
        .from("items")
        .select("id, price_cr")
        .eq("rarity", rarity);
      if (!data?.length) continue;
      const updates = (data as { id: string; price_cr: number }[]).map((item) =>
        admin.from("items").update({ price_cr: Math.round(item.price_cr * mult) }).eq("id", item.id)
      );
      await Promise.all(updates);
      total += data.length;
    }
    revalidatePath("/admin");
    return { success: true, updated: total };
  } catch (e) {
    return { success: false, error: (e as Error).message, updated: 0 };
  }
}

export async function saveWorldSettings(data: {
  worldMaxAliveMonsters: number;
  worldSpawnIntervalMin: number;
  worldSpawnIntervalMax: number;
  worldAliveCapMax: number;
  worldAliveCapPerPlayer: number;
  characterAttackCooldown: number;
  characterHpRegenPerSec: number;
  characterHpRegenDelay: number;
  characterPvpDamageMultiplier: number;
  characterPerkMultiplierCap: number;
  characterFistDamage: number;
  characterMoveSpeed: number;
  characterSprintMultiplier: number;
  characterSprintDamageMultiplier: number;
  killStreakMultiplierPerKill: number;
  killStreakMaxMultiplier: number;
  monsters: Array<{ id: string; credits_reward: number; hp: number; atk_dmg: number; move_speed: number; reward_min: number; reward_max: number; spawn_weight: number }>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();
    await Promise.all([
      admin.from("world_config").update({
        max_alive_monsters: data.worldMaxAliveMonsters,
        spawn_interval_min_sec: data.worldSpawnIntervalMin,
        spawn_interval_max_sec: data.worldSpawnIntervalMax,
        alive_cap_max: data.worldAliveCapMax,
        alive_cap_per_extra_player: data.worldAliveCapPerPlayer,
      }).eq("id", "default"),
      admin.from("character_config").update({
        attack_cooldown: data.characterAttackCooldown,
        hp_regen_per_sec: data.characterHpRegenPerSec,
        hp_regen_delay_after_hit_sec: data.characterHpRegenDelay,
        pvp_damage_multiplier: data.characterPvpDamageMultiplier,
        perk_multiplier_cap: data.characterPerkMultiplierCap,
        fist_damage: data.characterFistDamage,
        move_speed: data.characterMoveSpeed,
        sprint_multiplier: data.characterSprintMultiplier,
        sprint_damage_multiplier: data.characterSprintDamageMultiplier,
      }).eq("id", "default"),
      admin.from("kill_streak_config").update({
        multiplier_per_kill: data.killStreakMultiplierPerKill,
        max_multiplier: data.killStreakMaxMultiplier,
      }).eq("id", "default"),
      ...data.monsters.map((m) =>
        admin.from("monster_types").update({
          credits_reward: m.credits_reward,
          hp: m.hp,
          atk_dmg: m.atk_dmg,
          move_speed: m.move_speed,
          reward_min: m.reward_min,
          reward_max: m.reward_max,
          spawn_weight: m.spawn_weight,
        }).eq("id", m.id)
      ),
    ]);
    revalidatePath("/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
