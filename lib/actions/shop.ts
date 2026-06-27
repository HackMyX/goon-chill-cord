"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { broadcastLive } from "@/lib/realtime-broadcast";
import { notifyUser } from "@/lib/notifications-internal";
import { getSiteConfig } from "@/lib/actions/site-config";
import {
  DEFAULT_SHOP_SETTINGS,
  SHOP_RARITY_PICK_WEIGHT,
  roundToNicePrice,
  shopDateKey,
  type ShopSettings,
} from "@/lib/shop";
import { logDebugEvent, logActivity } from "@/lib/debug-log-server";
import type { Rarity } from "@/lib/cases";

function logServerError(scope: string, message: string, detail?: string) {
  console.error(`[${scope}] ${message}`, detail ?? "");
  void logDebugEvent({ scope, message, detail });
}

// ---------------------------------------------------------------------------
// Shop categories + per-day scheduling
// ---------------------------------------------------------------------------

export interface ShopCategoryDayRule {
  id: string;
  dayOfWeek: number | null;
  specificDate: string | null;
  enabled: boolean;
  rarityFilter: Rarity[] | null;
  typeFilter: string[] | null;
  itemCountOverride: number | null;
}

export interface ShopCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
  rarityFilter: Rarity[] | null;
  typeFilter: string[] | null;
  itemCount: number;
  priceMultiplierMin: number;
  priceMultiplierMax: number;
  dayRules: ShopCategoryDayRule[];
}

function mapDayRule(row: {
  id: string;
  day_of_week: number | null;
  specific_date: string | null;
  enabled: boolean;
  rarity_filter: string[] | null;
  type_filter: string[] | null;
  item_count_override: number | null;
}): ShopCategoryDayRule {
  return {
    id: row.id,
    dayOfWeek: row.day_of_week,
    specificDate: row.specific_date,
    enabled: row.enabled,
    rarityFilter: (row.rarity_filter as Rarity[] | null) ?? null,
    typeFilter: row.type_filter,
    itemCountOverride: row.item_count_override,
  };
}

/** Admin-only — every read here is for the Shop tab's category manager,
 * never the player-facing shop, so it's fine to always require admin. */
export async function listShopCategories(): Promise<ShopCategory[]> {
  const auth = await requireAdmin();
  if (!auth.ok) return [];

  const admin = createAdminClient();
  const [{ data: categories }, { data: rules }] = await Promise.all([
    admin.from("shop_categories").select("*").order("sort_order", { ascending: true }),
    admin.from("shop_category_day_rules").select("*"),
  ]);

  const rulesByCategory = new Map<string, ShopCategoryDayRule[]>();
  for (const row of rules ?? []) {
    const list = rulesByCategory.get(row.category_id) ?? [];
    list.push(mapDayRule(row));
    rulesByCategory.set(row.category_id, list);
  }

  return (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    enabled: c.enabled,
    sortOrder: c.sort_order,
    rarityFilter: (c.rarity_filter as Rarity[] | null) ?? null,
    typeFilter: c.type_filter,
    itemCount: c.item_count,
    priceMultiplierMin: c.price_multiplier_min,
    priceMultiplierMax: c.price_multiplier_max,
    dayRules: rulesByCategory.get(c.id) ?? [],
  }));
}

export interface UpsertShopCategoryInput {
  id?: string;
  name: string;
  icon: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
  rarityFilter: Rarity[] | null;
  typeFilter: string[] | null;
  itemCount: number;
  priceMultiplierMin: number;
  priceMultiplierMax: number;
}

export async function upsertShopCategory(input: UpsertShopCategoryInput): Promise<{ success: boolean; error?: string; id?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  if (!input.name.trim()) return { success: false, error: "Name ist erforderlich." };
  if (input.itemCount < 0 || input.itemCount > 50) return { success: false, error: "Item-Anzahl muss zwischen 0 und 50 liegen." };
  if (input.priceMultiplierMin <= 0 || input.priceMultiplierMax <= 0 || input.priceMultiplierMin > input.priceMultiplierMax) {
    return { success: false, error: "Ungültige Preis-Multiplikatoren." };
  }

  const admin = createAdminClient();
  const payload = {
    name: input.name.trim(),
    icon: input.icon,
    color: input.color,
    enabled: input.enabled,
    sort_order: Math.floor(input.sortOrder),
    rarity_filter: input.rarityFilter,
    type_filter: input.typeFilter,
    item_count: Math.floor(input.itemCount),
    price_multiplier_min: input.priceMultiplierMin,
    price_multiplier_max: input.priceMultiplierMax,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = input.id
    ? await admin.from("shop_categories").update(payload).eq("id", input.id).select("id").single()
    : await admin.from("shop_categories").insert(payload).select("id").single();

  if (error || !data) {
    logServerError("Shop", "upsertShopCategory failed", error?.message);
    return { success: false, error: "Speichern fehlgeschlagen — ist die Kategorien-Migration eingespielt?" };
  }

  revalidatePath("/admin");
  revalidatePath("/shop");
  return { success: true, id: data.id };
}

export async function deleteShopCategory(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin.from("shop_categories").delete().eq("id", id);
  if (error) return { success: false, error: "Löschen fehlgeschlagen." };

  revalidatePath("/admin");
  revalidatePath("/shop");
  return { success: true };
}

export interface UpsertShopCategoryDayRuleInput {
  categoryId: string;
  dayOfWeek?: number | null;
  specificDate?: string | null;
  enabled: boolean;
  rarityFilter: Rarity[] | null;
  typeFilter: string[] | null;
  itemCountOverride: number | null;
}

/** Upserts by the same (category_id, day_of_week) / (category_id,
 * specific_date) uniqueness the DB enforces — finds any existing row for
 * that exact slot first since Supabase's `.upsert()` needs an explicit
 * conflict target that matches a real constraint, and the two slot kinds
 * share one table with two different partial-unique indexes. */
export async function upsertShopCategoryDayRule(
  input: UpsertShopCategoryDayRuleInput
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const hasDay = typeof input.dayOfWeek === "number";
  const hasDate = typeof input.specificDate === "string" && input.specificDate.length > 0;
  if (hasDay === hasDate) {
    return { success: false, error: "Genau eines von Wochentag oder Datum muss gesetzt sein." };
  }
  if (hasDay && (input.dayOfWeek! < 0 || input.dayOfWeek! > 6)) {
    return { success: false, error: "Ungültiger Wochentag." };
  }

  const admin = createAdminClient();
  const payload = {
    category_id: input.categoryId,
    day_of_week: hasDay ? input.dayOfWeek : null,
    specific_date: hasDate ? input.specificDate : null,
    enabled: input.enabled,
    rarity_filter: input.rarityFilter,
    type_filter: input.typeFilter,
    item_count_override: input.itemCountOverride,
    updated_at: new Date().toISOString(),
  };

  let query = admin.from("shop_category_day_rules").select("id").eq("category_id", input.categoryId);
  query = hasDay ? query.eq("day_of_week", input.dayOfWeek!) : query.eq("specific_date", input.specificDate!);
  const { data: existing } = await query.maybeSingle();

  const { error } = existing
    ? await admin.from("shop_category_day_rules").update(payload).eq("id", existing.id)
    : await admin.from("shop_category_day_rules").insert(payload);

  if (error) {
    logServerError("Shop", "upsertShopCategoryDayRule failed", error.message);
    return { success: false, error: "Speichern fehlgeschlagen." };
  }

  revalidatePath("/admin");
  revalidatePath("/shop");
  return { success: true };
}

export async function deleteShopCategoryDayRule(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin.from("shop_category_day_rules").delete().eq("id", id);
  if (error) return { success: false, error: "Löschen fehlgeschlagen." };

  revalidatePath("/admin");
  revalidatePath("/shop");
  return { success: true };
}

interface ShopSettingsRow {
  auto_generate_enabled: boolean;
  auto_generate_item_count: number;
  auto_generate_price_multiplier_min: number;
  auto_generate_price_multiplier_max: number;
  auto_generate_item_types: string[] | null;
  motd: string | null;
  motd_enabled: boolean | null;
}

function rowToSettings(row: ShopSettingsRow): ShopSettings {
  return {
    autoGenerateEnabled: row.auto_generate_enabled,
    autoGenerateItemCount: row.auto_generate_item_count,
    autoGeneratePriceMultiplierMin: row.auto_generate_price_multiplier_min,
    autoGeneratePriceMultiplierMax: row.auto_generate_price_multiplier_max,
    autoGenerateItemTypes: row.auto_generate_item_types ?? DEFAULT_SHOP_SETTINGS.autoGenerateItemTypes,
    motd: row.motd ?? null,
    motdEnabled: row.motd_enabled ?? false,
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
      "auto_generate_enabled, auto_generate_item_count, auto_generate_price_multiplier_min, auto_generate_price_multiplier_max, auto_generate_item_types, motd, motd_enabled"
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
    motd: input.motd ?? null,
    motd_enabled: input.motdEnabled,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    void logDebugEvent({ level: "error", scope: "admin:shop", message: "Shop-Settings Speichern fehlgeschlagen", detail: error.message, context: { userId: user.id } });
    logServerError("Shop", "updateShopSettings failed", error.message);
    return { success: false, error: "Speichern fehlgeschlagen." };
  }

  void logActivity("admin:shop", `Shop-Settings gespeichert (${input.autoGenerateItemCount} Items/Tag, AutoGen: ${input.autoGenerateEnabled ? "an" : "aus"})`, { userId: user.id });
  await broadcastLive("shop-live");
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

/** Day-of-week for a `shopDateKey()` string, UTC, 0=Sunday..6=Saturday —
 * matches `shop_category_day_rules.day_of_week`'s convention. Parsing as
 * an explicit UTC midnight (not `new Date(dateKey)`, which some JS
 * engines treat as local time for date-only strings) keeps this in sync
 * with shopDateKey()'s own UTC-day convention. */
function dayOfWeekForDateKey(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

interface ResolvedCategoryRule {
  enabled: boolean;
  rarityFilter: Rarity[] | null;
  typeFilter: string[] | null;
  itemCount: number;
}

/** Specific-date rules beat day-of-week rules beat the category's own
 * defaults — this is what lets "every Monday only selten" coexist with
 * "but the 4th of July is a one-off ultra-only special" for the same
 * category without the two ever conflicting on which one wins. */
function resolveCategoryRuleForDate(category: ShopCategory, dateKey: string): ResolvedCategoryRule {
  const dow = dayOfWeekForDateKey(dateKey);
  const dateRule = category.dayRules.find((r) => r.specificDate === dateKey);
  const dowRule = category.dayRules.find((r) => r.dayOfWeek === dow);
  const rule = dateRule ?? dowRule ?? null;

  return {
    enabled: rule ? rule.enabled : true,
    rarityFilter: rule?.rarityFilter ?? category.rarityFilter,
    typeFilter: rule?.typeFilter ?? category.typeFilter,
    itemCount: rule?.itemCountOverride ?? category.itemCount,
  };
}

type ShopItemCandidate = { id: string; rarity: Rarity; type: string; price_cr: number };

/**
 * Lazily generates the procedural ("Automatik") portion of a given day's
 * shop the first time anyone loads it that day — there's no cron job in
 * this app, same pattern as sweepExpiredAuctions(). Manual listings an
 * admin already staged for that date (e.g. pre-loading tomorrow's shop)
 * are counted first and never touched/duplicated; generation only adds on
 * top of them.
 *
 * Category-aware: when `shop_categories` has any enabled rows, each one
 * contributes its own slice of the day's shop — independently filtered by
 * rarity/type, independently priced, and independently scheduled (a
 * per-weekday or per-specific-date rule can change its filters, item
 * count, or turn it off entirely for that one day; see
 * resolveCategoryRuleForDate()). With zero categories configured (a fresh
 * install, or before this feature existed), this falls back to the
 * original flat global-settings behavior so nothing breaks for sites that
 * haven't set categories up yet.
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

  const excludeIds = new Set(existingRows.map((row) => row.item_id));

  const { data: categoryRows } = await admin
    .from("shop_categories")
    .select("*")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  const { data: allRuleRows } =
    categoryRows && categoryRows.length > 0
      ? await admin.from("shop_category_day_rules").select("*").in("category_id", categoryRows.map((c) => c.id))
      : { data: [] as never[] };

  const categories: ShopCategory[] = (categoryRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    color: c.color,
    enabled: c.enabled,
    sortOrder: c.sort_order,
    rarityFilter: (c.rarity_filter as Rarity[] | null) ?? null,
    typeFilter: c.type_filter,
    itemCount: c.item_count,
    priceMultiplierMin: c.price_multiplier_min,
    priceMultiplierMax: c.price_multiplier_max,
    dayRules: (allRuleRows ?? []).filter((r) => r.category_id === c.id).map(mapDayRule),
  }));

  const newRows: {
    shop_date: string;
    item_id: string;
    price_cr: number;
    purchase_limit: number;
    featured: boolean;
    source: "auto";
    category_id: string | null;
  }[] = [];

  if (categories.length === 0) {
    // Legacy fallback — no categories configured at all.
    const needed = settings.autoGenerateItemCount - existingRows.length;
    if (needed > 0) {
      const { data: candidatePool } = await admin.from("items").select("id, rarity, price_cr").in("type", settings.autoGenerateItemTypes);
      const pool = (candidatePool ?? []).filter((item) => !excludeIds.has(item.id));
      const chosen = pickWeightedItems(pool as { id: string; rarity: Rarity; price_cr: number }[], needed);
      for (const item of chosen) {
        const multiplier =
          settings.autoGeneratePriceMultiplierMin +
          Math.random() * (settings.autoGeneratePriceMultiplierMax - settings.autoGeneratePriceMultiplierMin);
        const basePrice = Math.max(item.price_cr, 50);
        newRows.push({
          shop_date: dateKey,
          item_id: item.id,
          price_cr: roundToNicePrice(basePrice * multiplier),
          purchase_limit: 1,
          featured: item.rarity === "mythisch" || item.rarity === "ultra",
          source: "auto",
          category_id: null,
        });
        excludeIds.add(item.id);
      }
    }
  } else {
    // One big pool, fetched once — each category below filters its own
    // slice out of it client-side rather than re-querying per category.
    const { data: allItems } = await admin.from("items").select("id, rarity, type, price_cr");
    const itemPool = (allItems ?? []) as ShopItemCandidate[];

    for (const category of categories) {
      const rule = resolveCategoryRuleForDate(category, dateKey);
      if (!rule.enabled || rule.itemCount <= 0) continue;

      const candidates = itemPool.filter(
        (item) =>
          !excludeIds.has(item.id) &&
          (rule.rarityFilter === null || rule.rarityFilter.includes(item.rarity)) &&
          (rule.typeFilter === null || rule.typeFilter.includes(item.type))
      );
      if (candidates.length === 0) continue;

      const chosen = pickWeightedItems(candidates, rule.itemCount);
      for (const item of chosen) {
        const multiplier = category.priceMultiplierMin + Math.random() * (category.priceMultiplierMax - category.priceMultiplierMin);
        const basePrice = Math.max(item.price_cr, 50);
        newRows.push({
          shop_date: dateKey,
          item_id: item.id,
          price_cr: roundToNicePrice(basePrice * multiplier),
          purchase_limit: 1,
          featured: item.rarity === "mythisch" || item.rarity === "ultra",
          source: "auto",
          category_id: category.id,
        });
        excludeIds.add(item.id);
      }
    }
  }

  if (newRows.length === 0) return;

  const { error } = await admin.from("shop_listings").insert(newRows);
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
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  categorySortOrder: number;
}

export interface ShopCategoryMeta {
  id: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
}

export interface TodayShopResult {
  listings: ShopListingEntry[];
  resetsAt: string;
  motd: string | null;
  motdEnabled: boolean;
  categories: ShopCategoryMeta[];
}

/** The player-facing read — also the trigger point for that day's
 * auto-generation (see ensureShopGenerated above). */
export async function getTodayShop(): Promise<TodayShopResult> {
  const today = shopDateKey(new Date());
  await ensureShopGenerated(today);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const withDamage = await admin
    .from("shop_listings")
    .select("id, item_id, price_cr, purchase_limit, featured, source, category_id, item:items(id, name, rarity, type, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec)")
    .eq("shop_date", today)
    .order("featured", { ascending: false });
  let listings: { id: string; item_id: string; price_cr: number; purchase_limit: number; featured: boolean; source: string; category_id: string | null; item: unknown }[] | null =
    withDamage.data;
  if (withDamage.error) {
    const retry = await admin
      .from("shop_listings")
      .select("id, item_id, price_cr, purchase_limit, featured, source, item:items(id, name, rarity, type)")
      .eq("shop_date", today)
      .order("featured", { ascending: false });
    listings = (retry.data ?? []).map((row) => ({
      ...row,
      category_id: null,
      item: row.item ? { ...row.item, damage: null, armor: null, perk_type: null, perk_magnitude: null, shield_hp: null, shield_regen_cooldown_sec: null } : null,
    }));
  }

  // Fetch category metadata for section headers in the player-facing shop
  const listingCategoryIds = Array.from(new Set((listings ?? []).map((l) => l.category_id).filter((id): id is string => !!id)));
  const [purchaseCountsResult, categoryMetaResult, shopSettingsResult] = await Promise.all([
    user && listings && listings.length > 0
      ? admin.from("shop_purchases").select("listing_id").eq("user_id", user.id).in("listing_id", listings!.map((l) => l.id))
      : Promise.resolve({ data: [] as { listing_id: string }[] }),
    listingCategoryIds.length > 0
      ? admin.from("shop_categories").select("id, name, icon, color, sort_order").in("id", listingCategoryIds).order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; name: string; icon: string; color: string; sort_order: number }[] }),
    admin.from("shop_settings").select("motd, motd_enabled").eq("id", "default").single(),
  ]);

  const purchaseCounts = new Map<string, number>();
  for (const p of (purchaseCountsResult as { data: { listing_id: string }[] | null }).data ?? []) {
    purchaseCounts.set(p.listing_id, (purchaseCounts.get(p.listing_id) ?? 0) + 1);
  }
  const categoryMetaRows = (categoryMetaResult as { data: { id: string; name: string; icon: string; color: string; sort_order: number }[] | null }).data ?? [];
  const categoryMetaMap = new Map(categoryMetaRows.map((c) => [c.id, c]));
  const shopSettingsRow = (shopSettingsResult as { data: { motd: string | null; motd_enabled: boolean | null } | null }).data;

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
        const catMeta = l.category_id ? categoryMetaMap.get(l.category_id) : undefined;
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
          categoryId: l.category_id,
          categoryName: catMeta?.name ?? null,
          categoryIcon: catMeta?.icon ?? null,
          categoryColor: catMeta?.color ?? null,
          categorySortOrder: catMeta?.sort_order ?? 999,
        };
      }),
    resetsAt: tomorrow.toISOString(),
    motd: shopSettingsRow?.motd ?? null,
    motdEnabled: shopSettingsRow?.motd_enabled ?? false,
    categories: categoryMetaRows.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      sortOrder: c.sort_order,
    })),
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
  // Optimistic lock: the .eq("credits", profile.credits) guard only deducts if the
  // balance is unchanged since we read it. A failed match returns 0 rows WITHOUT an
  // error, so we MUST check the affected-row count — otherwise a concurrent second
  // purchase (double-click/lag) would skip the charge and still deliver the item.
  const { data: charged, error: creditError } = await admin
    .from("profiles")
    .update({ credits: newCredits })
    .eq("id", user.id)
    .eq("credits", profile.credits)
    .select("id");
  if (creditError || !charged || charged.length === 0) {
    if (creditError) logServerError("Shop", "purchase credit deduction failed", creditError.message);
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

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "shop_purchase",
      payload: { listingId, itemName, price: listing.price_cr, newCredits },
    });
  } catch {
    // best-effort
  }

  const { currencyName } = await getSiteConfig();
  await notifyUser({
    userId: user.id,
    type: "shop_purchase",
    title: "Kauf bestätigt",
    message: `Du hast ${itemName} für ${listing.price_cr.toLocaleString("de-DE")} ${currencyName} im Shop gekauft.`,
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
      "id, item_id, price_cr, purchase_limit, featured, source, category_id, shop_date, item:items(id, name, rarity, type, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec)"
    )
    .eq("shop_date", dateKey)
    .order("featured", { ascending: false });
  let data: { id: string; item_id: string; price_cr: number; purchase_limit: number; featured: boolean; source: string; category_id: string | null; shop_date: string; item: unknown }[] | null =
    withDamage.data;
  if (withDamage.error) {
    const retry = await admin
      .from("shop_listings")
      .select("id, item_id, price_cr, purchase_limit, featured, source, shop_date, item:items(id, name, rarity, type)")
      .eq("shop_date", dateKey)
      .order("featured", { ascending: false });
    data = (retry.data ?? []).map((row) => ({
      ...row,
      category_id: null,
      item: row.item ? { ...row.item, damage: null, armor: null, perk_type: null, perk_magnitude: null, shield_hp: null, shield_regen_cooldown_sec: null } : null,
    }));
  }

  const categoryIds = Array.from(new Set((data ?? []).map((l) => l.category_id).filter((id): id is string => !!id)));
  const { data: categoryRows } =
    categoryIds.length > 0
      ? await admin.from("shop_categories").select("id, name, icon, color, sort_order").in("id", categoryIds)
      : { data: [] as { id: string; name: string; icon: string; color: string; sort_order: number }[] };
  const categoryMeta = new Map((categoryRows ?? []).map((c: { id: string; name: string; icon: string; color: string; sort_order: number }) => [c.id, c]));

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
        categoryId: l.category_id,
        categoryName: l.category_id ? categoryMeta.get(l.category_id)?.name ?? null : null,
        categoryIcon: l.category_id ? categoryMeta.get(l.category_id)?.icon ?? null : null,
        categoryColor: l.category_id ? categoryMeta.get(l.category_id)?.color ?? null : null,
        categorySortOrder: l.category_id ? categoryMeta.get(l.category_id)?.sort_order ?? 999 : 999,
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
    void logDebugEvent({ level: "error", scope: "admin:shop", message: "Shop-Listing Hinzufügen fehlgeschlagen", detail: error.message, context: { itemId: input.itemId, dateKey } });
    logServerError("Shop", "addManualShopListing failed", error.message);
    return { success: false, error: "Hinzufügen fehlgeschlagen." };
  }

  void logActivity("admin:shop", `Manuelles Shop-Listing hinzugefügt: Item ${input.itemId} für ${input.priceCr} CR am ${dateKey}`, { itemId: input.itemId, priceCr: input.priceCr, dateKey });
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

  void logActivity("admin:shop", `Auto-Shop-Listings neu generiert für ${dateKey}`, { dateKey, dateOffsetDays });
  revalidatePath("/admin");
  revalidatePath("/shop");
  return { success: true };
}
