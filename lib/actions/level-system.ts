"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { notifyUser } from "@/lib/notifications-internal";
import { logDebugEvent } from "@/lib/debug-log-server";
import {
  calculateLevel, buildLevelInfo,
  DEFAULT_XP_SOURCES,
  type XpConfig, type XpSourceConfig, type LevelDefinition,
  type LevelReward, type AwardXpResult, type UserLevelInfo, type XpEvent,
} from "@/lib/level-system";

// ─── Config ────────────────────────────────────────────────────────────────────

export async function getXpConfig(): Promise<XpConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("xp_config")
      .select("levels, sources, ability_slot_count")
      .eq("id", "default")
      .maybeSingle();

    if (!data) {
      return { levels: [], sources: DEFAULT_XP_SOURCES, abilitySlotCount: 1 };
    }

    const levels = (Array.isArray(data.levels) ? data.levels : []) as LevelDefinition[];
    const sources = ((data.sources as unknown) ?? DEFAULT_XP_SOURCES) as XpSourceConfig;

    return {
      levels,
      sources: { ...DEFAULT_XP_SOURCES, ...sources },
      abilitySlotCount: (data.ability_slot_count as number) ?? 1,
    };
  } catch {
    return { levels: [], sources: DEFAULT_XP_SOURCES, abilitySlotCount: 1 };
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
    admin.from("profiles").select("xp, level, equipped_ability_key").eq("id", userId).single(),
    getXpConfig(),
  ]);

  if (!profile || !config.levels.length) {
    return { newXp: 0, newLevel: 1, leveledUp: false, levelsGained: 0, rewards: [] };
  }

  const currentXp = (profile.xp as number) ?? 0;
  const currentLevel = (profile.level as number) ?? 1;
  const equippedKey = profile.equipped_ability_key as string | null;

  // Check for XP boost ability
  let xpMultiplier = 1.0;
  if (equippedKey) {
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

  const amount = Math.max(1, Math.round(rawAmount * xpMultiplier));
  const newXp = currentXp + amount;
  const newLevel = calculateLevel(newXp, config.levels);

  // Collect all rewards for levels crossed
  const collectedRewards: LevelReward[] = [];
  if (newLevel > currentLevel) {
    for (let lvl = currentLevel + 1; lvl <= newLevel; lvl++) {
      const def = config.levels.find((l) => l.level === lvl);
      if (def?.rewards?.length) {
        collectedRewards.push(...def.rewards);
      }
    }
  }

  // Update XP + level
  await admin.from("profiles").update({ xp: newXp, level: newLevel }).eq("id", userId);

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
      context: { userId, oldLevel: currentLevel, newLevel, xpGained: amount, totalXp: newXp, source, rewards: collectedRewards.length },
    });
  }

  return {
    newXp,
    newLevel,
    leveledUp: newLevel > currentLevel,
    levelsGained: newLevel - currentLevel,
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
      if (reward.type === "credits" && reward.amount) {
        const rpcResult = await admin.rpc("increment_credits", { user_id: userId, amount: reward.amount });
        if (rpcResult.error) {
          // Fallback if RPC doesn't exist
          const { data: p } = await admin.from("profiles").select("credits").eq("id", userId).single();
          if (p) {
            await admin.from("profiles")
              .update({ credits: (p.credits as number) + reward.amount! })
              .eq("id", userId);
          }
        }

        // Log the credit grant
        await admin.from("audit_logs").insert({
          user_id: userId,
          action: "level_reward_credits",
          payload: { level: newLevel, amount: reward.amount },
        });
      } else if (reward.type === "ability" && reward.abilityKey) {
        await admin.from("user_abilities").insert({
          user_id: userId,
          ability_key: reward.abilityKey,
          source: "level_reward",
          source_detail: `Level ${newLevel}`,
        });
      } else if (reward.type === "badge" && reward.badgeKey) {
        await admin.from("user_badges").upsert(
          { user_id: userId, badge_key: reward.badgeKey, awarded_at: new Date().toISOString() },
          { onConflict: "user_id,badge_key", ignoreDuplicates: true }
        );
      } else if (reward.type === "name_style" && reward.nameStyleKey) {
        await admin.from("user_name_styles").upsert(
          { user_id: userId, style_key: reward.nameStyleKey, source: "level_reward" },
          { onConflict: "user_id,style_key", ignoreDuplicates: true }
        );
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
      admin.from("profiles").select("xp, level, equipped_ability_key").eq("id", user.id).single(),
      getXpConfig(),
    ]);

    if (!profile) return null;

    return buildLevelInfo(
      (profile.xp as number) ?? 0,
      (profile.level as number) ?? 1,
      profile.equipped_ability_key as string | null,
      config.levels
    );
  } catch {
    return null;
  }
}

export async function getUserLevelInfo(userId: string): Promise<UserLevelInfo | null> {
  try {
    const admin = createAdminClient();
    const [{ data: profile }, config] = await Promise.all([
      admin.from("profiles").select("xp, level, equipped_ability_key").eq("id", userId).single(),
      getXpConfig(),
    ]);

    if (!profile) return null;

    return buildLevelInfo(
      (profile.xp as number) ?? 0,
      (profile.level as number) ?? 1,
      profile.equipped_ability_key as string | null,
      config.levels
    );
  } catch {
    return null;
  }
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
