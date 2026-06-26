"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";

export async function getMyPrioBadges(): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("prio_badges")
    .eq("id", user.id)
    .single();

  return (data?.prio_badges as string[] | null) ?? [];
}

export async function setMyPrioBadges(
  keys: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const admin = createAdminClient();

  // Fetch max_prio_badges from site_config
  const { data: cfgRow } = await admin
    .from("site_config")
    .select("max_prio_badges")
    .limit(1)
    .maybeSingle();
  const maxSlots: number = (cfgRow?.max_prio_badges as number | null) ?? 2;

  // Validate count
  if (keys.length > maxSlots) {
    return { success: false, error: `Maximal ${maxSlots} Prio-Badges erlaubt.` };
  }

  // Validate that user actually owns all selected badges
  const { data: ownedRows } = await admin
    .from("user_badges")
    .select("badge_key")
    .eq("user_id", user.id);

  const owned = new Set((ownedRows ?? []).map((r) => (r as { badge_key: string }).badge_key));
  const invalid = keys.filter((k) => !owned.has(k));
  if (invalid.length > 0) {
    void logDebugEvent({ level: "warn", scope: "prio-badges:set", message: "Ungültige Badge-Keys", context: { userId: user.id, invalid } });
    return { success: false, error: `Du besitzt diese Badges nicht: ${invalid.join(", ")}` };
  }

  const { error } = await admin
    .from("profiles")
    .update({ prio_badges: keys })
    .eq("id", user.id);

  if (error) {
    void logDebugEvent({ level: "error", scope: "prio-badges:set", message: "DB-Fehler beim Speichern", context: { userId: user.id, error: error.message } });
    return { success: false, error: "Speichern fehlgeschlagen." };
  }

  void logActivity("wardrobe:prio-badges:set", `Prio-Badges gesetzt für ${user.id}`, { userId: user.id, keys });
  revalidatePath("/garderobe");
  return { success: true };
}
