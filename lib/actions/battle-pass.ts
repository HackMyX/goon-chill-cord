"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { getSiteConfig } from "@/lib/actions/site-config";
import { logDebugEvent } from "@/lib/debug-log-server";
import type { BattlePass, BattlePassTier, UserBpStatus, ActiveBpView, BpRewardType, BpTheme, BpShopPosition, BpShopBannerSize, BpAutoFillConfig } from "@/lib/battle-pass";
import type { Rarity } from "@/lib/cases";

// ── helpers ────────────────────────────────────────────────────────────────

function rowToTier(r: Record<string, unknown>): BattlePassTier {
  return {
    id: r.id as string,
    passId: r.pass_id as string,
    tierNumber: r.tier_number as number,
    name: r.name as string,
    isPremium: r.is_premium as boolean,
    isElite: (r.is_elite as boolean | null) ?? false,
    rewardType: r.reward_type as BpRewardType,
    rewardCredits: r.reward_credits as number | null,
    rewardItemId: r.reward_item_id as string | null,
    rewardBadgeKey: r.reward_badge_key as string | null,
    rewardBadgeText: r.reward_badge_text as string | null,
    rewardItemRarity: r.reward_item_rarity as Rarity | null,
    rewardXpBoost: r.reward_xp_boost as number | null,
    rewardNameStyleKey: r.reward_name_style_key as string | null,
    rewardQuantity: (r.reward_quantity as number | null) ?? 1,
    highlightTier: (r.highlight_tier as boolean | null) ?? false,
    description: r.description as string | null,
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
    elitePriceCr: (r.elite_price_cr as number | null) ?? 0,
    eliteEnabled: (r.elite_enabled as boolean | null) ?? false,
    enabled: r.enabled as boolean,
    isActive: r.is_active as boolean,
    startDate: r.start_date as string | null,
    endDate: r.end_date as string | null,
    tierCount: r.tier_count as number,
    spinChanceBoost: r.spin_chance_boost as number,
    bannerColor: r.banner_color as string,
    theme: (r.theme as BpTheme | null) ?? "default",
    accentColor: (r.accent_color as string | null) ?? "#7c3aed",
    bannerImageUrl: r.banner_image_url as string | null,
    showInShop: (r.show_in_shop as boolean | null) ?? true,
    showOnDashboard: (r.show_on_dashboard as boolean | null) ?? true,
    shopSortOrder: (r.shop_sort_order as number | null) ?? 0,
    shopPosition: ((r.shop_position as BpShopPosition | null) ?? "below_featured"),
    shopBannerSize: ((r.shop_banner_size as BpShopBannerSize | null) ?? "card"),
    customBuyText: (r.custom_buy_text as string | null) ?? null,
    customEliteBuyText: (r.custom_elite_buy_text as string | null) ?? null,
    highlightColor: (r.highlight_color as string | null) ?? null,
    showTierCountInShop: (r.show_tier_count_in_shop as boolean | null) ?? true,
    showCountdown: (r.show_countdown as boolean | null) ?? true,
    passIcon: (r.pass_icon as string | null) ?? "🏆",
    tiers,
    createdAt: r.created_at as string,
  };
}

// ── user-facing ─────────────────────────────────────────────────────────────

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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { pass, userStatus: null };

  const [{ data: ubpRow }, { data: claimRows }] = await Promise.all([
    admin
      .from("user_battle_passes")
      .select("has_premium, has_elite, progress_days")
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
    hasElite: ubpRow?.has_elite ?? false,
    progressDays: ubpRow?.progress_days ?? 0,
    claimedTierIds: (claimRows ?? []).map((r) => r.tier_id as string),
  };

  return { pass, userStatus };
}

export async function getShopBattlePasses(): Promise<BattlePass[]> {
  const admin = createAdminClient();
  const { data: passRows } = await admin
    .from("battle_passes")
    .select("*")
    .eq("is_active", true)
    .eq("enabled", true)
    .eq("show_in_shop", true)
    .order("shop_sort_order", { ascending: true });

  if (!passRows || passRows.length === 0) return [];
  return passRows.map((p) => rowToPass(p as Record<string, unknown>, []));
}

export async function getActiveBattlePasses(): Promise<ActiveBpView[]> {
  const admin = createAdminClient();

  const { data: passRows } = await admin
    .from("battle_passes")
    .select("*")
    .eq("is_active", true)
    .eq("enabled", true)
    .order("shop_sort_order", { ascending: true });

  if (!passRows || passRows.length === 0) return [];

  const passIds = passRows.map((p) => p.id as string);

  const [{ data: allTierRows }, supabase] = await Promise.all([
    admin
      .from("battle_pass_tiers")
      .select("*")
      .in("pass_id", passIds)
      .order("tier_number", { ascending: true }),
    createClient(),
  ]);

  const tiersByPass = new Map<string, BattlePassTier[]>();
  for (const passId of passIds) {
    tiersByPass.set(
      passId,
      (allTierRows ?? [])
        .filter((t) => t.pass_id === passId)
        .map((t) => rowToTier(t as Record<string, unknown>))
    );
  }

  const passes = passRows.map((p) =>
    rowToPass(p as Record<string, unknown>, tiersByPass.get(p.id as string) ?? [])
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return passes.map((pass) => ({ pass, userStatus: null }));

  const [{ data: ubpRows }, { data: claimRows }] = await Promise.all([
    admin
      .from("user_battle_passes")
      .select("pass_id, has_premium, has_elite, progress_days")
      .eq("user_id", user.id)
      .in("pass_id", passIds),
    admin
      .from("user_bp_tier_claims")
      .select("pass_id, tier_id")
      .eq("user_id", user.id)
      .in("pass_id", passIds),
  ]);

  return passes.map((pass) => {
    const ubp = (ubpRows ?? []).find((r) => r.pass_id === pass.id);
    const claims = (claimRows ?? [])
      .filter((r) => r.pass_id === pass.id)
      .map((r) => r.tier_id as string);

    const userStatus: UserBpStatus = {
      passId: pass.id,
      hasPremium: ubp?.has_premium ?? false,
      hasElite: ubp?.has_elite ?? false,
      progressDays: ubp?.progress_days ?? 0,
      claimedTierIds: claims,
    };
    return { pass, userStatus };
  });
}

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

export async function purchaseEliteBattlePass(passId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();
  const [{ data: passRow }, { data: profile }, { currencyName }] = await Promise.all([
    admin.from("battle_passes").select("id, elite_price_cr, elite_enabled, enabled, is_active").eq("id", passId).single(),
    admin.from("profiles").select("credits").eq("id", user.id).single(),
    getSiteConfig(),
  ]);

  if (!passRow || !passRow.enabled || !passRow.is_active) {
    return { success: false, error: "Dieser Pass ist nicht verfügbar." };
  }
  if (!(passRow.elite_enabled as boolean)) {
    return { success: false, error: "Der Elite-Pass ist nicht verfügbar." };
  }
  if (!profile) return { success: false, error: "Profil nicht gefunden." };

  const elitePriceCr = (passRow.elite_price_cr as number | null) ?? 0;
  if (profile.credits < elitePriceCr) {
    return { success: false, error: `Nicht genug ${currencyName}. Benötigt: ${elitePriceCr.toLocaleString("de-DE")} ${currencyName}.` };
  }

  const { data: existing } = await admin
    .from("user_battle_passes")
    .select("id, has_elite")
    .eq("user_id", user.id)
    .eq("pass_id", passId)
    .maybeSingle();

  if (existing?.has_elite) {
    return { success: false, error: "Du hast den Elite-Pass bereits." };
  }

  const newCredits = profile.credits - elitePriceCr;

  const { error: creditError } = await admin
    .from("profiles")
    .update({ credits: newCredits })
    .eq("id", user.id)
    .gte("credits", elitePriceCr);

  if (creditError) return { success: false, error: `Nicht genug ${currencyName}.` };

  const now = new Date().toISOString();
  if (existing) {
    await admin
      .from("user_battle_passes")
      .update({ has_elite: true, elite_purchased_at: now })
      .eq("id", existing.id);
  } else {
    await admin.from("user_battle_passes").insert({
      user_id: user.id,
      pass_id: passId,
      has_premium: false,
      has_elite: true,
      progress_days: 0,
      elite_purchased_at: now,
    });
  }

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "battle_pass_elite_purchase",
      payload: { passId, cost: elitePriceCr, newCredits },
    });
  } catch { /* ignore */ }

  revalidatePath("/battlepass");
  revalidatePath("/");
  return { success: true };
}

export async function claimBpTier(tierId: string): Promise<{ success: boolean; error?: string; reward?: string; rewardType?: BpRewardType }> {
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

  const { data: existing } = await admin
    .from("user_bp_tier_claims")
    .select("id")
    .eq("user_id", user.id)
    .eq("tier_id", tierId)
    .maybeSingle();
  if (existing) return { success: false, error: "Bereits abgeholt." };

  const { data: ubp } = await admin
    .from("user_battle_passes")
    .select("has_premium, progress_days")
    .eq("user_id", user.id)
    .eq("pass_id", passId)
    .maybeSingle();

  const progressDays = ubp?.progress_days ?? 0;
  const hasPremium = ubp?.has_premium ?? false;
  const t = tier as Record<string, unknown>;
  const tierNum = t.tier_number as number;
  const isPremium = t.is_premium as boolean;

  if (progressDays < tierNum) {
    return { success: false, error: `Noch nicht freigeschaltet — du brauchst ${tierNum} Login-Tage.` };
  }
  if (isPremium && !hasPremium) {
    return { success: false, error: "Nur für Premium-Pass-Inhaber." };
  }

  const rewardType = t.reward_type as BpRewardType;
  const quantity = (t.reward_quantity as number | null) ?? 1;
  let rewardMsg = "";

  if (rewardType === "credits") {
    const amount = Math.round(((t.reward_credits as number | null) ?? 0) * quantity);
    if (amount > 0) {
      const { data: prof } = await admin.from("profiles").select("credits").eq("id", user.id).single();
      if (prof) {
        await admin.from("profiles").update({ credits: (prof.credits as number) + amount }).eq("id", user.id);
      }
      rewardMsg = `+${amount.toLocaleString("de-DE")} Credits`;
    }
  } else if (rewardType === "item") {
    const itemId = t.reward_item_id as string | null;
    if (itemId) {
      const { data: item } = await admin.from("items").select("name, rarity").eq("id", itemId).maybeSingle();
      const count = Math.max(1, quantity);
      for (let i = 0; i < count; i++) {
        await admin.from("inventory").insert({ user_id: user.id, item_id: itemId, equipped: false });
      }
      rewardMsg = item ? `${item.name} (${item.rarity})${count > 1 ? ` ×${count}` : ""}` : "Item erhalten";
    }
  } else if (rewardType === "random_item") {
    const rarity = t.reward_item_rarity as Rarity | null;
    let query = admin.from("items").select("id, name, rarity").eq("type", "cosmetic");
    if (rarity) query = query.eq("rarity", rarity);
    const { data: items } = await query;
    if (items && items.length > 0) {
      const picked = items[Math.floor(Math.random() * items.length)];
      await admin.from("inventory").insert({ user_id: user.id, item_id: picked.id, equipped: false });
      rewardMsg = `Zufällig: ${picked.name} (${picked.rarity})`;
    }
  } else if (rewardType === "badge") {
    const badgeText = (t.reward_badge_text as string | null) ?? (t.reward_badge_key as string | null) ?? "";
    if (badgeText) {
      rewardMsg = `Badge: ${badgeText}`;
    }
  } else if (rewardType === "xp_boost") {
    const days = (t.reward_xp_boost as number | null) ?? 1;
    if (days > 0 && ubp) {
      const newDays = Math.min((ubp.progress_days as number) + days, (pass.tier_count as number) ?? 30);
      await admin
        .from("user_battle_passes")
        .update({ progress_days: newDays })
        .eq("user_id", user.id)
        .eq("pass_id", passId);
      rewardMsg = `+${days} Fortschrittstag${days !== 1 ? "e" : ""}`;
    }
  } else if (rewardType === "name_style") {
    const styleKey = t.reward_name_style_key as string | null;
    if (styleKey) {
      const { data: alreadyOwned } = await admin
        .from("user_name_styles")
        .select("id")
        .eq("user_id", user.id)
        .eq("style_key", styleKey)
        .maybeSingle();
      if (!alreadyOwned) {
        await admin.from("user_name_styles").insert({
          user_id: user.id,
          style_key: styleKey,
          source: "won",
        });
      }
      rewardMsg = `Name-Style: ${styleKey}`;
    }
  }

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
  return { success: true, reward: rewardMsg, rewardType };
}

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

export interface BpStats {
  totalUsers: number;
  premiumUsers: number;
  totalCrSpent: number;
  claimsCount: number;
}

export async function getBpStats(passId: string): Promise<BpStats> {
  try {
    const admin = createAdminClient();
    const [{ count: totalUsers }, { count: premiumUsers }, { data: purchaseData }, { count: claimsCount }] = await Promise.all([
      admin.from("user_battle_passes").select("*", { count: "exact", head: true }).eq("pass_id", passId),
      admin.from("user_battle_passes").select("*", { count: "exact", head: true }).eq("pass_id", passId).eq("has_premium", true),
      admin.from("battle_passes").select("price_cr").eq("id", passId).single(),
      admin.from("user_bp_tier_claims").select("*", { count: "exact", head: true }).eq("pass_id", passId),
    ]);
    const priceCr = (purchaseData?.price_cr as number | null) ?? 0;
    return {
      totalUsers: totalUsers ?? 0,
      premiumUsers: premiumUsers ?? 0,
      totalCrSpent: (premiumUsers ?? 0) * priceCr,
      claimsCount: claimsCount ?? 0,
    };
  } catch {
    return { totalUsers: 0, premiumUsers: 0, totalCrSpent: 0, claimsCount: 0 };
  }
}

// ── item search for tier editor ───────────────────────────────────────────────

export async function searchBpItems(
  query: string,
  rarity?: Rarity
): Promise<{ id: string; name: string; rarity: Rarity; type: string }[]> {
  const user = await requireAdminUser();
  if (!user) return [];

  const admin = createAdminClient();
  let q = admin.from("items").select("id, name, rarity, type").order("name");
  if (query.trim()) q = q.ilike("name", `%${query.trim()}%`);
  if (rarity) q = q.eq("rarity", rarity);
  const { data } = await q.limit(30);
  return (data ?? []) as { id: string; name: string; rarity: Rarity; type: string }[];
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

  if (error) return [];
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
  return !!error;
}

export interface AdminPassInput {
  name: string;
  seasonLabel: string;
  description: string;
  priceCr: number;
  elitePriceCr: number;
  eliteEnabled: boolean;
  enabled: boolean;
  startDate: string | null;
  endDate: string | null;
  tierCount: number;
  spinChanceBoost: number;
  bannerColor: string;
  theme: BpTheme;
  accentColor: string;
  bannerImageUrl: string | null;
  showInShop: boolean;
  showOnDashboard: boolean;
  shopSortOrder: number;
  shopPosition: BpShopPosition;
  shopBannerSize: BpShopBannerSize;
  customBuyText: string;
  customEliteBuyText: string;
  highlightColor: string;
  showTierCountInShop: boolean;
  showCountdown: boolean;
  passIcon: string;
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
      elite_price_cr: Math.max(0, Math.round(input.elitePriceCr)),
      elite_enabled: input.eliteEnabled,
      enabled: input.enabled,
      is_active: false,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      tier_count: Math.max(1, Math.min(50, Math.round(input.tierCount))),
      spin_chance_boost: Math.min(0.5, Math.max(0, input.spinChanceBoost)),
      banner_color: input.bannerColor || "#7c3aed",
      theme: input.theme || "default",
      accent_color: input.accentColor || "#7c3aed",
      banner_image_url: input.bannerImageUrl || null,
      show_in_shop: input.showInShop,
      show_on_dashboard: input.showOnDashboard,
      shop_sort_order: input.shopSortOrder ?? 0,
      shop_position: input.shopPosition ?? "below_featured",
      shop_banner_size: input.shopBannerSize ?? "card",
      custom_buy_text: input.customBuyText?.trim() || null,
      custom_elite_buy_text: input.customEliteBuyText?.trim() || null,
      highlight_color: input.highlightColor?.trim() || null,
      show_tier_count_in_shop: input.showTierCountInShop ?? true,
      show_countdown: input.showCountdown ?? true,
      pass_icon: input.passIcon?.trim() || "🏆",
    })
    .select("id")
    .single();

  if (error || !data) {
    void logDebugEvent({ scope: "adminCreateBattlePass", message: "Battlepass-Erstellung fehlgeschlagen", level: "error", detail: error?.message, context: { code: error?.code } });
    return { success: false, error: error?.message ? `DB-Fehler: ${error.message}` : "Erstellen fehlgeschlagen." };
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
      elite_price_cr: Math.max(0, Math.round(input.elitePriceCr)),
      elite_enabled: input.eliteEnabled,
      enabled: input.enabled,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      tier_count: Math.max(1, Math.min(50, Math.round(input.tierCount))),
      spin_chance_boost: Math.min(0.5, Math.max(0, input.spinChanceBoost)),
      banner_color: input.bannerColor || "#7c3aed",
      theme: input.theme || "default",
      accent_color: input.accentColor || "#7c3aed",
      banner_image_url: input.bannerImageUrl || null,
      show_in_shop: input.showInShop,
      show_on_dashboard: input.showOnDashboard,
      shop_sort_order: input.shopSortOrder ?? 0,
      shop_position: input.shopPosition ?? "below_featured",
      shop_banner_size: input.shopBannerSize ?? "card",
      custom_buy_text: input.customBuyText?.trim() || null,
      custom_elite_buy_text: input.customEliteBuyText?.trim() || null,
      highlight_color: input.highlightColor?.trim() || null,
      show_tier_count_in_shop: input.showTierCountInShop ?? true,
      show_countdown: input.showCountdown ?? true,
      pass_icon: input.passIcon?.trim() || "🏆",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { success: false, error: "Speichern fehlgeschlagen." };
  revalidatePath("/admin");
  revalidatePath("/battlepass");
  return { success: true };
}

export async function adminDeleteBattlePass(id: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("battle_passes").delete().eq("id", id);
  if (error) return { success: false, error: "Löschen fehlgeschlagen." };
  revalidatePath("/admin");
  return { success: true };
}

export async function adminSetPassActive(id: string, active: boolean): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
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
  isElite: boolean;
  rewardType: BpRewardType;
  rewardCredits: number | null;
  rewardItemId: string | null;
  rewardBadgeKey: string | null;
  rewardBadgeText: string | null;
  rewardItemRarity: Rarity | null;
  rewardXpBoost: number | null;
  rewardNameStyleKey: string | null;
  rewardQuantity: number;
  highlightTier: boolean;
  description: string | null;
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
      is_elite: input.isElite ?? false,
      reward_type: input.rewardType,
      reward_credits: input.rewardType === "credits" ? (input.rewardCredits ?? 100) : null,
      reward_item_id: (input.rewardType === "item") ? input.rewardItemId : null,
      reward_badge_key: input.rewardBadgeKey,
      reward_badge_text: (input.rewardType === "badge") ? (input.rewardBadgeText ?? "") : null,
      reward_item_rarity: (input.rewardType === "random_item") ? input.rewardItemRarity : null,
      reward_xp_boost: (input.rewardType === "xp_boost") ? (input.rewardXpBoost ?? 1) : null,
      reward_name_style_key: (input.rewardType === "name_style") ? (input.rewardNameStyleKey ?? null) : null,
      reward_quantity: Math.max(1, input.rewardQuantity),
      highlight_tier: input.highlightTier,
      description: input.description?.trim() || null,
      icon: input.icon.trim() || "🎁",
    }, { onConflict: "pass_id,tier_number" });

  if (error) return { success: false, error: "Tier speichern fehlgeschlagen." };
  revalidatePath("/admin");
  revalidatePath("/battlepass");
  return { success: true };
}

export async function adminAutoFillBpTiers(
  passId: string,
  config: BpAutoFillConfig
): Promise<{ success: boolean; count: number; error?: string }> {
  const user = await requireAdminUser();
  if (!user) return { success: false, count: 0, error: "Kein Zugriff." };

  const admin = createAdminClient();

  // Fetch pass to get tierCount
  const { data: passRow, error: passError } = await admin
    .from("battle_passes")
    .select("id, tier_count")
    .eq("id", passId)
    .single();

  if (passError || !passRow) {
    return { success: false, count: 0, error: "Pass nicht gefunden." };
  }

  const tierCount = passRow.tier_count as number;

  // Determine track boundaries
  const freeCount = Math.ceil(tierCount * config.freeRatio / 100);
  const eliteCount = Math.ceil(tierCount * config.eliteRatio / 100);
  const premiumCount = tierCount - freeCount - eliteCount;

  // Build all tier upsert rows
  const rows: Record<string, unknown>[] = [];

  for (let tierNumber = 1; tierNumber <= tierCount; tierNumber++) {
    const isMilestone = tierNumber % config.milestoneTierInterval === 0;

    // Determine track
    let isPremium = false;
    let isElite = false;
    if (tierNumber <= freeCount) {
      // free track
    } else if (tierNumber <= freeCount + premiumCount) {
      isPremium = true;
    } else {
      isElite = true;
    }

    // Determine reward type via deterministic hash
    const hash = (tierNumber * 2654435761) % 100;
    let rewardType: BpRewardType;
    if (hash < config.rewardMixCredits) {
      rewardType = "credits";
    } else if (hash < config.rewardMixCredits + config.rewardMixRandomItem) {
      rewardType = "random_item";
    } else if (hash < config.rewardMixCredits + config.rewardMixRandomItem + config.rewardMixXpBoost) {
      rewardType = "xp_boost";
    } else {
      rewardType = "badge";
    }

    // Credit amount
    let rewardCredits: number | null = null;
    if (rewardType === "credits") {
      if (config.creditProgression) {
        rewardCredits = Math.round(config.creditMin + (config.creditMax - config.creditMin) * (tierNumber / tierCount));
      } else {
        const range = config.creditMax - config.creditMin;
        rewardCredits = config.creditMin + ((tierNumber * 1234567) % (range + 1));
      }
    }

    // Rarity for random_item
    let rewardItemRarity: Rarity | null = null;
    if (rewardType === "random_item") {
      if (config.rarityProgression) {
        const pct = (tierNumber / tierCount) * 100;
        if (pct <= 25) {
          rewardItemRarity = "normal" as Rarity;
        } else if (pct <= 60) {
          rewardItemRarity = "selten" as Rarity;
        } else if (pct <= 85) {
          rewardItemRarity = "mythisch" as Rarity;
        } else {
          rewardItemRarity = "ultra" as Rarity;
        }
      } else {
        rewardItemRarity = "selten" as Rarity;
      }
    }

    // XP boost amount
    const rewardXpBoost = rewardType === "xp_boost"
      ? 1 + Math.floor(tierNumber / (tierCount / 3))
      : null;

    // Badge fields
    const rewardBadgeKey = isMilestone ? "bp_milestone" : null;
    const rewardBadgeText = (rewardType === "badge" && isMilestone) ? `Tier ${tierNumber} Meister` : null;

    // Icon
    let icon: string;
    if (isMilestone) {
      icon = "⭐";
    } else if (rewardType === "credits") {
      icon = "💰";
    } else if (rewardType === "random_item") {
      icon = "🎁";
    } else if (rewardType === "xp_boost") {
      icon = "⚡";
    } else {
      icon = "🏆";
    }

    const name = isMilestone ? `Meilenstein ${tierNumber}` : `Tier ${tierNumber}`;

    rows.push({
      pass_id: passId,
      tier_number: tierNumber,
      name,
      is_premium: isPremium,
      is_elite: isElite,
      reward_type: rewardType,
      reward_credits: rewardType === "credits" ? rewardCredits : null,
      reward_item_id: null,
      reward_badge_key: rewardBadgeKey,
      reward_badge_text: rewardType === "badge" ? (rewardBadgeText ?? `Tier ${tierNumber} Meister`) : null,
      reward_item_rarity: rewardType === "random_item" ? rewardItemRarity : null,
      reward_xp_boost: rewardType === "xp_boost" ? rewardXpBoost : null,
      reward_quantity: 1,
      highlight_tier: isMilestone,
      description: null,
      icon,
    });
  }

  // Batch upsert
  const { error: upsertError } = await admin
    .from("battle_pass_tiers")
    .upsert(rows, { onConflict: "pass_id,tier_number" });

  if (upsertError) {
    void logDebugEvent({
      scope: "adminAutoFillBpTiers",
      message: "Auto-Fill fehlgeschlagen",
      level: "error",
      detail: upsertError.message,
      context: { passId, tierCount },
    });
    return { success: false, count: 0, error: "Tier-Generierung fehlgeschlagen." };
  }

  void logDebugEvent({
    scope: "adminAutoFillBpTiers",
    message: `Auto-Fill erfolgreich: ${tierCount} Tiers generiert`,
    level: "info",
    context: { passId, tierCount, config },
  });

  revalidatePath("/admin");
  revalidatePath("/battlepass");
  return { success: true, count: rows.length };
}
