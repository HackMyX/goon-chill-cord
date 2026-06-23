"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { notifyUser } from "@/lib/notifications-internal";
import { getSiteConfig } from "@/lib/actions/site-config";
import {
  computeStreakReward,
  decideStreak,
  dateKey,
  normalizeDateKey,
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
  weekend_multiplier: number | null;
  special_event_enabled: boolean | null;
  special_event_multiplier: number | null;
  special_event_label: string | null;
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
    weekendMultiplier: row.weekend_multiplier ?? DEFAULT_STREAK_CONFIG.weekendMultiplier,
    specialEventEnabled: row.special_event_enabled ?? false,
    specialEventMultiplier: row.special_event_multiplier ?? DEFAULT_STREAK_CONFIG.specialEventMultiplier,
    specialEventLabel: row.special_event_label ?? DEFAULT_STREAK_CONFIG.specialEventLabel,
  };
}

/** Falls back to the code defaults whenever the table doesn't exist yet
 * or is empty — same defensive pattern as lib/cases-config.ts, since the
 * daily-claim flow must never hard-fail just because a migration hasn't
 * run. Uses the service-role client, not the regular one: `streak_config`
 * has RLS enabled with no policies (true of every brand-new table in this
 * project — see lib/actions/trading.ts for the same issue, confirmed live
 * with a 42501 error on `trades`), so the regular client silently got
 * zero rows back on *every* read and this always fell through to
 * defaults — meaning admin-saved settings never actually applied to a
 * real claim, even though the admin panel looked like it saved fine. */
export async function getStreakConfig(): Promise<StreakConfig> {
  const admin = createAdminClient();
  const baseColumns =
    "enabled, base_reward, daily_increment, max_reward, grace_period_hours, milestone_interval, milestone_bonus, reset_on_miss";

  // `weekend_multiplier` may not exist yet — try with it first, and if
  // that specific column is the problem, fall back to the columns that
  // were always there instead of losing every other admin-saved setting
  // just because one newer column isn't migrated yet.
  let { data, error } = await admin
    .from("streak_config")
    .select(`${baseColumns}, weekend_multiplier, special_event_enabled, special_event_multiplier, special_event_label`)
    .eq("id", "default")
    .single();
  if (error) {
    const withWeekend = await admin.from("streak_config").select(`${baseColumns}, weekend_multiplier`).eq("id", "default").single();
    if (!withWeekend.error) {
      data = withWeekend.data ? { ...withWeekend.data, special_event_enabled: null, special_event_multiplier: null, special_event_label: null } : null;
      error = withWeekend.error;
    } else {
      const retry = await admin.from("streak_config").select(baseColumns).eq("id", "default").single();
      data = retry.data ? { ...retry.data, weekend_multiplier: null, special_event_enabled: null, special_event_multiplier: null, special_event_label: null } : null;
      error = retry.error;
    }
  }

  if (error || !data) return DEFAULT_STREAK_CONFIG;
  return rowToConfig(data as StreakConfigRow);
}

export interface ClaimStatus {
  canClaim: boolean;
  enabled: boolean;
  streakDays: number;
  bestStreakDays: number;
  previewReward: number;
  previewIsMilestone: boolean;
  previewIsWeekend: boolean;
  config: StreakConfig;
}

/** Read-only check the UI polls to decide whether to show an active
 * "Claim" button — never mutates anything, safe to call as often as the
 * client wants (e.g. on every TopBar mount). Also feeds the player-facing
 * info popover (LiveClock's "i" button), which is why it returns the full
 * config + best streak, not just the bare minimum the claim button needs. */
export async function getClaimStatus(): Promise<ClaimStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const config = await getStreakConfig();

  if (!user) {
    return {
      canClaim: false,
      enabled: config.enabled,
      streakDays: 0,
      bestStreakDays: 0,
      previewReward: 0,
      previewIsMilestone: false,
      previewIsWeekend: false,
      config,
    };
  }

  // Same fallback as claimDailyReward() — `best_streak_days` may not
  // exist yet if that migration hasn't run; degrade instead of breaking
  // the entire claim-status check (which would otherwise make every
  // claim look "never done" since the whole select() errors as one unit).
  let profile = await supabase
    .from("profiles")
    .select("streak_days, best_streak_days, last_claim_date")
    .eq("id", user.id)
    .single()
    .then((r) => r.data);
  if (!profile) {
    const fallback = await supabase
      .from("profiles")
      .select("streak_days, last_claim_date")
      .eq("id", user.id)
      .single();
    profile = fallback.data ? { ...fallback.data, best_streak_days: 0 } : null;
  }

  const streakDays = profile?.streak_days ?? 0;
  // `last_claim_date` comes back as a full timestamptz string
  // ("2026-06-21T00:00:00+00:00"), not the bare "YYYY-MM-DD" `today` is —
  // normalize before any comparison, see normalizeDateKey() for why.
  const lastClaimDate = normalizeDateKey(profile?.last_claim_date ?? null);
  const now = new Date();
  const today = dateKey(now);
  const canClaim = config.enabled && lastClaimDate !== today;

  const decision = canClaim
    ? decideStreak(lastClaimDate, streakDays, now, config)
    : { continues: true, newStreak: streakDays };
  const preview = computeStreakReward(decision.newStreak, config, now);

  return {
    canClaim,
    enabled: config.enabled,
    streakDays,
    bestStreakDays: profile?.best_streak_days ?? 0,
    previewReward: preview.totalCredits,
    previewIsMilestone: preview.isMilestone,
    previewIsWeekend: now.getUTCDay() === 0 || now.getUTCDay() === 6,
    config,
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

  // `best_streak_days` is a newer column (added alongside the weekend
  // multiplier) — select with a fallback so a not-yet-run migration
  // degrades to "no best-streak tracking" instead of breaking the claim
  // entirely, same defensive pattern as app/admin/page.tsx's item_types.
  let hasBestStreakColumn = true;
  let profile = await supabase
    .from("profiles")
    .select("credits, streak_days, best_streak_days, last_claim_date")
    .eq("id", user.id)
    .single()
    .then((r) => r.data);
  if (!profile) {
    hasBestStreakColumn = false;
    const fallback = await supabase
      .from("profiles")
      .select("credits, streak_days, last_claim_date")
      .eq("id", user.id)
      .single();
    profile = fallback.data ? { ...fallback.data, best_streak_days: 0 } : null;
  }

  if (!profile) {
    return { success: false, error: "Profil konnte nicht geladen werden." };
  }

  const now = new Date();
  const today = dateKey(now);
  // Same timestamptz-vs-date-string mismatch as getClaimStatus() above —
  // `rawLastClaimDate` (whatever shape the column actually returned) stays
  // around separately because the optimistic-lock update below has to
  // match it *exactly* as stored, while every date-logic comparison needs
  // the normalized bare-date form.
  const rawLastClaimDate = profile.last_claim_date;
  const lastClaimDate = normalizeDateKey(rawLastClaimDate);

  if (lastClaimDate === today) {
    return { success: false, error: "Du hast deinen Reward heute schon abgeholt." };
  }

  const decision = decideStreak(lastClaimDate, profile.streak_days ?? 0, now, config);
  const result = computeStreakReward(decision.newStreak, config, now);
  const newCredits = profile.credits + result.totalCredits;
  const newBestStreak = Math.max(profile.best_streak_days ?? 0, decision.newStreak);

  // `.eq("last_claim_date", null)` is *not* the same as `IS NULL` in
  // Postgres/PostgREST — `column = NULL` is never true, so for any
  // player who had never claimed before (last_claim_date actually NULL),
  // this guard used to match zero rows on every single attempt, forever.
  // That's not a double-click edge case, that's the daily claim being
  // permanently broken for first-time claimers — exactly the "Abholen
  // funktioniert nicht" report. `.is()` is the correct operator for NULL.
  let updateQuery = supabase
    .from("profiles")
    .update({
      credits: newCredits,
      streak_days: decision.newStreak,
      ...(hasBestStreakColumn ? { best_streak_days: newBestStreak } : {}),
      last_claim_date: today,
    })
    .eq("id", user.id);
  updateQuery =
    rawLastClaimDate === null
      ? updateQuery.is("last_claim_date", null)
      : updateQuery.eq("last_claim_date", rawLastClaimDate);

  // The guard above (whichever form it took) means a double-click (two
  // claims firing before the first one's response lands) can't both
  // succeed — the second write affects zero rows instead of double-
  // crediting the reward.
  const { data: updatedRows, error: updateError } = await updateQuery.select("credits");
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

  // Every claim gets a notification — full daily-reward history, with a
  // distinct title for milestone days.
  const { currencyName } = await getSiteConfig();
  await notifyUser({
    userId: user.id,
    type: "streak_claim",
    title: result.isMilestone ? "Streak-Meilenstein erreicht!" : "Daily-Reward abgeholt",
    message: `${decision.newStreak} Tage in Folge — du hast ${result.totalCredits.toLocaleString("de-DE")} ${currencyName} erhalten.`,
    link: "/account",
  });

  return {
    success: true,
    reward: result.totalCredits,
    newStreak: decision.newStreak,
    isMilestone: result.isMilestone,
    newCredits: updatedRows[0].credits,
  };
}

export async function updateStreakConfig(input: StreakConfig): Promise<{ success: boolean; error?: string }> {
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

  if (!Number.isFinite(input.weekendMultiplier) || input.weekendMultiplier < 0) {
    return { success: false, error: "Ungültiger Wert für weekendMultiplier." };
  }

  const admin = createAdminClient();
  const baseRow = {
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
  };

  // `weekend_multiplier` may not exist yet if that migration hasn't run —
  // try with it first, and if the column genuinely doesn't exist, fall
  // back to saving everything else rather than failing the whole save.
  let { error } = await admin.from("streak_config").upsert({
    ...baseRow,
    weekend_multiplier: input.weekendMultiplier,
    special_event_enabled: input.specialEventEnabled,
    special_event_multiplier: input.specialEventMultiplier,
    special_event_label: input.specialEventLabel,
  });
  if (error) {
    const withWeekend = await admin.from("streak_config").upsert({ ...baseRow, weekend_multiplier: input.weekendMultiplier });
    error = withWeekend.error;
    if (error) {
      const retry = await admin.from("streak_config").upsert(baseRow);
      error = retry.error;
    }
  }

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
