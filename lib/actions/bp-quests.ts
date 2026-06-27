"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isModerator } from "@/lib/admin";
import { logDebugEvent } from "@/lib/debug-log-server";
import type {
  BpQuest, BpQuestDefinition, BpQuestWithProgress, UserBpQuestProgress,
  QuestDifficulty, QuestFrequency, QuestType,
} from "@/lib/battle-pass";

// ── helpers ──────────────────────────────────────────────────────────────────

function rowToDefinition(r: Record<string, unknown>): BpQuestDefinition {
  return {
    id: r.id as string,
    key: r.key as string,
    label: r.label as string,
    description: (r.description as string | null) ?? null,
    questType: (r.quest_type as QuestType) ?? "count",
    targetAction: r.target_action as string,
    defaultTarget: (r.default_target as number) ?? 10,
    defaultBpXpReward: (r.default_bp_xp_reward as number) ?? 250,
    difficulty: (r.difficulty as QuestDifficulty) ?? "medium",
    frequency: (r.frequency as QuestFrequency) ?? "weekly",
    icon: (r.icon as string) ?? "🎯",
    enabled: (r.enabled as boolean) ?? true,
  };
}

function rowToQuest(r: Record<string, unknown>): BpQuest {
  return {
    id: r.id as string,
    passId: r.pass_id as string,
    definitionId: (r.definition_id as string | null) ?? null,
    label: r.label as string,
    description: (r.description as string | null) ?? null,
    questType: (r.quest_type as QuestType) ?? "count",
    targetAction: r.target_action as string,
    targetValue: (r.target_value as number) ?? 10,
    bpXpReward: (r.bp_xp_reward as number) ?? 250,
    difficulty: (r.difficulty as QuestDifficulty) ?? "medium",
    frequency: (r.frequency as QuestFrequency) ?? "weekly",
    icon: (r.icon as string) ?? "🎯",
    sortOrder: (r.sort_order as number) ?? 0,
    enabled: (r.enabled as boolean) ?? true,
  };
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) throw new Error("Kein Admin");
  return user;
}

// ── Public / User-facing ─────────────────────────────────────────────────────

export async function getBpQuestsWithProgress(passId: string): Promise<BpQuestWithProgress[]> {
  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: questRows } = await admin
    .from("bp_quests")
    .select("*")
    .eq("pass_id", passId)
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  if (!questRows || questRows.length === 0) return [];

  const quests = questRows.map((r) => rowToQuest(r as Record<string, unknown>));

  if (!user) return quests.map((q) => ({ ...q, progress: null }));

  const questIds = quests.map((q) => q.id);
  const { data: progressRows } = await admin
    .from("user_bp_quest_progress")
    .select("quest_id, current_value, completed, bp_xp_awarded, completed_at")
    .eq("user_id", user.id)
    .in("quest_id", questIds);

  const progressMap = new Map<string, UserBpQuestProgress>();
  for (const p of (progressRows ?? [])) {
    progressMap.set(p.quest_id as string, {
      questId: p.quest_id as string,
      currentValue: (p.current_value as number) ?? 0,
      completed: (p.completed as boolean) ?? false,
      bpXpAwarded: (p.bp_xp_awarded as boolean) ?? false,
      completedAt: (p.completed_at as string | null) ?? null,
    });
  }

  return quests.map((q) => ({ ...q, progress: progressMap.get(q.id) ?? null }));
}

/**
 * Called from game actions (mine, monster kill, pvp, etc.) to track BP quest
 * progress for all active passes. Fire-and-forget — wrap in void.
 */
export async function incrementBpQuestProgress(
  userId: string,
  targetAction: string,
  amount: number = 1,
): Promise<void> {
  try {
    const admin = createAdminClient();

    // Get all active passes
    const { data: passes } = await admin
      .from("battle_passes")
      .select("id")
      .eq("is_active", true)
      .eq("enabled", true);

    if (!passes || passes.length === 0) return;

    const passIds = passes.map((p) => p.id as string);

    // Find matching quests across all active passes
    const { data: quests } = await admin
      .from("bp_quests")
      .select("id, pass_id, quest_type, target_value, bp_xp_reward")
      .in("pass_id", passIds)
      .eq("target_action", targetAction)
      .eq("enabled", true);

    if (!quests || quests.length === 0) return;

    for (const quest of quests) {
      const questId = quest.id as string;
      const passId = quest.pass_id as string;
      const targetValue = quest.target_value as number;
      const bpXpReward = quest.bp_xp_reward as number;

      // Upsert progress
      const { data: existing } = await admin
        .from("user_bp_quest_progress")
        .select("id, current_value, completed, bp_xp_awarded")
        .eq("user_id", userId)
        .eq("quest_id", questId)
        .maybeSingle();

      if (existing?.completed) continue;

      const newValue = ((existing?.current_value as number) ?? 0) + amount;
      const nowCompleted = newValue >= targetValue;

      if (existing) {
        await admin
          .from("user_bp_quest_progress")
          .update({
            current_value: newValue,
            completed: nowCompleted,
            completed_at: nowCompleted ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id as string);
      } else {
        await admin
          .from("user_bp_quest_progress")
          .insert({
            user_id: userId,
            quest_id: questId,
            pass_id: passId,
            current_value: newValue,
            completed: nowCompleted,
            completed_at: nowCompleted ? new Date().toISOString() : null,
          });
      }

      // Award BP XP if newly completed
      if (nowCompleted && !(existing?.bp_xp_awarded)) {
        await admin
          .from("user_bp_quest_progress")
          .update({ bp_xp_awarded: true })
          .eq("user_id", userId)
          .eq("quest_id", questId);

        // Increment BP XP: read current value, then write updated total
        const { data: ubpRow } = await admin
          .from("user_battle_passes")
          .select("bp_xp")
          .eq("user_id", userId)
          .eq("pass_id", passId)
          .maybeSingle();

        const currentXp = (ubpRow?.bp_xp as number | null) ?? 0;

        // CRITICAL: never voll-upserten — das würde has_premium/has_elite/progress_days
        // eines bestehenden (ggf. bezahlten) Pass-Rows auf die Defaults zurücksetzen.
        // Nur bp_xp anfassen; existierenden Row updaten, sonst frisch anlegen.
        if (ubpRow) {
          await admin
            .from("user_battle_passes")
            .update({ bp_xp: currentXp + bpXpReward })
            .eq("user_id", userId)
            .eq("pass_id", passId);
        } else {
          await admin
            .from("user_battle_passes")
            .insert({
              user_id: userId,
              pass_id: passId,
              bp_xp: bpXpReward,
              progress_days: 0,
              has_premium: false,
              has_elite: false,
            });
        }
      }
    }
  } catch (e) {
    logDebugEvent({ level: "error", scope: "bp-quests", message: `incrementBpQuestProgress error: ${e}`, context: { targetAction } });
  }
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function getBpQuestDefinitions(): Promise<BpQuestDefinition[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bp_quest_definitions")
    .select("*")
    .order("difficulty")
    .order("label");
  return (data ?? []).map((r) => rowToDefinition(r as Record<string, unknown>));
}

export async function adminGetBpQuests(passId: string): Promise<BpQuest[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("bp_quests")
    .select("*")
    .eq("pass_id", passId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => rowToQuest(r as Record<string, unknown>));
}

export async function adminCreateBpQuestDefinition(input: {
  key: string;
  label: string;
  description?: string;
  questType: QuestType;
  targetAction: string;
  defaultTarget: number;
  defaultBpXpReward: number;
  difficulty: QuestDifficulty;
  frequency: QuestFrequency;
  icon: string;
}): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("bp_quest_definitions").insert({
    key: input.key,
    label: input.label,
    description: input.description ?? null,
    quest_type: input.questType,
    target_action: input.targetAction,
    default_target: input.defaultTarget,
    default_bp_xp_reward: input.defaultBpXpReward,
    difficulty: input.difficulty,
    frequency: input.frequency,
    icon: input.icon,
    enabled: true,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin");
  return { success: true };
}

export async function adminUpdateBpQuestDefinition(
  id: string,
  input: Partial<{
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
  }>
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.description !== undefined) patch.description = input.description;
  if (input.questType !== undefined) patch.quest_type = input.questType;
  if (input.targetAction !== undefined) patch.target_action = input.targetAction;
  if (input.defaultTarget !== undefined) patch.default_target = input.defaultTarget;
  if (input.defaultBpXpReward !== undefined) patch.default_bp_xp_reward = input.defaultBpXpReward;
  if (input.difficulty !== undefined) patch.difficulty = input.difficulty;
  if (input.frequency !== undefined) patch.frequency = input.frequency;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  patch.updated_at = new Date().toISOString();

  const { error } = await admin.from("bp_quest_definitions").update(patch).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin");
  return { success: true };
}

export async function adminDeleteBpQuestDefinition(id: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("bp_quest_definitions").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin");
  return { success: true };
}

export async function adminAssignQuestToPass(
  passId: string,
  input: {
    definitionId?: string | null;
    label: string;
    description?: string | null;
    questType: QuestType;
    targetAction: string;
    targetValue: number;
    bpXpReward: number;
    difficulty: QuestDifficulty;
    frequency: QuestFrequency;
    icon: string;
    sortOrder?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  const { count } = await admin
    .from("bp_quests")
    .select("*", { count: "exact", head: true })
    .eq("pass_id", passId);

  const { error } = await admin.from("bp_quests").insert({
    pass_id: passId,
    definition_id: input.definitionId ?? null,
    label: input.label,
    description: input.description ?? null,
    quest_type: input.questType,
    target_action: input.targetAction,
    target_value: input.targetValue,
    bp_xp_reward: input.bpXpReward,
    difficulty: input.difficulty,
    frequency: input.frequency,
    icon: input.icon,
    sort_order: input.sortOrder ?? (count ?? 0),
    enabled: true,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin");
  return { success: true };
}

export async function adminUpdateBpQuest(
  questId: string,
  input: Partial<{
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
  }>
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.description !== undefined) patch.description = input.description;
  if (input.questType !== undefined) patch.quest_type = input.questType;
  if (input.targetAction !== undefined) patch.target_action = input.targetAction;
  if (input.targetValue !== undefined) patch.target_value = input.targetValue;
  if (input.bpXpReward !== undefined) patch.bp_xp_reward = input.bpXpReward;
  if (input.difficulty !== undefined) patch.difficulty = input.difficulty;
  if (input.frequency !== undefined) patch.frequency = input.frequency;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  patch.updated_at = new Date().toISOString();

  const { error } = await admin.from("bp_quests").update(patch).eq("id", questId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin");
  return { success: true };
}

export async function adminDeleteBpQuest(questId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("bp_quests").delete().eq("id", questId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin");
  return { success: true };
}

export async function adminAutoGenerateQuests(
  passId: string,
  config: {
    dailyCount: number;
    weeklyCount: number;
    seasonalCount: number;
    preferActions: string[];
    xpMultiplier: number;
  }
): Promise<{ success: boolean; generated: number; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: definitions } = await admin
    .from("bp_quest_definitions")
    .select("*")
    .eq("enabled", true)
    .order("difficulty");

  if (!definitions || definitions.length === 0) {
    return { success: false, generated: 0, error: "Keine Quest-Vorlagen gefunden" };
  }

  // Delete existing quests for this pass
  await admin.from("bp_quests").delete().eq("pass_id", passId);

  const defs = definitions.map((r) => rowToDefinition(r as Record<string, unknown>));
  const selected: BpQuestDefinition[] = [];

  function pickByFrequency(freq: QuestFrequency, count: number) {
    const pool = defs.filter((d) => d.frequency === freq && !selected.find((s) => s.key === d.key));
    // Prefer preferred actions, then fill rest
    const preferred = pool.filter((d) => config.preferActions.includes(d.targetAction));
    const rest = pool.filter((d) => !config.preferActions.includes(d.targetAction));
    const combined = [...preferred, ...rest];
    selected.push(...combined.slice(0, count));
  }

  pickByFrequency("daily", config.dailyCount);
  pickByFrequency("weekly", config.weeklyCount);
  pickByFrequency("seasonal", config.seasonalCount);

  const toInsert = selected.map((def, i) => ({
    pass_id: passId,
    definition_id: def.id,
    label: def.label,
    description: def.description,
    quest_type: def.questType,
    target_action: def.targetAction,
    target_value: def.defaultTarget,
    bp_xp_reward: Math.round(def.defaultBpXpReward * config.xpMultiplier),
    difficulty: def.difficulty,
    frequency: def.frequency,
    icon: def.icon,
    sort_order: i,
    enabled: true,
  }));

  const { error } = await admin.from("bp_quests").insert(toInsert);
  if (error) return { success: false, generated: 0, error: error.message };

  revalidatePath("/admin");
  return { success: true, generated: toInsert.length };
}

export async function adminResetQuestProgress(passId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_bp_quest_progress")
    .delete()
    .eq("pass_id", passId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function adminGetQuestStats(passId: string): Promise<{
  totalQuests: number;
  totalCompletions: number;
  totalXpAwarded: number;
  completionsByQuest: Array<{ questId: string; label: string; completions: number }>;
}> {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: quests }, { data: progress }] = await Promise.all([
    admin.from("bp_quests").select("id, label").eq("pass_id", passId),
    admin.from("user_bp_quest_progress").select("quest_id, completed, bp_xp_awarded, current_value").eq("pass_id", passId),
  ]);

  const totalCompletions = (progress ?? []).filter((p) => p.completed).length;
  const totalXpAwarded = (progress ?? []).filter((p) => p.bp_xp_awarded).length;

  const completionsByQuest = (quests ?? []).map((q) => ({
    questId: q.id as string,
    label: q.label as string,
    completions: (progress ?? []).filter((p) => p.quest_id === q.id && p.completed).length,
  }));

  return {
    totalQuests: (quests ?? []).length,
    totalCompletions,
    totalXpAwarded,
    completionsByQuest,
  };
}
