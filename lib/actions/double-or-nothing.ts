"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications-internal";
import { getSiteConfig } from "@/lib/actions/site-config";

export interface FlipResult {
  success: boolean;
  error?: string;
  won?: boolean;
  amount?: number;
  newCredits?: number;
  /** Seconds remaining in the cooldown (only set when rejected for cooldown). */
  cooldownRemaining?: number;
}

// Minimum seconds between two flips (server-enforced via audit_logs).
const COOLDOWN_SEC = 8;
// Maximum flips per calendar day (UTC) per user.
const DAILY_FLIP_LIMIT = 50;

export async function flipDouble(amount: number): Promise<FlipResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: "Ungültiger Einsatz." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Du musst eingeloggt sein." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, error: "Profil konnte nicht geladen werden." };
  }

  const { currencyName } = await getSiteConfig();
  const adminClient = createAdminClient();

  // --- Anti-exploit: cooldown + daily flip limit (via audit_logs) ---
  try {
    // 1. Cooldown: reject if last flip was less than COOLDOWN_SEC seconds ago
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
      if (elapsedSec < COOLDOWN_SEC) {
        const remaining = Math.ceil(COOLDOWN_SEC - elapsedSec);
        return {
          success: false,
          error: `Bitte warte noch ${remaining}s vor dem nächsten Flip.`,
          cooldownRemaining: remaining,
        };
      }
    }

    // 2. Daily flip limit: reject if player has already flipped DAILY_FLIP_LIMIT times today
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count: todayFlips } = await adminClient
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action", "double_or_nothing")
      .gte("created_at", todayStart.toISOString());

    if ((todayFlips ?? 0) >= DAILY_FLIP_LIMIT) {
      return {
        success: false,
        error: `Tageslimit von ${DAILY_FLIP_LIMIT} Flips erreicht. Komm morgen wieder!`,
      };
    }
  } catch {
    // audit_logs unavailable — allow the flip but skip limits to avoid blocking users.
  }

  // --- Execute the flip ---
  const stake = Math.min(Math.floor(amount), profile.credits);
  if (stake <= 0) {
    return { success: false, error: `Nicht genug ${currencyName}.` };
  }

  const won = Math.random() < 0.5;
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

  try {
    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action: "double_or_nothing",
      payload: { stake, won, newCredits: updatedRows[0].credits },
    });
  } catch {
    // audit_logs table may not exist yet — never let logging break the flow.
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

  return { success: true, won, amount: stake, newCredits: updatedRows[0].credits };
}
