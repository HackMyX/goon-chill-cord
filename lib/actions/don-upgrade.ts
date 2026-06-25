"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDonConfig } from "@/lib/actions/don-config";
import { getSiteConfig } from "@/lib/actions/site-config";

export interface DonUpgradeResult {
  success: boolean;
  error?: string;
  newTier?: number;
  newCredits?: number;
}

/** Buy a DON hourly-flip upgrade tier. Tiers are cumulative — buying tier 3
 *  while on tier 1 charges the full tier-3 price (not the delta). */
export async function purchaseDonUpgrade(targetTier: number): Promise<DonUpgradeResult> {
  if (!Number.isInteger(targetTier) || targetTier < 1) {
    return { success: false, error: "Ungültige Upgrade-Stufe." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const [config, { currencyName }] = await Promise.all([
    getDonConfig(),
    getSiteConfig(),
  ]);

  if (!config.upgradeEnabled) {
    return { success: false, error: "Upgrades sind derzeit deaktiviert." };
  }

  const tierDef = config.upgradeTiers.find((t) => t.tier === targetTier);
  if (!tierDef) return { success: false, error: "Diese Upgrade-Stufe existiert nicht." };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("credits, don_upgrade_tier")
    .eq("id", user.id)
    .single();

  if (!profile) return { success: false, error: "Profil nicht gefunden." };

  const currentTier = profile.don_upgrade_tier ?? 0;
  if (currentTier >= targetTier) {
    return { success: false, error: "Du hast diese Stufe bereits." };
  }

  // Cost = full price of target tier (not incremental)
  const cost = tierDef.costCr;
  if (profile.credits < cost) {
    return {
      success: false,
      error: `Nicht genug ${currencyName}. Du benötigst ${cost.toLocaleString("de-DE")} ${currencyName}.`,
    };
  }

  const newCredits = profile.credits - cost;

  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update({ credits: newCredits, don_upgrade_tier: targetTier })
    .eq("id", user.id)
    .gte("credits", cost)
    .select("credits, don_upgrade_tier");

  if (updateError || !updated || updated.length === 0) {
    return { success: false, error: `Nicht genug ${currencyName}.` };
  }

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "don_upgrade_purchase",
      payload: { targetTier, cost, newCredits },
    });
  } catch {
    // logging optional
  }

  revalidatePath("/don");
  return { success: true, newTier: targetTier, newCredits: updated[0].credits };
}

/** Get user's current DON upgrade tier. */
export async function getDonUpgradeTier(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data } = await supabase
    .from("profiles")
    .select("don_upgrade_tier")
    .eq("id", user.id)
    .single();

  return (data?.don_upgrade_tier as number | null) ?? 0;
}
