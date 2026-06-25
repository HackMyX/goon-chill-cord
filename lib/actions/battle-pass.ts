"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { getSiteConfig } from "@/lib/actions/site-config";
import { logDebugEvent } from "@/lib/debug-log-server";
import type { BattlePass, BattlePassTier, UserBpStatus, ActiveBpView, BpRewardType } from "@/lib/battle-pass";

// ── helpers ────────────────────────────────────────────────────────────────

function rowToTier(r: Record<string, unknown>): BattlePassTier {
  return {
    id: r.id as string,
    passId: r.pass_id as string,
    tierNumber: r.tier_number as number,
    name: r.name as string,
    isPremium: r.is_premium as boolean,
    rewardType: r.reward_type as BpRewardType,
    rewardCredits: r.reward_credits as number | null,
    rewardItemId: r.reward_item_id as string | null,
    rewardBadgeKey: r.reward_badge_key as string | null,
    icon: r.icon as string,
  };
}

function rowToPass(r: Record<string, unknown>, tiers: BattlePassTier[]): BattlePass {
  return {
    id: r.id as string,
    name: r.name as string,
    seasonLabel: r.season_label as string,
    description: r.description as string | null,
    priceCr: r.price_cr as number,
    enabled: r.enabled as boolean,
    isActive: r.is_active as boolean,
    startDate: r.start_date as string | null,
    endDate: r.end_date as string | null,
    tierCount: r.tier_count as number,
    spinChanceBoost: r.spin_chance_boost as number,
    bannerColor: r.banner_color as string,
    tiers,
    createdAt: r.created_at as string,
  };
}

// ── user-facing ─────────────────────────────────────────────────────────────

/** Returns the currently active pass + the logged-in user's status (null if not logged in). */
export async function getActiveBattlePass(): Promise<ActiveBpView | null> {
  const admin = createAdminClient();

  const { data: passRow } = await admin
    .from("battle_passes")
    .select("*")
    .eq("is_active", true)
    .eq("enabled", true)
    .maybeSingle();

  if (!passRow) return null;

  const { data: tierRows } = await admin
    .from("battle_pass_tiers")
    .select("*")
    .eq("pass_id", passRow.id)
    .order("tier_number", { ascending: true });

  const tiers = (tierRows ?? []).map((r) => rowToTier(r as Record<string, unknown>));
  const pass = rowToPass(passRow as Record<string, unknown>, tiers);

  // User status
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { pass, userStatus: null };

  const [{ data: ubpRow }, { data: claimRows }] = await Promise.all([
    admin
      .from("user_battle_passes")
      .select("has_premium, progress_days")
      .eq("user_id", user.id)
      .eq("pass_id", pass.id)
      .maybeSingle(),
    admin
      .from("user_bp_tier_claims")
      .select("tier_id")
      .eq("user_id", user.id)
      .eq("pass_id", pass.id),
  ]);

  const userStatus: UserBpStatus = {
    passId: pass.id,
    hasPremium: ubpRow?.has_premium ?? false,
    progressDays: ubpRow?.progress_days ?? 0,
    claimedTierIds: (claimRows ?? []).map((r) => r.tier_id as string),
  };

  return { pass, userStatus };
}

/** Purchase the premium pass. Deducts CR, creates/updates user_battle_passes row. */
export async function purchaseBattlePass(passId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();
  const [{ data: passRow }, { data: profile }, { currencyName }] = await Promise.all([
    admin.from("battle_passes").select("id, price_cr, enabled, is_active").eq("id", passId).single(),
    admin.from("profiles").select("credits").eq("id", user.id).single(),
    getSiteConfig(),
  ]);

  if (!passRow || !passRow.enabled || !passRow.is_active) {
    return { success: false, error: "Dieser Pass ist nicht verfügbar." };
  }
  if (!profile) return { success: false, error: "Profil nicht gefunden." };
  if (profile.credits < passRow.price_cr) {
    return { success: false, error: `Nicht genug ${currencyName}. Benötigt: ${passRow.price_cr.toLocaleString("de-DE")} ${currencyName}.` };
  }

  // Check if already purchased
  const { data: existing } = await admin
    .from("user_battle_passes")
    .select("id, has_premium")
    .eq("user_id", user.id)
    .eq("pass_id", passId)
    .maybeSingle();

  if (existing?.has_premium) {
    return { success: false, error: "Du hast diesen Pass bereits." };
  }

  const newCredits = profile.credits - passRow.price_cr;

  const { error: creditError } = await admin
    .from("profiles")
    .update({ credits: newCredits })
    .eq("id", user.id)
    .gte("credits", passRow.price_cr);

  if (creditError) return { success: false, error: `Nicht genug ${currencyName}.` };

  if (existing) {
    await admin
      .from("user_battle_passes")
      .update({ has_premium: true, purchased_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await admin.from("user_battle_passes").insert({
      user_id: user.id,
      pass_id: passId,
      has_premium: true,
      progress_days: 0,
      purchased_at: new Date().toISOString(),
    });
  }

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "battle_pass_purchase",
      payload: { passId, cost: passRow.price_cr, newCredits },
    });
  } catch { /* ignore */ }

  revalidatePath("/battlepass");
  revalidatePath("/");
  return { success: true };
}

/** Claim a tier reward (if eligible). */
export async function claimBpTier(tierId: string): Promise<{ success: boolean; error?: string; reward?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();

  const { data: tier } = await admin
    .from("battle_pass_tiers")
    .select("*, battle_passes(id, is_active, enabled)")
    .eq("id", tierId)
    .single();

  if (!tier) return { success: false, error: "Tier nicht gefunden." };

  const pass = (tier as Record<string, unknown>).battle_passes as Record<string, unknown> | null;
  if (!pass?.is_active || !pass?.enabled) {
    return { success: false, error: "Dieser Pass ist nicht aktiv." };
  }

  const passId = pass.id as string;

  // Check if already claimed
  const { data: existing } = await admin
    .from("user_bp_tier_claims")
    .select("id")
    .eq("user_id", user.id)
    .eq("tier_id", tierId)
    .maybeSingle();
  if (existing) return { success: false, error: "Bereits abgeholt." };

  // Get user's pass status
  const { data: ubp } = await admin
    .from("user_battle_passes")
    .select("has_premium, progress_days")
    .eq("user_id", user.id)
    .eq("pass_id", passId)
    .maybeSingle();

  const progressDays = ubp?.progress_days ?? 0;
  const hasPremium = ubp?.has_premium ?? false;
  const tierNum = (tier as Record<string, unknown>).tier_number as number;
  const isPremium = (tier as Record<string, unknown>).is_premium as boolean;

  if (progressDays < tierNum) {
    return { success: false, error: `Noch nicht freigeschaltet — du brauchst ${tierNum} Login-Tage.` };
  }
  if (isPremium && !hasPremium) {
    return { success: false, error: "Nur für Premium-Pass-Inhaber." };
  }

  // Grant reward
  const rewardType = (tier as Record<string, unknown>).reward_type as string;
  let rewardMsg = "";

  if (rewardType === "credits") {
    const amount = ((tier as Record<string, unknown>).reward_credits as number | null) ?? 0;
    if (amount > 0) {
      const { data: prof } = await admin.from("profiles").select("credits").eq("id", user.id).single();
      if (prof) {
        await admin.from("profiles").update({ credits: (prof.credits as number) + amount }).eq("id", user.id);
      }
      rewardMsg = `+${amount.toLocaleString("de-DE")} Credits`;
    }
  }

  // Record claim
  await admin.from("user_bp_tier_claims").insert({
    user_id: user.id,
    pass_id: passId,
    tier_id: tierId,
  });

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "battle_pass_tier_claim",
      payload: { tierId, passId, tierNum, rewardType, rewardMsg },
    });
  } catch { /* ignore */ }

  revalidatePath("/battlepass");
  revalidatePath("/");
  return { success: true, reward: rewardMsg };
}

/** Called by the daily-streak claim to advance the user's battlepass progress. */
export async function advanceBattlePassProgress(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: passRow } = await admin
      .from("battle_passes")
      .select("id, tier_count")
      .eq("is_active", true)
      .eq("enabled", true)
      .maybeSingle();

    if (!passRow) return;

    const { data: existing } = await admin
      .from("user_battle_passes")
      .select("id, progress_days")
      .eq("user_id", userId)
      .eq("pass_id", passRow.id)
      .maybeSingle();

    if (existing) {
      if ((existing.progress_days as number) < (passRow.tier_count as number)) {
        await admin
          .from("user_battle_passes")
          .update({ progress_days: (existing.progress_days as number) + 1 })
          .eq("id", existing.id);
      }
    } else {
      await admin.from("user_battle_passes").insert({
        user_id: userId,
        pass_id: passRow.id,
        has_premium: false,
        progress_days: 1,
      });
    }
  } catch {
    // Never block the streak claim
  }
}

/** Check if the logged-in user has an active premium pass (for spin-boost). */
export async function getUserBattlePassBoost(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const admin = createAdminClient();
    const { data: passRow } = await admin
      .from("battle_passes")
      .select("id, spin_chance_boost")
      .eq("is_active", true)
      .eq("enabled", true)
      .maybeSingle();

    if (!passRow) return 0;

    const { data: ubp } = await admin
      .from("user_battle_passes")
      .select("has_premium")
      .eq("user_id", user.id)
      .eq("pass_id", passRow.id)
      .maybeSingle();

    return ubp?.has_premium ? (passRow.spin_chance_boost as number) : 0;
  } catch {
    return 0;
  }
}

// ── admin CRUD ───────────────────────────────────────────────────────────────

async function requireAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return null;
  return user;
}

export async function adminListBattlePasses(): Promise<BattlePass[]> {
  const admin = createAdminClient();
  const { data: passes, error } = await admin
    .from("battle_passes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    // Table likely doesn't exist yet — return empty, migration banner will show
    return [];
  }
  if (!passes) return [];

  const passIds = passes.map((p) => p.id as string);
  const { data: allTiers } = await admin
    .from("battle_pass_tiers")
    .select("*")
    .in("pass_id", passIds.length > 0 ? passIds : ["__none__"])
    .order("tier_number", { ascending: true });

  return passes.map((p) => {
    const tiers = (allTiers ?? [])
      .filter((t) => t.pass_id === p.id)
      .map((t) => rowToTier(t as Record<string, unknown>));
    return rowToPass(p as Record<string, unknown>, tiers);
  });
}

export async function checkBattlePassMigration(): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("battle_passes").select("id").limit(0);
  return !!error; // true = migration needed
}

export interface AdminPassInput {
  name: string;
  seasonLabel: string;
  description: string;
  priceCr: number;
  enabled: boolean;
  startDate: string | null;
  endDate: string | null;
  tierCount: number;
  spinChanceBoost: number;
  bannerColor: string;
}

export async function adminCreateBattlePass(
  input: AdminPassInput
): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await requireAdminUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("battle_passes")
    .insert({
      name: input.name.trim(),
      season_label: input.seasonLabel.trim(),
      description: input.description.trim() || null,
      price_cr: Math.max(0, Math.round(input.priceCr)),
      enabled: input.enabled,
      is_active: false,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      tier_count: Math.max(1, Math.min(30, Math.round(input.tierCount))),
      spin_chance_boost: Math.min(0.5, Math.max(0, input.spinChanceBoost)),
      banner_color: input.bannerColor || "#7c3aed",
    })
    .select("id")
    .single();

  if (error || !data) {
    void logDebugEvent({ scope: "adminCreateBattlePass", message: "Battlepass-Erstellung fehlgeschlagen", level: "error", detail: error?.message, context: { code: error?.code, hint: error?.hint } });
    return { success: false, error: error?.message ? `DB-Fehler: ${error.message}` : "Erstellen fehlgeschlagen — Tabellen fehlen möglicherweise (Migration ausführen)." };
  }
  revalidatePath("/admin");
  return { success: true, id: data.id as string };
}

export async function adminUpdateBattlePass(
  id: string,
  input: AdminPassInput
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("battle_passes")
    .update({
      name: input.name.trim(),
      season_label: input.seasonLabel.trim(),
      description: input.description.trim() || null,
      price_cr: Math.max(0, Math.round(input.priceCr)),
      enabled: input.enabled,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      tier_count: Math.max(1, Math.min(30, Math.round(input.tierCount))),
      spin_chance_boost: Math.min(0.5, Math.max(0, input.spinChanceBoost)),
      banner_color: input.bannerColor || "#7c3aed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { success: false, error: "Speichern fehlgeschlagen." };
  revalidatePath("/admin");
  revalidatePath("/battlepass");
  return { success: true };
}

export async function adminDeleteBattlePass(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("battle_passes").delete().eq("id", id);
  if (error) return { success: false, error: "Löschen fehlgeschlagen." };
  revalidatePath("/admin");
  return { success: true };
}

/** Activate a pass (deactivates all others first). */
export async function adminSetPassActive(
  id: string,
  active: boolean
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  if (active) {
    // Deactivate all others
    await admin.from("battle_passes").update({ is_active: false }).neq("id", id);
  }
  const { error } = await admin
    .from("battle_passes")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { success: false, error: "Fehler beim Aktivieren." };
  revalidatePath("/admin");
  revalidatePath("/battlepass");
  return { success: true };
}

export interface AdminTierInput {
  tierNumber: number;
  name: string;
  isPremium: boolean;
  rewardType: BpRewardType;
  rewardCredits: number | null;
  icon: string;
}

export async function adminUpsertBpTier(
  passId: string,
  input: AdminTierInput
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("battle_pass_tiers")
    .upsert({
      pass_id: passId,
      tier_number: input.tierNumber,
      name: input.name.trim(),
      is_premium: input.isPremium,
      reward_type: input.rewardType,
      reward_credits: input.rewardType === "credits" ? (input.rewardCredits ?? 100) : null,
      reward_item_id: null,
      reward_badge_key: null,
      icon: input.icon.trim() || "🎁",
    }, { onConflict: "pass_id,tier_number" });

  if (error) return { success: false, error: "Tier speichern fehlgeschlagen." };
  revalidatePath("/admin");
  revalidatePath("/battlepass");
  return { success: true };
}
