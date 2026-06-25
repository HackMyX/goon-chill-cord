"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { logDebugEvent } from "@/lib/debug-log-server";
import { DEFAULT_PLINKO_CONFIG, type PlinkoConfig, type PlinkoRiskLevel } from "@/lib/plinko-types";
export type { PlinkoConfig, PlinkoRiskLevel } from "@/lib/plinko-types";

export async function getPlinkoConfig(): Promise<PlinkoConfig> {
  const admin = createAdminClient();
  const { data } = await admin.from("plinko_config").select("*").eq("id", "default").maybeSingle();
  if (!data) return DEFAULT_PLINKO_CONFIG;
  const d = data as Record<string, unknown>;
  return {
    enabled: (d.enabled as boolean) ?? true,
    hourlyBallLimit: (d.hourly_ball_limit as number) ?? 20,
    dailyBallLimit: (d.daily_ball_limit as number) ?? 0,
    ballCostCr: (d.ball_cost_cr as number) ?? 100,
    rows: (d.rows as number) ?? 8,
    riskLevels: (d.risk_levels as PlinkoRiskLevel[]) ?? DEFAULT_PLINKO_CONFIG.riskLevels,
    maxWinCr: (d.max_win_cr as number) ?? 0,
    announceBigWins: (d.announce_big_wins as boolean) ?? true,
    bigWinThreshold: (d.big_win_threshold as number) ?? 1000,
    showHistory: (d.show_history as boolean) ?? true,
    showLeaderboard: (d.show_leaderboard as boolean) ?? true,
    leaderboardSize: (d.leaderboard_size as number) ?? 10,
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
  username: string;
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
    .select("id, username, avatar_url")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  return data.map((r) => {
    const prof = profileMap.get(r.user_id as string);
    return {
      username: (prof?.username as string) ?? "Anonym",
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

  // Hourly limit check
  const usedHour = await getMyPlinkoUsageThisHour(user.id);
  if (usedHour >= config.hourlyBallLimit) {
    return { success: false, error: `Stündliches Limit erreicht (${config.hourlyBallLimit} Bälle/h).` };
  }

  // Daily limit check (0 = disabled)
  if (config.dailyBallLimit > 0) {
    const usedToday = await getMyPlinkoUsageToday(user.id);
    if (usedToday >= config.dailyBallLimit) {
      return { success: false, error: `Tägliches Limit erreicht (${config.dailyBallLimit} Bälle/Tag).` };
    }
  }

  // Check credits
  const { data: profile } = await admin.from("profiles").select("credits").eq("id", user.id).single();
  const currentCredits: number = (profile?.credits as number) ?? 0;
  if (currentCredits < config.ballCostCr) {
    return { success: false, error: `Nicht genug Credits (benötigt: ${config.ballCostCr} CR).` };
  }

  // Simulate ball path
  const rows = config.rows;
  const path: number[] = [0];
  let pos = 0;
  for (let r = 0; r < rows; r++) {
    const goRight = Math.random() < 0.5 ? 1 : 0;
    pos += goRight;
    path.push(pos);
  }
  const bucketIndex = pos;
  const multipliers = riskDef.multipliers;
  const bucketCount = multipliers.length;
  const clampedIdx = Math.min(bucketIndex, bucketCount - 1);
  const multiplier = multipliers[clampedIdx];

  let payout = Math.floor(config.ballCostCr * multiplier);
  if (config.maxWinCr > 0) payout = Math.min(payout, config.maxWinCr);

  const netChange = payout - config.ballCostCr;
  const newCredits = Math.max(0, currentCredits + netChange);

  await admin.from("profiles").update({ credits: newCredits }).eq("id", user.id);
  await admin.from("plinko_plays").insert({
    user_id: user.id,
    risk_level: input.riskLevel,
    ball_cost: config.ballCostCr,
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
      content: `🎰 ${username} hat beim Plinko ${payout.toLocaleString("de-DE")} Credits gewonnen! (${multiplier}x · ${riskDef.label})`,
      is_system: true,
      metadata: { type: "plinko_win", payout, multiplier, riskLevel: input.riskLevel },
    });
  }

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
    ball_cost_cr: cfg.ballCostCr,
    rows: cfg.rows,
    risk_levels: cfg.riskLevels,
    max_win_cr: cfg.maxWinCr,
    announce_big_wins: cfg.announceBigWins,
    big_win_threshold: cfg.bigWinThreshold,
    show_history: cfg.showHistory,
    show_leaderboard: cfg.showLeaderboard,
    leaderboard_size: cfg.leaderboardSize,
    updated_at: new Date().toISOString(),
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/plinko");
  revalidatePath("/admin");
  return { success: true };
}
