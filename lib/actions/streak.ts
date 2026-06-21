"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import {
  computeStreakReward,
  decideStreak,
  dateKey,
  DEFAULT_STREAK_CONFIG,
  type StreakConfig,
} from "@/lib/streak";

interface StreakConfigRow {
  enabled: boolean;
  base_reward: number;
  daily_increment: number;
  max_reward: number;
  grace_period_hours: number;
  milestone_interval: number;
  milestone_bonus: number;
  reset_on_miss: boolean;
}

function rowToConfig(row: StreakConfigRow): StreakConfig {
  return {
    enabled: row.enabled,
    baseReward: row.base_reward,
    dailyIncrement: row.daily_increment,
    maxReward: row.max_reward,
    gracePeriodHours: row.grace_period_hours,
    milestoneInterval: row.milestone_interval,
    milestoneBonus: row.milestone_bonus,
    resetOnMiss: row.reset_on_miss,
  };
}

/** Falls back to the code defaults whenever the table doesn't exist yet
 * or is empty — same defensive pattern as lib/cases-config.ts, since the
 * daily-claim flow must never hard-fail just because a migration hasn't
 * run. */
export async function getStreakConfig(): Promise<StreakConfig> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("streak_config")
    .select(
      "enabled, base_reward, daily_increment, max_reward, grace_period_hours, milestone_interval, milestone_bonus, reset_on_miss"
    )
    .eq("id", "default")
    .single();

  if (error || !data) return DEFAULT_STREAK_CONFIG;
  return rowToConfig(data as StreakConfigRow);
}

export interface ClaimStatus {
  canClaim: boolean;
  enabled: boolean;
  streakDays: number;
  previewReward: number;
  previewIsMilestone: boolean;
}

/** Read-only check the UI polls to decide whether to show an active
 * "Claim" button — never mutates anything, safe to call as often as the
 * client wants (e.g. on every TopBar mount). */
export async function getClaimStatus(): Promise<ClaimStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { canClaim: false, enabled: true, streakDays: 0, previewReward: 0, previewIsMilestone: false };
  }

  const [{ data: profile }, config] = await Promise.all([
    supabase.from("profiles").select("streak_days, last_claim_date").eq("id", user.id).single(),
    getStreakConfig(),
  ]);

  const streakDays = profile?.streak_days ?? 0;
  const lastClaimDate = profile?.last_claim_date ?? null;
  const today = dateKey(new Date());
  const canClaim = config.enabled && lastClaimDate !== today;

  const decision = canClaim
    ? decideStreak(lastClaimDate, streakDays, new Date(), config)
    : { continues: true, newStreak: streakDays };
  const preview = computeStreakReward(decision.newStreak, config);

  return {
    canClaim,
    enabled: config.enabled,
    streakDays,
    previewReward: preview.totalCredits,
    previewIsMilestone: preview.isMilestone,
  };
}

export interface ClaimResult {
  success: boolean;
  error?: string;
  reward?: number;
  newStreak?: number;
  isMilestone?: boolean;
  newCredits?: number;
}

export async function claimDailyReward(): Promise<ClaimResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const config = await getStreakConfig();
  if (!config.enabled) {
    return { success: false, error: "Der Daily-Reward ist aktuell deaktiviert." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("credits, streak_days, last_claim_date")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, error: "Profil konnte nicht geladen werden." };
  }

  const now = new Date();
  const today = dateKey(now);

  if (profile.last_claim_date === today) {
    return { success: false, error: "Du hast deinen Reward heute schon abgeholt." };
  }

  const decision = decideStreak(profile.last_claim_date, profile.streak_days ?? 0, now, config);
  const result = computeStreakReward(decision.newStreak, config);
  const newCredits = profile.credits + result.totalCredits;

  const { data: updatedRows, error: updateError } = await supabase
    .from("profiles")
    .update({
      credits: newCredits,
      streak_days: decision.newStreak,
      last_claim_date: today,
    })
    .eq("id", user.id)
    .eq("last_claim_date", profile.last_claim_date as string | null ?? null)
    .select("credits");

  // The `.eq("last_claim_date", ...)` guard means a double-click (two
  // claims firing before the first one's response lands) can't both
  // succeed — the second write affects zero rows instead of double-
  // crediting the reward.
  if (updateError || !updatedRows || updatedRows.length === 0) {
    return { success: false, error: "Reward konnte nicht abgeholt werden — bitte erneut versuchen." };
  }

  try {
    await createAdminClient().from("audit_logs").insert({
      user_id: user.id,
      action: "streak_claim",
      payload: {
        newStreak: decision.newStreak,
        reward: result.reward,
        milestoneBonus: result.milestoneBonus,
        totalCredits: result.totalCredits,
        newCredits: updatedRows[0].credits,
      },
    });
  } catch {
    // audit_logs is best-effort, never blocks the claim itself.
  }

  revalidatePath("/");
  revalidatePath("/account");

  return {
    success: true,
    reward: result.totalCredits,
    newStreak: decision.newStreak,
    isMilestone: result.isMilestone,
    newCredits: updatedRows[0].credits,
  };
}

export async function updateStreakConfig(input: {
  enabled: boolean;
  baseReward: number;
  dailyIncrement: number;
  maxReward: number;
  gracePeriodHours: number;
  milestoneInterval: number;
  milestoneBonus: number;
  resetOnMiss: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", user.id)
    .single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
      return { success: false, error: `Ungültiger Wert für ${key}.` };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("streak_config")
    .upsert({
      id: "default",
      enabled: input.enabled,
      base_reward: Math.floor(input.baseReward),
      daily_increment: Math.floor(input.dailyIncrement),
      max_reward: Math.floor(input.maxReward),
      grace_period_hours: Math.floor(input.gracePeriodHours),
      milestone_interval: Math.floor(input.milestoneInterval),
      milestone_bonus: Math.floor(input.milestoneBonus),
      reset_on_miss: input.resetOnMiss,
      updated_at: new Date().toISOString(),
    });

  if (error) return { success: false, error: "Speichern fehlgeschlagen." };

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "admin_streak_config_update",
      payload: input,
    });
  } catch {
    // best-effort
  }

  revalidatePath("/admin");
  return { success: true };
}
