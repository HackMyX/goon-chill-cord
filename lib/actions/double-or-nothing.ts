"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications-internal";
import { getSiteConfig } from "@/lib/actions/site-config";
import { getDonConfig } from "@/lib/actions/don-config";

export interface FlipResult {
  success: boolean;
  error?: string;
  won?: boolean;
  amount?: number;
  newCredits?: number;
  /** Seconds remaining in the cooldown. */
  cooldownRemaining?: number;
  /** How many flips remain today after this one. */
  remainingFlips?: number;
  /** How many flips remain in the current hour after this one. */
  remainingHourlyFlips?: number;
}

export async function flipDouble(amount: number): Promise<FlipResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Ungültiger Einsatz." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const [{ data: profile, error: profileError }, { currencyName }, config] = await Promise.all([
    supabase.from("profiles").select("credits, don_upgrade_tier").eq("id", user.id).single(),
    getSiteConfig(),
    getDonConfig(),
  ]);

  if (profileError || !profile) return { success: false, error: "Profil konnte nicht geladen werden." };

  if (!config.enabled) return { success: false, error: "Double or Nothing ist derzeit deaktiviert." };

  const adminClient = createAdminClient();

  // --- Anti-exploit: cooldown + daily flip limit ---
  try {
    if (config.cooldownSec > 0) {
      const { data: lastFlip } = await adminClient
        .from("audit_logs")
        .select("created_at")
        .eq("user_id", user.id)
        .eq("action", "double_or_nothing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastFlip) {
        const elapsedSec = (Date.now() - new Date(lastFlip.created_at).getTime()) / 1000;
        if (elapsedSec < config.cooldownSec) {
          const remaining = Math.ceil(config.cooldownSec - elapsedSec);
          return {
            success: false,
            error: `Bitte warte noch ${remaining}s vor dem nächsten Flip.`,
            cooldownRemaining: remaining,
          };
        }
      }
    }

    // Hourly limit check — base limit + bonus from user's upgrade tier
    if (config.hourlyFlipLimit !== null) {
      const userUpgradeTier = (profile as { don_upgrade_tier?: number }).don_upgrade_tier ?? 0;
      let bonusFlips = 0;
      if (config.upgradeEnabled && userUpgradeTier > 0) {
        const tierDef = config.upgradeTiers.find((t) => t.tier === userUpgradeTier);
        bonusFlips = tierDef?.bonusHourlyFlips ?? 0;
      }
      const effectiveHourlyLimit = config.hourlyFlipLimit + bonusFlips;

      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const { count: hourFlips } = await adminClient
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("action", "double_or_nothing")
        .gte("created_at", hourAgo.toISOString());
      if ((hourFlips ?? 0) >= effectiveHourlyLimit) {
        return {
          success: false,
          error: `Stundenlimit von ${effectiveHourlyLimit} Flips erreicht. Bitte warte etwas!`,
          remainingHourlyFlips: 0,
        };
      }
    }

    if (config.dailyFlipLimit !== null) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { count: todayFlips } = await adminClient
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("action", "double_or_nothing")
        .gte("created_at", todayStart.toISOString());

      if ((todayFlips ?? 0) >= config.dailyFlipLimit) {
        return {
          success: false,
          error: `Tageslimit von ${config.dailyFlipLimit} Flips erreicht. Komm morgen wieder!`,
          remainingFlips: 0,
        };
      }
    }
  } catch {
    // audit_logs unavailable — skip limits.
  }

  // --- Clamp stake to config limits ---
  let stake = Math.floor(amount);
  if (stake < config.minBet) stake = config.minBet;
  if (config.maxBet !== null && stake > config.maxBet) stake = config.maxBet;
  stake = Math.min(stake, profile.credits);

  if (stake <= 0) return { success: false, error: `Nicht genug ${currencyName}.` };

  const won = Math.random() < config.winChance;
  const delta = won ? stake : -stake;
  const newCredits = profile.credits + delta;

  const { data: updatedRows, error: updateError } = await supabase
    .from("profiles")
    .update({ credits: newCredits })
    .eq("id", user.id)
    .gte("credits", stake)
    .select("credits");

  if (updateError || !updatedRows || updatedRows.length === 0) {
    return { success: false, error: `Nicht genug ${currencyName}.` };
  }

  let remainingFlips: number | undefined;
  let remainingHourlyFlips: number | undefined;
  try {
    const todayStart2 = new Date();
    todayStart2.setUTCHours(0, 0, 0, 0);
    const hourAgo2 = new Date(Date.now() - 60 * 60 * 1000);
    const [{ count: usedAfter }, { count: usedHour }] = await Promise.all([
      adminClient
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("action", "double_or_nothing")
        .gte("created_at", todayStart2.toISOString()),
      config.hourlyFlipLimit !== null
        ? adminClient
            .from("audit_logs")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("action", "double_or_nothing")
            .gte("created_at", hourAgo2.toISOString())
        : Promise.resolve({ count: 0 }),
    ]);

    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action: "double_or_nothing",
      payload: { stake, won, newCredits: updatedRows[0].credits },
    });
    remainingFlips = config.dailyFlipLimit !== null ? Math.max(0, config.dailyFlipLimit - ((usedAfter ?? 0) + 1)) : undefined;
    if (config.hourlyFlipLimit !== null) {
      const userUpgradeTier2 = (profile as { don_upgrade_tier?: number }).don_upgrade_tier ?? 0;
      let bonusFlips2 = 0;
      if (config.upgradeEnabled && userUpgradeTier2 > 0) {
        const tierDef2 = config.upgradeTiers.find((t) => t.tier === userUpgradeTier2);
        bonusFlips2 = tierDef2?.bonusHourlyFlips ?? 0;
      }
      const effectiveHourlyLimit2 = config.hourlyFlipLimit + bonusFlips2;
      remainingHourlyFlips = Math.max(0, effectiveHourlyLimit2 - ((usedHour ?? 0) + 1));
    }
  } catch {
    // logging failed — ignore
  }

  await notifyUser({
    userId: user.id,
    type: "double_or_nothing",
    title: won ? "Double or Nothing gewonnen!" : "Double or Nothing verloren",
    message: won
      ? `Du hast deinen Einsatz von ${stake.toLocaleString("de-DE")} ${currencyName} verdoppelt!`
      : `Du hast deinen Einsatz von ${stake.toLocaleString("de-DE")} ${currencyName} verloren.`,
    link: "/",
  });

  // Award XP on win (fire-and-forget)
  if (won) {
    try {
      const { awardXp, getXpConfig } = await import("@/lib/actions/level-system");
      const xpCfg = await getXpConfig();
      void awardXp(user.id, xpCfg.sources.don_win ?? 20, "don_win", `Einsatz: ${stake.toLocaleString("de-DE")} CR`);
    } catch { /* non-fatal */ }
  }

  return { success: true, won, amount: stake, newCredits: updatedRows[0].credits, remainingFlips, remainingHourlyFlips };
}
