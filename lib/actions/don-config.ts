"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { DEFAULT_DON_CONFIG, type DonConfig } from "@/lib/don-config";

interface DonConfigRow {
  enabled: boolean | null;
  daily_flip_limit: number | null;
  cooldown_sec: number | null;
  win_chance: number | null;
  min_bet: number | null;
  max_bet: number | null;
  quick_amounts: number[] | null;
  section_title: string | null;
  section_subtitle: string | null;
  show_remaining_spins: boolean | null;
}

export async function getDonConfig(): Promise<DonConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("don_config")
    .select("enabled, daily_flip_limit, cooldown_sec, win_chance, min_bet, max_bet, quick_amounts, section_title, section_subtitle, show_remaining_spins")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return DEFAULT_DON_CONFIG;
  const row = data as DonConfigRow;
  const def = DEFAULT_DON_CONFIG;
  return {
    enabled: row.enabled ?? def.enabled,
    dailyFlipLimit: typeof row.daily_flip_limit === "number" ? Math.max(1, row.daily_flip_limit) : def.dailyFlipLimit,
    cooldownSec: typeof row.cooldown_sec === "number" ? Math.max(0, row.cooldown_sec) : def.cooldownSec,
    winChance: typeof row.win_chance === "number" ? Math.min(1, Math.max(0, row.win_chance)) : def.winChance,
    minBet: typeof row.min_bet === "number" ? Math.max(1, row.min_bet) : def.minBet,
    maxBet: typeof row.max_bet === "number" ? row.max_bet : def.maxBet,
    quickAmounts: Array.isArray(row.quick_amounts) && row.quick_amounts.length > 0
      ? row.quick_amounts
      : def.quickAmounts,
    sectionTitle: row.section_title?.trim() || def.sectionTitle,
    sectionSubtitle: row.section_subtitle?.trim() || def.sectionSubtitle,
    showRemainingSpins: row.show_remaining_spins ?? def.showRemainingSpins,
  };
}

export async function updateDonConfig(
  input: DonConfig
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("don_config").upsert({
    id: "default",
    enabled: input.enabled,
    daily_flip_limit: Math.max(1, Math.round(input.dailyFlipLimit)),
    cooldown_sec: Math.max(0, Math.round(input.cooldownSec)),
    win_chance: Math.min(1, Math.max(0, input.winChance)),
    min_bet: Math.max(1, Math.round(input.minBet)),
    max_bet: input.maxBet !== null ? Math.max(1, Math.round(input.maxBet)) : null,
    quick_amounts: (input.quickAmounts ?? []).filter((n) => Number.isFinite(n) && n > 0),
    section_title: input.sectionTitle?.trim() || DEFAULT_DON_CONFIG.sectionTitle,
    section_subtitle: input.sectionSubtitle?.trim() || DEFAULT_DON_CONFIG.sectionSubtitle,
    show_remaining_spins: input.showRemainingSpins,
    updated_at: new Date().toISOString(),
  });

  if (error) return { success: false, error: "Speichern fehlgeschlagen — ist die don_config-Tabelle angelegt?" };
  revalidatePath("/");
  revalidatePath("/", "layout");
  return { success: true };
}

/** How many times has this user flipped today (UTC)? For display purposes. */
export async function getFlipsToday(userId: string): Promise<number> {
  const admin = createAdminClient();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "double_or_nothing")
    .gte("created_at", todayStart.toISOString());
  return count ?? 0;
}
