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
}

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
    await createAdminClient().from("audit_logs").insert({
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
