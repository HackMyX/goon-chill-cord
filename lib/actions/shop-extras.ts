"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Extras" layer for the shop: everything that is NOT a catalogue item but can
 * still be sold — abilities + name styles (later: badges, vouchers). The daily
 * shop_listings rotation stays item-only; these are always-available offers
 * driven by each definition's own `available_in_shop` / `shop_price_cr` flags
 * (so the "Im Shop verfügbar" toggle that already exists finally DOES something).
 *
 * One read (getShopExtras) + one type-switched purchase (purchaseShopExtra) keep
 * it unified, and a NEW sellable kind only has to be added in both places.
 */

export interface ShopExtra {
  type: "ability" | "name_style";
  key: string;
  name: string;
  description: string;
  priceCr: number;
  rarity: string;
  icon: string;
  category: string;
  effectType?: string;
  owned: boolean;
  /** Remaining stock (name styles), null = unlimited. */
  stock: number | null;
}

export async function getShopExtras(): Promise<ShopExtra[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const [{ data: abilities }, { data: styles }, { data: ownAb }, { data: ownSt }] = await Promise.all([
    admin.from("ability_definitions")
      .select("key, name, description, category, effect_type, rarity, icon, shop_price_cr, available_in_shop, enabled, sort_order")
      .eq("available_in_shop", true).eq("enabled", true).order("sort_order", { ascending: true }),
    admin.from("name_styles")
      .select("key, label, rarity, shop_price_cr, available_in_shop, shop_stock, shop_expires_at, shop_sort_order")
      .eq("available_in_shop", true).order("shop_sort_order", { ascending: true }),
    user ? admin.from("user_abilities").select("ability_key").eq("user_id", user.id) : Promise.resolve({ data: [] }),
    user ? admin.from("user_name_styles").select("style_key").eq("user_id", user.id) : Promise.resolve({ data: [] }),
  ]);

  const ownedAbilities = new Set((ownAb ?? []).map((r) => (r as { ability_key: string }).ability_key));
  const ownedStyles = new Set((ownSt ?? []).map((r) => (r as { style_key: string }).style_key));

  const out: ShopExtra[] = [];

  for (const a of (abilities ?? []) as Record<string, unknown>[]) {
    const price = Number(a.shop_price_cr ?? 0);
    if (price <= 0) continue;
    out.push({
      type: "ability",
      key: a.key as string,
      name: a.name as string,
      description: (a.description as string) ?? "",
      priceCr: price,
      rarity: (a.rarity as string) ?? "selten",
      icon: (a.icon as string) ?? "Zap",
      category: (a.category as string) ?? "global",
      effectType: a.effect_type as string,
      owned: ownedAbilities.has(a.key as string),
      stock: null,
    });
  }

  for (const s of (styles ?? []) as Record<string, unknown>[]) {
    const price = Number(s.shop_price_cr ?? 0);
    if (price <= 0) continue;
    const exp = s.shop_expires_at as string | null;
    if (exp && exp < nowIso) continue;
    const stock = (s.shop_stock as number | null) ?? null;
    out.push({
      type: "name_style",
      key: s.key as string,
      name: (s.label as string) ?? (s.key as string),
      description: "Name-Style",
      priceCr: price,
      rarity: (s.rarity as string) ?? "selten",
      icon: "Palette",
      category: "name_style",
      owned: ownedStyles.has(s.key as string),
      stock,
    });
  }

  return out;
}

export async function purchaseShopExtra(input: { type: "ability" | "name_style"; key: string }): Promise<{ ok: boolean; error?: string }> {
  if (input.type === "name_style") {
    // Reuse the existing, fully-validated name-style purchase (stock/expiry/owned).
    const { purchaseNameStyle } = await import("@/lib/actions/name-styles");
    return purchaseNameStyle(input.key);
  }

  // ── Ability purchase (mirrors purchaseNameStyle) ──
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht eingeloggt." };
  const admin = createAdminClient();

  const { data: def } = await admin
    .from("ability_definitions")
    .select("key, name, available_in_shop, enabled, shop_price_cr")
    .eq("key", input.key)
    .maybeSingle();
  if (!def) return { ok: false, error: "Fähigkeit nicht gefunden." };
  if (!def.available_in_shop || def.enabled === false) return { ok: false, error: "Diese Fähigkeit ist gerade nicht im Shop verfügbar." };
  const price = Number(def.shop_price_cr ?? 0);
  if (price <= 0) return { ok: false, error: "Diese Fähigkeit hat keinen gültigen Preis." };

  const { count: owned } = await admin
    .from("user_abilities").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("ability_key", input.key);
  if (owned) return { ok: false, error: "Du besitzt diese Fähigkeit bereits." };

  const { data: profile } = await admin.from("profiles").select("credits").eq("id", user.id).single();
  const credits = Number(profile?.credits ?? 0);
  if (credits < price) return { ok: false, error: `Zu wenig Credits. Benötigt: ${price.toLocaleString("de-DE")} CR.` };

  const { data: deducted } = await admin
    .from("profiles")
    .update({ credits: credits - price })
    .eq("id", user.id)
    .gte("credits", price)
    .select("credits");
  if (!deducted || deducted.length === 0) return { ok: false, error: "Zu wenig Credits." };

  const { error: grantErr } = await admin.from("user_abilities").insert({
    user_id: user.id, ability_key: input.key, source: "shop_purchase", source_detail: "Shop-Kauf",
  });
  if (grantErr) {
    // Refund on grant failure.
    await admin.from("profiles").update({ credits }).eq("id", user.id);
    return { ok: false, error: "Fähigkeit konnte nicht vergeben werden." };
  }
  return { ok: true };
}
