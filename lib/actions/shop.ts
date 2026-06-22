"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { notifyUser } from "@/lib/notifications-internal";
import {
  DEFAULT_SHOP_SETTINGS,
  SHOP_RARITY_PICK_WEIGHT,
  roundToNicePrice,
  shopDateKey,
  type ShopSettings,
} from "@/lib/shop";
import type { Rarity } from "@/lib/cases";

function logServerError(scope: string, message: string, detail?: string) {
  console.error(`[${scope}] ${message}`, detail ?? "");
}

interface ShopSettingsRow {
  auto_generate_enabled: boolean;
  auto_generate_item_count: number;
  auto_generate_price_multiplier_min: number;
  auto_generate_price_multiplier_max: number;
  auto_generate_item_types: string[] | null;
}

function rowToSettings(row: ShopSettingsRow): ShopSettings {
  return {
    autoGenerateEnabled: row.auto_generate_enabled,
    autoGenerateItemCount: row.auto_generate_item_count,
    autoGeneratePriceMultiplierMin: row.auto_generate_price_multiplier_min,
    autoGeneratePriceMultiplierMax: row.auto_generate_price_multiplier_max,
    autoGenerateItemTypes: row.auto_generate_item_types ?? DEFAULT_SHOP_SETTINGS.autoGenerateItemTypes,
  };
}

/** Same "brand-new table, RLS-with-no-policies, must use the service-role
 * client" situation as streak_config/trades/auctions — see
 * lib/actions/streak.ts's getStreakConfig() for the full explanation. */
export async function getShopSettings(): Promise<ShopSettings> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shop_settings")
    .select(
      "auto_generate_enabled, auto_generate_item_count, auto_generate_price_multiplier_min, auto_generate_price_multiplier_max, auto_generate_item_types"
    )
    .eq("id", "default")
    .single();

  if (error || !data) return DEFAULT_SHOP_SETTINGS;
  return rowToSettings(data as ShopSettingsRow);
}

export async function updateShopSettings(
  input: ShopSettings
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", user.id)
    .single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  if (input.autoGenerateItemCount < 0 || input.autoGenerateItemCount > 50) {
    return { success: false, error: "Item-Anzahl muss zwischen 0 und 50 liegen." };
  }
  if (input.autoGeneratePriceMultiplierMin <= 0 || input.autoGeneratePriceMultiplierMax <= 0) {
    return { success: false, error: "Preis-Multiplikatoren müssen positiv sein." };
  }
  if (input.autoGeneratePriceMultiplierMin > input.autoGeneratePriceMultiplierMax) {
    return { success: false, error: "Min-Multiplikator darf nicht über dem Max liegen." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("shop_settings").upsert({
    id: "default",
    auto_generate_enabled: input.autoGenerateEnabled,
    auto_generate_item_count: Math.floor(input.autoGenerateItemCount),
    auto_generate_price_multiplier_min: input.autoGeneratePriceMultiplierMin,
    auto_generate_price_multiplier_max: input.autoGeneratePriceMultiplierMax,
    auto_generate_item_types: input.autoGenerateItemTypes,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    logServerError("Shop", "updateShopSettings failed", error.message);
    return { success: false, error: "Speichern fehlgeschlagen." };
  }

  revalidatePath("/admin");
  revalidatePath("/shop");
  return { success: true };
}

/**
 * Weighted random pick of `count` distinct items matching the configured
 * types, biased toward common rarities (SHOP_RARITY_PICK_WEIGHT) without
 * ever fully excluding rarer ones — so a Mythisch/Ultra item turning up
 * in the shop feels like a small event, not noise and not impossible.
 */
function pickWeightedItems<T extends { id: string; rarity: Rarity }>(pool: T[], count: number): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const weights = remaining.map((item) => SHOP_RARITY_PICK_WEIGHT[item.rarity] ?? 1);
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * total;
    let index = 0;
    for (; index < weights.length; index++) {
      roll -= weights[index];
      if (roll <= 0) break;
    }
    const chosen = remaining.splice(Math.min(index, remaining.length - 1), 1)[0];
    picked.push(chosen);
  }
  return picked;
}

/**
 * Lazily generates the procedural ("Automatik") portion of a given day's
 * shop the first time anyone loads it that day — there's no cron job in
 * this app, same pattern as sweepExpiredAuctions(). Manual listings an
 * admin already staged for that date (e.g. pre-loading tomorrow's shop)
 * are counted first and never touched; generation only tops up the
 * remaining slots to reach the configured item count, which is exactly
 * what lets "the admin places a few exclusive items, the Automatik fills
 * in the rest" work as one combined shop.
 */
async function ensureShopGenerated(dateKey: string): Promise<void> {
  const admin = createAdminClient();
  const settings = await getShopSettings();
  if (!settings.autoGenerateEnabled) return;

  const { data: existing } = await admin
    .from("shop_listings")
    .select("id, item_id, source")
    .eq("shop_date", dateKey);

  const existingRows = existing ?? [];
  const alreadyGenerated = existingRows.some((row) => row.source === "auto");
  if (alreadyGenerated) return;

  const needed = settings.autoGenerateItemCount - existingRows.length;
  if (needed <= 0) return;

  const excludeIds = new Set(existingRows.map((row) => row.item_id));
  const { data: candidatePool } = await admin
    .from("items")
    .select("id, rarity, price_cr")
    .in("type", settings.autoGenerateItemTypes);

  const pool = (candidatePool ?? []).filter((item) => !excludeIds.has(item.id));
  if (pool.length === 0) return;

  const chosen = pickWeightedItems(pool as { id: string; rarity: Rarity; price_cr: number }[], needed);
  const rows = chosen.map((item) => {
    const multiplier =
      settings.autoGeneratePriceMultiplierMin +
      Math.random() * (settings.autoGeneratePriceMultiplierMax - settings.autoGeneratePriceMultiplierMin);
    const basePrice = Math.max(item.price_cr, 50);
    return {
      shop_date: dateKey,
      item_id: item.id,
      price_cr: roundToNicePrice(basePrice * multiplier),
      purchase_limit: 1,
      featured: item.rarity === "mythisch" || item.rarity === "ultra",
      source: "auto",
    };
  });

  const { error } = await admin.from("shop_listings").insert(rows);
  if (error) logServerError("Shop", "ensureShopGenerated insert failed", error.message);
}

export interface ShopListingEntry {
  id: string;
  itemId: string;
  itemName: string;
  itemRarity: Rarity;
  itemType: string;
  itemDamage: number | null;
  itemArmor: number | null;
  itemPerkType: string | null;
  itemPerkMagnitude: number | null;
  itemShieldHp: number | null;
  itemShieldCooldown: number | null;
  priceCr: number;
  purchaseLimit: number;
  featured: boolean;
  source: "manual" | "auto";
  purchasedByMe: number;
}

/** The player-facing read — also the trigger point for that day's
 * auto-generation (see ensureShopGenerated above). */
export async function getTodayShop(): Promise<{ listings: ShopListingEntry[]; resetsAt: string }> {
  const today = shopDateKey(new Date());
  await ensureShopGenerated(today);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const withDamage = await admin
    .from("shop_listings")
    .select("id, item_id, price_cr, purchase_limit, featured, source, item:items(id, name, rarity, type, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec)")
    .eq("shop_date", today)
    .order("featured", { ascending: false });
  let listings: { id: string; item_id: string; price_cr: number; purchase_limit: number; featured: boolean; source: string; item: unknown }[] | null =
    withDamage.data;
  if (withDamage.error) {
    const retry = await admin
      .from("shop_listings")
      .select("id, item_id, price_cr, purchase_limit, featured, source, item:items(id, name, rarity, type)")
      .eq("shop_date", today)
      .order("featured", { ascending: false });
    listings = (retry.data ?? []).map((row) => ({
      ...row,
      item: row.item ? { ...row.item, damage: null, armor: null, perk_type: null, perk_magnitude: null, shield_hp: null, shield_regen_cooldown_sec: null } : null,
    }));
  }

  let purchaseCounts = new Map<string, number>();
  if (user && listings && listings.length > 0) {
    const { data: purchases } = await admin
      .from("shop_purchases")
      .select("listing_id")
      .eq("user_id", user.id)
      .in("listing_id", listings.map((l) => l.id));
    purchaseCounts = new Map();
    for (const p of purchases ?? []) {
      purchaseCounts.set(p.listing_id, (purchaseCounts.get(p.listing_id) ?? 0) + 1);
    }
  }

  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);

  return {
    listings: (listings ?? [])
      .filter((l) => l.item)
      .map((l) => {
        const item = l.item as unknown as {
          id: string; name: string; rarity: Rarity; type: string;
          damage: number | null; armor: number | null;
          perk_type: string | null; perk_magnitude: number | null;
          shield_hp: number | null; shield_regen_cooldown_sec: number | null;
        };
        return {
          id: l.id,
          itemId: item.id,
          itemName: item.name,
          itemRarity: item.rarity,
          itemType: item.type,
          itemDamage: item.damage ?? null,
          itemArmor: item.armor ?? null,
          itemPerkType: item.perk_type ?? null,
          itemPerkMagnitude: item.perk_magnitude ?? null,
          itemShieldHp: item.shield_hp ?? null,
          itemShieldCooldown: item.shield_regen_cooldown_sec ?? null,
          priceCr: l.price_cr,
          purchaseLimit: l.purchase_limit,
          featured: l.featured,
          source: l.source as "manual" | "auto",
          purchasedByMe: purchaseCounts.get(l.id) ?? 0,
        };
      }),
    resetsAt: tomorrow.toISOString(),
  };
}

export interface ShopPurchaseResult {
  success: boolean;
  error?: string;
  newCredits?: number;
}

export async function purchaseShopItem(listingId: string): Promise<ShopPurchaseResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();
  const today = shopDateKey(new Date());

  const { data: listing } = await admin
    .from("shop_listings")
    .select("id, item_id, price_cr, purchase_limit, shop_date, item:items(name)")
    .eq("id", listingId)
    .single();

  if (!listing || listing.shop_date !== today) {
    return { success: false, error: "Dieses Angebot ist nicht mehr verfügbar." };
  }

  const { count: alreadyBought } = await admin
    .from("shop_purchases")
    .select("*", { count: "exact", head: true })
    .eq("listing_id", listingId)
    .eq("user_id", user.id);
  if ((alreadyBought ?? 0) >= listing.purchase_limit) {
    return { success: false, error: "Du hast dieses Item heute schon gekauft." };
  }

  const { data: profile } = await admin.from("profiles").select("credits").eq("id", user.id).single();
  if (!profile || profile.credits < listing.price_cr) {
    return { success: false, error: "Nicht genug Credits." };
  }

  const newCredits = profile.credits - listing.price_cr;
  const { error: creditError } = await admin
    .from("profiles")
    .update({ credits: newCredits })
    .eq("id", user.id)
    .eq("credits", profile.credits);
  if (creditError) {
    logServerError("Shop", "purchase credit deduction failed", creditError.message);
    return { success: false, error: "Kauf fehlgeschlagen — bitte erneut versuchen." };
  }

  const { error: invError } = await admin.from("inventory").insert({
    user_id: user.id,
    item_id: listing.item_id,
    equipped: false,
  });
  if (invError) {
    // Roll back the charge since the item was never actually delivered.
    await admin.from("profiles").update({ credits: profile.credits }).eq("id", user.id);
    logServerError("Shop", "purchase inventory insert failed", invError.message);
    return { success: false, error: "Kauf fehlgeschlagen — bitte erneut versuchen." };
  }

  await admin.from("shop_purchases").insert({
    listing_id: listingId,
    user_id: user.id,
    price_paid: listing.price_cr,
  });

  const itemName = (listing.item as unknown as { name: string } | null)?.name ?? "ein Item";
  await notifyUser({
    userId: user.id,
    type: "shop_purchase",
    title: "Kauf bestätigt",
    message: `Du hast ${itemName} für ${listing.price_cr.toLocaleString("de-DE")} CR im Shop gekauft.`,
    link: "/shop",
  });

  revalidatePath("/shop");
  revalidatePath("/garderobe");
  revalidatePath("/");
  return { success: true, newCredits };
}

// ---- Admin management ----

export interface AdminShopListing extends ShopListingEntry {
  shopDate: string;
}

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Kein Zugriff." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", user.id)
    .single();
  if (!isAdmin(profile)) return { ok: false, error: "Kein Zugriff." };
  return { ok: true };
}

export async function getAdminShopListings(dateOffsetDays: number): Promise<AdminShopListing[]> {
  const auth = await requireAdmin();
  if (!auth.ok) return [];

  const date = new Date();
  date.setUTCDate(date.getUTCDate() + dateOffsetDays);
  const dateKey = shopDateKey(date);

  const admin = createAdminClient();
  const withDamage = await admin
    .from("shop_listings")
    .select(
      "id, item_id, price_cr, purchase_limit, featured, source, shop_date, item:items(id, name, rarity, type, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec)"
    )
    .eq("shop_date", dateKey)
    .order("featured", { ascending: false });
  let data: { id: string; item_id: string; price_cr: number; purchase_limit: number; featured: boolean; source: string; shop_date: string; item: unknown }[] | null =
    withDamage.data;
  if (withDamage.error) {
    const retry = await admin
      .from("shop_listings")
      .select("id, item_id, price_cr, purchase_limit, featured, source, shop_date, item:items(id, name, rarity, type)")
      .eq("shop_date", dateKey)
      .order("featured", { ascending: false });
    data = (retry.data ?? []).map((row) => ({
      ...row,
      item: row.item ? { ...row.item, damage: null, armor: null, perk_type: null, perk_magnitude: null, shield_hp: null, shield_regen_cooldown_sec: null } : null,
    }));
  }

  return (data ?? [])
    .filter((l) => l.item)
    .map((l) => {
      const item = l.item as unknown as {
        id: string; name: string; rarity: Rarity; type: string;
        damage: number | null; armor: number | null;
        perk_type: string | null; perk_magnitude: number | null;
        shield_hp: number | null; shield_regen_cooldown_sec: number | null;
      };
      return {
        id: l.id,
        itemId: item.id,
        itemName: item.name,
        itemRarity: item.rarity,
        itemType: item.type,
        itemDamage: item.damage ?? null,
        itemArmor: item.armor ?? null,
        itemPerkType: item.perk_type ?? null,
        itemPerkMagnitude: item.perk_magnitude ?? null,
        itemShieldHp: item.shield_hp ?? null,
        itemShieldCooldown: item.shield_regen_cooldown_sec ?? null,
        priceCr: l.price_cr,
        purchaseLimit: l.purchase_limit,
        featured: l.featured,
        source: l.source as "manual" | "auto",
        purchasedByMe: 0,
        shopDate: l.shop_date,
      };
    });
}

export async function addManualShopListing(input: {
  dateOffsetDays: number;
  itemId: string;
  priceCr: number;
  purchaseLimit: number;
  featured: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  if (!Number.isFinite(input.priceCr) || input.priceCr < 1) {
    return { success: false, error: "Ungültiger Preis." };
  }

  const date = new Date();
  date.setUTCDate(date.getUTCDate() + input.dateOffsetDays);
  const dateKey = shopDateKey(date);

  const admin = createAdminClient();
  const { error } = await admin.from("shop_listings").insert({
    shop_date: dateKey,
    item_id: input.itemId,
    price_cr: Math.floor(input.priceCr),
    purchase_limit: Math.max(1, Math.floor(input.purchaseLimit)),
    featured: input.featured,
    source: "manual",
  });

  if (error) {
    logServerError("Shop", "addManualShopListing failed", error.message);
    return { success: false, error: "Hinzufügen fehlgeschlagen." };
  }

  revalidatePath("/admin");
  revalidatePath("/shop");
  return { success: true };
}

export async function removeShopListing(listingId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin.from("shop_listings").delete().eq("id", listingId);
  if (error) return { success: false, error: "Entfernen fehlgeschlagen." };

  revalidatePath("/admin");
  revalidatePath("/shop");
  return { success: true };
}

export async function updateShopListing(
  listingId: string,
  patch: { priceCr?: number; purchaseLimit?: number; featured?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const update: Record<string, number | boolean> = {};
  if (patch.priceCr !== undefined) update.price_cr = Math.max(1, Math.floor(patch.priceCr));
  if (patch.purchaseLimit !== undefined) update.purchase_limit = Math.max(1, Math.floor(patch.purchaseLimit));
  if (patch.featured !== undefined) update.featured = patch.featured;

  const admin = createAdminClient();
  const { error } = await admin.from("shop_listings").update(update).eq("id", listingId);
  if (error) return { success: false, error: "Aktualisieren fehlgeschlagen." };

  revalidatePath("/admin");
  revalidatePath("/shop");
  return { success: true };
}

/** Deletes only the auto-generated rows for a date and re-runs
 * generation — manual listings the admin staged are untouched. */
export async function regenerateAutoShopListings(
  dateOffsetDays: number
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const date = new Date();
  date.setUTCDate(date.getUTCDate() + dateOffsetDays);
  const dateKey = shopDateKey(date);

  const admin = createAdminClient();
  await admin.from("shop_listings").delete().eq("shop_date", dateKey).eq("source", "auto");
  await ensureShopGenerated(dateKey);

  revalidatePath("/admin");
  revalidatePath("/shop");
  return { success: true };
}
