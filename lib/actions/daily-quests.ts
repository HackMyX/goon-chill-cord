"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { logDebugEvent, logActivity } from "@/lib/debug-log-server";
import { awardXp } from "@/lib/actions/level-system";
import { incrementBpQuestProgress } from "@/lib/actions/bp-quests";
import {
  DEFAULT_DAILY_QUEST_CONFIG,
  levelScaleFactor,
  type DailyQuestTemplate,
  type DailyQuestConfig,
  type UserDailyQuest,
  type QuestDifficulty,
} from "@/lib/daily-quests";

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt.");
  return { user, supabase };
}

async function requireAdmin_() {
  const { user, supabase } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) throw new Error("Kein Admin-Zugriff.");
  return { user, admin: createAdminClient() };
}

// ── Config ────────────────────────────────────────────────────────────────────

export async function getDailyQuestConfig(): Promise<DailyQuestConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("daily_quest_config").select("*").eq("id", "default").maybeSingle();
    if (!data) return DEFAULT_DAILY_QUEST_CONFIG;
    return {
      enabled:                  (data.enabled as boolean)              ?? true,
      questsPerDay:             (data.quests_per_day as number)        ?? 3,
      refreshHourUtc:           (data.refresh_hour_utc as number)      ?? 0,
      autoGenerate:             (data.auto_generate as boolean)        ?? true,
      manualTemplateKeys:       (data.manual_template_keys as string[]) ?? [],
      levelScaleTargets:        (data.level_scale_targets as boolean)  ?? true,
      levelScaleRewards:        (data.level_scale_rewards as boolean)  ?? true,
      xpRewardMultiplier:       Number(data.xp_reward_multiplier)      ?? 1.0,
      creditsRewardMultiplier:  Number(data.credits_reward_multiplier) ?? 1.0,
      bpXpRewardMultiplier:     Number(data.bp_xp_reward_multiplier)   ?? 1.0,
    };
  } catch { return DEFAULT_DAILY_QUEST_CONFIG; }
}

export async function updateDailyQuestConfig(cfg: DailyQuestConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireAdmin_();
    const admin = createAdminClient();
    const { error } = await admin.from("daily_quest_config").upsert({
      id: "default",
      enabled: cfg.enabled,
      quests_per_day: cfg.questsPerDay,
      refresh_hour_utc: cfg.refreshHourUtc,
      auto_generate: cfg.autoGenerate,
      manual_template_keys: cfg.manualTemplateKeys,
      level_scale_targets: cfg.levelScaleTargets,
      level_scale_rewards: cfg.levelScaleRewards,
      xp_reward_multiplier: cfg.xpRewardMultiplier,
      credits_reward_multiplier: cfg.creditsRewardMultiplier,
      bp_xp_reward_multiplier: cfg.bpXpRewardMultiplier,
      updated_at: new Date().toISOString(),
    });
    if (error) return { success: false, error: error.message };
    void logActivity("admin:daily-quest-config:update", `Quest-Config gespeichert von ${user.id}`, { questsPerDay: cfg.questsPerDay });
    revalidatePath("/");
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// ── Templates (admin CRUD) ────────────────────────────────────────────────────

export async function getDailyQuestTemplates(): Promise<DailyQuestTemplate[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("daily_quest_templates")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map(rowToTemplate);
}

function rowToTemplate(row: Record<string, unknown>): DailyQuestTemplate {
  return {
    key:                 String(row.key),
    label:               String(row.label),
    description:         String(row.description ?? ""),
    targetAction:        String(row.target_action),
    baseTarget:          Number(row.base_target) ?? 1,
    difficulty:          String(row.difficulty ?? "easy") as QuestDifficulty,
    minLevel:            Number(row.min_level) ?? 1,
    maxLevel:            Number(row.max_level) ?? 999,
    rewardType:          String(row.reward_type ?? "credits") as DailyQuestTemplate["rewardType"],
    baseRewardCredits:   Number(row.base_reward_credits) ?? 0,
    baseRewardXp:        Number(row.base_reward_xp) ?? 0,
    baseRewardBpXp:      Number(row.base_reward_bp_xp) ?? 0,
    rewardItemRarity:    (row.reward_item_rarity as string | null) ?? null,
    icon:                String(row.icon ?? "Star"),
    category:            String(row.category ?? "allgemein"),
    enabled:             Boolean(row.enabled ?? true),
    sortOrder:           Number(row.sort_order) ?? 0,
  };
}

export async function adminUpsertQuestTemplate(t: DailyQuestTemplate): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireAdmin_();
    const admin = createAdminClient();
    const { error } = await admin.from("daily_quest_templates").upsert({
      key: t.key, label: t.label, description: t.description,
      target_action: t.targetAction, base_target: t.baseTarget,
      difficulty: t.difficulty, min_level: t.minLevel, max_level: t.maxLevel,
      reward_type: t.rewardType, base_reward_credits: t.baseRewardCredits,
      base_reward_xp: t.baseRewardXp, base_reward_bp_xp: t.baseRewardBpXp,
      reward_item_rarity: t.rewardItemRarity, icon: t.icon,
      category: t.category, enabled: t.enabled, sort_order: t.sortOrder,
    }, { onConflict: "key" });
    if (error) return { success: false, error: error.message };
    void logActivity("admin:daily-quest-template:upsert", `Template "${t.key}" gespeichert von ${user.id}`);
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function adminDeleteQuestTemplate(key: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireAdmin_();
    const admin = createAdminClient();
    const { error } = await admin.from("daily_quest_templates").delete().eq("key", key);
    if (error) return { success: false, error: error.message };
    void logActivity("admin:daily-quest-template:delete", `Template "${key}" gelöscht von ${user.id}`);
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// ── User-facing: Get or generate daily quests ─────────────────────────────────

function todayUtcDate(refreshHourUtc: number): string {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const d = new Date(now);
  if (utcHour < refreshHourUtc) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

export async function getMyDailyQuests(): Promise<UserDailyQuest[]> {
  try {
    const { user } = await requireUser();
    const admin = createAdminClient();
    const cfg = await getDailyQuestConfig();

    if (!cfg.enabled) return [];

    const today = todayUtcDate(cfg.refreshHourUtc);

    // Check if quests already generated for today
    const { data: existing } = await admin
      .from("user_daily_quests")
      .select("*")
      .eq("user_id", user.id)
      .eq("quest_date", today)
      .order("created_at", { ascending: true });

    if (existing && existing.length > 0) return existing.map(rowToUserQuest);

    // Generate quests
    const quests = await generateQuestsForUser(user.id, cfg, today, admin);
    return quests;
  } catch (e) {
    void logDebugEvent({ level: "error", scope: "daily-quests:get", message: String(e) });
    return [];
  }
}

async function generateQuestsForUser(
  userId: string,
  cfg: DailyQuestConfig,
  today: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<UserDailyQuest[]> {
  // Get player's level for scaling
  const { data: profile } = await admin.from("profiles").select("level").eq("id", userId).maybeSingle();
  const level = Number((profile as Record<string, unknown> | null)?.level ?? 1);
  const scale = cfg.levelScaleTargets ? levelScaleFactor(level) : 1.0;
  const rewardScale = cfg.levelScaleRewards ? levelScaleFactor(level) : 1.0;

  let templates: DailyQuestTemplate[] = [];

  if (!cfg.autoGenerate && cfg.manualTemplateKeys.length > 0) {
    // Manual mode: use specified keys
    const { data } = await admin
      .from("daily_quest_templates")
      .select("*")
      .in("key", cfg.manualTemplateKeys)
      .eq("enabled", true);
    templates = (data ?? []).map(rowToTemplate);
  } else {
    // Auto mode: pick by difficulty distribution, filtered by level
    const { data } = await admin
      .from("daily_quest_templates")
      .select("*")
      .eq("enabled", true)
      .lte("min_level", level)
      .gte("max_level", level)
      .order("sort_order", { ascending: true });
    const all = (data ?? []).map(rowToTemplate);

    // Difficulty distribution: 1 easy + 1 medium + 1 hard (or legendary if high level)
    const byDiff = {
      easy: all.filter(t => t.difficulty === "easy"),
      medium: all.filter(t => t.difficulty === "medium"),
      hard: all.filter(t => t.difficulty === "hard"),
      legendary: all.filter(t => t.difficulty === "legendary"),
    };

    const pick = (arr: DailyQuestTemplate[], n: number) => {
      const shuffled = [...arr].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, n);
    };

    const count = Math.max(1, cfg.questsPerDay);
    if (count === 1) {
      templates = pick(byDiff.easy, 1);
    } else if (count === 2) {
      templates = [...pick(byDiff.easy, 1), ...pick(byDiff.medium, 1)].slice(0, 2);
    } else {
      const hardPool = level >= 15 ? [...byDiff.hard, ...byDiff.legendary] : byDiff.hard;
      templates = [
        ...pick(byDiff.easy, 1),
        ...pick(byDiff.medium, Math.max(1, count - 2)),
        ...pick(hardPool, 1),
      ].slice(0, count);
    }

    // Fill remaining slots with easy if not enough
    while (templates.length < count && byDiff.easy.length > 0) {
      const t = pick(byDiff.easy.filter(e => !templates.find(t2 => t2.key === e.key)), 1);
      if (t.length === 0) break;
      templates.push(...t);
    }
  }

  if (templates.length === 0) return [];

  // Build rows
  const rows = templates.map(t => ({
    user_id: userId,
    template_key: t.key,
    quest_date: today,
    label: t.label,
    description: t.description,
    target_action: t.targetAction,
    target_value: Math.max(1, Math.round(t.baseTarget * scale)),
    current_value: 0,
    completed: false,
    difficulty: t.difficulty,
    reward_type: t.rewardType,
    reward_credits: Math.round(t.baseRewardCredits * rewardScale * cfg.creditsRewardMultiplier),
    reward_xp: Math.round(t.baseRewardXp * rewardScale * cfg.xpRewardMultiplier),
    reward_bp_xp: Math.round(t.baseRewardBpXp * rewardScale * cfg.bpXpRewardMultiplier),
    reward_item_rarity: t.rewardItemRarity,
  }));

  const { data: inserted, error } = await admin
    .from("user_daily_quests")
    .insert(rows)
    .select("*");

  if (error || !inserted) {
    void logDebugEvent({ level: "error", scope: "daily-quests:generate", message: error?.message ?? "Insert failed" });
    return [];
  }

  return inserted.map(rowToUserQuest);
}

function rowToUserQuest(row: Record<string, unknown>): UserDailyQuest {
  return {
    id:               String(row.id),
    userId:           String(row.user_id),
    templateKey:      (row.template_key as string | null) ?? null,
    questDate:        String(row.quest_date),
    label:            String(row.label),
    description:      String(row.description ?? ""),
    targetAction:     String(row.target_action),
    targetValue:      Number(row.target_value) ?? 1,
    currentValue:     Number(row.current_value) ?? 0,
    completed:        Boolean(row.completed),
    difficulty:       String(row.difficulty ?? "easy") as UserDailyQuest["difficulty"],
    rewardType:       String(row.reward_type ?? "credits") as UserDailyQuest["rewardType"],
    rewardCredits:    Number(row.reward_credits) ?? 0,
    rewardXp:         Number(row.reward_xp) ?? 0,
    rewardBpXp:       Number(row.reward_bp_xp) ?? 0,
    rewardItemRarity: (row.reward_item_rarity as string | null) ?? null,
    rewardClaimed:    Boolean(row.reward_claimed),
    claimedAt:        (row.claimed_at as string | null) ?? null,
    createdAt:        String(row.created_at),
  };
}

// ── Progress tracking (fire-and-forget) ──────────────────────────────────────

export async function incrementDailyQuestProgress(
  targetAction: string,
  amount: number = 1
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const admin = createAdminClient();
    const cfg = await getDailyQuestConfig();
    if (!cfg.enabled) return;

    const today = todayUtcDate(cfg.refreshHourUtc);

    const { data: quests } = await admin
      .from("user_daily_quests")
      .select("id, target_value, current_value, completed")
      .eq("user_id", user.id)
      .eq("quest_date", today)
      .eq("target_action", targetAction)
      .eq("completed", false);

    if (!quests || quests.length === 0) return;

    for (const quest of quests as Record<string, unknown>[]) {
      const newVal = Math.min(
        Number(quest.current_value) + amount,
        Number(quest.target_value)
      );
      const nowComplete = newVal >= Number(quest.target_value);

      await admin
        .from("user_daily_quests")
        .update({ current_value: newVal, completed: nowComplete })
        .eq("id", String(quest.id));
    }
  } catch { /* fire-and-forget, never throw */ }
}

// ── Claim reward ──────────────────────────────────────────────────────────────

export async function claimDailyQuestReward(
  questId: string
): Promise<{ success: boolean; error?: string; reward?: { credits: number; xp: number; bpXp: number; itemRarity: string | null } }> {
  try {
    const { user } = await requireUser();
    const admin = createAdminClient();

    const { data: quest, error: fetchErr } = await admin
      .from("user_daily_quests")
      .select("*")
      .eq("id", questId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr || !quest) return { success: false, error: "Quest nicht gefunden." };

    const q = quest as Record<string, unknown>;
    if (!q.completed) return { success: false, error: "Quest noch nicht abgeschlossen." };
    if (q.reward_claimed) return { success: false, error: "Belohnung bereits eingelöst." };

    const rewardCredits = Number(q.reward_credits) ?? 0;
    const rewardXp      = Number(q.reward_xp)      ?? 0;
    const rewardBpXp    = Number(q.reward_bp_xp)   ?? 0;
    const rewardItemRarity = (q.reward_item_rarity as string | null) ?? null;

    // Atomic claim: only ONE concurrent request can flip reward_claimed false→true.
    // The .eq("reward_claimed", false) guard + row-count check makes the whole
    // grant idempotent regardless of double-click / double-request timing.
    const { data: claimedRows, error: updateErr } = await admin
      .from("user_daily_quests")
      .update({ reward_claimed: true, claimed_at: new Date().toISOString() })
      .eq("id", questId)
      .eq("reward_claimed", false)
      .select("id");

    if (updateErr) return { success: false, error: "Fehler beim Einlösen." };
    if (!claimedRows || claimedRows.length === 0) {
      return { success: false, error: "Belohnung bereits eingelöst." };
    }

    // Grant credits atomically (relative increment — never read-modify-write).
    if (rewardCredits > 0) {
      await admin.rpc("increment_credits", { user_id: user.id, amount: rewardCredits });
    }

    // Grant XP
    if (rewardXp > 0) {
      void awardXp(user.id, rewardXp, "daily_quest", String(q.label));
    }

    // Grant BP-XP (fire quest progress on active passes)
    if (rewardBpXp > 0) {
      try {
        void incrementBpQuestProgress(user.id, "quest_complete", 1);
      } catch { /* non-fatal */ }
    }

    // Item reward: grant a random item of the specified rarity
    if (rewardItemRarity) {
      try {
        const { data: items } = await admin
          .from("items")
          .select("id")
          .eq("rarity", rewardItemRarity)
          .limit(50);
        if (items && items.length > 0) {
          const item = (items as { id: string }[])[Math.floor(Math.random() * items.length)];
          await admin.from("inventory").insert({ user_id: user.id, item_id: item.id });
        }
      } catch { /* non-fatal */ }
    }

    void logDebugEvent({
      level: "info",
      scope: "daily-quests:claim",
      message: `Quest "${q.label}" beansprucht von ${user.id}`,
      context: { questId, rewardCredits, rewardXp, rewardBpXp, rewardItemRarity },
    });

    revalidatePath("/");
    return { success: true, reward: { credits: rewardCredits, xp: rewardXp, bpXp: rewardBpXp, itemRarity: rewardItemRarity } };
  } catch (e) { return { success: false, error: String(e) }; }
}

// ── Admin stats ───────────────────────────────────────────────────────────────

export interface DailyQuestStats {
  totalUsersWithQuests: number;
  completedToday: number;
  claimedToday: number;
  totalCrDistributed: number;
  totalXpDistributed: number;
  templateCompletionRates: { key: string; label: string; completions: number; total: number }[];
}

export async function adminGetDailyQuestStats(): Promise<DailyQuestStats> {
  try {
    const { admin } = await requireAdmin_();
    const today = new Date().toISOString().split("T")[0];

    const { data: todayQuests } = await admin
      .from("user_daily_quests")
      .select("user_id, completed, reward_claimed, reward_credits, reward_xp, template_key")
      .eq("quest_date", today);

    if (!todayQuests || todayQuests.length === 0) {
      return { totalUsersWithQuests: 0, completedToday: 0, claimedToday: 0, totalCrDistributed: 0, totalXpDistributed: 0, templateCompletionRates: [] };
    }

    const rows = todayQuests as Record<string, unknown>[];
    const userIds = new Set(rows.map(r => String(r.user_id)));
    const completed = rows.filter(r => r.completed);
    const claimed = rows.filter(r => r.reward_claimed);

    const totalCr = claimed.reduce((s, r) => s + Number(r.reward_credits ?? 0), 0);
    const totalXp = claimed.reduce((s, r) => s + Number(r.reward_xp ?? 0), 0);

    // Per-template stats
    const templateMap = new Map<string, { label: string; completions: number; total: number }>();
    const templates = await getDailyQuestTemplates();
    const tMap = new Map(templates.map(t => [t.key, t.label]));

    for (const r of rows) {
      const key = String(r.template_key ?? "_unknown");
      if (!templateMap.has(key)) templateMap.set(key, { label: tMap.get(key) ?? key, completions: 0, total: 0 });
      const entry = templateMap.get(key)!;
      entry.total++;
      if (r.completed) entry.completions++;
    }

    return {
      totalUsersWithQuests: userIds.size,
      completedToday: completed.length,
      claimedToday: claimed.length,
      totalCrDistributed: totalCr,
      totalXpDistributed: totalXp,
      templateCompletionRates: [...templateMap.entries()]
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.total - a.total),
    };
  } catch { return { totalUsersWithQuests: 0, completedToday: 0, claimedToday: 0, totalCrDistributed: 0, totalXpDistributed: 0, templateCompletionRates: [] }; }
}

export async function adminResetUserQuests(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireAdmin_();
    const admin = createAdminClient();
    const today = new Date().toISOString().split("T")[0];
    await admin.from("user_daily_quests").delete().eq("user_id", userId).eq("quest_date", today);
    void logActivity("admin:daily-quests:reset-user", `Quests zurückgesetzt für ${userId} von ${user.id}`);
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function adminResetAllQuests(): Promise<{ success: boolean; error?: string; deleted?: number }> {
  try {
    const { user } = await requireAdmin_();
    const admin = createAdminClient();
    const today = new Date().toISOString().split("T")[0];
    const { data } = await admin.from("user_daily_quests").delete().eq("quest_date", today).select("id");
    const deleted = (data ?? []).length;
    void logActivity("admin:daily-quests:reset-all", `Alle heutigen Quests zurückgesetzt von ${user.id}: ${deleted} gelöscht`);
    return { success: true, deleted };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function adminGetUserQuestOverview(userId: string): Promise<UserDailyQuest[]> {
  try {
    await requireAdmin_();
    const admin = createAdminClient();
    const today = new Date().toISOString().split("T")[0];
    const { data } = await admin
      .from("user_daily_quests")
      .select("*")
      .eq("user_id", userId)
      .eq("quest_date", today);
    return (data ?? []).map(rowToUserQuest);
  } catch { return []; }
}
