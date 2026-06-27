"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { getSiteConfig } from "@/lib/actions/site-config";
import { recomputeAutoPrioBadges } from "@/lib/actions/prio-badges";
import { logDebugEvent, logActivity } from "@/lib/debug-log-server";
import type { BattlePass, BattlePassTier, UserBpStatus, ActiveBpView, BpRewardType, BpTheme, BpShopPosition, BpShopBannerSize, BpAutoFillConfig, BpVisualConfig } from "@/lib/battle-pass";
import { DEFAULT_BP_VISUAL_CONFIG } from "@/lib/battle-pass";
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
    rewardItemName: (r.reward_item_name as string | null) ?? null,
    rewardItemType: (r.reward_item_type as string | null) ?? null,
    rewardBadgeKey: r.reward_badge_key as string | null,
    rewardBadgeText: r.reward_badge_text as string | null,
    rewardItemRarity: r.reward_item_rarity as Rarity | null,
    rewardXpBoost: r.reward_xp_boost as number | null,
    rewardNameStyleKey: r.reward_name_style_key as string | null,
    rewardAbilityKey: (r.reward_ability_key as string | null) ?? null,
    rewardAbilityName: (r.reward_ability_name as string | null) ?? null,
    rewardQuantity: (r.reward_quantity as number | null) ?? 1,
    highlightTier: (r.highlight_tier as boolean | null) ?? false,
    description: r.description as string | null,
    icon: r.icon as string,
    bpXpRequired: (r.bp_xp_required as number | null) ?? null,
    displayMode: ((r.display_mode as string | null) ?? "auto") as import("@/lib/battle-pass").BpTileDisplayMode,
    showTierName: (r.show_tier_name as boolean | null) ?? true,
    showTierDescription: (r.show_tier_description as boolean | null) ?? true,
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
    incompatibleWith: (r.incompatible_with as string[] | null) ?? [],
    tiers,
    createdAt: r.created_at as string,
    progressionType: ((r.progression_type as string | null) ?? "days") as "days" | "xp",
    bpXpPerTier: (r.bp_xp_per_tier as number | null) ?? 1000,
    bpXpCapPerDay: (r.bp_xp_cap_per_day as number | null) ?? 0,
    visualConfig: { ...DEFAULT_BP_VISUAL_CONFIG, ...((r.visual_config as Partial<BpVisualConfig> | null) ?? {}) },
  };
}

/**
 * Fills name/type/rarity for "item" reward tiers from the real items table,
 * using reward_item_id as the source of truth. Without this the 3D tile preview
 * has no item to render (the denormalized reward_item_name column was never
 * migrated), so specific-item rewards fell back to a flat placeholder icon.
 * One batched query for all item rewards across the given tiers.
 */
async function enrichItemRewards(
  admin: ReturnType<typeof createAdminClient>,
  tiers: BattlePassTier[],
): Promise<void> {
  const ids = Array.from(new Set(
    tiers
      .filter((t) => t.rewardType === "item" && t.rewardItemId)
      .map((t) => t.rewardItemId as string),
  ));
  if (ids.length === 0) return;

  const { data: items } = await admin
    .from("items")
    .select("id, name, type, rarity, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec")
    .in("id", ids);
  if (!items) return;

  const byId = new Map(items.map((it) => [it.id as string, it as Record<string, unknown>]));
  for (const t of tiers) {
    if (t.rewardType !== "item" || !t.rewardItemId) continue;
    const it = byId.get(t.rewardItemId);
    if (!it) continue;
    t.rewardItemName = (it.name as string | null) ?? t.rewardItemName;
    t.rewardItemType = (it.type as string | null) ?? t.rewardItemType;
    t.rewardItemRarity = ((it.rarity as Rarity | null) ?? t.rewardItemRarity) ?? null;
    t.rewardItemStats = {
      damage: (it.damage as number | null) ?? null,
      armor: (it.armor as number | null) ?? null,
      perkType: (it.perk_type as string | null) ?? null,
      perkMagnitude: (it.perk_magnitude as number | null) ?? null,
      shieldHp: (it.shield_hp as number | null) ?? null,
      shieldRegenCooldownSec: (it.shield_regen_cooldown_sec as number | null) ?? null,
    };
  }
}

/** Live-broadcast to all clients viewing the Battle Pass (no reload) — AGENTS §3.
 * The battlepass-shell subscribes to "bp-live" and re-fetches getActiveBattlePass
 * so admin tier/reward/visual changes appear instantly for everyone. */
async function broadcastBpChange() {
  try {
    const admin = createAdminClient();
    const ch = admin.channel("bp-live");
    await ch.send({ type: "broadcast", event: "bp_changed", payload: { updatedAt: new Date().toISOString() } });
    await admin.removeChannel(ch);
  } catch { /* best-effort */ }
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
  await enrichItemRewards(admin, tiers);
  const pass = rowToPass(passRow as Record<string, unknown>, tiers);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { pass, userStatus: null };

  const [{ data: ubpRow }, { data: claimRows }] = await Promise.all([
    admin
      .from("user_battle_passes")
      .select("has_premium, has_elite, progress_days, bp_xp")
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
    bpXp: (ubpRow?.bp_xp as number | null) ?? 0,
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

  // Enrich item rewards across all passes (one batched query, patches by ref).
  await enrichItemRewards(admin, Array.from(tiersByPass.values()).flat());

  const passes = passRows.map((p) =>
    rowToPass(p as Record<string, unknown>, tiersByPass.get(p.id as string) ?? [])
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return passes.map((pass) => ({ pass, userStatus: null }));

  const [{ data: ubpRows }, { data: claimRows }] = await Promise.all([
    admin
      .from("user_battle_passes")
      .select("pass_id, has_premium, has_elite, progress_days, bp_xp")
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
      bpXp: (ubp?.bp_xp as number | null) ?? 0,
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
    admin.from("battle_passes").select("id, price_cr, enabled, is_active, incompatible_with").eq("id", passId).single(),
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

  // Incompatibility check
  const incompatibleWith = (passRow.incompatible_with as string[] | null) ?? [];
  if (incompatibleWith.length > 0) {
    const { data: conflictRows } = await admin
      .from("user_battle_passes")
      .select("pass_id")
      .eq("user_id", user.id)
      .eq("has_premium", true)
      .in("pass_id", incompatibleWith);
    if (conflictRows && conflictRows.length > 0) {
      const { data: conflictPasses } = await admin
        .from("battle_passes")
        .select("name")
        .in("id", conflictRows.map((r) => r.pass_id as string));
      const names = (conflictPasses ?? []).map((p) => p.name as string).join(", ");
      return { success: false, error: `Dieser Pass ist nicht kombinierbar mit: ${names}. Du kannst ihn nicht gleichzeitig besitzen.` };
    }
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

  void logActivity("battlepass:purchase", `Battle Pass gekauft: ${passId}`, { userId: user.id, passId, cost: passRow.price_cr });
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
    admin.from("battle_passes").select("id, elite_price_cr, elite_enabled, enabled, is_active, incompatible_with").eq("id", passId).single(),
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

  // Incompatibility check
  const incompatibleWith = (passRow.incompatible_with as string[] | null) ?? [];
  if (incompatibleWith.length > 0) {
    const { data: conflictRows } = await admin
      .from("user_battle_passes")
      .select("pass_id")
      .eq("user_id", user.id)
      .eq("has_elite", true)
      .in("pass_id", incompatibleWith);
    if (conflictRows && conflictRows.length > 0) {
      const { data: conflictPasses } = await admin
        .from("battle_passes")
        .select("name")
        .in("id", conflictRows.map((r) => r.pass_id as string));
      const names = (conflictPasses ?? []).map((p) => p.name as string).join(", ");
      return { success: false, error: `Dieser Elite-Pass ist nicht kombinierbar mit: ${names}.` };
    }
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

  // Reserve the claim ATOMICALLY before granting anything. UNIQUE(user_id,tier_id)
  // means two concurrent claimBpTier() calls can't both pass this point, so the
  // reward can never be double-granted by a double-click/double-request. If any
  // grant step below early-returns an error, the finally block rolls this reservation
  // back so the tier stays claimable (preserving the prior "a failed grant never
  // consumes the claim" guarantee).
  const { error: claimReserveErr } = await admin
    .from("user_bp_tier_claims")
    .insert({ user_id: user.id, pass_id: passId, tier_id: tierId });
  if (claimReserveErr) return { success: false, error: "Bereits abgeholt." };

  let claimGranted = false;
  try {

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
    // Specific item reward — MUST reliably land in the inventory. Any failure
    // returns BEFORE the claim is recorded (below), so the tier stays claimable
    // and the player never loses the reward.
    const itemId = t.reward_item_id as string | null;
    if (!itemId) {
      return { success: false, error: "Diese Belohnung ist fehlerhaft konfiguriert (kein Item hinterlegt). Bitte Admin informieren — der Tier wurde NICHT als abgeholt markiert." };
    }
    const { data: item } = await admin.from("items").select("name, rarity").eq("id", itemId).maybeSingle();
    if (!item) {
      return { success: false, error: "Das hinterlegte Item existiert nicht mehr. Bitte Admin informieren — der Tier wurde NICHT abgeholt." };
    }
    const count = Math.max(1, quantity);
    const invRows = Array.from({ length: count }, () => ({ user_id: user.id, item_id: itemId, equipped: false }));
    const { error: invErr } = await admin.from("inventory").insert(invRows);
    if (invErr) {
      void logDebugEvent({ level: "error", scope: "battlepass:claim", message: "BP Item-Grant fehlgeschlagen", detail: invErr.message, context: { userId: user.id, tierId, itemId } });
      return { success: false, error: "Das Item konnte nicht ins Inventar gelegt werden. Bitte erneut versuchen — der Tier wurde NICHT abgeholt." };
    }
    rewardMsg = `${item.name} (${item.rarity})${count > 1 ? ` ×${count}` : ""}`;
  } else if (rewardType === "random_item") {
    const rarity = t.reward_item_rarity as Rarity | null;
    let query = admin.from("items").select("id, name, rarity").eq("type", "cosmetic");
    if (rarity) query = query.eq("rarity", rarity);
    const { data: items } = await query;
    if (!items || items.length === 0) {
      return { success: false, error: "Kein passendes Item für diese Belohnung gefunden. Bitte Admin informieren — der Tier wurde NICHT abgeholt." };
    }
    const picked = items[Math.floor(Math.random() * items.length)];
    const { error: invErr } = await admin.from("inventory").insert({ user_id: user.id, item_id: picked.id, equipped: false });
    if (invErr) {
      void logDebugEvent({ level: "error", scope: "battlepass:claim", message: "BP Random-Item-Grant fehlgeschlagen", detail: invErr.message, context: { userId: user.id, tierId, itemId: picked.id } });
      return { success: false, error: "Das Item konnte nicht ins Inventar gelegt werden. Bitte erneut versuchen — der Tier wurde NICHT abgeholt." };
    }
    rewardMsg = `Zufällig: ${picked.name} (${picked.rarity})`;
  } else if (rewardType === "badge") {
    // Previously this branch ONLY set a display string and never granted the
    // badge — claiming a badge tier gave the player nothing. Now it actually
    // inserts into user_badges (idempotent), and fails the claim on error so
    // the tier stays claimable.
    const badgeKey = t.reward_badge_key as string | null;
    const badgeText = (t.reward_badge_text as string | null) ?? badgeKey ?? "";
    if (!badgeKey) {
      return { success: false, error: "Diese Belohnung ist fehlerhaft konfiguriert (kein Badge hinterlegt). Bitte Admin informieren — der Tier wurde NICHT abgeholt." };
    }
    const { error: badgeErr } = await admin.from("user_badges").upsert(
      { user_id: user.id, badge_key: badgeKey },
      { onConflict: "user_id,badge_key", ignoreDuplicates: true },
    );
    if (badgeErr) {
      void logDebugEvent({ level: "error", scope: "battlepass:claim", message: "BP Badge-Grant fehlgeschlagen", detail: badgeErr.message, context: { userId: user.id, tierId, badgeKey } });
      return { success: false, error: "Das Badge konnte nicht vergeben werden. Bitte erneut versuchen — der Tier wurde NICHT abgeholt." };
    }
    await recomputeAutoPrioBadges(user.id);
    rewardMsg = `Badge: ${badgeText}`;
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
    if (!styleKey) {
      return { success: false, error: "Diese Belohnung ist fehlerhaft konfiguriert (kein Name-Style hinterlegt). Bitte Admin informieren — der Tier wurde NICHT abgeholt." };
    }
    const { data: alreadyOwned } = await admin
      .from("user_name_styles")
      .select("id")
      .eq("user_id", user.id)
      .eq("style_key", styleKey)
      .maybeSingle();
    if (!alreadyOwned) {
      const { ensureStyleInDb } = await import("@/lib/actions/name-styles");
      await ensureStyleInDb(styleKey, admin);
      const { error: nsErr } = await admin.from("user_name_styles").insert({
        user_id: user.id,
        style_key: styleKey,
        source: "won",
      });
      if (nsErr) {
        void logDebugEvent({ level: "error", scope: "battlepass:claim", message: "BP Name-Style-Grant fehlgeschlagen", detail: nsErr.message, context: { userId: user.id, tierId, styleKey } });
        return { success: false, error: "Der Name-Style konnte nicht vergeben werden. Bitte erneut versuchen — der Tier wurde NICHT abgeholt." };
      }
      void import("@/lib/actions/badges").then((m) => m.checkAndAwardNameStyleBadges(user.id)).catch(() => {});
    }
    rewardMsg = `Name-Style: ${styleKey}`;
  } else if (rewardType === "ability") {
    const abilityKey = (t.reward_ability_key as string | null);
    if (!abilityKey) {
      return { success: false, error: "Diese Belohnung ist fehlerhaft konfiguriert (keine Fähigkeit hinterlegt). Bitte Admin informieren — der Tier wurde NICHT abgeholt." };
    }
    const { error: abErr } = await admin.from("user_abilities").insert({
      user_id: user.id,
      ability_key: abilityKey,
      source: "bp_tier",
      source_detail: `Battle Pass Tier ${tierNum}`,
    });
    if (abErr) {
      void logDebugEvent({ level: "error", scope: "battlepass:claim", message: "BP Ability-Grant fehlgeschlagen", detail: abErr.message, context: { userId: user.id, tierId, abilityKey } });
      return { success: false, error: "Die Fähigkeit konnte nicht vergeben werden. Bitte erneut versuchen — der Tier wurde NICHT abgeholt." };
    }
    rewardMsg = `Fähigkeit erhalten: ${abilityKey}`;
  }

  // Award XP for tier claim — fire-and-forget
  try {
    const { awardXp, getXpConfig } = await import("@/lib/actions/level-system");
    const xpCfg = await getXpConfig();
    void awardXp(user.id, xpCfg.sources.bp_tier_claim ?? 50, "bp_tier_claim", `Tier ${tierNum}`);
  } catch { /* non-fatal */ }

  // All reward grants succeeded and no early-return fired — the reservation is now
  // permanent (the finally below will NOT roll it back).
  claimGranted = true;

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "battle_pass_tier_claim",
      payload: { tierId, passId, tierNum, rewardType, rewardMsg },
    });
  } catch { /* ignore */ }

  void logActivity("battlepass:claim", `BP-Tier eingelöst: ${tierId} (${rewardType})`, { userId: user.id, tierId, passId, tierNum, rewardType, reward: rewardMsg });
  revalidatePath("/battlepass");
  revalidatePath("/");
  return { success: true, reward: rewardMsg, rewardType };

  } finally {
    if (!claimGranted) {
      // A grant step bailed out with an error return → release the reserved claim
      // so the tier stays claimable (no reward was kept).
      await admin.from("user_bp_tier_claims").delete()
        .eq("user_id", user.id).eq("tier_id", tierId);
    }
  }
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
  incompatibleWith?: string[];
  progressionType?: "days" | "xp";
  bpXpPerTier?: number;
  bpXpCapPerDay?: number;
  visualConfig?: BpVisualConfig;
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
      incompatible_with: input.incompatibleWith ?? [],
      visual_config: input.visualConfig ?? DEFAULT_BP_VISUAL_CONFIG,
    })
    .select("id")
    .single();

  if (error || !data) {
    void logDebugEvent({ scope: "adminCreateBattlePass", message: "Battlepass-Erstellung fehlgeschlagen", level: "error", detail: error?.message, context: { code: error?.code } });
    return { success: false, error: error?.message ? `DB-Fehler: ${error.message}` : "Erstellen fehlgeschlagen." };
  }
  void logActivity("admin:bp:create", `Battle Pass erstellt: ${input.name}`, { passId: data.id, name: input.name, tierCount: input.tierCount });
  await broadcastBpChange();
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
      incompatible_with: input.incompatibleWith ?? [],
      progression_type: input.progressionType ?? "days",
      bp_xp_per_tier: input.bpXpPerTier ?? 1000,
      bp_xp_cap_per_day: input.bpXpCapPerDay ?? 0,
      visual_config: input.visualConfig ?? DEFAULT_BP_VISUAL_CONFIG,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    void logDebugEvent({ scope: "adminUpdateBattlePass", message: "Battle Pass Update fehlgeschlagen", level: "error", detail: error.message, context: { passId: id } });
    return { success: false, error: "Speichern fehlgeschlagen." };
  }
  void logActivity("admin:bp:update", `Battle Pass gespeichert: ${input.name}`, { passId: id, name: input.name, theme: input.theme, visualConfig: input.visualConfig });
  await broadcastBpChange();
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
  await broadcastBpChange();
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
  await broadcastBpChange();
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
  rewardItemType: string | null;
  rewardBadgeKey: string | null;
  rewardBadgeText: string | null;
  rewardItemRarity: Rarity | null;
  rewardXpBoost: number | null;
  rewardNameStyleKey: string | null;
  rewardAbilityKey?: string | null;
  rewardItemName?: string | null;
  rewardQuantity: number;
  highlightTier: boolean;
  description: string | null;
  icon: string;
  displayMode?: string;
  showTierName?: boolean;
  showTierDescription?: boolean;
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
      reward_item_type: (input.rewardType === "item") ? (input.rewardItemType ?? null) : null,
      reward_badge_key: input.rewardBadgeKey,
      reward_badge_text: (input.rewardType === "badge") ? (input.rewardBadgeText ?? "") : null,
      reward_item_rarity: (input.rewardType === "random_item") ? input.rewardItemRarity : null,
      reward_xp_boost: (input.rewardType === "xp_boost") ? (input.rewardXpBoost ?? 1) : null,
      reward_name_style_key: (input.rewardType === "name_style") ? (input.rewardNameStyleKey ?? null) : null,
      reward_ability_key: (input.rewardType === "ability") ? (input.rewardAbilityKey ?? null) : null,
      reward_quantity: Math.max(1, input.rewardQuantity),
      highlight_tier: input.highlightTier,
      description: input.description?.trim() || null,
      icon: input.icon.trim() || "🎁",
      display_mode: input.displayMode ?? "auto",
      show_tier_name: input.showTierName ?? true,
      show_tier_description: input.showTierDescription ?? true,
    }, { onConflict: "pass_id,tier_number" });

  if (error) return { success: false, error: "Tier speichern fehlgeschlagen." };
  await broadcastBpChange();
  revalidatePath("/admin");
  revalidatePath("/battlepass");
  return { success: true };
}

// ── Drag & Drop Timeline-Editor ───────────────────────────────────────────────
// Belohnungs-Inhalt einer Stufe (alles AUSSER Identität pass_id/tier_number/id/created_at).
// reward_item_name & reward_ability_name absichtlich AUSGELASSEN (existieren nicht in der DB).
const BP_TIER_CONTENT_COLS =
  "name, is_premium, is_elite, reward_type, reward_credits, reward_item_id, reward_item_type, " +
  "reward_item_rarity, reward_badge_key, reward_badge_text, reward_xp_boost, reward_name_style_key, " +
  "reward_ability_key, reward_quantity, highlight_tier, description, icon, bp_xp_required, " +
  "display_mode, show_tier_name, show_tier_description";

function bpTrackFlags(track: "free" | "premium" | "elite") {
  return { is_premium: track === "premium", is_elite: track === "elite" };
}

function bpTierContent(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of BP_TIER_CONTENT_COLS.split(",").map((c) => c.trim())) {
    out[col] = row[col] ?? null;
  }
  return out;
}

/**
 * Verschiebt / tauscht eine Belohnung im visuellen Timeline-Editor.
 * - fromTier === toTier  → reiner Track-Wechsel (Free/Premium/Elite) der Quelle.
 * - Ziel belegt          → Tausch beider Stufen-Inhalte (Quelle erhält toTrack, das verdrängte
 *                           Reward landet an der Quell-Stufe und behält deren bisherigen Track).
 * - Ziel leer            → Verschieben (Quelle wird geleert, Ziel erhält Inhalt + toTrack).
 * Belohnungs-Grant-Logik (claimBpTier) bleibt komplett unangetastet.
 */
export async function adminPlaceBpReward(
  passId: string,
  fromTier: number,
  toTier: number,
  toTrack: "free" | "premium" | "elite",
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminUser();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();

  const { data: src, error: srcErr } = await admin
    .from("battle_pass_tiers")
    .select(BP_TIER_CONTENT_COLS)
    .eq("pass_id", passId)
    .eq("tier_number", fromTier)
    .maybeSingle();
  if (srcErr) return { success: false, error: "Quell-Stufe konnte nicht geladen werden." };
  if (!src) return { success: false, error: "Keine Belohnung an der Quell-Stufe." };
  const srcRow = src as unknown as Record<string, unknown>;

  // Reiner Track-Wechsel innerhalb derselben Stufe
  if (fromTier === toTier) {
    const { error } = await admin
      .from("battle_pass_tiers")
      .update(bpTrackFlags(toTrack))
      .eq("pass_id", passId)
      .eq("tier_number", fromTier);
    if (error) return { success: false, error: "Track-Wechsel fehlgeschlagen." };
    await broadcastBpChange();
    revalidatePath("/admin");
    revalidatePath("/battlepass");
    return { success: true };
  }

  const { data: tgt } = await admin
    .from("battle_pass_tiers")
    .select(BP_TIER_CONTENT_COLS)
    .eq("pass_id", passId)
    .eq("tier_number", toTier)
    .maybeSingle();

  if (tgt) {
    // TAUSCH: verdrängtes Reward → Quell-Stufe (behält Quell-Track); Quelle → Ziel (toTrack)
    const srcTrack: "free" | "premium" | "elite" = srcRow.is_elite
      ? "elite"
      : srcRow.is_premium
        ? "premium"
        : "free";
    const e1 = await admin
      .from("battle_pass_tiers")
      .update({ ...bpTierContent(tgt as unknown as Record<string, unknown>), ...bpTrackFlags(srcTrack) })
      .eq("pass_id", passId)
      .eq("tier_number", fromTier);
    const e2 = await admin
      .from("battle_pass_tiers")
      .update({ ...bpTierContent(srcRow), ...bpTrackFlags(toTrack) })
      .eq("pass_id", passId)
      .eq("tier_number", toTier);
    if (e1.error || e2.error) return { success: false, error: "Tausch fehlgeschlagen." };
  } else {
    // VERSCHIEBEN auf leere Stufe: Ziel anlegen, Quelle löschen
    const e1 = await admin
      .from("battle_pass_tiers")
      .upsert(
        { pass_id: passId, tier_number: toTier, ...bpTierContent(srcRow), ...bpTrackFlags(toTrack) },
        { onConflict: "pass_id,tier_number" },
      );
    if (e1.error) return { success: false, error: "Verschieben fehlgeschlagen." };
    const e2 = await admin
      .from("battle_pass_tiers")
      .delete()
      .eq("pass_id", passId)
      .eq("tier_number", fromTier);
    if (e2.error) return { success: false, error: "Quell-Stufe konnte nicht geleert werden." };
  }

  await broadcastBpChange();
  revalidatePath("/admin");
  revalidatePath("/battlepass");
  return { success: true };
}

/** Leert eine Stufe (löscht die Tier-Zeile). Belohnungs-Definition entfernt, Claims der User bleiben. */
export async function adminClearBpTier(
  passId: string,
  tierNumber: number,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdminUser();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("battle_pass_tiers")
    .delete()
    .eq("pass_id", passId)
    .eq("tier_number", tierNumber);
  if (error) return { success: false, error: "Stufe konnte nicht geleert werden." };
  await broadcastBpChange();
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
    .select("id, tier_count, elite_enabled")
    .eq("id", passId)
    .single();

  if (passError || !passRow) {
    return { success: false, count: 0, error: "Pass nicht gefunden." };
  }

  const tierCount = passRow.tier_count as number;
  const passEliteEnabled = passRow.elite_enabled === true;

  // ── Echte Items laden → der Generator vergibt KONKRETE Items (reward_item_id), damit die
  //    3D-Modelle in den Kacheln erscheinen (statt generischer Würfel). Gruppiert nach Seltenheit.
  const RAMP: Rarity[] = ["normal", "selten", "mythisch", "ultra"];
  const byRarity: Record<string, { id: string; type: string | null; name: string }[]> = { normal: [], selten: [], mythisch: [], ultra: [] };
  // Getragene Items (hat/hair/face/jacket/pants/shoes) brauchen einen Charakter und clippen in
  // kleinen Kacheln → der Generator überspringt sie; sie können manuell im Pool platziert werden.
  const WORN = new Set(["hat", "hair", "face", "jacket", "pants", "shoes"]);
  try {
    const { data: itemRows } = await admin.from("items").select("id, type, rarity, name");
    for (const it of (itemRows ?? []) as { id: string; type: string | null; rarity: string; name: string | null }[]) {
      if (it.type && WORN.has(it.type)) continue;
      if (byRarity[it.rarity]) byRarity[it.rarity].push({ id: it.id, type: it.type, name: it.name ?? "Item" });
    }
  } catch { /* keine Items → Fallback auf Credits unten */ }
  const hasAnyItems = RAMP.some((r) => byRarity[r].length > 0);
  const pickIdx: Record<string, number> = { normal: 0, selten: 0, mythisch: 0, ultra: 0 };
  const pickItem = (rarity: Rarity): { id: string; type: string | null; name: string } | null => {
    // bevorzugte Seltenheit, dann nächstbeste mit Bestand
    for (const r of [rarity, ...RAMP.filter((x) => x !== rarity)]) {
      const pool = byRarity[r];
      if (pool && pool.length) { const it = pool[pickIdx[r] % pool.length]; pickIdx[r]++; return it; }
    }
    return null;
  };
  const rarityForTier = (tierNumber: number): Rarity => {
    if (!config.rarityProgression) return "selten";
    const pct = (tierNumber / tierCount) * 100;
    if (pct <= 25) return "normal";
    if (pct <= 60) return "selten";
    if (pct <= 85) return "mythisch";
    return "ultra";
  };

  // ── Track-Grenzen robust (Summe == tierCount, nie negativ) ──
  let freeCount = Math.round(tierCount * config.freeRatio / 100);
  let eliteCount = passEliteEnabled ? Math.round(tierCount * config.eliteRatio / 100) : 0;
  if (freeCount + eliteCount > tierCount) {
    eliteCount = Math.max(0, tierCount - freeCount);
    if (freeCount > tierCount) freeCount = tierCount;
  }
  const premiumCount = Math.max(0, tierCount - freeCount - eliteCount);

  // ── Mix EXAKT auf tierCount verteilen (echte 100%): Kontingente + greedy-Verteilung ──
  const quota: Record<string, number> = {
    item: Math.round(tierCount * config.rewardMixRandomItem / 100),
    credits: Math.round(tierCount * config.rewardMixCredits / 100),
    xp_boost: Math.round(tierCount * config.rewardMixXpBoost / 100),
    badge: Math.round(tierCount * config.rewardMixBadge / 100),
  };
  const quotaSum = quota.item + quota.credits + quota.xp_boost + quota.badge;
  quota.credits = Math.max(0, quota.credits + (tierCount - quotaSum)); // Rundungsrest auf Credits

  // Build all tier upsert rows
  const rows: Record<string, unknown>[] = [];

  for (let tierNumber = 1; tierNumber <= tierCount; tierNumber++) {
    const isMilestone = config.milestoneTierInterval > 0 && tierNumber % config.milestoneTierInterval === 0;

    // Track
    let isPremium = false;
    let isElite = false;
    if (tierNumber <= freeCount) { /* free */ }
    else if (tierNumber <= freeCount + premiumCount) isPremium = true;
    else isElite = true;

    // Reward-Typ: Meilensteine = fettes 3D-Item; sonst greedy nach größtem Restkontingent
    let rewardType: BpRewardType;
    if (isMilestone && hasAnyItems) {
      rewardType = "item";
    } else {
      const order: BpRewardType[] = ["item", "credits", "xp_boost", "badge"];
      let best: BpRewardType = "credits";
      let bestN = -1;
      for (const t of order) { if (quota[t] > bestN) { bestN = quota[t]; best = t; } }
      rewardType = bestN > 0 ? best : "credits";
    }
    if (quota[rewardType] !== undefined && quota[rewardType] > 0) quota[rewardType]--;

    // Item-Reward → echtes Item nach Seltenheit (Meilenstein = Top-Seltenheit)
    let reward_item_id: string | null = null;
    let reward_item_type: string | null = null;
    let reward_item_rarity: Rarity | null = null;
    let pickedName: string | null = null;
    if (rewardType === "item") {
      const rar: Rarity = isMilestone ? "ultra" : rarityForTier(tierNumber);
      if (config.resolveRandomItems !== false) {
        // Konkretes Item schon jetzt auswürfeln → echtes 3D-Modell + echter Name in der Kachel
        const it = pickItem(rar);
        if (it) { reward_item_id = it.id; reward_item_type = it.type; reward_item_rarity = rar; pickedName = it.name; }
        else { rewardType = "credits"; } // keine Items vorhanden
      } else {
        // Als Überraschungs-Drop belassen — Item wird erst beim Claim gewürfelt
        rewardType = "random_item";
        reward_item_rarity = rar;
      }
    }

    // Credits (progressiv, Meilenstein verdoppelt)
    let reward_credits: number | null = null;
    if (rewardType === "credits") {
      reward_credits = config.creditProgression
        ? Math.round(config.creditMin + (config.creditMax - config.creditMin) * ((tierNumber - 1) / Math.max(1, tierCount - 1)))
        : Math.round((config.creditMin + config.creditMax) / 2);
      if (isMilestone) reward_credits = Math.round(reward_credits * 2);
    }

    // XP-Boost (1–3 Tage, steigend)
    const reward_xp_boost = rewardType === "xp_boost" ? (1 + Math.floor((tierNumber / Math.max(1, tierCount)) * 3)) : null;

    // Badge — IMMER gültiger Key (nur bp_milestone ist geseedet) → nie leer/kaputt
    const reward_badge_key = rewardType === "badge" ? "bp_milestone" : null;
    const reward_badge_text = rewardType === "badge" ? (isMilestone ? `Meilenstein ${tierNumber}` : "Season Badge") : null;

    // Icon + Name
    const icon = isMilestone ? "⭐"
      : rewardType === "credits" ? "💰"
      : rewardType === "item" ? "📦"
      : rewardType === "xp_boost" ? "⚡" : "🏆";
    // Aussagekräftiger Name (User will Items immer mit echtem Namen sehen)
    const name =
      rewardType === "item" ? (pickedName ?? `Level ${tierNumber}`)
      : rewardType === "credits" ? (isMilestone ? `Meilenstein ${tierNumber}` : "Credits")
      : rewardType === "random_item" ? "Zufalls-Item"
      : rewardType === "xp_boost" ? "XP-Boost"
      : rewardType === "badge" ? (reward_badge_text ?? "Season Badge")
      : `Level ${tierNumber}`;
    const tierDisplayMode = (config.milestoneAlways3D && isMilestone) ? "3d" : (config.defaultDisplayMode ?? "3d");

    rows.push({
      pass_id: passId,
      tier_number: tierNumber,
      name,
      is_premium: isPremium,
      is_elite: isElite,
      reward_type: rewardType,
      reward_credits,
      reward_item_id,
      reward_item_type,
      reward_badge_key,
      reward_badge_text,
      reward_item_rarity,
      reward_xp_boost,
      reward_name_style_key: null,
      reward_ability_key: null,
      reward_quantity: 1,
      highlight_tier: isMilestone,
      description: null,
      icon,
      display_mode: tierDisplayMode,
      show_tier_name: true,
      show_tier_description: true,
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

  await broadcastBpChange();
  revalidatePath("/admin");
  revalidatePath("/battlepass");
  return { success: true, count: rows.length };
}
