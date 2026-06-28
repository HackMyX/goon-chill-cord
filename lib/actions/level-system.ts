"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { notifyUser } from "@/lib/notifications-internal";
import { grantReward, type RewardSpec } from "@/lib/rewards-grant";
import { isAbilityActive } from "@/lib/actions/abilities";
import { getSynergyConfig, addBpXpToActivePass } from "@/lib/actions/economy-synergy";
import { computeSynergyMultipliers } from "@/lib/economy-synergy";
import { logDebugEvent } from "@/lib/debug-log-server";
import {
  calculateLevel, buildLevelInfo, prestigeXpMultiplier,
  DEFAULT_XP_SOURCES, DEFAULT_LEVEL_ROAD_CONFIG,
  type XpConfig, type XpSourceConfig, type LevelDefinition,
  type LevelReward, type AwardXpResult, type UserLevelInfo, type XpEvent,
  type LevelRewardDisplay, type LevelRoadConfig,
} from "@/lib/level-system";

// ─── Config ────────────────────────────────────────────────────────────────────

export async function getXpConfig(): Promise<XpConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("xp_config")
      .select("levels, sources, ability_slot_count, level_reward_display, level_road_config")
      .eq("id", "default")
      .maybeSingle();

    if (!data) {
      return { levels: [], sources: DEFAULT_XP_SOURCES, abilitySlotCount: 1, levelRewardDisplay: "3d", levelRoadConfig: DEFAULT_LEVEL_ROAD_CONFIG };
    }

    const levels = (Array.isArray(data.levels) ? data.levels : []) as LevelDefinition[];
    const sources = ((data.sources as unknown) ?? DEFAULT_XP_SOURCES) as XpSourceConfig;
    const display = (data.level_reward_display === "icon" ? "icon" : "3d") as LevelRewardDisplay;
    const roadRaw = (data.level_road_config as Partial<LevelRoadConfig> | null) ?? null;
    const levelRoadConfig: LevelRoadConfig = roadRaw && Array.isArray(roadRaw.tiers) && roadRaw.tiers.length
      ? {
          tiers: roadRaw.tiers,
          showXp: roadRaw.showXp ?? true,
          showTitles: roadRaw.showTitles ?? true,
          milestoneEvery: roadRaw.milestoneEvery ?? 10,
          ambientFx: roadRaw.ambientFx ?? true,
          celebrateMilestones: roadRaw.celebrateMilestones ?? true,
          prestigeXpBonusPercent: roadRaw.prestigeXpBonusPercent ?? 5,
        }
      : DEFAULT_LEVEL_ROAD_CONFIG;

    return {
      levels,
      sources: { ...DEFAULT_XP_SOURCES, ...sources },
      abilitySlotCount: (data.ability_slot_count as number) ?? 1,
      levelRewardDisplay: display,
      levelRoadConfig,
    };
  } catch {
    return { levels: [], sources: DEFAULT_XP_SOURCES, abilitySlotCount: 1, levelRewardDisplay: "3d", levelRoadConfig: DEFAULT_LEVEL_ROAD_CONFIG };
  }
}

export async function updateXpConfig(
  config: XpConfig
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const { error } = await admin.from("xp_config").upsert({
    id: "default",
    levels: config.levels,
    sources: config.sources,
    ability_slot_count: config.abilitySlotCount,
    level_reward_display: config.levelRewardDisplay === "icon" ? "icon" : "3d",
    level_road_config: config.levelRoadConfig ?? DEFAULT_LEVEL_ROAD_CONFIG,
    updated_at: new Date().toISOString(),
  });

  if (error) return { success: false, error: error.message };
  revalidatePath("/", "layout");
  return { success: true };
}

// ─── Core award function ────────────────────────────────────────────────────────

/**
 * Award XP to a user. Handles level-up detection, reward grants, and XP event logging.
 * Returns info about the XP gain for the caller to surface to the user.
 */
export async function awardXp(
  userId: string,
  rawAmount: number,
  source: string,
  sourceDetail?: string
): Promise<AwardXpResult> {
  if (rawAmount <= 0) {
    return { newXp: 0, newLevel: 1, leveledUp: false, levelsGained: 0, rewards: [] };
  }

  const admin = createAdminClient();

  // Load user profile + XP config in parallel
  const [{ data: profile }, config] = await Promise.all([
    admin.from("profiles").select("xp, level, equipped_ability_key, prestige").eq("id", userId).single(),
    getXpConfig(),
  ]);

  if (!profile || !config.levels.length) {
    return { newXp: 0, newLevel: 1, leveledUp: false, levelsGained: 0, rewards: [] };
  }

  const currentXp = (profile.xp as number) ?? 0;
  const equippedKey = profile.equipped_ability_key as string | null;

  // Check for XP boost ability
  let xpMultiplier = 1.0;
  if (equippedKey && await isAbilityActive(admin, userId, equippedKey)) {
    try {
      const { data: abilityDef } = await admin
        .from("ability_definitions")
        .select("effect_type, effect_value")
        .eq("key", equippedKey)
        .eq("enabled", true)
        .single();
      if (abilityDef?.effect_type === "xp_boost" || abilityDef?.effect_type === "world_xp_boost") {
        xpMultiplier = 1 + (abilityDef.effect_value as number);
      }
    } catch { /* non-fatal */ }
  }

  // Permanent prestige XP boost (+bonus% per prestige level), on top of any
  // equipped XP-boost ability.
  const prestige = (profile.prestige as number) ?? 0;
  const prestigeMult = prestigeXpMultiplier(prestige, config.levelRoadConfig.prestigeXpBonusPercent ?? 5);

  // Economy-synergy layer: level-scaling + weekend/happy-hour time boosts on XP,
  // and the Level-XP → Battle-Pass-XP cross-flow (computed after the grant below).
  const synergyCfg = await getSynergyConfig();
  const playerLevel = (profile.level as number) ?? 1;
  const syn = computeSynergyMultipliers(synergyCfg, playerLevel, new Date());

  const amount = Math.max(1, Math.round(rawAmount * xpMultiplier * prestigeMult * syn.xpMult));

  // Atomic XP increment — prevents lost updates AND double level-reward grants when
  // many `void awardXp(...)` run concurrently. The RPC serialises the increment under
  // the row lock and RETURNs the true new total; we derive THIS call's contiguous
  // [oldXp, newXp] window from it, so every level boundary is owned by exactly one
  // increment. Falls back to read-modify-write only if the RPC is missing.
  let newXp: number;
  const incRes = await admin.rpc("increment_xp", { p_user_id: userId, p_amount: amount });
  if (incRes.error || incRes.data == null) {
    newXp = currentXp + amount;
    await admin.from("profiles").update({ xp: newXp }).eq("id", userId);
  } else {
    newXp = Number(incRes.data);
  }
  const oldXp = Math.max(0, newXp - amount);
  const oldLevel = calculateLevel(oldXp, config.levels);
  const newLevel = calculateLevel(newXp, config.levels);

  // Monotonic level write — the .lt guard means a slower concurrent call can never
  // downgrade the level a faster one already set.
  if (newLevel > oldLevel) {
    await admin.from("profiles").update({ level: newLevel }).eq("id", userId).lt("level", newLevel);
  }

  // Collect rewards for the levels crossed in THIS increment's [oldXp, newXp] window.
  const collectedRewards: LevelReward[] = [];
  if (newLevel > oldLevel) {
    for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
      const def = config.levels.find((l) => l.level === lvl);
      if (def?.rewards?.length) {
        // After prestiging, re-climbing must NOT re-grant CREDIT rewards (that
        // would be an infinite credit farm). Badges/name-styles/abilities are
        // idempotent (already owned) so they stay harmless.
        const rs = prestige > 0 ? def.rewards.filter((r) => r.type !== "credits") : def.rewards;
        collectedRewards.push(...rs);
      }
    }
  }

  // Log XP event
  try {
    await admin.from("xp_events").insert({
      user_id: userId,
      amount,
      source,
      source_detail: sourceDetail ?? null,
    });
  } catch { /* non-fatal */ }

  // Grant level-up rewards
  if (collectedRewards.length > 0) {
    await grantLevelRewards(userId, newLevel, collectedRewards, admin);

    // Notify user about level-up
    try {
      await notifyUser({
        userId,
        type: "level_up",
        title: `🎉 Level ${newLevel} erreicht!`,
        message: `Glückwunsch! Du hast Level ${newLevel} erreicht${collectedRewards.length > 0 ? " und Belohnungen erhalten" : ""}.`,
        link: "/profil",
      });
    } catch { /* non-fatal */ }

    // Debug log level-up event
    void logDebugEvent({
      level: "info",
      scope: "level_system",
      message: `Level-Up: User ${userId} → Level ${newLevel}`,
      context: { userId, oldLevel, newLevel, xpGained: amount, totalXp: newXp, source, rewards: collectedRewards.length },
    });
  }

  // Cross-flow: a configurable share of the Level-XP just earned also fills the
  // player's ACTIVE battle pass — so every XP source on the site feeds the pass.
  if (syn.bpXpFromLevelXpPercent > 0) {
    const bpXp = Math.round((amount * syn.bpXpFromLevelXpPercent) / 100);
    if (bpXp > 0) await addBpXpToActivePass(admin, userId, bpXp);
  }

  return {
    newXp,
    newLevel,
    leveledUp: newLevel > oldLevel,
    levelsGained: newLevel - oldLevel,
    rewards: collectedRewards,
  };
}

async function grantLevelRewards(
  userId: string,
  newLevel: number,
  rewards: LevelReward[],
  admin: ReturnType<typeof createAdminClient>
): Promise<void> {
  for (const reward of rewards) {
    try {
      // Alle Reward-Typen laufen über den zentralen Dispatcher — so unterstützt
      // die Level-Road exakt dieselben Belohnungen wie Battle Pass / Shop / Daily.
      const spec: RewardSpec = {
        type: reward.type,
        amount: reward.amount,
        itemId: reward.itemId,
        itemRarity: reward.itemRarity,
        abilityKey: reward.abilityKey,
        styleKey: reward.nameStyleKey,
        badgeKey: reward.badgeKey,
        voucherMode: reward.voucherMode,
        voucherTierId: reward.voucherTierId,
        voucherRarityFloor: reward.voucherRarityFloor as RewardSpec["voucherRarityFloor"],
        bonusGame: reward.bonusGame,
        durationHours: reward.durationHours,
      };
      await grantReward(admin, userId, spec, "level_reward");
      if (reward.type === "credits" && reward.amount) {
        await admin.from("audit_logs").insert({
          user_id: userId,
          action: "level_reward_credits",
          payload: { level: newLevel, amount: reward.amount },
        });
      }
    } catch { /* never let reward failure break the XP award */ }
  }
}

// ─── User queries ──────────────────────────────────────────────────────────────

export async function getMyLevelInfo(): Promise<UserLevelInfo | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createAdminClient();
    const [{ data: profile }, config] = await Promise.all([
      admin.from("profiles").select("xp, level, equipped_ability_key, prestige").eq("id", user.id).single(),
      getXpConfig(),
    ]);

    if (!profile) return null;

    return buildLevelInfo(
      (profile.xp as number) ?? 0,
      (profile.level as number) ?? 1,
      profile.equipped_ability_key as string | null,
      config.levels,
      (profile.prestige as number) ?? 0
    );
  } catch {
    return null;
  }
}

export async function getUserLevelInfo(userId: string): Promise<UserLevelInfo | null> {
  try {
    const admin = createAdminClient();
    const [{ data: profile }, config] = await Promise.all([
      admin.from("profiles").select("xp, level, equipped_ability_key, prestige").eq("id", userId).single(),
      getXpConfig(),
    ]);

    if (!profile) return null;

    return buildLevelInfo(
      (profile.xp as number) ?? 0,
      (profile.level as number) ?? 1,
      profile.equipped_ability_key as string | null,
      config.levels,
      (profile.prestige as number) ?? 0
    );
  } catch {
    return null;
  }
}

// ─── Prestige ────────────────────────────────────────────────────────────────

/** Prestige: at max level, reset xp/level to 0/1 and bank a prestige rank for a
 *  permanent XP boost. Re-climbing no longer re-grants credit rewards (anti-farm). */
export async function prestigeUser(): Promise<{ success: boolean; error?: string; prestige?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const [{ data: profile }, config] = await Promise.all([
    admin.from("profiles").select("level, prestige").eq("id", user.id).single(),
    getXpConfig(),
  ]);
  if (!profile) return { success: false, error: "Profil nicht gefunden." };
  if (!config.levels.length) return { success: false, error: "Kein Level-System konfiguriert." };

  const maxLevel = Math.max(...config.levels.map((l) => l.level));
  const curLevel = (profile.level as number) ?? 1;
  if (curLevel < maxLevel) {
    return { success: false, error: `Prestige erst ab Max-Level (${maxLevel}).` };
  }

  const newPrestige = ((profile.prestige as number) ?? 0) + 1;
  const { error } = await admin
    .from("profiles")
    .update({ prestige: newPrestige, xp: 0, level: 1 })
    .eq("id", user.id)
    .gte("level", maxLevel); // guard: only if still at max (idempotent vs double-click)

  if (error) return { success: false, error: error.message };

  try {
    await notifyUser({
      userId: user.id,
      type: "level_up",
      title: `⭐ Prestige ${newPrestige}!`,
      message: `Du hast prestiged! Dauerhafter XP-Bonus aktiv. Steige erneut auf.`,
      link: "/account",
    });
  } catch { /* non-fatal */ }

  revalidatePath("/", "layout");
  return { success: true, prestige: newPrestige };
}

export async function getMyXpHistory(limit = 20): Promise<XpEvent[]> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const admin = createAdminClient();
    const { data } = await admin
      .from("xp_events")
      .select("id, user_id, amount, source, source_detail, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    return (data ?? []).map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      amount: r.amount as number,
      source: r.source as string,
      sourceDetail: r.source_detail as string | null,
      createdAt: r.created_at as string,
    }));
  } catch {
    return [];
  }
}

// ─── Admin: XP leaderboard ─────────────────────────────────────────────────────

export async function getXpLeaderboard(limit = 20): Promise<{
  rank: number; userId: string; username: string; xp: number; level: number; nameStyleKey?: string;
}[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, username, xp, level, active_name_style_key")
    .order("xp", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((r, i) => ({
    rank: i + 1,
    userId: r.id as string,
    username: r.username as string,
    xp: (r.xp as number) ?? 0,
    level: (r.level as number) ?? 1,
    nameStyleKey: (r.active_name_style_key as string | null) ?? undefined,
  }));
}

// ─── Admin: grant XP manually ─────────────────────────────────────────────────

export async function adminGrantXp(
  targetUserId: string,
  amount: number,
  reason?: string
): Promise<{ success: boolean; error?: string; result?: AwardXpResult }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const result = await awardXp(targetUserId, amount, "admin_grant", reason);

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "admin_grant_xp",
    payload: { target_user_id: targetUserId, amount, reason, result },
  });

  revalidatePath("/admin");
  return { success: true, result };
}
