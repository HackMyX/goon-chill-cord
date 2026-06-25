"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { logDebugEvent } from "@/lib/debug-log-server";

export interface PlinkoRiskLevel {
  key: string;
  label: string;
  emoji: string;
  multipliers: number[];
}

export interface PlinkoConfig {
  enabled: boolean;
  hourlyBallLimit: number;
  ballCostCr: number;
  rows: number;
  riskLevels: PlinkoRiskLevel[];
  maxWinCr: number;
  announceBigWins: boolean;
  bigWinThreshold: number;
}

export const DEFAULT_PLINKO_CONFIG: PlinkoConfig = {
  enabled: true,
  hourlyBallLimit: 20,
  ballCostCr: 100,
  rows: 8,
  riskLevels: [
    { key: "low",    label: "Niedrig", emoji: "🟢", multipliers: [1.5, 1.3, 1.1, 0.9, 0.8, 0.9, 1.1, 1.3, 1.5] },
    { key: "medium", label: "Mittel",  emoji: "🟡", multipliers: [5,   2,   1.5, 0.8, 0.5, 0.8, 1.5, 2,   5  ] },
    { key: "high",   label: "Hoch",    emoji: "🔴", multipliers: [10,  3,   1.5, 0.5, 0.2, 0.5, 1.5, 3,   10 ] },
  ],
  maxWinCr: 0,
  announceBigWins: true,
  bigWinThreshold: 1000,
};

export async function getPlinkoConfig(): Promise<PlinkoConfig> {
  const admin = createAdminClient();
  const { data } = await admin.from("plinko_config").select("*").eq("id", "default").maybeSingle();
  if (!data) return DEFAULT_PLINKO_CONFIG;
  const d = data as Record<string, unknown>;
  return {
    enabled: (d.enabled as boolean) ?? true,
    hourlyBallLimit: (d.hourly_ball_limit as number) ?? 20,
    ballCostCr: (d.ball_cost_cr as number) ?? 100,
    rows: (d.rows as number) ?? 8,
    riskLevels: (d.risk_levels as PlinkoRiskLevel[]) ?? DEFAULT_PLINKO_CONFIG.riskLevels,
    maxWinCr: (d.max_win_cr as number) ?? 0,
    announceBigWins: (d.announce_big_wins as boolean) ?? true,
    bigWinThreshold: (d.big_win_threshold as number) ?? 1000,
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
  const used = await getMyPlinkoUsageThisHour(user.id);
  if (used >= config.hourlyBallLimit) {
    return { success: false, error: `Stündliches Limit erreicht (${config.hourlyBallLimit} Bälle/h).` };
  }

  // Check credits
  const { data: profile } = await admin.from("profiles").select("credits").eq("id", user.id).single();
  const currentCredits: number = (profile?.credits as number) ?? 0;
  if (currentCredits < config.ballCostCr) {
    return { success: false, error: `Nicht genug Credits (benötigt: ${config.ballCostCr} CR).` };
  }

  // Simulate ball path — pre-determined random walk
  const rows = config.rows;
  const path: number[] = [0]; // starting offset (relative column)
  let pos = 0;
  for (let r = 0; r < rows; r++) {
    const goRight = Math.random() < 0.5 ? 1 : 0;
    pos += goRight;
    path.push(pos);
  }
  const bucketIndex = pos; // 0 to rows (inclusive)
  const multipliers = riskDef.multipliers;
  const bucketCount = multipliers.length; // should be rows+1
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

  // Announce big wins in global chat
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
    ball_cost_cr: cfg.ballCostCr,
    rows: cfg.rows,
    risk_levels: cfg.riskLevels,
    max_win_cr: cfg.maxWinCr,
    announce_big_wins: cfg.announceBigWins,
    big_win_threshold: cfg.bigWinThreshold,
    updated_at: new Date().toISOString(),
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/plinko");
  revalidatePath("/admin");
  return { success: true };
}
