"use server";

import { revalidatePath } from "next/cache";
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
}

export async function flipDouble(amount: number): Promise<FlipResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Ungültiger Einsatz." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const [{ data: profile, error: profileError }, { currencyName }, config] = await Promise.all([
    supabase.from("profiles").select("credits").eq("id", user.id).single(),
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
  try {
    const todayStart2 = new Date();
    todayStart2.setUTCHours(0, 0, 0, 0);
    const { count: usedAfter } = await adminClient
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action", "double_or_nothing")
      .gte("created_at", todayStart2.toISOString());

    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action: "double_or_nothing",
      payload: { stake, won, newCredits: updatedRows[0].credits },
    });
    remainingFlips = Math.max(0, config.dailyFlipLimit - ((usedAfter ?? 0) + 1));
  } catch {
    // logging failed — ignore
  }

  revalidatePath("/");

  await notifyUser({
    userId: user.id,
    type: "double_or_nothing",
    title: won ? "Double or Nothing gewonnen!" : "Double or Nothing verloren",
    message: won
      ? `Du hast deinen Einsatz von ${stake.toLocaleString("de-DE")} ${currencyName} verdoppelt!`
      : `Du hast deinen Einsatz von ${stake.toLocaleString("de-DE")} ${currencyName} verloren.`,
    link: "/",
  });

  return { success: true, won, amount: stake, newCredits: updatedRows[0].credits, remainingFlips };
}
