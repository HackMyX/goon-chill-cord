import { Suspense } from "react";
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
import { getWorldSpawnConfig } from "@/lib/actions/world-spawn";
import { getSiteConfig } from "@/lib/actions/site-config";
import { getModPermissions } from "@/lib/actions/mod";
import { getChatConfig } from "@/lib/actions/global-chat";
import { getAllNotes } from "@/lib/actions/patchnotes";
import { getDonConfig } from "@/lib/actions/don-config";
import { getSnakeConfig } from "@/lib/actions/snake";
import { getMineConfig } from "@/lib/actions/mine";
import { getCleanupRules } from "@/lib/actions/cleanup-config";
import { adminListBattlePasses, checkBattlePassMigration } from "@/lib/actions/battle-pass";
import { getPlinkoConfig } from "@/lib/actions/plinko";
import { getXpConfig } from "@/lib/actions/level-system";
import { getSoundConfig } from "@/lib/actions/sound-config";
import { CASE_GROUPS } from "@/lib/cases";
import { getCaseGroups } from "@/lib/actions/cases-admin";
import {
  AdminShell,
  type AuditLogEntry,
  type CaseTierRow,
  type CaseGroupRow,
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

  // Graceful column fallback: try with all new columns, degrade if not yet migrated.
  async function fetchTierRows() {
    // Try with all columns (including the new ones from add-case-groups.cjs)
    const withAll = await admin
      .from("case_tiers")
      .select("id, group_id, label, price, rarity_weights, enabled, item_types, item_ids, group_label, group_subtitle, preview_cost, multi_open_max, sort_order, per_rarity_item_ids, name_styles_eligible, tier_sublabel, updated_at")
      .order("sort_order", { ascending: true });
    if (!withAll.error) return withAll.data;

    // Fallback without new columns
    const withOldFull = await admin
      .from("case_tiers")
      .select("id, group_id, label, price, rarity_weights, enabled, item_types, item_ids, group_label, group_subtitle, preview_cost, multi_open_max, updated_at")
      .order("group_id", { ascending: true });
    if (!withOldFull.error) {
      return (withOldFull.data ?? []).map((row) => ({
        ...row, sort_order: null, per_rarity_item_ids: null, name_styles_eligible: null, tier_sublabel: null,
      }));
    }

    const withOld = await admin
      .from("case_tiers")
      .select("id, group_id, label, price, rarity_weights, enabled, item_types, item_ids, group_label, group_subtitle, updated_at")
      .order("group_id", { ascending: true });
    if (!withOld.error) {
      return (withOld.data ?? []).map((row) => ({
        ...row, preview_cost: 0, multi_open_max: 10, sort_order: null, per_rarity_item_ids: null, name_styles_eligible: null, tier_sublabel: null,
      }));
    }

    const withTypes = await admin
      .from("case_tiers")
      .select("id, group_id, label, price, rarity_weights, enabled, item_types, updated_at")
      .order("group_id", { ascending: true });
    if (!withTypes.error) {
      return (withTypes.data ?? []).map((row) => ({
        ...row, item_ids: null, group_label: null, group_subtitle: null, preview_cost: 0, multi_open_max: 10,
        sort_order: null, per_rarity_item_ids: null, name_styles_eligible: null, tier_sublabel: null,
      }));
    }

    const withoutTypes = await admin
      .from("case_tiers")
      .select("id, group_id, label, price, rarity_weights, enabled, updated_at")
      .order("group_id", { ascending: true });
    return (withoutTypes.data ?? []).map((row) => ({
      ...row, item_types: null, item_ids: null, group_label: null, group_subtitle: null, preview_cost: 0, multi_open_max: 10,
      sort_order: null, per_rarity_item_ids: null, name_styles_eligible: null, tier_sublabel: null,
    }));
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
    modPermissions,
    chatConfig,
    worldSpawnConfig,
    allPatchNotes,
    adminDonConfig,
    adminSnakeConfig,
    adminMineConfig,
    cleanupRules,
    battlePasses,
    battlePassMigrationNeeded,
    adminPlinkoConfig,
  ] = await Promise.all([
    admin
      .from("audit_logs")
      .select("id, action, payload, created_at, profiles(username)")
      .order("created_at", { ascending: false })
      .limit(50),
    fetchTierRows(),
    admin
      .from("profiles")
      .select("id, username, credits, role, cases_opened, support_banned, verified, warning_strikes, warning_note")
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
    getModPermissions(),
    getChatConfig(),
    getWorldSpawnConfig(),
    getAllNotes(),
    getDonConfig(),
    getSnakeConfig(),
    getMineConfig(),
    getCleanupRules(),
    adminListBattlePasses(),
    checkBattlePassMigration(),
    getPlinkoConfig(),
  ]);

  const [xpConfig, soundConfig] = await Promise.all([
    getXpConfig(),
    getSoundConfig(),
  ]);

  // Load case groups (new dynamic system — graceful if table not yet migrated)
  const caseGroupRows = await getCaseGroups().catch(() => [] as CaseGroupRow[]);

  // Sort tiers: by group display_order, then sort_order within the group.
  // Falls back to CASE_GROUPS known order when case_groups table is not yet migrated.
  const KNOWN_TIER_ORDER = CASE_GROUPS.flatMap((g) => [g.standard.id, g.premium.id]);
  const groupOrderById = new Map(caseGroupRows.map((g, i) => [g.id, g.display_order ?? i]));
  const sortedTierRows = [...(tierRows ?? [])].sort((a, b) => {
    const aGroupOrder = groupOrderById.get(a.group_id) ?? 999;
    const bGroupOrder = groupOrderById.get(b.group_id) ?? 999;
    if (aGroupOrder !== bGroupOrder) return aGroupOrder - bGroupOrder;
    const aSortOrder = a.sort_order ?? KNOWN_TIER_ORDER.indexOf(a.id);
    const bSortOrder = b.sort_order ?? KNOWN_TIER_ORDER.indexOf(b.id);
    return aSortOrder - bSortOrder;
  });

  return (
    <Suspense fallback={null}>
    <AdminShell
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      auditLog={(auditRows ?? []) as unknown as AuditLogEntry[]}
      caseGroups={caseGroupRows as CaseGroupRow[]}
      caseTiers={sortedTierRows as unknown as CaseTierRow[]}
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
      worldSpawnConfig={worldSpawnConfig}
      siteConfig={siteConfig}
      modPermissions={modPermissions}
      chatConfig={chatConfig}
      patchNotes={allPatchNotes}
      donConfig={adminDonConfig}
      snakeConfig={adminSnakeConfig}
      mineConfig={adminMineConfig}
      cleanupRules={cleanupRules}
      battlePasses={battlePasses}
      battlePassMigrationNeeded={battlePassMigrationNeeded}
      plinkoConfig={adminPlinkoConfig}
      xpConfig={xpConfig}
      soundConfig={soundConfig}
    />
    </Suspense>
  );
}
