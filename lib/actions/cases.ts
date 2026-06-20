"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findCaseTier, pickRarity } from "@/lib/cases";
import { getCaseConfig } from "@/lib/cases-config";

export interface WonItem {
  id: string;
  name: string;
  rarity: string;
  type: string;
  image_url: string | null;
}

export interface OpenCaseResult {
  success: boolean;
  error?: string;
  item?: WonItem;
  newCredits?: number;
}

export async function openCase(tierId: string): Promise<OpenCaseResult> {
  const caseGroups = await getCaseConfig();
  const found = findCaseTier(tierId, caseGroups);
  if (!found) {
    return { success: false, error: "Unbekanntes Case." };
  }
  const { group, tier } = found;

  if (tier.enabled === false) {
    return { success: false, error: "Dieses Case ist aktuell deaktiviert." };
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
    .select("credits, cases_opened")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, error: "Profil konnte nicht geladen werden." };
  }

  if (profile.credits < tier.price) {
    return { success: false, error: "Nicht genug Credits für dieses Case." };
  }

  const rolledRarity = pickRarity(tier.rarityWeights);
  // A tier's own item_types (set via the admin panel) takes precedence over
  // the parent group's default pool, so admins can scope a specific tier
  // (e.g. a future "Hut Case") to a subset of types.
  const itemTypes = tier.itemTypes ?? group.itemTypes;

  let { data: pool, error: poolError } = await supabase
    .from("items")
    .select("id, name, rarity, type, image_url")
    .eq("rarity", rolledRarity)
    .in("type", itemTypes)
    .limit(500);

  // Fallback: the exact rarity has no items yet (e.g. DB import still in
  // progress) — broaden to any rarity within this case's item pool instead
  // of failing the whole case open. The rolled rarity odds still apply
  // overall once the real catalogue is fully imported.
  if (!poolError && (!pool || pool.length === 0)) {
    const fallback = await supabase
      .from("items")
      .select("id, name, rarity, type, image_url")
      .in("type", itemTypes)
      .limit(500);
    pool = fallback.data;
    poolError = fallback.error;
  }

  if (poolError || !pool || pool.length === 0) {
    return {
      success: false,
      error: "Für dieses Case sind aktuell keine Items hinterlegt.",
    };
  }

  const wonItem = pool[Math.floor(Math.random() * pool.length)];
  const newCredits = profile.credits - tier.price;

  // Guard against a race where credits changed between the read above and
  // this write (e.g. a double click) by re-checking the balance atomically.
  const { data: updatedRows, error: updateError } = await supabase
    .from("profiles")
    .update({
      credits: newCredits,
      cases_opened: profile.cases_opened + 1,
    })
    .eq("id", user.id)
    .gte("credits", tier.price)
    .select("credits");

  if (updateError || !updatedRows || updatedRows.length === 0) {
    return { success: false, error: "Nicht genug Credits für dieses Case." };
  }

  const { error: inventoryError } = await supabase
    .from("inventory")
    .insert({ user_id: user.id, item_id: wonItem.id });

  if (inventoryError) {
    // Roll back the credit deduction since the item was never granted.
    await supabase
      .from("profiles")
      .update({ credits: profile.credits, cases_opened: profile.cases_opened })
      .eq("id", user.id);
    return { success: false, error: "Item konnte nicht vergeben werden." };
  }

  // Audit trail — best-effort via the service-role client (so a user can't
  // tamper with their own log) and never blocks/fails the case-open itself.
  try {
    await createAdminClient().from("audit_logs").insert({
      user_id: user.id,
      action: "case_open",
      payload: {
        tierId: tier.id,
        groupId: group.id,
        price: tier.price,
        wonItemId: wonItem.id,
        wonItemName: wonItem.name,
        rarity: wonItem.rarity,
        newCredits: updatedRows[0].credits,
      },
    });
  } catch {
    // audit_logs table may not exist yet — never let logging break the flow.
  }

  revalidatePath("/");

  return {
    success: true,
    item: wonItem,
    newCredits: updatedRows[0].credits,
  };
}
