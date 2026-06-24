"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import {
  DEFAULT_SNAKE_CONFIG, DEFAULT_X1_CONFIG, DEFAULT_X2_CONFIG, DEFAULT_GRIND_CONFIG, DEFAULT_FARM_CONFIG,
  type SnakeConfig, type SnakeModeConfig, type SnakeGrindConfig, type SnakeMode,
} from "@/lib/snake-config";
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

function sanitizeMode(raw: Partial<SnakeModeConfig>, def: SnakeModeConfig): SnakeModeConfig {
  return { ...def, ...raw };
}

function sanitizeGrind(raw: Partial<SnakeGrindConfig>): SnakeGrindConfig {
  return { ...DEFAULT_GRIND_CONFIG, ...raw };
}

export async function getSnakeConfig(): Promise<SnakeConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("snake_config")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return DEFAULT_SNAKE_CONFIG;

  // Try new modes_config JSONB column first (written by updateSnakeConfig)
  const mc = (data.modes_config ?? null) as {
    x1?: Partial<SnakeModeConfig>;
    x2?: Partial<SnakeModeConfig>;
    grind?: Partial<SnakeGrindConfig>;
    farm?: Partial<SnakeModeConfig>;
  } | null;

  if (mc && typeof mc === "object") {
    return {
      enabled: data.enabled ?? DEFAULT_SNAKE_CONFIG.enabled,
      sectionTitle: data.section_title?.trim() || DEFAULT_SNAKE_CONFIG.sectionTitle,
      sectionSubtitle: data.section_subtitle?.trim() || DEFAULT_SNAKE_CONFIG.sectionSubtitle,
      x1: sanitizeMode(mc.x1 ?? {}, DEFAULT_X1_CONFIG),
      x2: sanitizeMode(mc.x2 ?? {}, DEFAULT_X2_CONFIG),
      grind: sanitizeGrind(mc.grind ?? {}),
      farm: sanitizeMode(mc.farm ?? {}, DEFAULT_FARM_CONFIG),
    };
  }

  // Legacy fallback: read old individual columns → map to x1/x2, use grind defaults
  const d = DEFAULT_SNAKE_CONFIG;
  const x1: SnakeModeConfig = {
    ...DEFAULT_X1_CONFIG,
    boardSize: data.board_size ?? DEFAULT_X1_CONFIG.boardSize,
    creditsPerApple: data.credits_per_apple_x1 ?? DEFAULT_X1_CONFIG.creditsPerApple,
    initialSpeedMs: data.initial_speed_ms ?? DEFAULT_X1_CONFIG.initialSpeedMs,
    speedIncreasePerApple: data.speed_increase_per_apple ?? DEFAULT_X1_CONFIG.speedIncreasePerApple,
    minSpeedMs: data.min_speed_ms ?? DEFAULT_X1_CONFIG.minSpeedMs,
    wallWrap: data.wall_wrap ?? DEFAULT_X1_CONFIG.wallWrap,
    dailyCrLimit: typeof data.daily_cr_limit === "number" ? data.daily_cr_limit : DEFAULT_X1_CONFIG.dailyCrLimit,
    leaderboardSize: data.leaderboard_size ?? DEFAULT_X1_CONFIG.leaderboardSize,
    bonusEveryN: data.bonus_every_n ?? DEFAULT_X1_CONFIG.bonusEveryN,
    bonusCrFlat: data.bonus_cr_flat ?? DEFAULT_X1_CONFIG.bonusCrFlat,
    bonusMultiplierApples: data.bonus_multiplier_apples ?? DEFAULT_X1_CONFIG.bonusMultiplierApples,
    goldenAppleEnabled: data.golden_apple_enabled ?? DEFAULT_X1_CONFIG.goldenAppleEnabled,
    goldenAppleCrMultiplier: data.golden_apple_cr_multiplier ?? DEFAULT_X1_CONFIG.goldenAppleCrMultiplier,
    goldenAppleLifeApples: data.golden_apple_life_apples ?? DEFAULT_X1_CONFIG.goldenAppleLifeApples,
    startLength: data.start_length ?? DEFAULT_X1_CONFIG.startLength,
    particlesEnabled: data.particles_enabled ?? DEFAULT_X1_CONFIG.particlesEnabled,
  };
  const x2: SnakeModeConfig = {
    ...DEFAULT_X2_CONFIG,
    boardSize: data.board_size ?? DEFAULT_X2_CONFIG.boardSize,
    creditsPerApple: data.credits_per_apple_x2 ?? DEFAULT_X2_CONFIG.creditsPerApple,
    initialSpeedMs: data.x2_initial_speed_ms ?? DEFAULT_X2_CONFIG.initialSpeedMs,
    speedIncreasePerApple: data.speed_increase_per_apple ?? DEFAULT_X2_CONFIG.speedIncreasePerApple,
    minSpeedMs: data.min_speed_ms ?? DEFAULT_X2_CONFIG.minSpeedMs,
    wallWrap: data.wall_wrap ?? DEFAULT_X2_CONFIG.wallWrap,
    dailyCrLimit: typeof data.daily_cr_limit === "number" ? data.daily_cr_limit : DEFAULT_X2_CONFIG.dailyCrLimit,
    leaderboardSize: data.leaderboard_size ?? DEFAULT_X2_CONFIG.leaderboardSize,
    bonusEveryN: data.bonus_every_n ?? DEFAULT_X2_CONFIG.bonusEveryN,
    bonusCrFlat: data.bonus_cr_flat ?? DEFAULT_X2_CONFIG.bonusCrFlat,
    bonusMultiplierApples: data.bonus_multiplier_apples ?? DEFAULT_X2_CONFIG.bonusMultiplierApples,
    goldenAppleEnabled: data.golden_apple_enabled ?? DEFAULT_X2_CONFIG.goldenAppleEnabled,
    goldenAppleCrMultiplier: data.golden_apple_cr_multiplier ?? DEFAULT_X2_CONFIG.goldenAppleCrMultiplier,
    goldenAppleLifeApples: data.golden_apple_life_apples ?? DEFAULT_X2_CONFIG.goldenAppleLifeApples,
    startLength: data.start_length ?? DEFAULT_X2_CONFIG.startLength,
    particlesEnabled: data.particles_enabled ?? DEFAULT_X2_CONFIG.particlesEnabled,
  };

  return {
    enabled: data.enabled ?? d.enabled,
    sectionTitle: data.section_title?.trim() || d.sectionTitle,
    sectionSubtitle: data.section_subtitle?.trim() || d.sectionSubtitle,
    x1,
    x2,
    grind: DEFAULT_GRIND_CONFIG,
    farm: DEFAULT_FARM_CONFIG,
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

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v)));

  function sanitizeGameLimit(v: number | null | undefined) {
    return (v !== null && v !== undefined) ? Math.max(1, Math.round(v)) : null;
  }

  const sanitizedX1: SnakeModeConfig = {
    enabled: input.x1.enabled,
    boardSize: clamp(input.x1.boardSize, 10, 50),
    creditsPerApple: clamp(input.x1.creditsPerApple, 1, 10000),
    initialSpeedMs: clamp(input.x1.initialSpeedMs, 50, 1000),
    speedIncreasePerApple: Math.max(0, input.x1.speedIncreasePerApple),
    minSpeedMs: clamp(input.x1.minSpeedMs, 30, 500),
    wallWrap: input.x1.wallWrap,
    dailyCrLimit: input.x1.dailyCrLimit !== null ? Math.max(1, Math.round(input.x1.dailyCrLimit)) : null,
    dailyGameLimit: sanitizeGameLimit(input.x1.dailyGameLimit),
    bonusEveryN: clamp(input.x1.bonusEveryN, 1, 100),
    bonusCrFlat: Math.max(0, Math.round(input.x1.bonusCrFlat)),
    bonusMultiplierApples: Math.max(0, Math.round(input.x1.bonusMultiplierApples)),
    goldenAppleEnabled: input.x1.goldenAppleEnabled,
    goldenAppleCrMultiplier: Math.max(1, input.x1.goldenAppleCrMultiplier),
    goldenAppleLifeApples: Math.max(1, Math.round(input.x1.goldenAppleLifeApples)),
    startLength: clamp(input.x1.startLength, 1, 15),
    particlesEnabled: input.x1.particlesEnabled,
    leaderboardSize: clamp(input.x1.leaderboardSize, 5, 100),
  };

  const sanitizedX2: SnakeModeConfig = {
    enabled: input.x2.enabled,
    boardSize: clamp(input.x2.boardSize, 10, 50),
    creditsPerApple: clamp(input.x2.creditsPerApple, 1, 10000),
    initialSpeedMs: clamp(input.x2.initialSpeedMs, 30, 1000),
    speedIncreasePerApple: Math.max(0, input.x2.speedIncreasePerApple),
    minSpeedMs: clamp(input.x2.minSpeedMs, 20, 500),
    wallWrap: input.x2.wallWrap,
    dailyCrLimit: input.x2.dailyCrLimit !== null ? Math.max(1, Math.round(input.x2.dailyCrLimit)) : null,
    dailyGameLimit: sanitizeGameLimit(input.x2.dailyGameLimit),
    bonusEveryN: clamp(input.x2.bonusEveryN, 1, 100),
    bonusCrFlat: Math.max(0, Math.round(input.x2.bonusCrFlat)),
    bonusMultiplierApples: Math.max(0, Math.round(input.x2.bonusMultiplierApples)),
    goldenAppleEnabled: input.x2.goldenAppleEnabled,
    goldenAppleCrMultiplier: Math.max(1, input.x2.goldenAppleCrMultiplier),
    goldenAppleLifeApples: Math.max(1, Math.round(input.x2.goldenAppleLifeApples)),
    startLength: clamp(input.x2.startLength, 1, 15),
    particlesEnabled: input.x2.particlesEnabled,
    leaderboardSize: clamp(input.x2.leaderboardSize, 5, 100),
  };

  const sanitizedGrind: SnakeGrindConfig = {
    enabled: input.grind.enabled,
    boardSize: clamp(input.grind.boardSize, 16, 128),
    creditsPerApple: clamp(input.grind.creditsPerApple, 1, 10000),
    initialSpeedMs: clamp(input.grind.initialSpeedMs, 50, 1000),
    speedIncreasePerApple: Math.max(0, input.grind.speedIncreasePerApple),
    minSpeedMs: clamp(input.grind.minSpeedMs, 30, 500),
    wallWrap: false, // grind always has walls
    dailyCrLimit: input.grind.dailyCrLimit !== null ? Math.max(1, Math.round(input.grind.dailyCrLimit)) : null,
    dailyGameLimit: sanitizeGameLimit(input.grind.dailyGameLimit),
    bonusEveryN: clamp(input.grind.bonusEveryN, 1, 100),
    bonusCrFlat: Math.max(0, Math.round(input.grind.bonusCrFlat)),
    bonusMultiplierApples: Math.max(0, Math.round(input.grind.bonusMultiplierApples)),
    goldenAppleEnabled: input.grind.goldenAppleEnabled,
    goldenAppleCrMultiplier: Math.max(1, input.grind.goldenAppleCrMultiplier),
    goldenAppleLifeApples: Math.max(1, Math.round(input.grind.goldenAppleLifeApples)),
    startLength: clamp(input.grind.startLength, 1, 15),
    particlesEnabled: input.grind.particlesEnabled,
    leaderboardSize: clamp(input.grind.leaderboardSize, 5, 100),
    shrinkEveryN: clamp(input.grind.shrinkEveryN, 1, 100),
    minBoardSize: clamp(input.grind.minBoardSize, 4, 32),
    bonusCrPerShrink: Math.max(0, Math.round(input.grind.bonusCrPerShrink)),
  };

  const sanitizedFarm: SnakeModeConfig = {
    enabled: input.farm.enabled,
    boardSize: clamp(input.farm.boardSize, 10, 50),
    creditsPerApple: clamp(input.farm.creditsPerApple, 1, 10000),
    initialSpeedMs: clamp(input.farm.initialSpeedMs, 30, 1000),
    speedIncreasePerApple: Math.max(0, input.farm.speedIncreasePerApple),
    minSpeedMs: clamp(input.farm.minSpeedMs, 20, 500),
    wallWrap: input.farm.wallWrap,
    dailyCrLimit: input.farm.dailyCrLimit !== null ? Math.max(1, Math.round(input.farm.dailyCrLimit)) : null,
    dailyGameLimit: sanitizeGameLimit(input.farm.dailyGameLimit),
    bonusEveryN: clamp(input.farm.bonusEveryN, 0, 100),
    bonusCrFlat: Math.max(0, Math.round(input.farm.bonusCrFlat)),
    bonusMultiplierApples: Math.max(0, Math.round(input.farm.bonusMultiplierApples)),
    goldenAppleEnabled: input.farm.goldenAppleEnabled,
    goldenAppleCrMultiplier: Math.max(1, input.farm.goldenAppleCrMultiplier),
    goldenAppleLifeApples: Math.max(1, Math.round(input.farm.goldenAppleLifeApples)),
    startLength: clamp(input.farm.startLength, 1, 15),
    particlesEnabled: input.farm.particlesEnabled,
    leaderboardSize: clamp(input.farm.leaderboardSize, 5, 100),
  };

  const admin = createAdminClient();
  const { error } = await admin.from("snake_config").upsert({
    id: "default",
    enabled: input.enabled,
    section_title: input.sectionTitle?.trim() || DEFAULT_SNAKE_CONFIG.sectionTitle,
    section_subtitle: input.sectionSubtitle?.trim() || DEFAULT_SNAKE_CONFIG.sectionSubtitle,
    modes_config: { x1: sanitizedX1, x2: sanitizedX2, grind: sanitizedGrind, farm: sanitizedFarm },
    // Keep legacy columns updated for any existing external reads
    board_size: sanitizedX1.boardSize,
    credits_per_apple_x1: sanitizedX1.creditsPerApple,
    credits_per_apple_x2: sanitizedX2.creditsPerApple,
    x2_apple_threshold: 30,
    wall_wrap: sanitizedX1.wallWrap,
    initial_speed_ms: sanitizedX1.initialSpeedMs,
    speed_increase_per_apple: sanitizedX1.speedIncreasePerApple,
    min_speed_ms: sanitizedX1.minSpeedMs,
    x2_initial_speed_ms: sanitizedX2.initialSpeedMs,
    daily_cr_limit: sanitizedX1.dailyCrLimit,
    leaderboard_size: sanitizedX1.leaderboardSize,
    bonus_every_n: sanitizedX1.bonusEveryN,
    bonus_cr_flat: sanitizedX1.bonusCrFlat,
    bonus_multiplier_apples: sanitizedX1.bonusMultiplierApples,
    golden_apple_enabled: sanitizedX1.goldenAppleEnabled,
    golden_apple_cr_multiplier: sanitizedX1.goldenAppleCrMultiplier,
    golden_apple_life_apples: sanitizedX1.goldenAppleLifeApples,
    start_length: sanitizedX1.startLength,
    particles_enabled: sanitizedX1.particlesEnabled,
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
  speedMode: SnakeMode
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

  const modeCfg = speedMode === "grind" ? config.grind : speedMode === "x2" ? config.x2 : speedMode === "farm" ? config.farm : config.x1;
  if (!modeCfg.enabled) return { success: false, error: `Snake ${speedMode} ist deaktiviert.` };

  // Daily CR limit check
  let actualCredits = creditsEarned;
  if (modeCfg.dailyCrLimit !== null) {
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

    const remaining = Math.max(0, modeCfg.dailyCrLimit - earnedToday);
    actualCredits = Math.min(creditsEarned, remaining);
  }

  // Daily game limit check
  if (modeCfg.dailyGameLimit !== null) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: gameLogs } = await admin
      .from("audit_logs")
      .select("payload")
      .eq("user_id", user.id)
      .eq("action", "snake_earn")
      .gte("created_at", todayStart.toISOString());
    const gamesThisMode = (gameLogs ?? []).filter((row) => {
      const p = row.payload as Record<string, unknown> | null;
      return p?.speed_mode === speedMode;
    }).length;
    if (gamesThisMode >= modeCfg.dailyGameLimit) {
      return {
        success: false,
        error: `Tageslimit von ${modeCfg.dailyGameLimit} Spielen (${speedMode}) erreicht. Komm morgen wieder!`,
      };
    }
  }

  // Server-side sanity cap: max possible CR ≈ score * creditsPerApple * multipliers
  const sanityMax = score * modeCfg.creditsPerApple * (modeCfg.goldenAppleCrMultiplier + 1) * 2
    + Math.ceil(score / Math.max(1, modeCfg.bonusEveryN)) * modeCfg.bonusCrFlat
    + (speedMode === "grind"
      ? Math.ceil(score / Math.max(1, (modeCfg as SnakeGrindConfig).shrinkEveryN)) * (modeCfg as SnakeGrindConfig).bonusCrPerShrink
      : 0);
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

  if (actualCredits > 0) {
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ credits: profile.credits + actualCredits })
      .eq("id", user.id);
    if (updateErr) return { success: false, error: "Credits konnten nicht vergeben werden." };
  }

  await admin.from("snake_best_scores").upsert({
    user_id: user.id,
    speed_mode: speedMode,
    best_score: newBestScore,
    total_cr_earned: (current?.total_cr_earned ?? 0) + actualCredits,
    games_played: (current?.games_played ?? 0) + 1,
    updated_at: new Date().toISOString(),
  });

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "snake_earn",
      payload: { score, speed_mode: speedMode, credits_earned: actualCredits, is_new_record: isNewRecord },
    });
  } catch { /* non-fatal */ }

  if (isNewRecord && score > 0) {
    const modeLabel = speedMode === "grind" ? "Grind" : speedMode === "x2" ? "x2 Turbo" : "Classic";
    await notifyUser({
      userId: user.id,
      type: "snake_record",
      title: `Neuer Snake-Rekord (${modeLabel})!`,
      message: `${score} Äpfel in ${modeLabel} — ${actualCredits.toLocaleString("de-DE")} ${currencyName} verdient.`,
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
  speedMode: SnakeMode,
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
): Promise<{ x1: number; x2: number; grind: number; farm: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("snake_best_scores")
    .select("speed_mode, best_score")
    .eq("user_id", userId);

  const x1 = (data ?? []).find((r) => r.speed_mode === "x1")?.best_score ?? 0;
  const x2 = (data ?? []).find((r) => r.speed_mode === "x2")?.best_score ?? 0;
  const grind = (data ?? []).find((r) => r.speed_mode === "grind")?.best_score ?? 0;
  const farm = (data ?? []).find((r) => r.speed_mode === "farm")?.best_score ?? 0;
  return { x1, x2, grind, farm };
}

export async function getDailyGamesPerMode(
  userId: string
): Promise<{ x1: number; x2: number; grind: number; farm: number }> {
  const admin = createAdminClient();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { data } = await admin
    .from("audit_logs")
    .select("payload")
    .eq("user_id", userId)
    .eq("action", "snake_earn")
    .gte("created_at", todayStart.toISOString());

  const result = { x1: 0, x2: 0, grind: 0, farm: 0 };
  for (const row of data ?? []) {
    const mode = (row.payload as Record<string, unknown> | null)?.speed_mode as string | undefined;
    if (mode === "x1" || mode === "x2" || mode === "grind" || mode === "farm") result[mode]++;
  }
  return result;
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
