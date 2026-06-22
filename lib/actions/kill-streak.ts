"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { notifyUser } from "@/lib/notifications-internal";
import { getMonsterTypes } from "@/lib/actions/monsters";
import {
  DEFAULT_KILL_STREAK_CONFIG,
  streakCrMultiplier,
  type KillStreakConfig,
} from "@/lib/kill-streak";

interface KillStreakConfigRow {
  multiplier_per_kill: number;
  max_multiplier: number;
  mob_scale_per_kill: number;
  mob_scale_max: number;
}

function rowToConfig(row: KillStreakConfigRow): KillStreakConfig {
  return {
    multiplierPerKill: row.multiplier_per_kill,
    maxMultiplier: row.max_multiplier,
    mobScalePerKill: row.mob_scale_per_kill,
    mobScaleMax: row.mob_scale_max,
  };
}

/** Falls back to the code defaults whenever the table doesn't exist yet or
 * is empty — same defensive pattern as lib/actions/streak.ts'
 * getStreakConfig(), for the same reason (brand-new tables in this project
 * are RLS-enabled with no policies, so only this admin-client read ever
 * sees the row at all). */
export async function getKillStreakConfig(): Promise<KillStreakConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kill_streak_config")
    .select("multiplier_per_kill, max_multiplier, mob_scale_per_kill, mob_scale_max")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return DEFAULT_KILL_STREAK_CONFIG;
  return rowToConfig(data as KillStreakConfigRow);
}

export interface UpdateKillStreakConfigInput {
  multiplierPerKill: number;
  maxMultiplier: number;
  mobScalePerKill: number;
  mobScaleMax: number;
}

export interface KillStreakActionResult {
  success: boolean;
  error?: string;
}

export async function updateKillStreakConfig(input: UpdateKillStreakConfigInput): Promise<KillStreakActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", user.id)
    .single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const numericFields: [string, number][] = [
    ["multiplierPerKill", input.multiplierPerKill],
    ["maxMultiplier", input.maxMultiplier],
    ["mobScalePerKill", input.mobScalePerKill],
    ["mobScaleMax", input.mobScaleMax],
  ];
  for (const [field, value] of numericFields) {
    if (!Number.isFinite(value) || value < 0) {
      return { success: false, error: `Ungültiger Wert für ${field}.` };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin.from("kill_streak_config").upsert({
    id: "default",
    multiplier_per_kill: input.multiplierPerKill,
    max_multiplier: input.maxMultiplier,
    mob_scale_per_kill: input.mobScalePerKill,
    mob_scale_max: input.mobScaleMax,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { success: false, error: "Speichern fehlgeschlagen — ist die Kill-Streak-Migration eingespielt?" };
  }

  revalidatePath("/admin");
  revalidatePath("/world");
  return { success: true };
}

/**
 * Resets the kill-streak's *uncommitted* state to zero — called once when
 * a player's World session starts (world-shell.tsx's mount effect) and
 * also whenever a streak is forfeited (death, or simply never explicitly
 * cashed out before the tab closed). This is what makes an ungraceful
 * disconnect (Alt+F4, closing the tab) free to handle correctly: nothing
 * has to detect that it happened — the *next* time this player enters the
 * World, whatever was sitting uncommitted just gets zeroed before any new
 * kill can build on top of stale state. No cron, no presence-timeout
 * logic, no second system tracking "did they leave cleanly".
 */
export async function enterWorld(): Promise<KillStreakActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ pending_streak_cr: 0, streak_kill_count: 0 })
    .eq("id", user.id);

  if (error) return { success: false, error: "Konnte Streak nicht zurücksetzen." };
  return { success: true };
}

export interface RegisterStreakKillResult {
  success: boolean;
  error?: string;
  reward?: number;
  newStreakKillCount?: number;
  newPendingStreakCr?: number;
}

/** Same idea as the old claimMonsterKill (lib/actions/monsters.ts, now
 * replaced by this — the World has no server-authoritative combat
 * simulation, monsters live entirely client-side, so this is a pragmatic
 * rate-limit, not a claim that the kill itself is verified): the reward is
 * always rolled from the server's own monster_types config, the client
 * only ever names *which* monster type died. The difference from the old
 * action is where the reward goes — `pending_streak_cr`, not straight to
 * `profiles.credits` — and that it scales up with the streak itself via
 * lib/kill-streak.ts' `streakCrMultiplier`. */
const MIN_KILL_INTERVAL_MS = 300;

export async function registerStreakKill(monsterTypeId: string): Promise<RegisterStreakKillResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const types = await getMonsterTypes();
  const type = types.find((t) => t.id === monsterTypeId);
  if (!type || !type.enabled) {
    return { success: false, error: "Unbekannter oder deaktivierter Monster-Typ." };
  }

  const admin = createAdminClient();
  const { data: lastKill } = await admin
    .from("audit_logs")
    .select("created_at")
    .eq("user_id", user.id)
    .eq("action", "streak_kill")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastKill && Date.now() - new Date(lastKill.created_at).getTime() < MIN_KILL_INTERVAL_MS) {
    return { success: false, error: "Zu schnell." };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("pending_streak_cr, streak_kill_count")
    .eq("id", user.id)
    .single();
  if (!profile) return { success: false, error: "Profil konnte nicht geladen werden." };

  const config = await getKillStreakConfig();
  const killsSoFar = profile.streak_kill_count ?? 0;
  const baseReward = Math.floor(type.rewardMin + Math.random() * (type.rewardMax - type.rewardMin + 1));
  const reward = Math.round(baseReward * streakCrMultiplier(killsSoFar, config));
  const newStreakKillCount = killsSoFar + 1;
  const newPendingStreakCr = (profile.pending_streak_cr ?? 0) + reward;

  const { error } = await admin
    .from("profiles")
    .update({ pending_streak_cr: newPendingStreakCr, streak_kill_count: newStreakKillCount })
    .eq("id", user.id);
  if (error) return { success: false, error: "Konnte Belohnung nicht gutschreiben." };

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "streak_kill",
      payload: { monsterTypeId, reward, newStreakKillCount, newPendingStreakCr },
    });
  } catch {
    // best-effort — the credit grant above already happened either way.
  }

  return { success: true, reward, newStreakKillCount, newPendingStreakCr };
}

export interface CommitStreakCrResult {
  success: boolean;
  error?: string;
  committed?: number;
  newCredits?: number;
}

/** The "Disconnect" button's action — atomically moves whatever's
 * currently pending into the player's real, spendable balance and zeroes
 * both streak columns. This is the *only* path that ever turns pending
 * streak CR into real credits; closing the tab without calling this (or
 * dying — see forfeitStreakOnDeath) just leaves it to be zeroed by the
 * next enterWorld() call instead, never credited. */
export async function commitStreakCr(): Promise<CommitStreakCrResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("credits, pending_streak_cr")
    .eq("id", user.id)
    .single();
  if (!profile) return { success: false, error: "Profil konnte nicht geladen werden." };

  const committed = profile.pending_streak_cr ?? 0;
  const newCredits = profile.credits + committed;

  const { error } = await admin
    .from("profiles")
    .update({ credits: newCredits, pending_streak_cr: 0, streak_kill_count: 0 })
    .eq("id", user.id);
  if (error) return { success: false, error: "Auszahlung fehlgeschlagen." };

  if (committed > 0) {
    try {
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "streak_commit",
        payload: { committed, newCredits },
      });
    } catch {
      // best-effort
    }
    await notifyUser({
      userId: user.id,
      type: "streak_commit",
      title: "Kill-Streak ausgezahlt",
      message: `Du hast ${committed.toLocaleString("de-DE")} CR aus deiner Kill-Streak eingelöst.`,
      link: "/account",
    });
  }

  return { success: true, committed, newCredits };
}

export interface ForfeitStreakResult {
  success: boolean;
  error?: string;
  /** What was actually lost — read *before* zeroing, so the death screen
   * can show it. */
  forfeitedCr?: number;
  forfeitedKillCount?: number;
}

/** Called from the death-screen flow (not silently from Player.tsx's
 * physics loop) — same reset as enterWorld(), but reads the about-to-be-
 * lost amounts first so the UI can actually show what dying just cost,
 * before they're gone. `profiles.credits` and the player's inventory are
 * never touched here — only the uncommitted streak CR is at risk on
 * death, exactly per spec. */
export async function forfeitStreakOnDeath(): Promise<ForfeitStreakResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("pending_streak_cr, streak_kill_count")
    .eq("id", user.id)
    .single();
  if (!profile) return { success: false, error: "Profil konnte nicht geladen werden." };

  const forfeitedCr = profile.pending_streak_cr ?? 0;
  const forfeitedKillCount = profile.streak_kill_count ?? 0;

  const { error } = await admin
    .from("profiles")
    .update({ pending_streak_cr: 0, streak_kill_count: 0 })
    .eq("id", user.id);
  if (error) return { success: false, error: "Konnte Streak nicht zurücksetzen." };

  if (forfeitedCr > 0) {
    try {
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "streak_forfeit",
        payload: { forfeitedCr, forfeitedKillCount },
      });
    } catch {
      // best-effort
    }
  }

  return { success: true, forfeitedCr, forfeitedKillCount };
}
