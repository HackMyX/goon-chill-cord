import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { getStreakConfig } from "@/lib/actions/streak";
import { getShopSettings, getAdminShopListings, getTodayShop } from "@/lib/actions/shop";
import { getMonsterTypes } from "@/lib/actions/monsters";
import { getPetConfigs } from "@/lib/actions/pets";
import { getKillStreakConfig } from "@/lib/actions/kill-streak";
import { getWorldSessionConfig } from "@/lib/actions/world-session";
import { getCharacterConfig } from "@/lib/actions/character-config";
import { getSiteConfig } from "@/lib/actions/site-config";
import {
  AdminShell,
  type AuditLogEntry,
  type CaseTierRow,
  type ProfileRow,
  type ItemRow,
} from "@/components/admin/admin-shell";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, username, role")
    .eq("id", user.id)
    .single();

  if (!isAdmin(profile)) redirect("/");

  const admin = createAdminClient();

  // `item_types` may not exist yet (one-time SQL not run) — degrade to the
  // column-less select rather than losing the whole Economy tab.
  async function fetchTierRows() {
    const withTypes = await admin
      .from("case_tiers")
      .select("id, group_id, label, price, rarity_weights, enabled, item_types, updated_at")
      .order("group_id", { ascending: true });
    if (!withTypes.error) return withTypes.data;

    const withoutTypes = await admin
      .from("case_tiers")
      .select("id, group_id, label, price, rarity_weights, enabled, updated_at")
      .order("group_id", { ascending: true });
    return (withoutTypes.data ?? []).map((row) => ({ ...row, item_types: null }));
  }

  // `damage`/stat columns may not exist yet (one-time SQL not run) —
  // degrade to the column-less select rather than losing the whole Items
  // tab, same pattern as fetchTierRows() above.
  async function fetchItemRows() {
    const withStats = await admin
      .from("items")
      .select(
        "id, name, rarity, type, price_cr, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec"
      )
      .order("name", { ascending: true })
      .limit(1000);
    if (!withStats.error) return withStats.data;

    const withoutStats = await admin
      .from("items")
      .select("id, name, rarity, type, price_cr")
      .order("name", { ascending: true })
      .limit(1000);
    return (withoutStats.data ?? []).map((row) => ({
      ...row,
      damage: null,
      armor: 0,
      perk_type: "none" as const,
      perk_magnitude: 0,
      shield_hp: 0,
      shield_regen_cooldown_sec: 0,
    }));
  }

  // getTodayShop() is what actually triggers that day's auto-generation
  // (lib/actions/shop.ts's ensureShopGenerated) — calling it here means
  // visiting /admin first (before any player visits /shop) still rotates
  // the shop on schedule, not just whichever page happens to load first.
  await getTodayShop();

  const [
    { data: auditRows },
    tierRows,
    { data: profileRows },
    itemRows,
    streakConfig,
    shopSettings,
    todayShopListings,
    tomorrowShopListings,
    monsterTypes,
    petTypes,
    killStreakConfig,
    worldSessionConfig,
    characterConfig,
    siteConfig,
  ] = await Promise.all([
    admin
      .from("audit_logs")
      .select("id, action, payload, created_at, profiles(username)")
      .order("created_at", { ascending: false })
      .limit(50),
    fetchTierRows(),
    admin
      .from("profiles")
      .select("id, username, credits, role, cases_opened")
      .order("credits", { ascending: false })
      .limit(200),
    fetchItemRows(),
    getStreakConfig(),
    getShopSettings(),
    getAdminShopListings(0),
    getAdminShopListings(1),
    getMonsterTypes(),
    getPetConfigs(),
    getKillStreakConfig(),
    getWorldSessionConfig(),
    getCharacterConfig(),
    getSiteConfig(),
  ]);

  return (
    <AdminShell
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      auditLog={(auditRows ?? []) as unknown as AuditLogEntry[]}
      caseTiers={(tierRows ?? []) as unknown as CaseTierRow[]}
      profiles={(profileRows ?? []) as unknown as ProfileRow[]}
      items={((itemRows ?? []) as unknown[]) as ItemRow[]}
      streakConfig={streakConfig}
      shopSettings={shopSettings}
      todayShopListings={todayShopListings}
      tomorrowShopListings={tomorrowShopListings}
      monsterTypes={monsterTypes}
      petTypes={petTypes}
      killStreakConfig={killStreakConfig}
      worldSessionConfig={worldSessionConfig}
      characterConfig={characterConfig}
      siteConfig={siteConfig}
    />
  );
}
