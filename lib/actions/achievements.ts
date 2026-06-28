"use server";

import { createClient } from "@/lib/supabase/server";
import { computeAchievements, type AchievementProgress, type AchStat } from "@/lib/achievements";

/** Compute the signed-in player's achievements from their live stats (level,
 *  xp, cases opened, streak, credits, inventory size). No achievements table —
 *  everything is derived, so it's always consistent with the real numbers. */
export async function getMyAchievements(): Promise<AchievementProgress[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("level, xp, cases_opened, streak_days, credits")
    .eq("id", user.id)
    .single();

  const { count: invCount } = await supabase
    .from("inventory")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const p = (profile ?? {}) as Record<string, unknown>;
  const stats: Record<AchStat, number> = {
    level: (p.level as number) ?? 0,
    xp: (p.xp as number) ?? 0,
    cases_opened: (p.cases_opened as number) ?? 0,
    streak_days: (p.streak_days as number) ?? 0,
    credits: (p.credits as number) ?? 0,
    inventory: invCount ?? 0,
  };

  return computeAchievements(stats);
}
