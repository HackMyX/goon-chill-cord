"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { getActiveEquippedAbilityEffect } from "@/lib/actions/abilities";
import { broadcastLive } from "@/lib/realtime-broadcast";
import { consumeGameBonus } from "@/lib/rewards-grant";
import { DEFAULT_PLINKO_CONFIG, type PlinkoConfig, type PlinkoRiskLevel } from "@/lib/plinko-types";
export type { PlinkoConfig, PlinkoRiskLevel } from "@/lib/plinko-types";

export async function getPlinkoConfig(): Promise<PlinkoConfig> {
  const admin = createAdminClient();
  const { data } = await admin.from("plinko_config").select("*").eq("id", "default").maybeSingle();
  if (!data) return DEFAULT_PLINKO_CONFIG;
  const d = data as Record<string, unknown>;
  return {
    enabled: (d.enabled as boolean) ?? true,
    hourlyBallLimit: (d.hourly_ball_limit as number) ?? 30,
    dailyBallLimit: (d.daily_ball_limit as number) ?? 0,
    minBetCr: (d.min_bet_cr as number) ?? 500,
    maxBetCr: (d.max_bet_cr as number) ?? 0,
    quickBetAmounts: (d.quick_bet_amounts as number[]) ?? [500, 2000, 10000, 50000, 250000],
    rows: (d.rows as number) ?? 12,
    riskLevels: (d.risk_levels as PlinkoRiskLevel[]) ?? DEFAULT_PLINKO_CONFIG.riskLevels,
    maxWinCr: (d.max_win_cr as number) ?? 0,
    announceBigWins: (d.announce_big_wins as boolean) ?? true,
    bigWinThreshold: (d.big_win_threshold as number) ?? 25000,
    showHistory: (d.show_history as boolean) ?? true,
    showLeaderboard: (d.show_leaderboard as boolean) ?? true,
    leaderboardSize: (d.leaderboard_size as number) ?? 10,
    particlesEnabled: (d.particles_enabled as boolean) ?? true,
    trailLength: (d.trail_length as number) ?? 7,
    glowIntensity: (d.glow_intensity as number) ?? 1.8,
    animationSpeed: (d.animation_speed as number) ?? 1.0,
    autoBetEnabled: (d.auto_bet_enabled as boolean) ?? true,
  };
}

export async function getMyPlinkoUsageThisHour(userId: string): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("plinko_plays")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  return count ?? 0;
}

export async function getMyPlinkoUsageToday(userId: string): Promise<number> {
  const admin = createAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count } = await admin
    .from("plinko_plays")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", today.toISOString());
  return count ?? 0;
}

export interface PlinkoHistoryEntry {
  id: string;
  riskLevel: string;
  ballCost: number;
  resultMultiplier: number;
  payoutCr: number;
  bucketIndex: number;
  createdAt: string;
}

export async function getMyPlinkoHistory(limit = 30): Promise<PlinkoHistoryEntry[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("plinko_plays")
    .select("id, risk_level, ball_cost, result_multiplier, payout_cr, bucket_index, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    riskLevel: r.risk_level as string,
    ballCost: r.ball_cost as number,
    resultMultiplier: r.result_multiplier as number,
    payoutCr: r.payout_cr as number,
    bucketIndex: r.bucket_index as number,
    createdAt: r.created_at as string,
  }));
}

export interface PlinkoPersonalStats {
  totalPlays: number;
  totalSpent: number;
  totalWon: number;
  netCr: number;
  bestMultiplier: number;
  biggestWin: number;
}

export async function getMyPlinkoStats(): Promise<PlinkoPersonalStats> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { totalPlays: 0, totalSpent: 0, totalWon: 0, netCr: 0, bestMultiplier: 0, biggestWin: 0 };

  const admin = createAdminClient();
  const { data } = await admin
    .from("plinko_plays")
    .select("ball_cost, result_multiplier, payout_cr")
    .eq("user_id", user.id);

  if (!data || data.length === 0) {
    return { totalPlays: 0, totalSpent: 0, totalWon: 0, netCr: 0, bestMultiplier: 0, biggestWin: 0 };
  }

  const totalPlays = data.length;
  const totalSpent = data.reduce((s, r) => s + ((r.ball_cost as number) ?? 0), 0);
  const totalWon = data.reduce((s, r) => s + ((r.payout_cr as number) ?? 0), 0);
  const bestMultiplier = Math.max(...data.map((r) => (r.result_multiplier as number) ?? 0));
  const biggestWin = Math.max(...data.map((r) => (r.payout_cr as number) ?? 0));

  return {
    totalPlays,
    totalSpent,
    totalWon,
    netCr: totalWon - totalSpent,
    bestMultiplier,
    biggestWin,
  };
}

export interface PlinkoLeaderEntry {
  userId: string;
  username: string;
  nameStyleKey?: string;
  avatarUrl: string | null;
  payoutCr: number;
  multiplier: number;
  riskLevel: string;
  createdAt: string;
}

export async function getTopPlinkoWins(limit = 10): Promise<PlinkoLeaderEntry[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("plinko_plays")
    .select("user_id, payout_cr, result_multiplier, risk_level, created_at")
    .order("payout_cr", { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return [];

  const userIds = [...new Set(data.map((r) => r.user_id as string))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, username, avatar_url, active_name_style_key")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  return data.map((r) => {
    const prof = profileMap.get(r.user_id as string);
    return {
      userId: r.user_id as string,
      username: (prof?.username as string) ?? "Anonym",
      nameStyleKey: (prof?.active_name_style_key as string | null) ?? undefined,
      avatarUrl: (prof?.avatar_url as string | null) ?? null,
      payoutCr: r.payout_cr as number,
      multiplier: r.result_multiplier as number,
      riskLevel: r.risk_level as string,
      createdAt: r.created_at as string,
    };
  });
}

export interface PlinkoAdminStats {
  totalPlays: number;
  totalCrSpent: number;
  totalCrPaidOut: number;
  netCrForHouse: number;
  uniquePlayers: number;
  bigWinsCount: number;
}

export async function getPlinkoAdminStats(): Promise<PlinkoAdminStats> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("plinko_plays")
      .select("user_id, ball_cost, payout_cr");

    if (!data) return { totalPlays: 0, totalCrSpent: 0, totalCrPaidOut: 0, netCrForHouse: 0, uniquePlayers: 0, bigWinsCount: 0 };

    const cfg = await getPlinkoConfig();
    const totalCrSpent = data.reduce((s, r) => s + ((r.ball_cost as number) ?? 0), 0);
    const totalCrPaidOut = data.reduce((s, r) => s + ((r.payout_cr as number) ?? 0), 0);
    const uniquePlayers = new Set(data.map((r) => r.user_id as string)).size;
    const bigWinsCount = data.filter((r) => ((r.payout_cr as number) ?? 0) >= cfg.bigWinThreshold).length;

    return {
      totalPlays: data.length,
      totalCrSpent,
      totalCrPaidOut,
      netCrForHouse: totalCrSpent - totalCrPaidOut,
      uniquePlayers,
      bigWinsCount,
    };
  } catch {
    return { totalPlays: 0, totalCrSpent: 0, totalCrPaidOut: 0, netCrForHouse: 0, uniquePlayers: 0, bigWinsCount: 0 };
  }
}

export async function dropPlinkoBall(input: {
  riskLevel: string;
  betAmount: number;
}): Promise<{
  success: boolean;
  error?: string;
  bucketIndex?: number;
  multiplier?: number;
  payout?: number;
  newCredits?: number;
  path?: number[];
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();
  const config = await getPlinkoConfig();

  if (!config.enabled) return { success: false, error: "Plinko ist aktuell deaktiviert." };

  const riskDef = config.riskLevels.find((r) => r.key === input.riskLevel);
  if (!riskDef) return { success: false, error: "Ungültige Risikostufe." };

  // Bet validation
  if (!Number.isFinite(input.betAmount) || input.betAmount <= 0) {
    return { success: false, error: "Ungültiger Einsatz." };
  }
  if (input.betAmount < config.minBetCr) {
    return { success: false, error: `Mindest-Einsatz: ${config.minBetCr.toLocaleString("de-DE")} CR.` };
  }
  if (config.maxBetCr > 0 && input.betAmount > config.maxBetCr) {
    return { success: false, error: `Max-Einsatz: ${config.maxBetCr.toLocaleString("de-DE")} CR.` };
  }

  // Limit check. A player over their hourly/daily cap may still drop a ball if
  // they hold a Plinko-Bonus voucher — it's consumed one ball at a time and
  // bypasses both caps for that ball.
  const usedHour = await getMyPlinkoUsageThisHour(user.id);
  const overHourly = usedHour >= config.hourlyBallLimit;
  let overDaily = false;
  if (config.dailyBallLimit > 0) {
    const usedToday = await getMyPlinkoUsageToday(user.id);
    overDaily = usedToday >= config.dailyBallLimit;
  }
  if (overHourly || overDaily) {
    const usedBonus = await consumeGameBonus(admin, user.id, "plinko");
    if (!usedBonus) {
      return overDaily
        ? { success: false, error: `Tägliches Limit erreicht (${config.dailyBallLimit} Bälle/Tag).` }
        : { success: false, error: `Stündliches Limit erreicht (${config.hourlyBallLimit} Bälle/h).` };
    }
  }

  // Check credits
  const { data: profile } = await admin.from("profiles").select("credits").eq("id", user.id).single();
  const currentCredits: number = (profile?.credits as number) ?? 0;
  if (currentCredits < input.betAmount) {
    return { success: false, error: `Nicht genug Credits (benötigt: ${input.betAmount.toLocaleString("de-DE")} CR).` };
  }

  // Simulate ball path. The number of pin rows is derived FROM the multiplier
  // array (buckets = multipliers.length, rows = buckets − 1) so the landing
  // bucket is ALWAYS a true Binomial(rows, 0.5) draw that maps exactly onto a
  // multiplier — no index clamping, no probability skew, regardless of what the
  // legacy `config.rows` field says. Each pin is an independent 50/50 step.
  const multipliers = riskDef.multipliers;
  const rows = Math.max(2, multipliers.length - 1);
  const path: number[] = [0];
  let pos = 0;
  for (let r = 0; r < rows; r++) {
    const goRight = Math.random() < 0.5 ? 1 : 0;
    pos += goRight;
    path.push(pos);
  }
  const bucketIndex = pos;            // 0 … rows == 0 … multipliers.length−1
  const clampedIdx = bucketIndex;     // already in range — kept for the DB column name
  let multiplier = multipliers[bucketIndex];

  // Equipped ability (mutually exclusive): boost all multipliers, recover part
  // of a worst-slot loss, or globally boost winnings (credit_bonus).
  const plinkoEff = await getActiveEquippedAbilityEffect(admin, user.id);
  if (plinkoEff?.effectType === "plinko_multiplier_boost" && plinkoEff.effectValue > 0) {
    multiplier = multiplier * (1 + plinkoEff.effectValue);
  }

  let payout = Math.floor(input.betAmount * multiplier);
  if (config.maxWinCr > 0) payout = Math.min(payout, config.maxWinCr);

  // Loss recovery: refund a fraction of the bet when landing on the lowest slot.
  if (plinkoEff?.effectType === "plinko_loss_recovery" && plinkoEff.effectValue > 0
      && payout < input.betAmount && multiplier <= Math.min(...multipliers)) {
    payout = Math.min(input.betAmount, payout + Math.floor(input.betAmount * plinkoEff.effectValue));
  }
  // credit_bonus boosts only the winnings (not the staked bet).
  if (plinkoEff?.effectType === "credit_bonus" && plinkoEff.effectValue > 0 && payout > input.betAmount) {
    payout = input.betAmount + Math.floor((payout - input.betAmount) * (1 + plinkoEff.effectValue));
    if (config.maxWinCr > 0) payout = Math.min(payout, config.maxWinCr);
  }

  // Atomic, race-safe settlement: credits = credits + (payout - bet) WHERE credits >= bet,
  // done server-side in one statement under the row lock. Replaces the old read-modify-write
  // (read credits → write absolute newCredits) that let N parallel balls re-roll for free
  // because the last absolute write won. Returns NULL if the player can't afford the bet.
  const { data: settledCredits, error: settleErr } = await admin.rpc("apply_bet_result", {
    p_user_id: user.id,
    p_bet: input.betAmount,
    p_payout: payout,
  });
  if (settleErr || settledCredits === null || settledCredits === undefined) {
    return { success: false, error: `Nicht genug Credits (benötigt: ${input.betAmount.toLocaleString("de-DE")} CR).` };
  }
  const newCredits = settledCredits as number;
  await admin.from("plinko_plays").insert({
    user_id: user.id,
    risk_level: input.riskLevel,
    ball_cost: input.betAmount,
    result_multiplier: multiplier,
    payout_cr: payout,
    bucket_index: clampedIdx,
  });

  if (config.announceBigWins && payout >= config.bigWinThreshold) {
    const { data: prof } = await admin.from("profiles").select("username").eq("id", user.id).single();
    const username = (prof?.username as string) ?? "Jemand";
    void admin.from("global_chat_messages").insert({
      username: "System",
      role: "system",
      content: `🎰 ${username} hat beim Plinko ${payout.toLocaleString("de-DE")} Credits gewonnen! (${multiplier}x · ${riskDef.label} · Einsatz: ${input.betAmount.toLocaleString("de-DE")} CR)`,
      is_system: true,
      metadata: { type: "plinko_win", payout, multiplier, riskLevel: input.riskLevel, betAmount: input.betAmount },
    });
  }

  // Award XP per drop (fire-and-forget)
  try {
    const { awardXp, getXpConfig } = await import("@/lib/actions/level-system");
    const xpCfg = await getXpConfig();
    void awardXp(user.id, xpCfg.sources.plinko_per_drop ?? 5, "plinko_drop", `${multiplier}x · ${input.riskLevel}`);
  } catch { /* non-fatal */ }

  try {
    const { incrementBpQuestProgress } = await import("@/lib/actions/bp-quests");
    void incrementBpQuestProgress(user.id, "plinko_play", 1);
  } catch { /* non-fatal */ }

  try {
    const { incrementDailyQuestProgress } = await import("@/lib/actions/daily-quests");
    void incrementDailyQuestProgress("plinko_play", 1);
  } catch { /* non-fatal */ }

  return { success: true, bucketIndex: clampedIdx, multiplier, payout, newCredits, path };
}

export async function updatePlinkoConfig(cfg: PlinkoConfig): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Admin." };

  const { error } = await admin.from("plinko_config").upsert({
    id: "default",
    enabled: cfg.enabled,
    hourly_ball_limit: cfg.hourlyBallLimit,
    daily_ball_limit: cfg.dailyBallLimit,
    min_bet_cr: cfg.minBetCr,
    max_bet_cr: cfg.maxBetCr,
    quick_bet_amounts: cfg.quickBetAmounts,
    ball_cost_cr: cfg.minBetCr,
    rows: cfg.rows,
    risk_levels: cfg.riskLevels,
    max_win_cr: cfg.maxWinCr,
    announce_big_wins: cfg.announceBigWins,
    big_win_threshold: cfg.bigWinThreshold,
    show_history: cfg.showHistory,
    show_leaderboard: cfg.showLeaderboard,
    leaderboard_size: cfg.leaderboardSize,
    particles_enabled: cfg.particlesEnabled,
    trail_length: cfg.trailLength,
    glow_intensity: cfg.glowIntensity,
    animation_speed: cfg.animationSpeed,
    auto_bet_enabled: cfg.autoBetEnabled,
    updated_at: new Date().toISOString(),
  });
  if (error) return { success: false, error: error.message };
  await broadcastLive("plinko-config-live");
  revalidatePath("/plinko");
  revalidatePath("/admin");
  return { success: true };
}
