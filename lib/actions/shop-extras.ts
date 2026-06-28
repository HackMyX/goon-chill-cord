"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopDateKey } from "@/lib/shop";
import { purchaseShopItem } from "@/lib/actions/shop";

/**
 * Read + buy for the shop's NON-ITEM listings (abilities / name styles / badges /
 * vouchers) that the unified auto-generator placed for today. The item listings
 * stay on getTodayShop's 3D carousel; these render as cards. Everything is one
 * shop_listings row, so purchase just routes through purchaseShopItem (which is
 * type-aware) — no parallel purchase path, no per-definition shop flag.
 */

export interface ShopExtra {
  listingId: string;
  type: "ability" | "name_style" | "badge" | "voucher";
  key: string;
  name: string;
  description: string;
  priceCr: number;
  rarity: string;
  icon: string;
  category: string;
  owned: boolean;
}

export async function getShopExtras(): Promise<ShopExtra[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const today = shopDateKey(new Date());

  const { data: rows } = await admin
    .from("shop_listings")
    .select("id, listing_type, ability_key, name_style_key, badge_key, badge_text, voucher_config, price_cr")
    .eq("shop_date", today)
    .neq("listing_type", "item")
    .order("featured", { ascending: false });
  if (!rows || rows.length === 0) return [];

  const abilityKeys = [...new Set(rows.filter((r) => r.listing_type === "ability" && r.ability_key).map((r) => r.ability_key as string))];
  const styleKeys = [...new Set(rows.filter((r) => r.listing_type === "name_style" && r.name_style_key).map((r) => r.name_style_key as string))];
  const badgeKeys = [...new Set(rows.filter((r) => r.listing_type === "badge" && r.badge_key).map((r) => r.badge_key as string))];

  const [{ data: abilities }, { data: styles }, { data: badges }, { data: ownAb }, { data: ownSt }, { data: ownBa }] = await Promise.all([
    abilityKeys.length ? admin.from("ability_definitions").select("key, name, description, category, rarity, icon").in("key", abilityKeys) : Promise.resolve({ data: [] }),
    styleKeys.length ? admin.from("name_styles").select("key, label, rarity").in("key", styleKeys) : Promise.resolve({ data: [] }),
    badgeKeys.length ? admin.from("badge_definitions").select("key, label, icon").in("key", badgeKeys) : Promise.resolve({ data: [] }),
    user ? admin.from("user_abilities").select("ability_key").eq("user_id", user.id) : Promise.resolve({ data: [] }),
    user ? admin.from("user_name_styles").select("style_key").eq("user_id", user.id) : Promise.resolve({ data: [] }),
    user ? admin.from("user_badges").select("badge_key").eq("user_id", user.id) : Promise.resolve({ data: [] }),
  ]);

  const abMap = new Map((abilities ?? []).map((a) => [(a as { key: string }).key, a as Record<string, unknown>]));
  const stMap = new Map((styles ?? []).map((s) => [(s as { key: string }).key, s as Record<string, unknown>]));
  const baMap = new Map((badges ?? []).map((b) => [(b as { key: string }).key, b as Record<string, unknown>]));
  const ownedAb = new Set((ownAb ?? []).map((r) => (r as { ability_key: string }).ability_key));
  const ownedSt = new Set((ownSt ?? []).map((r) => (r as { style_key: string }).style_key));
  const ownedBa = new Set((ownBa ?? []).map((r) => (r as { badge_key: string }).badge_key));

  const out: ShopExtra[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const lt = r.listing_type as string;
    const price = Number(r.price_cr ?? 0);
    if (lt === "ability") {
      const k = r.ability_key as string; const d = abMap.get(k);
      if (!d) continue;
      out.push({ listingId: r.id as string, type: "ability", key: k, name: (d.name as string) ?? k, description: (d.description as string) ?? "", priceCr: price, rarity: (d.rarity as string) ?? "selten", icon: (d.icon as string) ?? "Zap", category: (d.category as string) ?? "global", owned: ownedAb.has(k) });
    } else if (lt === "name_style") {
      const k = r.name_style_key as string; const d = stMap.get(k);
      out.push({ listingId: r.id as string, type: "name_style", key: k, name: (d?.label as string) ?? k, description: "Name-Style", priceCr: price, rarity: (d?.rarity as string) ?? "selten", icon: "Palette", category: "name_style", owned: ownedSt.has(k) });
    } else if (lt === "badge") {
      const k = r.badge_key as string; const d = baMap.get(k);
      out.push({ listingId: r.id as string, type: "badge", key: k, name: (r.badge_text as string) || (d?.label as string) || k, description: "Badge", priceCr: price, rarity: "selten", icon: "Award", category: "badge", owned: ownedBa.has(k) });
    } else if (lt === "voucher") {
      const vc = (r.voucher_config ?? {}) as Record<string, unknown>;
      const isBonus = (vc.kind as string) === "game_bonus";
      const floor = (vc.rarityFloor as string) ?? "selten";
      const rLabel: Record<string, string> = { normal: "Normal", selten: "Selten", mythisch: "Mythisch", ultra: "Ultra" };
      out.push({
        listingId: r.id as string, type: "voucher", key: r.id as string,
        name: isBonus ? `+${vc.amount ?? 0} ${vc.game ?? "Spiel"}-Bonus` : `Gratis-Case (mind. ${rLabel[floor] ?? floor})`,
        description: "Gutschein", priceCr: price, rarity: isBonus ? "selten" : floor, icon: "Ticket", category: "voucher", owned: false,
      });
    }
  }
  return out;
}

export async function purchaseShopExtra(input: { listingId: string }): Promise<{ ok: boolean; error?: string }> {
  const res = await purchaseShopItem(input.listingId);
  return { ok: res.success, error: res.error };
}
