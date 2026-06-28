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
import { grantAbility, grantNameStyle, grantBadge, grantCaseVoucher, grantGameBonus } from "@/lib/rewards-grant";

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

export type ShopContentType = "item" | "ability" | "name_style" | "badge" | "voucher";

export interface ShopCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
  /** Which pool this category auto-draws from (default 'item'). */
  contentType: ShopContentType;
  /** For contentType 'voucher': 'case' = Gratis-Case (Seltenheits-Floor), 'game_bonus' = Extra-Spielzüge. */
  voucherKind: ShopVoucherKind;
  voucherGame: string | null;
  voucherAmount: number;
  voucherDurationHours: number;
  rarityFilter: Rarity[] | null;
  typeFilter: string[] | null;
  itemCount: number;
  priceMultiplierMin: number;
  priceMultiplierMax: number;
  dayRules: ShopCategoryDayRule[];
}

export type ShopVoucherKind = "case" | "game_bonus";

/** Fallback price (before the category multiplier) for non-item givables that
 *  don't carry their own price — keyed by rarity. */
const RARITY_BASE_PRICE: Record<string, number> = {
  normal: 1500, selten: 6000, mythisch: 30000, ultra: 120000,
};

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
    contentType: ((c.content_type as ShopContentType) ?? "item"),
    voucherKind: ((c.voucher_kind as ShopVoucherKind) ?? "case"),
    voucherGame: (c.voucher_game as string | null) ?? null,
    voucherAmount: Number(c.voucher_amount ?? 1),
    voucherDurationHours: Number(c.voucher_duration_hours ?? 0),
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
  contentType?: ShopContentType;
  voucherKind?: ShopVoucherKind;
  voucherGame?: string | null;
  voucherAmount?: number;
  voucherDurationHours?: number;
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
    content_type: input.contentType ?? "item",
    voucher_kind: input.voucherKind ?? "case",
    voucher_game: input.voucherKind === "game_bonus" ? (input.voucherGame ?? "plinko") : null,
    voucher_amount: Math.max(1, Math.floor(input.voucherAmount ?? 1)),
    voucher_duration_hours: Math.max(0, Math.floor(input.voucherDurationHours ?? 0)),
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
  rarity_weights: Record<string, number> | null;
  motd: string | null;
  motd_enabled: boolean | null;
}

function rowToSettings(row: ShopSettingsRow): ShopSettings {
  const rw = row.rarity_weights;
  return {
    autoGenerateEnabled: row.auto_generate_enabled,
    autoGenerateItemCount: row.auto_generate_item_count,
    autoGeneratePriceMultiplierMin: row.auto_generate_price_multiplier_min,
    autoGeneratePriceMultiplierMax: row.auto_generate_price_multiplier_max,
    autoGenerateItemTypes: row.auto_generate_item_types ?? DEFAULT_SHOP_SETTINGS.autoGenerateItemTypes,
    rarityWeights: {
      normal: Number(rw?.normal ?? DEFAULT_SHOP_SETTINGS.rarityWeights.normal),
      selten: Number(rw?.selten ?? DEFAULT_SHOP_SETTINGS.rarityWeights.selten),
      mythisch: Number(rw?.mythisch ?? DEFAULT_SHOP_SETTINGS.rarityWeights.mythisch),
      ultra: Number(rw?.ultra ?? DEFAULT_SHOP_SETTINGS.rarityWeights.ultra),
    },
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
      "auto_generate_enabled, auto_generate_item_count, auto_generate_price_multiplier_min, auto_generate_price_multiplier_max, auto_generate_item_types, rarity_weights, motd, motd_enabled"
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
    rarity_weights: input.rarityWeights,
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
function pickWeightedItems<T extends { id: string; rarity: Rarity }>(
  pool: T[],
  count: number,
  rarityWeights: Record<Rarity, number> = SHOP_RARITY_PICK_WEIGHT,
): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const weights = remaining.map((item) => rarityWeights[item.rarity] ?? 1);
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
type GivablePoolEntry = { key: string; rarity: Rarity; base: number; text?: string | null };

/** Candidate pool for a non-item shop category. Draws from ALL enabled
 *  definitions of the type (no per-definition shop flag) — the category config
 *  controls how many / which rarities actually get listed. */
async function fetchGivablePool(admin: ReturnType<typeof createAdminClient>, ct: "ability" | "name_style" | "badge"): Promise<GivablePoolEntry[]> {
  if (ct === "ability") {
    const { data } = await admin.from("ability_definitions").select("key, rarity, shop_price_cr").eq("enabled", true);
    return (data ?? []).map((r) => {
      const rarity = (r.rarity as Rarity) ?? "selten";
      const price = Number(r.shop_price_cr ?? 0);
      return { key: r.key as string, rarity, base: price > 0 ? price : (RARITY_BASE_PRICE[rarity] ?? 6000) };
    });
  }
  if (ct === "name_style") {
    const { data } = await admin.from("name_styles").select("key, rarity, shop_price_cr");
    return (data ?? []).map((r) => {
      const rarity = (r.rarity as Rarity) ?? "selten";
      const price = Number(r.shop_price_cr ?? 0);
      return { key: r.key as string, rarity, base: price > 0 ? price : (RARITY_BASE_PRICE[rarity] ?? 6000) };
    });
  }
  const { data } = await admin.from("badge_definitions").select("key, label");
  return (data ?? []).map((r) => ({ key: r.key as string, rarity: "selten" as Rarity, base: RARITY_BASE_PRICE["selten"], text: (r.label as string) ?? null }));
}

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
    contentType: ((c.content_type as ShopContentType) ?? "item"),
    voucherKind: ((c.voucher_kind as ShopVoucherKind) ?? "case"),
    voucherGame: (c.voucher_game as string | null) ?? null,
    voucherAmount: Number(c.voucher_amount ?? 1),
    voucherDurationHours: Number(c.voucher_duration_hours ?? 0),
    rarityFilter: (c.rarity_filter as Rarity[] | null) ?? null,
    typeFilter: c.type_filter,
    itemCount: c.item_count,
    priceMultiplierMin: c.price_multiplier_min,
    priceMultiplierMax: c.price_multiplier_max,
    dayRules: (allRuleRows ?? []).filter((r) => r.category_id === c.id).map(mapDayRule),
  }));

  const newRows: Record<string, unknown>[] = [];

  if (categories.length === 0) {
    // Legacy fallback — no categories configured at all.
    const needed = settings.autoGenerateItemCount - existingRows.length;
    if (needed > 0) {
      const { data: candidatePool } = await admin.from("items").select("id, rarity, price_cr").in("type", settings.autoGenerateItemTypes);
      const pool = (candidatePool ?? []).filter((item) => !excludeIds.has(item.id));
      const chosen = pickWeightedItems(pool as { id: string; rarity: Rarity; price_cr: number }[], needed, settings.rarityWeights);
      for (const item of chosen) {
        const multiplier =
          settings.autoGeneratePriceMultiplierMin +
          Math.random() * (settings.autoGeneratePriceMultiplierMax - settings.autoGeneratePriceMultiplierMin);
        const basePrice = Math.max(item.price_cr, 50);
        newRows.push({
          shop_date: dateKey,
          listing_type: "item",
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
    // One big item pool, fetched once — item categories filter their slice
    // client-side. Non-item categories pull from their own givable pool.
    const { data: allItems } = await admin.from("items").select("id, rarity, type, price_cr");
    const itemPool = (allItems ?? []) as ShopItemCandidate[];

    for (const category of categories) {
      const rule = resolveCategoryRuleForDate(category, dateKey);
      if (!rule.enabled || rule.itemCount <= 0) continue;
      const priceMult = () => category.priceMultiplierMin + Math.random() * (category.priceMultiplierMax - category.priceMultiplierMin);

      if (category.contentType === "item") {
        const candidates = itemPool.filter(
          (item) =>
            !excludeIds.has(item.id) &&
            (rule.rarityFilter === null || rule.rarityFilter.includes(item.rarity)) &&
            (rule.typeFilter === null || rule.typeFilter.includes(item.type))
        );
        if (candidates.length === 0) continue;
        for (const item of pickWeightedItems(candidates, rule.itemCount, settings.rarityWeights)) {
          const basePrice = Math.max(item.price_cr, 50);
          newRows.push({
            shop_date: dateKey, listing_type: "item", item_id: item.id,
            price_cr: roundToNicePrice(basePrice * priceMult()), purchase_limit: 1,
            featured: item.rarity === "mythisch" || item.rarity === "ultra", source: "auto", category_id: category.id,
          });
          excludeIds.add(item.id);
        }
      } else if (category.contentType === "voucher") {
        // Vouchers have no definition pool — the category GENERATES them.
        if (category.voucherKind === "game_bonus") {
          // Extra-Spielzüge für ein Spiel (Plinko/Snake/DON). Preis skaliert mit Anzahl.
          const game = (category.voucherGame === "snake" || category.voucherGame === "don") ? category.voucherGame : "plinko";
          const amount = Math.max(1, Math.floor(category.voucherAmount || 1));
          const durationHours = Math.max(0, Math.floor(category.voucherDurationHours || 0));
          for (let i = 0; i < rule.itemCount; i++) {
            newRows.push({
              shop_date: dateKey, listing_type: "voucher",
              voucher_config: { kind: "game_bonus", game, amount, durationHours },
              price_cr: roundToNicePrice(Math.max(amount * 1200, 500) * priceMult()),
              purchase_limit: 1, featured: false, source: "auto", category_id: category.id,
            });
          }
        } else {
          // Gratis-Case mit Seltenheits-Floor aus dem Rarity-Filter.
          const rarities = (rule.rarityFilter && rule.rarityFilter.length > 0)
            ? rule.rarityFilter
            : (["normal", "selten", "mythisch", "ultra"] as Rarity[]);
          for (let i = 0; i < rule.itemCount; i++) {
            const rarity = rarities[Math.floor(Math.random() * rarities.length)];
            newRows.push({
              shop_date: dateKey, listing_type: "voucher",
              voucher_config: { kind: "case", mode: "rarity", rarityFloor: rarity },
              price_cr: roundToNicePrice((RARITY_BASE_PRICE[rarity] ?? 6000) * priceMult()),
              purchase_limit: 1, featured: rarity === "mythisch" || rarity === "ultra", source: "auto", category_id: category.id,
            });
          }
        }
      } else {
        // Non-item definition pool — auto-draws from ALL enabled definitions of
        // this type — no per-definition "Im Shop verfügbar" flag (the category IS the gate).
        const pool = await fetchGivablePool(admin, category.contentType as "ability" | "name_style" | "badge");
        const candidates = pool.filter(
          (p) => !excludeIds.has(`${category.contentType}:${p.key}`) &&
            (rule.rarityFilter === null || rule.rarityFilter.includes(p.rarity)),
        );
        if (candidates.length === 0) continue;
        for (const c of pickWeightedItems(candidates.map((p) => ({ id: p.key, rarity: p.rarity, base: p.base, text: p.text })), rule.itemCount, settings.rarityWeights)) {
          const row: Record<string, unknown> = {
            shop_date: dateKey, listing_type: category.contentType,
            price_cr: roundToNicePrice(Math.max(c.base, 100) * priceMult()), purchase_limit: 1,
            featured: c.rarity === "mythisch" || c.rarity === "ultra", source: "auto", category_id: category.id,
          };
          if (category.contentType === "ability") row.ability_key = c.id;
          else if (category.contentType === "name_style") row.name_style_key = c.id;
          else if (category.contentType === "badge") { row.badge_key = c.id; row.badge_text = c.text ?? null; }
          newRows.push(row);
          excludeIds.add(`${category.contentType}:${c.id}`);
        }
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
    .select("id, item_id, listing_type, ability_key, name_style_key, badge_key, badge_text, voucher_config, price_cr, purchase_limit, shop_date, item:items(name)")
    .eq("id", listingId)
    .single();

  if (!listing || listing.shop_date !== today) {
    return { success: false, error: "Dieses Angebot ist nicht mehr verfügbar." };
  }
  const listingType = (listing.listing_type as string) ?? "item";

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

  // Deliver the purchase. Items go to the inventory; every other type is granted
  // through the central reward granters. On ANY failure the charge is rolled back.
  let deliveredName = "ein Item";
  const rollback = async () => { await admin.from("profiles").update({ credits: profile.credits }).eq("id", user.id); };
  if (listingType === "item") {
    const { error: invError } = await admin.from("inventory").insert({ user_id: user.id, item_id: listing.item_id, equipped: false });
    if (invError) { await rollback(); logServerError("Shop", "purchase inventory insert failed", invError.message); return { success: false, error: "Kauf fehlgeschlagen — bitte erneut versuchen." }; }
    deliveredName = (listing.item as unknown as { name: string } | null)?.name ?? "ein Item";
  } else {
    let g: { ok: boolean; error?: string; summary: string };
    if (listingType === "ability") g = await grantAbility(admin, user.id, { abilityKey: (listing.ability_key as string) ?? "", source: "shop_purchase", sourceDetail: "Shop-Kauf" });
    else if (listingType === "name_style") g = await grantNameStyle(admin, user.id, { styleKey: (listing.name_style_key as string) ?? "", source: "shop_purchase" });
    else if (listingType === "badge") g = await grantBadge(admin, user.id, { badgeKey: (listing.badge_key as string) ?? "" });
    else if (listingType === "voucher") {
      const vc = (listing.voucher_config ?? {}) as Record<string, unknown>;
      if ((vc.kind as string) === "game_bonus") g = await grantGameBonus(admin, user.id, { game: vc.game as "plinko" | "snake" | "don", amount: Number(vc.amount ?? 1), durationHours: Number(vc.durationHours ?? 0), source: "shop_purchase" });
      else g = await grantCaseVoucher(admin, user.id, { mode: (vc.mode as "tier" | "rarity") ?? "tier", tierId: vc.tierId as string | undefined, rarityFloor: vc.rarityFloor as Rarity | undefined, durationHours: Number(vc.durationHours ?? 0), source: "shop_purchase" });
    }
    else g = { ok: false, error: "Unbekannter Angebots-Typ.", summary: "" };
    if (!g.ok) { await rollback(); return { success: false, error: g.error ?? "Kauf fehlgeschlagen." }; }
    deliveredName = g.summary;
  }

  await admin.from("shop_purchases").insert({
    listing_id: listingId,
    user_id: user.id,
    price_paid: listing.price_cr,
  });

  const itemName = deliveredName;

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "shop_purchase",
      payload: { listingId, itemName, price: listing.price_cr, listingType, newCredits },
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
  /** 'item' | 'ability' | 'name_style' | 'badge' | 'voucher' */
  listingType: string;
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
  const { data: rawRows } = await admin
    .from("shop_listings")
    .select("id, item_id, listing_type, ability_key, name_style_key, badge_key, badge_text, voucher_config, price_cr, purchase_limit, featured, source, category_id, shop_date, item:items(id, name, rarity, type, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec)")
    .eq("shop_date", dateKey)
    .order("featured", { ascending: false });
  const rows = (rawRows ?? []) as Record<string, unknown>[];

  const categoryIds = Array.from(new Set(rows.map((l) => l.category_id as string | null).filter((id): id is string => !!id)));
  const { data: categoryRows } =
    categoryIds.length > 0
      ? await admin.from("shop_categories").select("id, name, icon, color, sort_order").in("id", categoryIds)
      : { data: [] as { id: string; name: string; icon: string; color: string; sort_order: number }[] };
  const categoryMeta = new Map((categoryRows ?? []).map((c: { id: string; name: string; icon: string; color: string; sort_order: number }) => [c.id, c]));

  // Labels für Nicht-Item-Listings auflösen (damit der Admin sie sieht + entfernen kann).
  const abilityKeys = [...new Set(rows.filter((r) => r.listing_type === "ability" && r.ability_key).map((r) => r.ability_key as string))];
  const styleKeys = [...new Set(rows.filter((r) => r.listing_type === "name_style" && r.name_style_key).map((r) => r.name_style_key as string))];
  const badgeKeys = [...new Set(rows.filter((r) => r.listing_type === "badge" && r.badge_key).map((r) => r.badge_key as string))];
  const [ab, st, ba] = await Promise.all([
    abilityKeys.length ? admin.from("ability_definitions").select("key, name, rarity").in("key", abilityKeys) : Promise.resolve({ data: [] }),
    styleKeys.length ? admin.from("name_styles").select("key, label, rarity").in("key", styleKeys) : Promise.resolve({ data: [] }),
    badgeKeys.length ? admin.from("badge_definitions").select("key, label").in("key", badgeKeys) : Promise.resolve({ data: [] }),
  ]);
  const toMap = (d: unknown) => new Map(((d ?? []) as Record<string, unknown>[]).map((r) => [r.key as string, r]));
  const abMap = toMap(ab.data); const stMap = toMap(st.data); const baMap = toMap(ba.data);

  const catFields = (categoryId: string | null) => ({
    categoryId,
    categoryName: categoryId ? categoryMeta.get(categoryId)?.name ?? null : null,
    categoryIcon: categoryId ? categoryMeta.get(categoryId)?.icon ?? null : null,
    categoryColor: categoryId ? categoryMeta.get(categoryId)?.color ?? null : null,
    categorySortOrder: categoryId ? categoryMeta.get(categoryId)?.sort_order ?? 999 : 999,
  });

  const out: AdminShopListing[] = [];
  for (const l of rows) {
    const lt = (l.listing_type as string) ?? "item";
    const base = {
      id: l.id as string,
      priceCr: l.price_cr as number,
      purchaseLimit: l.purchase_limit as number,
      featured: l.featured as boolean,
      source: l.source as "manual" | "auto",
      purchasedByMe: 0,
      shopDate: l.shop_date as string,
      listingType: lt,
      itemDamage: null, itemArmor: null, itemPerkType: null, itemPerkMagnitude: null, itemShieldHp: null, itemShieldCooldown: null,
      ...catFields((l.category_id as string | null) ?? null),
    };
    if (lt === "item") {
      const item = l.item as Record<string, unknown> | null;
      if (!item) continue; // verwaistes Item-Listing
      out.push({ ...base, itemId: item.id as string, itemName: item.name as string, itemRarity: item.rarity as Rarity, itemType: item.type as string,
        itemDamage: (item.damage as number | null) ?? null, itemArmor: (item.armor as number | null) ?? null, itemPerkType: (item.perk_type as string | null) ?? null,
        itemPerkMagnitude: (item.perk_magnitude as number | null) ?? null, itemShieldHp: (item.shield_hp as number | null) ?? null, itemShieldCooldown: (item.shield_regen_cooldown_sec as number | null) ?? null });
    } else if (lt === "ability") {
      const d = abMap.get(l.ability_key as string);
      out.push({ ...base, itemId: "", itemName: `Fähigkeit: ${(d?.name as string) ?? l.ability_key}`, itemRarity: ((d?.rarity as Rarity) ?? "selten"), itemType: "ability" });
    } else if (lt === "name_style") {
      const d = stMap.get(l.name_style_key as string);
      out.push({ ...base, itemId: "", itemName: `Name-Style: ${(d?.label as string) ?? l.name_style_key}`, itemRarity: ((d?.rarity as Rarity) ?? "selten"), itemType: "name_style" });
    } else if (lt === "badge") {
      const d = baMap.get(l.badge_key as string);
      out.push({ ...base, itemId: "", itemName: `Badge: ${(l.badge_text as string) || (d?.label as string) || (l.badge_key as string)}`, itemRarity: "selten", itemType: "badge" });
    } else if (lt === "voucher") {
      const vc = (l.voucher_config ?? {}) as Record<string, unknown>;
      const isBonus = vc.kind === "game_bonus";
      const label = isBonus ? `Gutschein: +${vc.amount ?? 0} ${vc.game ?? "Spiel"}` : `Gutschein: Gratis-Case (${vc.rarityFloor ?? "?"})`;
      out.push({ ...base, itemId: "", itemName: label, itemRarity: "selten", itemType: "voucher" });
    }
  }
  return out;
}

export async function addManualShopListing(input: {
  dateOffsetDays: number;
  priceCr: number;
  purchaseLimit: number;
  featured: boolean;
  /** Default 'item' (rückwärtskompatibel). Sonst Fähigkeit/Name-Style/Badge/Gutschein. */
  listingType?: ShopContentType;
  itemId?: string;
  abilityKey?: string;
  nameStyleKey?: string;
  badgeKey?: string;
  badgeText?: string;
  voucherConfig?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  if (!Number.isFinite(input.priceCr) || input.priceCr < 1) {
    return { success: false, error: "Ungültiger Preis." };
  }

  const lt = input.listingType ?? "item";
  const row: Record<string, unknown> = {
    price_cr: Math.floor(input.priceCr),
    purchase_limit: Math.max(1, Math.floor(input.purchaseLimit)),
    featured: input.featured,
    source: "manual",
    listing_type: lt,
  };
  let labelForLog = "";
  if (lt === "item") {
    if (!input.itemId) return { success: false, error: "Kein Item gewählt." };
    row.item_id = input.itemId; labelForLog = `Item ${input.itemId}`;
  } else if (lt === "ability") {
    if (!input.abilityKey) return { success: false, error: "Keine Fähigkeit gewählt." };
    row.ability_key = input.abilityKey; labelForLog = `Fähigkeit ${input.abilityKey}`;
  } else if (lt === "name_style") {
    if (!input.nameStyleKey) return { success: false, error: "Kein Name-Style gewählt." };
    row.name_style_key = input.nameStyleKey; labelForLog = `Name-Style ${input.nameStyleKey}`;
  } else if (lt === "badge") {
    if (!input.badgeKey) return { success: false, error: "Kein Badge gewählt." };
    row.badge_key = input.badgeKey; row.badge_text = input.badgeText ?? null; labelForLog = `Badge ${input.badgeKey}`;
  } else if (lt === "voucher") {
    if (!input.voucherConfig || !input.voucherConfig.kind) return { success: false, error: "Gutschein-Konfiguration fehlt." };
    row.voucher_config = input.voucherConfig; labelForLog = `Gutschein ${String(input.voucherConfig.kind)}`;
  } else {
    return { success: false, error: "Unbekannter Listing-Typ." };
  }

  const date = new Date();
  date.setUTCDate(date.getUTCDate() + input.dateOffsetDays);
  const dateKey = shopDateKey(date);
  row.shop_date = dateKey;

  const admin = createAdminClient();
  const { error } = await admin.from("shop_listings").insert(row);

  if (error) {
    void logDebugEvent({ level: "error", scope: "admin:shop", message: "Shop-Listing Hinzufügen fehlgeschlagen", detail: error.message, context: { listingType: lt, dateKey } });
    logServerError("Shop", "addManualShopListing failed", error.message);
    return { success: false, error: "Hinzufügen fehlgeschlagen." };
  }

  void logActivity("admin:shop", `Manuelles Shop-Listing hinzugefügt: ${labelForLog} für ${input.priceCr} CR am ${dateKey}`, { listingType: lt, priceCr: input.priceCr, dateKey });
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
