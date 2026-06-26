"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { DEFAULT_MINE_CONFIG, DEFAULT_MINE_LEVELS, type MineConfig, type MineLevel } from "@/lib/mine-config";
import { notifyUser } from "@/lib/notifications-internal";
import { getSiteConfig } from "@/lib/actions/site-config";
import { awardXp, getXpConfig } from "@/lib/actions/level-system";

export interface MineProgress {
  userId: string;
  level: number;
  lastCollectedAt: string;
  totalMined: number;
}

export interface MineLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  nameStyleKey?: string;
  level: number;
  totalMined: number;
}

export interface CollectResult {
  success: boolean;
  error?: string;
  earned?: number;
  newCredits?: number;
}

export interface UpgradeResult {
  success: boolean;
  error?: string;
  newLevel?: number;
  newCredits?: number;
}

export async function getMineConfig(): Promise<MineConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mine_config")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return DEFAULT_MINE_CONFIG;

  let levels: MineLevel[] = DEFAULT_MINE_LEVELS;
  if (Array.isArray(data.levels) && data.levels.length > 0) {
    levels = (data.levels as unknown[]).map((l: unknown) => {
      const row = l as Record<string, unknown>;
      return {
        level: Number(row.level) || 1,
        crPerHour: Number(row.crPerHour) || 100,
        maxStorageHours: Number(row.maxStorageHours) || 24,
        upgradeCost: row.upgradeCost !== null && row.upgradeCost !== undefined ? Number(row.upgradeCost) : null,
      };
    });
  }

  return {
    enabled: data.enabled ?? true,
    levels,
    sectionTitle: data.section_title?.trim() || DEFAULT_MINE_CONFIG.sectionTitle,
    sectionSubtitle: data.section_subtitle?.trim() || DEFAULT_MINE_CONFIG.sectionSubtitle,
  };
}

export async function updateMineConfig(
  input: MineConfig
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("mine_config").upsert({
    id: "default",
    enabled: input.enabled,
    levels: input.levels,
    section_title: input.sectionTitle?.trim() || DEFAULT_MINE_CONFIG.sectionTitle,
    section_subtitle: input.sectionSubtitle?.trim() || DEFAULT_MINE_CONFIG.sectionSubtitle,
    updated_at: new Date().toISOString(),
  });

  if (error) return { success: false, error: "Speichern fehlgeschlagen." };
  revalidatePath("/mine");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function getMineProgress(userId: string): Promise<MineProgress | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mine_progress")
    .select("user_id, level, last_collected_at, total_mined")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;
  return {
    userId: data.user_id,
    level: data.level,
    lastCollectedAt: data.last_collected_at,
    totalMined: data.total_mined,
  };
}

/** Ensure a mine_progress row exists for this user (creates L1 if first visit). */
export async function ensureMineProgress(userId: string): Promise<MineProgress> {
  const admin = createAdminClient();
  await admin.from("mine_progress").upsert(
    { user_id: userId, level: 1, last_collected_at: new Date().toISOString(), total_mined: 0 },
    { onConflict: "user_id", ignoreDuplicates: true }
  );
  const progress = await getMineProgress(userId);
  return progress ?? { userId, level: 1, lastCollectedAt: new Date().toISOString(), totalMined: 0 };
}

export async function collectMineCredits(): Promise<CollectResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();
  const [config, { currencyName }, { data: profile }, progress] = await Promise.all([
    getMineConfig(),
    getSiteConfig(),
    supabase.from("profiles").select("credits, equipped_ability_key").eq("id", user.id).single(),
    getMineProgress(user.id),
  ]);

  if (!config.enabled) return { success: false, error: "Die Mine ist derzeit deaktiviert." };
  if (!profile) return { success: false, error: "Profil nicht gefunden." };

  const mineProgress = progress ?? await ensureMineProgress(user.id);
  const levelCfg = config.levels.find((l) => l.level === mineProgress.level) ?? config.levels[0];

  // Apply ability effects: storage bonus
  const equippedKey = (profile as Record<string, unknown>).equipped_ability_key as string | null;
  let storageHoursBonus = 0;
  let crBonusMultiplier = 1.0;
  let doubleChance = 0.0;
  let upgradeDiscountRate = 0.0;

  if (equippedKey) {
    try {
      const { data: abilityDef } = await admin
        .from("ability_definitions")
        .select("effect_type, effect_value, effect_config")
        .eq("key", equippedKey)
        .eq("enabled", true)
        .single();

      if (abilityDef) {
        const et = abilityDef.effect_type as string;
        const ev = Number(abilityDef.effect_value) ?? 0;
        const ec = (abilityDef.effect_config ?? {}) as Record<string, number>;

        if (et === "mine_cr_bonus") {
          crBonusMultiplier = 1 + ev;
          if (ec.storage_bonus) storageHoursBonus = levelCfg.maxStorageHours * ec.storage_bonus;
          if (ec.double_chance) doubleChance = ec.double_chance;
          if (ec.upgrade_discount) upgradeDiscountRate = ec.upgrade_discount;
        } else if (et === "mine_double_chance") {
          doubleChance = ev;
        } else if (et === "mine_storage_hours") {
          storageHoursBonus = ev;
        } else if (et === "mine_upgrade_discount") {
          upgradeDiscountRate = ev;
        }
      }
    } catch { /* non-fatal */ }
  }

  const effectiveMaxStorageHours = levelCfg.maxStorageHours + storageHoursBonus;
  const elapsedMs = Date.now() - new Date(mineProgress.lastCollectedAt).getTime();
  const elapsedHours = elapsedMs / 3600000;
  const maxStorage = levelCfg.crPerHour * effectiveMaxStorageHours;
  const rawEarned = levelCfg.crPerHour * elapsedHours;
  let earned = Math.floor(Math.min(rawEarned, maxStorage) * crBonusMultiplier);

  // Double chance roll
  if (doubleChance > 0 && Math.random() < doubleChance) {
    earned *= 2;
  }

  if (earned <= 0) return { success: false, error: "Noch nichts zu schürfen — warte ein bisschen!" };

  const now = new Date().toISOString();
  const newCredits = (profile.credits as number) + earned;

  const [{ error: creditErr }] = await Promise.all([
    supabase.from("profiles").update({ credits: newCredits }).eq("id", user.id),
    admin.from("mine_progress").update({
      last_collected_at: now,
      total_mined: mineProgress.totalMined + earned,
      updated_at: now,
    }).eq("user_id", user.id),
  ]);

  if (creditErr) return { success: false, error: "Credits konnten nicht vergeben werden." };

  // Award XP (non-fatal)
  try {
    const xpCfg = await getXpConfig();
    const xpPerCr = xpCfg.sources.mine_collect_per_100cr ?? 1;
    const xpAmount = Math.max(1, Math.round((earned / 100) * xpPerCr));
    void awardXp(user.id, xpAmount, "mine_collect", `Level ${mineProgress.level}, ${earned} CR`);
  } catch { /* non-fatal */ }

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "mine_collect",
      payload: { level: mineProgress.level, earned, elapsed_hours: elapsedHours.toFixed(2), ability: equippedKey ?? null },
    });
  } catch { /* non-fatal */ }

  try {
    const { incrementBpQuestProgress } = await import("@/lib/actions/bp-quests");
    void incrementBpQuestProgress(user.id, "mine_collect", 1);
    void incrementBpQuestProgress(user.id, "credits_collected", earned);
  } catch { /* non-fatal */ }

  try {
    const { incrementDailyQuestProgress } = await import("@/lib/actions/daily-quests");
    void incrementDailyQuestProgress("mine_collect", 1);
    void incrementDailyQuestProgress("credits_collected", earned);
  } catch { /* non-fatal */ }

  if (earned >= 1000) {
    await notifyUser({
      userId: user.id,
      type: "mine_collect",
      title: "Mine geleert!",
      message: `Du hast ${earned.toLocaleString("de-DE")} ${currencyName} aus deiner Mine Level ${mineProgress.level} abgebaut.`,
      link: "/mine",
    });
  }

  revalidatePath("/mine");
  return { success: true, earned, newCredits };
}

export async function upgradeMine(): Promise<UpgradeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();
  const [config, { currencyName }, { data: profile }, progress] = await Promise.all([
    getMineConfig(),
    getSiteConfig(),
    supabase.from("profiles").select("credits, equipped_ability_key").eq("id", user.id).single(),
    getMineProgress(user.id),
  ]);

  if (!config.enabled) return { success: false, error: "Die Mine ist derzeit deaktiviert." };
  if (!profile) return { success: false, error: "Profil nicht gefunden." };

  const mineProgress = progress ?? await ensureMineProgress(user.id);
  const currentLevelCfg = config.levels.find((l) => l.level === mineProgress.level);

  if (!currentLevelCfg) return { success: false, error: "Level nicht gefunden." };
  if (currentLevelCfg.upgradeCost === null) return { success: false, error: "Maximales Level bereits erreicht!" };

  // Apply upgrade discount ability
  let cost = currentLevelCfg.upgradeCost;
  const equippedKeyUpgrade = ((profile as Record<string, unknown>).equipped_ability_key) as string | null;
  if (equippedKeyUpgrade) {
    try {
      const { data: abilityDefUpgrade } = await admin
        .from("ability_definitions")
        .select("effect_type, effect_value, effect_config")
        .eq("key", equippedKeyUpgrade)
        .eq("enabled", true)
        .single();
      if (abilityDefUpgrade) {
        const ec = (abilityDefUpgrade.effect_config ?? {}) as Record<string, number>;
        if (abilityDefUpgrade.effect_type === "mine_upgrade_discount") {
          cost = Math.floor(cost * (1 - Number(abilityDefUpgrade.effect_value)));
        } else if (abilityDefUpgrade.effect_type === "mine_cr_bonus" && ec.upgrade_discount) {
          cost = Math.floor(cost * (1 - ec.upgrade_discount));
        }
      }
    } catch { /* non-fatal */ }
  }

  if ((profile.credits as number) < cost) {
    return { success: false, error: `Nicht genug ${currencyName}. Du brauchst ${cost.toLocaleString("de-DE")} CR.` };
  }

  const newLevel = mineProgress.level + 1;
  const newCredits = (profile.credits as number) - cost;
  const now = new Date().toISOString();

  const [{ error: creditErr }] = await Promise.all([
    supabase.from("profiles").update({ credits: newCredits }).eq("id", user.id),
    admin.from("mine_progress").update({ level: newLevel, updated_at: now }).eq("user_id", user.id),
  ]);

  if (creditErr) return { success: false, error: "Upgrade fehlgeschlagen." };

  // Award XP for upgrading
  try {
    const xpCfg = await getXpConfig();
    const baseXp = xpCfg.sources.mine_collect_per_100cr ?? 1;
    const upgradeXp = Math.max(20, Math.round((cost / 100) * baseXp * 0.5));
    void awardXp(user.id, upgradeXp, "mine_upgrade", `Mine Level ${mineProgress.level} → ${newLevel}`);
  } catch { /* non-fatal */ }

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "mine_upgrade",
      payload: { old_level: mineProgress.level, new_level: newLevel, cost },
    });
  } catch { /* non-fatal */ }

  await notifyUser({
    userId: user.id,
    type: "mine_upgrade",
    title: `Mine auf Level ${newLevel} upgegraded!`,
    message: `Du hast ${cost.toLocaleString("de-DE")} ${currencyName} bezahlt. Neue Rate: ${config.levels.find((l) => l.level === newLevel)?.crPerHour ?? "?"} CR/h.`,
    link: "/mine",
  });

  revalidatePath("/mine");
  return { success: true, newLevel, newCredits };
}

export async function getMineLeaderboard(limit = 20): Promise<MineLeaderboardEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mine_progress")
    .select("user_id, level, total_mined, profiles(username, active_name_style_key)")
    .order("total_mined", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as {
    user_id: string;
    level: number;
    total_mined: number;
    profiles: { username: string; active_name_style_key: string | null } | null;
  }[]).map((row, i) => ({
    rank: i + 1,
    userId: row.user_id,
    username: row.profiles?.username ?? "Unbekannt",
    nameStyleKey: row.profiles?.active_name_style_key ?? undefined,
    level: row.level,
    totalMined: row.total_mined,
  }));
}

export async function getWorldLeaderboard(limit = 20): Promise<{ rank: number; userId: string; username: string; nameStyleKey?: string; credits: number }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, username, credits, active_name_style_key")
    .order("credits", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((row, i) => ({
    rank: i + 1,
    userId: row.id,
    username: row.username,
    nameStyleKey: (row.active_name_style_key as string | null) ?? undefined,
    credits: row.credits,
  }));
}
