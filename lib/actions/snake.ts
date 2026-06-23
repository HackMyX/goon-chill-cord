"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { DEFAULT_SNAKE_CONFIG, type SnakeConfig } from "@/lib/snake-config";
import { notifyUser } from "@/lib/notifications-internal";
import { getSiteConfig } from "@/lib/actions/site-config";

export interface SnakeLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  bestScore: number;
  totalCrEarned: number;
  gamesPlayed: number;
}

export interface SnakeSubmitResult {
  success: boolean;
  error?: string;
  creditsAwarded?: number;
  newCredits?: number;
  isNewRecord?: boolean;
  previousBest?: number;
}

export async function getSnakeConfig(): Promise<SnakeConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("snake_config")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return DEFAULT_SNAKE_CONFIG;
  const d = DEFAULT_SNAKE_CONFIG;
  return {
    enabled: data.enabled ?? d.enabled,
    boardSize: data.board_size ?? d.boardSize,
    creditsPerAppleX1: data.credits_per_apple_x1 ?? d.creditsPerAppleX1,
    creditsPerAppleX2: data.credits_per_apple_x2 ?? d.creditsPerAppleX2,
    x2AppleThreshold: data.x2_apple_threshold ?? d.x2AppleThreshold,
    wallWrap: data.wall_wrap ?? d.wallWrap,
    initialSpeedMs: data.initial_speed_ms ?? d.initialSpeedMs,
    speedIncreasePerApple: data.speed_increase_per_apple ?? d.speedIncreasePerApple,
    minSpeedMs: data.min_speed_ms ?? d.minSpeedMs,
    x2InitialSpeedMs: data.x2_initial_speed_ms ?? d.x2InitialSpeedMs,
    dailyCrLimit: typeof data.daily_cr_limit === "number" ? data.daily_cr_limit : d.dailyCrLimit,
    leaderboardSize: data.leaderboard_size ?? d.leaderboardSize,
    sectionTitle: data.section_title?.trim() || d.sectionTitle,
    sectionSubtitle: data.section_subtitle?.trim() || d.sectionSubtitle,
    bonusEveryN: data.bonus_every_n ?? d.bonusEveryN,
    bonusCrFlat: data.bonus_cr_flat ?? d.bonusCrFlat,
    bonusMultiplierApples: data.bonus_multiplier_apples ?? d.bonusMultiplierApples,
    goldenAppleEnabled: data.golden_apple_enabled ?? d.goldenAppleEnabled,
    goldenAppleCrMultiplier: data.golden_apple_cr_multiplier ?? d.goldenAppleCrMultiplier,
    goldenAppleLifeApples: data.golden_apple_life_apples ?? d.goldenAppleLifeApples,
    startLength: data.start_length ?? d.startLength,
    particlesEnabled: data.particles_enabled ?? d.particlesEnabled,
  };
}

export async function updateSnakeConfig(
  input: SnakeConfig
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("snake_config").upsert({
    id: "default",
    enabled: input.enabled,
    board_size: Math.max(10, Math.min(40, Math.round(input.boardSize))),
    credits_per_apple_x1: Math.max(1, Math.round(input.creditsPerAppleX1)),
    credits_per_apple_x2: Math.max(1, Math.round(input.creditsPerAppleX2)),
    x2_apple_threshold: Math.max(1, Math.round(input.x2AppleThreshold)),
    wall_wrap: input.wallWrap,
    initial_speed_ms: Math.max(50, Math.round(input.initialSpeedMs)),
    speed_increase_per_apple: Math.max(0, input.speedIncreasePerApple),
    min_speed_ms: Math.max(30, Math.round(input.minSpeedMs)),
    x2_initial_speed_ms: Math.max(30, Math.round(input.x2InitialSpeedMs)),
    daily_cr_limit: input.dailyCrLimit !== null ? Math.max(1, Math.round(input.dailyCrLimit)) : null,
    leaderboard_size: Math.max(5, Math.min(100, Math.round(input.leaderboardSize))),
    section_title: input.sectionTitle?.trim() || DEFAULT_SNAKE_CONFIG.sectionTitle,
    section_subtitle: input.sectionSubtitle?.trim() || DEFAULT_SNAKE_CONFIG.sectionSubtitle,
    bonus_every_n: Math.max(1, Math.round(input.bonusEveryN)),
    bonus_cr_flat: Math.max(0, Math.round(input.bonusCrFlat)),
    bonus_multiplier_apples: Math.max(0, Math.round(input.bonusMultiplierApples)),
    golden_apple_enabled: input.goldenAppleEnabled,
    golden_apple_cr_multiplier: Math.max(1, input.goldenAppleCrMultiplier),
    golden_apple_life_apples: Math.max(1, Math.round(input.goldenAppleLifeApples)),
    start_length: Math.max(1, Math.min(10, Math.round(input.startLength))),
    particles_enabled: input.particlesEnabled,
    updated_at: new Date().toISOString(),
  });

  if (error) return { success: false, error: "Speichern fehlgeschlagen." };
  revalidatePath("/snake");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function submitSnakeScore(
  score: number,
  creditsEarned: number,
  speedMode: "x1" | "x2"
): Promise<SnakeSubmitResult> {
  if (!Number.isFinite(score) || score < 0) return { success: false, error: "Ungültiger Score." };
  if (!Number.isFinite(creditsEarned) || creditsEarned < 0) return { success: false, error: "Ungültige Credits." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();

  const [config, { currencyName }, { data: profile }] = await Promise.all([
    getSnakeConfig(),
    getSiteConfig(),
    supabase.from("profiles").select("credits").eq("id", user.id).single(),
  ]);

  if (!config.enabled) return { success: false, error: "Snake ist derzeit deaktiviert." };
  if (!profile) return { success: false, error: "Profil nicht gefunden." };

  // Daily CR limit check
  let actualCredits = creditsEarned;
  if (config.dailyCrLimit !== null) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todayLogs } = await admin
      .from("audit_logs")
      .select("payload")
      .eq("user_id", user.id)
      .eq("action", "snake_earn")
      .gte("created_at", todayStart.toISOString());

    const earnedToday = (todayLogs ?? []).reduce((sum, row) => {
      const p = row.payload as Record<string, unknown> | null;
      return sum + (typeof p?.credits_earned === "number" ? p.credits_earned : 0);
    }, 0);

    const remaining = Math.max(0, config.dailyCrLimit - earnedToday);
    actualCredits = Math.min(creditsEarned, remaining);
  }

  // Server-side credit cap sanity check (prevent inflated client values)
  const maxPossibleCrX1 = score * config.creditsPerAppleX1 * 2;
  const maxPossibleCrX2 = score * config.creditsPerAppleX2 * 2;
  const sanityMax = speedMode === "x2" ? maxPossibleCrX2 : maxPossibleCrX1;
  actualCredits = Math.min(actualCredits, sanityMax);

  const { data: current } = await admin
    .from("snake_best_scores")
    .select("best_score, total_cr_earned, games_played")
    .eq("user_id", user.id)
    .eq("speed_mode", speedMode)
    .maybeSingle();

  const previousBest = current?.best_score ?? 0;
  const isNewRecord = score > previousBest;
  const newBestScore = Math.max(previousBest, score);

  // Award credits
  if (actualCredits > 0) {
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ credits: profile.credits + actualCredits })
      .eq("id", user.id);
    if (updateErr) return { success: false, error: "Credits konnten nicht vergeben werden." };
  }

  // Upsert best score
  await admin.from("snake_best_scores").upsert({
    user_id: user.id,
    speed_mode: speedMode,
    best_score: newBestScore,
    total_cr_earned: (current?.total_cr_earned ?? 0) + actualCredits,
    games_played: (current?.games_played ?? 0) + 1,
    updated_at: new Date().toISOString(),
  });

  // Audit log
  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "snake_earn",
      payload: {
        score,
        speed_mode: speedMode,
        credits_earned: actualCredits,
        is_new_record: isNewRecord,
      },
    });
  } catch { /* non-fatal */ }

  // Notify on new record
  if (isNewRecord && score > 0) {
    await notifyUser({
      userId: user.id,
      type: "snake_record",
      title: `Neuer Snake Rekord (${speedMode})!`,
      message: `Du hast deinen Rekord auf ${score} Äpfel verbessert und ${actualCredits.toLocaleString("de-DE")} ${currencyName} verdient.`,
      link: "/snake",
    });
  }

  revalidatePath("/snake");
  return {
    success: true,
    creditsAwarded: actualCredits,
    newCredits: profile.credits + actualCredits,
    isNewRecord,
    previousBest,
  };
}

export async function getSnakeLeaderboard(
  speedMode: "x1" | "x2",
  limit = 20
): Promise<SnakeLeaderboardEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("snake_best_scores")
    .select("user_id, best_score, total_cr_earned, games_played, profiles(username)")
    .eq("speed_mode", speedMode)
    .order("best_score", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as {
    user_id: string;
    best_score: number;
    total_cr_earned: number;
    games_played: number;
    profiles: { username: string } | null;
  }[]).map((row, i) => ({
    rank: i + 1,
    userId: row.user_id,
    username: row.profiles?.username ?? "Unbekannt",
    bestScore: row.best_score,
    totalCrEarned: row.total_cr_earned,
    gamesPlayed: row.games_played,
  }));
}

export async function getMySnakeBest(
  userId: string
): Promise<{ x1: number; x2: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("snake_best_scores")
    .select("speed_mode, best_score")
    .eq("user_id", userId);

  const x1 = (data ?? []).find((r) => r.speed_mode === "x1")?.best_score ?? 0;
  const x2 = (data ?? []).find((r) => r.speed_mode === "x2")?.best_score ?? 0;
  return { x1, x2 };
}

export async function getDailyCrEarned(userId: string): Promise<number> {
  const admin = createAdminClient();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data } = await admin
    .from("audit_logs")
    .select("payload")
    .eq("user_id", userId)
    .eq("action", "snake_earn")
    .gte("created_at", todayStart.toISOString());

  return (data ?? []).reduce((sum, row) => {
    const p = row.payload as Record<string, unknown> | null;
    return sum + (typeof p?.credits_earned === "number" ? p.credits_earned : 0);
  }, 0);
}
