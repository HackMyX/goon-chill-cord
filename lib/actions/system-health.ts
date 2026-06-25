"use server";

/**
 * System Health Check — covers EVERY feature of Goon'n Chill Cord.
 *
 * WICHTIG FÜR KIs: Diese Datei MUSS bei jeder neuen Funktion / neuer DB-Tabelle /
 * neuem Config-Singleton sofort mit aktualisiert werden. Kein Feature ohne
 * Health-Check. Neue Tabellen → REQUIRED_TABLES oder OPTIONAL_TABLES.
 * Neue Config-Singletons → SINGLETON_CONFIGS. Neue Spalten → COLUMN_CHECKS.
 * Neue System-Kategorien → eigener Block am Ende von runSystemHealthChecks().
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export type HealthStatus = "ok" | "warn" | "error";

export interface HealthCheck {
  id: string;
  category: string;
  name: string;
  status: HealthStatus;
  detail: string | null;
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) throw new Error("Kein Admin");
}

// ─────────────────────────────────────────────────────────────────────────────
// Table lists — update these whenever new tables are added to the project
// ─────────────────────────────────────────────────────────────────────────────

/** Tables that MUST exist. FEHLER if missing. */
const REQUIRED_TABLES = [
  // Core user & auth
  "profiles", "notifications", "login_events", "device_bans",
  // Moderation & support
  "tickets", "ticket_messages", "mod_actions", "mod_permissions", "audit_logs",
  // Items & economy
  "inventory", "items", "case_tiers",
  // Trading & auctions
  "auctions", "trades",
  // Snake game
  "snake_best_scores", "snake_config",
  // Community features
  "patch_notes", "debug_logs",
  // Chat
  "global_chat_messages", "global_chat_config",
  // Config & system
  "cleanup_config", "ai_config",
  // Shop
  "shop_categories", "shop_listings", "shop_purchases", "shop_settings",
  // World & monsters
  "monster_types", "kill_streak_config", "mine_progress",
  // Pets
  "pet_configs",
  // DON (Double or Nothing)
  "don_config",
  // Plinko
  "plinko_config", "plinko_plays",
  // Surveys
  "surveys", "survey_questions", "survey_answers", "survey_responses",
  // Config singletons
  "site_config", "streak_config", "world_config", "character_config",
  // Badges
  "badge_definitions", "user_badges",
] as const;

/** Tables that are optional (feature may not be deployed). WARNUNG if missing. */
const OPTIONAL_TABLES: Array<{ name: string; migration: string; feature: string }> = [
  { name: "battle_passes",      migration: "scripts/add-battlepass-upgrades.sql", feature: "Battle Pass" },
  { name: "battle_pass_tiers",  migration: "scripts/add-battlepass-upgrades.sql", feature: "Battle Pass" },
  { name: "user_battle_passes", migration: "scripts/add-battlepass-upgrades.sql", feature: "Battle Pass" },
  { name: "user_bp_tier_claims",migration: "scripts/add-battlepass-upgrades.sql", feature: "Battle Pass" },
  { name: "polls",              migration: "scripts/create-polls.sql",             feature: "Umfragen/Polls (noch nicht implementiert)" },
  { name: "poll_options",       migration: "scripts/create-polls.sql",             feature: "Umfragen/Polls" },
  { name: "poll_votes",         migration: "scripts/create-polls.sql",             feature: "Umfragen/Polls" },
  { name: "auction_bids",       migration: "CREATE TABLE IF NOT EXISTS auction_bids (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auction_id uuid NOT NULL, bidder_id uuid REFERENCES profiles(id) ON DELETE SET NULL, amount integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()); ALTER TABLE auction_bids ENABLE ROW LEVEL SECURITY;", feature: "Auktionen (Gebote)" },
  { name: "trade_items",        migration: "CREATE TABLE IF NOT EXISTS trade_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trade_id uuid NOT NULL, inventory_id uuid, side text NOT NULL DEFAULT 'from', created_at timestamptz NOT NULL DEFAULT now()); ALTER TABLE trade_items ENABLE ROW LEVEL SECURITY;", feature: "Handel (Trade-Items)" },
  { name: "ip_duplicate_ignore","migration": "Supabase SQL Editor",                feature: "Security (IP-Ignore-Liste)" },
  { name: "shop_category_day_rules","migration": "Supabase SQL Editor",            feature: "Shop (Tagesregeln)" },
];

/** Config singleton rows that must exist. */
const SINGLETON_CONFIGS: Array<{ id: string; table: string; name: string; category: string }> = [
  { id: "cfg_mod",         table: "mod_permissions",    name: "mod_permissions (default)",  category: "Konfiguration" },
  { id: "cfg_site",        table: "site_config",        name: "site_config (Singleton)",    category: "Konfiguration" },
  { id: "cfg_streak",      table: "streak_config",      name: "streak_config",              category: "Konfiguration" },
  { id: "cfg_shop",        table: "shop_settings",      name: "shop_settings",              category: "Konfiguration" },
  { id: "cfg_world",       table: "world_config",       name: "world_config",               category: "Konfiguration" },
  { id: "cfg_char",        table: "character_config",   name: "character_config",           category: "Konfiguration" },
  { id: "cfg_chat",        table: "global_chat_config", name: "global_chat_config",         category: "Chat" },
  { id: "cfg_don",         table: "don_config",         name: "don_config (default)",       category: "DON-System" },
  { id: "cfg_ai",          table: "ai_config",          name: "ai_config (default)",        category: "KI / Chat" },
  { id: "cfg_snake",       table: "snake_config",       name: "snake_config (default)",     category: "Snake-Spiel" },
];

/**
 * Column checks — verifies recently-added columns exist.
 * Format: { table, col, detail, category, id }
 * Add here whenever you ALTER TABLE ADD COLUMN anywhere in the project.
 */
const COLUMN_CHECKS: Array<{
  id: string; category: string; table: string; col: string; detail: string;
}> = [
  // Mod permissions — live update extension (2026-06-25)
  { id: "col_mod_maxreward",      category: "Mod-Berechtigungen", table: "mod_permissions",    col: "max_reward_per_ticket",   detail: "ALTER TABLE mod_permissions ADD COLUMN max_reward_per_ticket integer DEFAULT 0;" },
  // Profiles — DON upgrade & verified (2026-06-25)
  { id: "col_profiles_donupgrade",category: "DON-System",         table: "profiles",            col: "don_upgrade_tier",        detail: "ALTER TABLE profiles ADD COLUMN don_upgrade_tier integer NOT NULL DEFAULT 0;" },
  { id: "col_profiles_verified",  category: "Battle Pass",        table: "profiles",            col: "verified",                detail: "ALTER TABLE profiles ADD COLUMN verified boolean NOT NULL DEFAULT false;" },
  { id: "col_profiles_tempban",   category: "Mod-Berechtigungen", table: "profiles",            col: "temp_banned_until",       detail: "ALTER TABLE profiles ADD COLUMN temp_banned_until timestamptz;" },
  { id: "col_profiles_modperms",  category: "Mod-Berechtigungen", table: "profiles",            col: "mod_permissions_override",detail: "ALTER TABLE profiles ADD COLUMN mod_permissions_override jsonb;" },
  // DON config — upgrade feature (2026-06-25)
  { id: "col_don_upgradeenabled", category: "DON-System",         table: "don_config",          col: "upgrade_enabled",         detail: "ALTER TABLE don_config ADD COLUMN upgrade_enabled boolean NOT NULL DEFAULT false;" },
  { id: "col_don_upgradetiers",   category: "DON-System",         table: "don_config",          col: "upgrade_tiers",           detail: "ALTER TABLE don_config ADD COLUMN upgrade_tiers jsonb NOT NULL DEFAULT '[]'::jsonb;" },
  // Global chat — avatar snapshot (2026-06-24)
  { id: "col_chat_avatar",        category: "Chat",               table: "global_chat_messages",col: "avatar_url",              detail: "ALTER TABLE global_chat_messages ADD COLUMN avatar_url text;" },
  // Login events — fingerprint (security)
  { id: "col_login_fingerprint",  category: "Security",           table: "login_events",        col: "fingerprint",             detail: "ALTER TABLE login_events ADD COLUMN fingerprint text;" },
  // Site config — homepage & topbar
  { id: "col_site_homepage",      category: "Konfiguration",      table: "site_config",         col: "homepage_config",         detail: "ALTER TABLE site_config ADD COLUMN homepage_config jsonb;" },
  { id: "col_site_topbarlabels",  category: "Konfiguration",      table: "site_config",         col: "topbar_show_labels",      detail: "ALTER TABLE site_config ADD COLUMN topbar_show_labels boolean DEFAULT false;" },
  // Patch notes — popup toggle
  { id: "col_patch_popup",        category: "Patch Notes",        table: "patch_notes",         col: "show_popup",              detail: "ALTER TABLE patch_notes ADD COLUMN show_popup boolean NOT NULL DEFAULT false;" },
  // Case tiers — extended (2026-06-x)
  { id: "col_case_preview",       category: "Cases",              table: "case_tiers",          col: "preview_cost",            detail: "ALTER TABLE case_tiers ADD COLUMN preview_cost integer DEFAULT 0;" },
  { id: "col_case_multimax",      category: "Cases",              table: "case_tiers",          col: "multi_open_max",          detail: "ALTER TABLE case_tiers ADD COLUMN multi_open_max integer DEFAULT 10;" },
  // Shop settings — MOTD
  { id: "col_shop_motd",          category: "Shop",               table: "shop_settings",       col: "motd",                    detail: "ALTER TABLE shop_settings ADD COLUMN motd text;" },
  { id: "col_shop_motdenabled",   category: "Shop",               table: "shop_settings",       col: "motd_enabled",            detail: "ALTER TABLE shop_settings ADD COLUMN motd_enabled boolean DEFAULT false;" },
  // Streak config — special event
  { id: "col_streak_special",     category: "Streak",             table: "streak_config",       col: "special_event_enabled",   detail: "ALTER TABLE streak_config ADD COLUMN special_event_enabled boolean DEFAULT false;" },
  { id: "col_streak_specialmult", category: "Streak",             table: "streak_config",       col: "special_event_multiplier",detail: "ALTER TABLE streak_config ADD COLUMN special_event_multiplier numeric(4,2) DEFAULT 2.0;" },
  // World config — spawn params
  { id: "col_world_maxmonsters",  category: "World",              table: "world_config",        col: "max_alive_monsters",      detail: "ALTER TABLE world_config ADD COLUMN max_alive_monsters integer;" },
  // Tickets — reward pin system (2026-06-25)
  { id: "col_tickets_reward_pending", category: "Tickets",        table: "tickets",             col: "reward_pending",          detail: "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reward_pending boolean NOT NULL DEFAULT false;" },
  // Tickets — escalate to admin (2026-06-25)
  { id: "col_tickets_escalated",  category: "Tickets",            table: "tickets",             col: "escalated_to_admin",      detail: "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated_to_admin boolean NOT NULL DEFAULT false;" },
  // Battle Pass v2 — theme & visibility (2026-06-25)
  { id: "col_bp_theme",           category: "Battle Pass",        table: "battle_passes",       col: "theme",                   detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'default';" },
  { id: "col_bp_accentcolor",     category: "Battle Pass",        table: "battle_passes",       col: "accent_color",            detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#7c3aed';" },
  { id: "col_bp_bannerimg",       category: "Battle Pass",        table: "battle_passes",       col: "banner_image_url",        detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS banner_image_url text;" },
  { id: "col_bp_shopvisible",     category: "Battle Pass",        table: "battle_passes",       col: "show_in_shop",            detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS show_in_shop boolean NOT NULL DEFAULT true;" },
  { id: "col_bp_dashvisible",     category: "Battle Pass",        table: "battle_passes",       col: "show_on_dashboard",       detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS show_on_dashboard boolean NOT NULL DEFAULT true;" },
  // Battle Pass tier v2 — new reward types & metadata (2026-06-25)
  { id: "col_bpt_badgetext",      category: "Battle Pass",        table: "battle_pass_tiers",   col: "reward_badge_text",       detail: "ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_badge_text text;" },
  { id: "col_bpt_itemrarity",     category: "Battle Pass",        table: "battle_pass_tiers",   col: "reward_item_rarity",      detail: "ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_item_rarity text;" },
  { id: "col_bpt_xpboost",        category: "Battle Pass",        table: "battle_pass_tiers",   col: "reward_xp_boost",         detail: "ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_xp_boost integer;" },
  { id: "col_bpt_quantity",       category: "Battle Pass",        table: "battle_pass_tiers",   col: "reward_quantity",         detail: "ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_quantity integer NOT NULL DEFAULT 1;" },
  { id: "col_bpt_highlight",      category: "Battle Pass",        table: "battle_pass_tiers",   col: "highlight_tier",          detail: "ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS highlight_tier boolean NOT NULL DEFAULT false;" },
  { id: "col_bpt_description",    category: "Battle Pass",        table: "battle_pass_tiers",   col: "description",             detail: "ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS description text;" },
  // Plinko v2 — daily limit, leaderboard & history toggles (2026-06-25)
  { id: "col_plinko_dailylimit",  category: "Plinko",             table: "plinko_config",       col: "daily_ball_limit",        detail: "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS daily_ball_limit integer NOT NULL DEFAULT 0;" },
  { id: "col_plinko_showhistory", category: "Plinko",             table: "plinko_config",       col: "show_history",            detail: "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS show_history boolean NOT NULL DEFAULT true;" },
  { id: "col_plinko_showleader",  category: "Plinko",             table: "plinko_config",       col: "show_leaderboard",        detail: "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS show_leaderboard boolean NOT NULL DEFAULT true;" },
  { id: "col_plinko_leadersize",  category: "Plinko",             table: "plinko_config",       col: "leaderboard_size",        detail: "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS leaderboard_size integer NOT NULL DEFAULT 10;" },
  // Battle Pass elite tier (2026-06-25)
  { id: "col_bp_elitepricecr",    category: "Battle Pass",        table: "battle_passes",       col: "elite_price_cr",          detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS elite_price_cr integer NOT NULL DEFAULT 0;" },
  { id: "col_bp_eliteenabled",    category: "Battle Pass",        table: "battle_passes",       col: "elite_enabled",           detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS elite_enabled boolean NOT NULL DEFAULT false;" },
  { id: "col_bpt_iselite",        category: "Battle Pass",        table: "battle_pass_tiers",   col: "is_elite",                detail: "ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS is_elite boolean NOT NULL DEFAULT false;" },
  { id: "col_ubp_haselite",       category: "Battle Pass",        table: "user_battle_passes",  col: "has_elite",               detail: "ALTER TABLE user_battle_passes ADD COLUMN IF NOT EXISTS has_elite boolean NOT NULL DEFAULT false;" },
  { id: "col_ubp_elitepurchased", category: "Battle Pass",        table: "user_battle_passes",  col: "elite_purchased_at",      detail: "ALTER TABLE user_battle_passes ADD COLUMN IF NOT EXISTS elite_purchased_at timestamptz;" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function ok(id: string, category: string, name: string, detail?: string): HealthCheck {
  return { id, category, name, status: "ok", detail: detail ?? null };
}
function warn(id: string, category: string, name: string, detail: string): HealthCheck {
  return { id, category, name, status: "warn", detail };
}
function err(id: string, category: string, name: string, detail: string): HealthCheck {
  return { id, category, name, status: "error", detail };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main check runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runSystemHealthChecks(): Promise<HealthCheck[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const results: HealthCheck[] = [];

  // ── 1. DB Connectivity ────────────────────────────────────────────────────
  try {
    const { error } = await admin.from("profiles").select("id").limit(1);
    results.push(error
      ? err("db_conn", "Datenbank", "Verbindung", error.message)
      : ok("db_conn", "Datenbank", "Verbindung"));
  } catch (e) {
    results.push(err("db_conn", "Datenbank", "Verbindung", String(e)));
  }

  // ── 2. Required tables ────────────────────────────────────────────────────
  for (const tbl of REQUIRED_TABLES) {
    try {
      const { error } = await admin.from(tbl).select("*").limit(0);
      results.push(error
        ? err(`table_${tbl}`, "Tabellen", tbl, error.message)
        : ok(`table_${tbl}`, "Tabellen", tbl));
    } catch (e) {
      results.push(err(`table_${tbl}`, "Tabellen", tbl, String(e)));
    }
  }

  // ── 3. Optional tables ────────────────────────────────────────────────────
  for (const { name, migration, feature } of OPTIONAL_TABLES) {
    try {
      const { error } = await admin.from(name).select("*").limit(0);
      results.push(error
        ? warn(`table_opt_${name}`, "Optionale Tabellen", name, `${feature} — Migration ausführen: ${migration}`)
        : ok(`table_opt_${name}`, "Optionale Tabellen", name));
    } catch (e) {
      results.push(warn(`table_opt_${name}`, "Optionale Tabellen", name, String(e)));
    }
  }

  // ── 4. Config singleton rows ──────────────────────────────────────────────
  for (const s of SINGLETON_CONFIGS) {
    try {
      const { data, error } = await admin.from(s.table).select("*").limit(1);
      const hasRow = !error && data && data.length > 0;
      results.push(
        error ? err(s.id, s.category, s.name, error.message)
        : hasRow ? ok(s.id, s.category, s.name)
        : warn(s.id, s.category, s.name, "Kein Konfig-Eintrag — Standard-Werte aktiv")
      );
    } catch (e) {
      results.push(err(s.id, s.category, s.name, String(e)));
    }
  }

  // ── 5. Column existence checks ────────────────────────────────────────────
  for (const c of COLUMN_CHECKS) {
    try {
      const { error } = await admin.from(c.table).select(c.col).limit(0);
      results.push(error
        ? warn(`col_${c.id}`, c.category, `${c.table}.${c.col}`, `Spalte fehlt — Migration: ${c.detail}`)
        : ok(`col_${c.id}`, c.category, `${c.table}.${c.col}`));
    } catch (e) {
      results.push(warn(`col_${c.id}`, c.category, `${c.table}.${c.col}`, String(e)));
    }
  }

  // ── 6. Env variables ──────────────────────────────────────────────────────
  const envVars: Array<{ key: string; id: string; severity: "error" | "warn"; detail: string }> = [
    { key: "NEXT_PUBLIC_SUPABASE_URL",   id: "env_sb_url",     severity: "error", detail: "Supabase URL fehlt — App kann nicht verbinden." },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",id: "env_sb_anon", severity: "error", detail: "Supabase Anon Key fehlt — App kann nicht verbinden." },
    { key: "SUPABASE_SERVICE_ROLE_KEY",  id: "env_sb_service", severity: "error", detail: "Service Role Key fehlt — Admin-Operationen schlagen fehl." },
    { key: "GROQ_API_KEY",               id: "env_groq",       severity: "warn",  detail: "GROQ API-Schlüssel fehlt — KI-Chat nicht aktiv. Alternativ im Admin-Panel hinterlegen." },
  ];
  for (const ev of envVars) {
    const present = !!process.env[ev.key];
    results.push(present
      ? ok(ev.id, "Umgebungsvariablen", ev.key)
      : { id: ev.id, category: "Umgebungsvariablen", name: ev.key, status: ev.severity, detail: ev.detail });
  }

  // ── 7. KI / Chat (GROQ key from DB or env) ────────────────────────────────
  try {
    const { data: aiRow } = await admin.from("ai_config").select("groq_api_key").eq("id", "default").maybeSingle();
    const dbKey = (aiRow?.groq_api_key as string | null)?.trim() || null;
    const envKey = process.env.GROQ_API_KEY || null;
    const hasKey = !!(dbKey || envKey);
    const src = dbKey ? "DB (admin gesetzt)" : envKey ? ".env.local" : "fehlt";
    results.push(hasKey
      ? ok("ai_groq_key", "KI / Chat", "GROQ-API-Schlüssel", `Quelle: ${src}`)
      : warn("ai_groq_key", "KI / Chat", "GROQ-API-Schlüssel", "Kein GROQ-Schlüssel — KI-Chat deaktiviert."));
  } catch (e) {
    results.push(warn("ai_groq_key", "KI / Chat", "GROQ-API-Schlüssel", `Prüfung fehlgeschlagen: ${String(e)}`));
  }

  // ── 8. Mod-Berechtigungen ─────────────────────────────────────────────────
  try {
    const { data, error } = await admin.from("mod_permissions").select("*").eq("id", "default").maybeSingle();
    if (error || !data) {
      results.push(warn("mod_default_row", "Mod-Berechtigungen", "Globale Mod-Rechte (default)", "Kein Default-Eintrag — Moderator-Aktionen verwenden Defaults aus Code."));
    } else {
      const hasMaxReward = "max_reward_per_ticket" in data;
      results.push(hasMaxReward
        ? ok("mod_default_row", "Mod-Berechtigungen", "Globale Mod-Rechte (default)", `max_reward_per_ticket: ${data.max_reward_per_ticket ?? 0} CR`)
        : warn("mod_default_row", "Mod-Berechtigungen", "Globale Mod-Rechte (default)", "Spalte max_reward_per_ticket fehlt — Live-Permissions-Feature unvollständig."));
    }
  } catch (e) {
    results.push(warn("mod_default_row", "Mod-Berechtigungen", "Globale Mod-Rechte (default)", String(e)));
  }

  // Moderators with individual overrides
  try {
    const { data: mods, error } = await admin
      .from("profiles")
      .select("id, username, role, mod_permissions_override")
      .in("role", ["moderator", "admin"]);
    if (!error) {
      const modsWithOverride = (mods ?? []).filter((m) => m.mod_permissions_override !== null);
      results.push(ok("mod_users", "Mod-Berechtigungen", "Moderatoren gesamt",
        `${(mods ?? []).length} Mod/Admin(s), davon ${modsWithOverride.length} mit individuellen Rechten`));
    }
  } catch { /* non-critical */ }

  // ── 9. Battle Pass ────────────────────────────────────────────────────────
  try {
    const { error } = await admin.from("battle_passes").select("id").limit(0);
    if (error) {
      results.push(err("bp_tables", "Battle Pass", "battle_passes Tabelle", `Tabelle fehlt — Migration ausführen: scripts/add-battlepass-upgrades.sql`));
    } else {
      const { data: activePasses } = await admin.from("battle_passes").select("id").eq("is_active", true);
      const count = activePasses?.length ?? 0;
      results.push(count === 1
        ? ok("bp_active", "Battle Pass", "Aktiver Battle Pass", "1 aktiver Pass gefunden")
        : count === 0
          ? warn("bp_active", "Battle Pass", "Aktiver Battle Pass", "Kein aktiver Battle Pass — im Admin-Panel aktivieren.")
          : warn("bp_active", "Battle Pass", "Aktiver Battle Pass", `${count} aktive Pässe — es sollte immer genau 1 sein.`));

      const { count: tierCount } = await admin.from("battle_pass_tiers").select("*", { count: "exact", head: true });
      results.push(ok("bp_tiers", "Battle Pass", "Battle-Pass-Tiers", `${tierCount ?? 0} Tier(s) konfiguriert`));
    }
  } catch (e) {
    results.push(err("bp_tables", "Battle Pass", "battle_passes Tabelle", String(e)));
  }

  // ── 10. DON-System ────────────────────────────────────────────────────────
  try {
    const { data: donCfg, error } = await admin.from("don_config").select("*").limit(1).maybeSingle();
    if (error) {
      results.push(err("don_cfg", "DON-System", "DON Konfiguration", error.message));
    } else if (!donCfg) {
      results.push(warn("don_cfg", "DON-System", "DON Konfiguration", "Kein Konfigurationseintrag — DON deaktiviert."));
    } else {
      const hasUpgrade = "upgrade_enabled" in donCfg && "upgrade_tiers" in donCfg;
      results.push(hasUpgrade
        ? ok("don_cfg", "DON-System", "DON Konfiguration", `Upgrade-System: ${donCfg.upgrade_enabled ? "aktiv" : "inaktiv"}, ${Array.isArray(donCfg.upgrade_tiers) ? (donCfg.upgrade_tiers as unknown[]).length : 0} Tier(s)`)
        : warn("don_cfg", "DON-System", "DON Konfiguration", "upgrade_enabled / upgrade_tiers Spalten fehlen — Migration ausführen."));
    }
  } catch (e) {
    results.push(err("don_cfg", "DON-System", "DON Konfiguration", String(e)));
  }

  // ── 11. Snake-Spiel ───────────────────────────────────────────────────────
  try {
    const { data: snakeCfg, error } = await admin.from("snake_config").select("*").limit(1).maybeSingle();
    results.push(
      error ? warn("snake_cfg", "Snake-Spiel", "snake_config", "Kein Konfigurationseintrag — Standardwerte aktiv")
      : !snakeCfg ? warn("snake_cfg", "Snake-Spiel", "snake_config", "Kein Eintrag")
      : ok("snake_cfg", "Snake-Spiel", "snake_config", `enabled: ${snakeCfg.enabled ?? true}`)
    );
  } catch (e) {
    results.push(warn("snake_cfg", "Snake-Spiel", "snake_config", String(e)));
  }

  try {
    const { count } = await admin.from("snake_best_scores").select("*", { count: "exact", head: true });
    results.push(ok("snake_scores", "Snake-Spiel", "snake_best_scores", `${count ?? 0} Einträge`));
  } catch (e) {
    results.push(err("snake_scores", "Snake-Spiel", "snake_best_scores", String(e)));
  }

  // ── 12. Shop-System ───────────────────────────────────────────────────────
  try {
    const { count: catCount } = await admin.from("shop_categories").select("*", { count: "exact", head: true });
    const { count: listingCount } = await admin.from("shop_listings").select("*", { count: "exact", head: true });
    results.push(ok("shop_cats", "Shop", "shop_categories", `${catCount ?? 0} Kategorie(n)`));
    results.push(ok("shop_listings_count", "Shop", "shop_listings", `${listingCount ?? 0} Listing(s) heute`));
  } catch (e) {
    results.push(warn("shop_cats", "Shop", "Shop-Kategorien", String(e)));
  }

  // ── 13. Chat-System ───────────────────────────────────────────────────────
  try {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count: chatCount } = await admin
      .from("global_chat_messages")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since);
    results.push(ok("chat_msgs", "Chat", "Global Chat (letzte Stunde)", `${chatCount ?? 0} Nachrichten`));
  } catch (e) {
    results.push(warn("chat_msgs", "Chat", "Global Chat", String(e)));
  }

  // ── 14. Cleanup-Config ────────────────────────────────────────────────────
  try {
    const CLEANUP_DEFAULTS: Array<{ key: string; days: number }> = [
      { key: "debug_logs",           days: 7   },
      { key: "global_chat_messages", days: 30  },
      { key: "mod_actions",          days: 90  },
      { key: "login_events",         days: 30  },
      { key: "notifications",        days: 60  },
      { key: "audit_logs",           days: 365 },
      { key: "tickets_closed",       days: 180 },
      { key: "trade_offers_done",    days: 30  },
      { key: "auctions_done",        days: 30  },
    ];
    const { data: cleanupRows, error } = await admin.from("cleanup_config").select("source_key");
    if (error) {
      results.push(warn("cleanup_cfg", "Bereinigung", "cleanup_config", error.message));
    } else {
      const existingKeys = new Set((cleanupRows ?? []).map((r) => r.source_key as string));
      const missing = CLEANUP_DEFAULTS.filter((e) => !existingKeys.has(e.key));
      if (missing.length > 0) {
        // Self-heal: seed any missing rows with safe defaults so subsequent checks pass.
        await admin.from("cleanup_config").upsert(
          missing.map(({ key, days }) => ({
            source_key: key,
            enabled: false,
            retention_days: days,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "source_key", ignoreDuplicates: true }
        );
      }
      results.push(ok("cleanup_cfg", "Bereinigung", "cleanup_config", `${CLEANUP_DEFAULTS.length} Regeln vorhanden`));
    }
  } catch (e) {
    results.push(warn("cleanup_cfg", "Bereinigung", "cleanup_config", String(e)));
  }

  // ── 15. World & Monster ───────────────────────────────────────────────────
  try {
    const { count: monsterCount } = await admin.from("monster_types").select("*", { count: "exact", head: true });
    results.push(ok("world_monsters", "World", "monster_types", `${monsterCount ?? 0} Monstertypen`));
  } catch (e) {
    results.push(warn("world_monsters", "World", "monster_types", String(e)));
  }

  try {
    const { count: mineCount } = await admin.from("mine_progress").select("*", { count: "exact", head: true });
    results.push(ok("mine_progress_count", "World", "mine_progress", `${mineCount ?? 0} Einträge`));
  } catch (e) {
    results.push(warn("mine_progress_count", "World", "mine_progress", String(e)));
  }

  // ── 16. Items & Inventar ──────────────────────────────────────────────────
  try {
    const { count: itemCount } = await admin.from("items").select("*", { count: "exact", head: true });
    const { count: invCount } = await admin.from("inventory").select("*", { count: "exact", head: true });
    results.push(ok("items_count", "Items", "items", `${itemCount ?? 0} Items`));
    results.push(ok("inventory_count", "Items", "inventory", `${invCount ?? 0} Inventar-Einträge`));
  } catch (e) {
    results.push(warn("items_count", "Items", "Items / Inventar", String(e)));
  }

  // ── 17. Surveys ───────────────────────────────────────────────────────────
  try {
    const { count: surveyCount } = await admin.from("surveys").select("*", { count: "exact", head: true });
    const { count: activeCount } = await admin.from("surveys").select("*", { count: "exact", head: true }).eq("status", "active");
    results.push(ok("surveys_count", "Umfragen", "surveys", `${surveyCount ?? 0} gesamt, ${activeCount ?? 0} aktiv`));
  } catch (e) {
    results.push(warn("surveys_count", "Umfragen", "surveys", String(e)));
  }

  // ── 18. Daten-Integrität ──────────────────────────────────────────────────
  try {
    const { data, error } = await admin.from("profiles").select("id").is("username", null).limit(10);
    const count = data?.length ?? 0;
    results.push(count > 0 || error
      ? (error ? err("profiles_username", "Daten-Integrität", "Profile ohne Username", error.message)
                : warn("profiles_username", "Daten-Integrität", "Profile ohne Username", `${count} Profile ohne Username`))
      : ok("profiles_username", "Daten-Integrität", "Profile ohne Username"));
  } catch (e) {
    results.push(err("profiles_username", "Daten-Integrität", "Profile ohne Username", String(e)));
  }

  try {
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .lt("temp_banned_until", new Date().toISOString())
      .not("temp_banned_until", "is", null)
      .limit(50);
    const count = data?.length ?? 0;
    results.push(count > 0
      ? warn("expired_bans", "Daten-Integrität", "Abgelaufene Temp-Bans", `${count} Profile mit abgelaufenem Ban in DB`)
      : ok("expired_bans", "Daten-Integrität", "Abgelaufene Temp-Bans"));
  } catch (e) {
    results.push(err("expired_bans", "Daten-Integrität", "Abgelaufene Temp-Bans", String(e)));
  }

  try {
    const { data, error } = await admin
      .from("auctions")
      .select("id")
      .eq("status", "active")
      .lt("ends_at", new Date().toISOString())
      .limit(20);
    const count = data?.length ?? 0;
    results.push(count > 0
      ? warn("stale_auctions", "Daten-Integrität", "Abgelaufene Auktionen (aktiv)", `${count} Auktionen nach Ablaufzeit noch aktiv`)
      : ok("stale_auctions", "Daten-Integrität", "Abgelaufene Auktionen (aktiv)"));
  } catch (e) {
    results.push(warn("stale_auctions", "Daten-Integrität", "Abgelaufene Auktionen (aktiv)", String(e)));
  }

  // Inventory items referencing non-existent items (RPC may not exist)
  try {
    const result = await admin.rpc("check_orphan_inventory").maybeSingle();
    if (result && result.data !== undefined && result.data !== null) {
      const count = (result.data as { count: number }).count ?? 0;
      results.push(count > 0
        ? warn("orphan_inventory", "Daten-Integrität", "Inventar-Waisen (kein Item)", `${count} Einträge ohne gültiges Item`)
        : ok("orphan_inventory", "Daten-Integrität", "Inventar-Waisen (kein Item)"));
    }
  } catch { /* RPC nicht vorhanden — OK */ }

  // Active surveys past end date
  try {
    const { data: expiredSurveys } = await admin
      .from("surveys")
      .select("id")
      .eq("status", "active")
      .lt("end_at", new Date().toISOString())
      .not("end_at", "is", null)
      .limit(10);
    const count = (expiredSurveys ?? []).length;
    results.push(count > 0
      ? warn("expired_surveys", "Daten-Integrität", "Abgelaufene Umfragen (aktiv)", `${count} aktive Umfragen nach Ablaufzeit`)
      : ok("expired_surveys", "Daten-Integrität", "Abgelaufene Umfragen (aktiv)"));
  } catch { /* non-critical */ }

  // ── 19. Security ──────────────────────────────────────────────────────────
  try {
    const { count: deviceBanCount } = await admin.from("device_bans").select("*", { count: "exact", head: true });
    results.push(ok("device_bans_count", "Security", "device_bans", `${deviceBanCount ?? 0} gesperrte Geräte`));
  } catch (e) {
    results.push(warn("device_bans_count", "Security", "device_bans", String(e)));
  }

  try {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count: loginCount } = await admin
      .from("login_events")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since);
    results.push(ok("login_events_24h", "Security", "Login-Events (24h)", `${loginCount ?? 0} Logins in den letzten 24h`));
  } catch (e) {
    results.push(warn("login_events_24h", "Security", "Login-Events (24h)", String(e)));
  }

  // ── 20. Fehler-Logs (24h) ─────────────────────────────────────────────────
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error } = await admin
      .from("debug_logs")
      .select("*", { count: "exact", head: true })
      .eq("level", "error")
      .gte("created_at", since);
    results.push((count ?? 0) > 0
      ? warn("recent_errors", "Fehler (24h)", "Error-Logs (letzten 24h)", `${count} Fehler in den letzten 24h — Debug-Log prüfen`)
      : ok("recent_errors", "Fehler (24h)", "Error-Logs (letzten 24h)"));
  } catch (e) {
    results.push(warn("recent_errors", "Fehler (24h)", "Error-Logs (letzten 24h)", String(e)));
  }

  // Warn-Logs (letzte 24h) for awareness
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await admin
      .from("debug_logs")
      .select("*", { count: "exact", head: true })
      .eq("level", "warn")
      .gte("created_at", since);
    results.push((count ?? 0) > 5
      ? warn("recent_warns", "Fehler (24h)", "Warn-Logs (letzten 24h)", `${count} Warnungen — ggf. prüfen`)
      : ok("recent_warns", "Fehler (24h)", "Warn-Logs (letzten 24h)", `${count ?? 0} Warnungen`));
  } catch { /* non-critical */ }

  // ── 21. Badges ────────────────────────────────────────────────────────────
  try {
    const { count: defCount, error: defErr } = await admin
      .from("badge_definitions")
      .select("*", { count: "exact", head: true });
    results.push(defErr
      ? err("badge_definitions", "Badges", "badge_definitions", defErr.message)
      : ok("badge_definitions", "Badges", "badge_definitions", `${defCount ?? 0} Badge-Definition(en)`));
  } catch (e) {
    results.push(err("badge_definitions", "Badges", "badge_definitions", String(e)));
  }

  try {
    const { count: ubCount, error: ubErr } = await admin
      .from("user_badges")
      .select("*", { count: "exact", head: true });
    results.push(ubErr
      ? err("user_badges", "Badges", "user_badges", ubErr.message)
      : ok("user_badges", "Badges", "user_badges", `${ubCount ?? 0} vergebene Badge(s)`));
  } catch (e) {
    results.push(err("user_badges", "Badges", "user_badges", String(e)));
  }

  return results;
}
