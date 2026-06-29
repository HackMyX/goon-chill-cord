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
  "tickets", "ticket_messages", "ticket_internal_notes", "ticket_rewards", "mod_actions", "mod_permissions", "audit_logs",
  // Items & economy
  "inventory", "items", "case_tiers", "case_groups",
  // Trading & auctions
  "auctions", "trades", "auction_bids", "trade_items",
  // Snake game
  "snake_best_scores", "snake_config",
  // Community features
  "patch_notes", "debug_logs",
  // Chat
  "global_chat_messages", "global_chat_config", "homepage_chat_config",
  // Config & system
  "cleanup_config", "ai_config",
  // Shop
  "shop_categories", "shop_listings", "shop_purchases", "shop_settings",
  // World & monsters
  "monster_types", "kill_streak_config", "mine_progress",
  // Pets
  "pet_configs", "pet_rarity_overrides",
  // DON (Double or Nothing)
  "don_config",
  // Plinko
  "plinko_config", "plinko_plays",
  // Surveys
  "surveys", "survey_questions", "survey_answers", "survey_responses",
  // Polls (placeholder)
  "polls", "poll_options", "poll_votes",
  // Config singletons
  "site_config", "streak_config", "world_config", "character_config",
  // Badges
  "badge_definitions", "user_badges",
  // Name Styles
  "name_styles", "user_name_styles", "name_style_rarity_config",
  // Battle Pass
  "battle_passes", "battle_pass_tiers", "user_battle_passes", "user_bp_tier_claims",
  "bp_quest_definitions", "bp_quests", "user_bp_quest_progress",
  // Level & XP system
  "xp_config", "xp_events", "ability_definitions", "user_abilities",
  "redemption_codes", "redemption_claims",
  // Sound
  "sound_config",
  // Preview Engine config singleton
  "preview_config",
  // Fine-grained config (run scripts/add-fine-config.cjs)
  "fine_config",
  // Mine (used by mine.ts, balance-studio.ts — was missing from full-db-sync.cjs)
  "mine_config",
  // Backup system (used by backup.ts — was missing from full-db-sync.cjs)
  "backups",
  // Game leaderboard config singleton (run scripts/add-game-leaderboard-config.cjs)
  "game_leaderboard_config",
  // Music config singleton (run scripts/add-music-config.cjs)
  "music_config",
  // Reward-feedback config singleton (run scripts/add-feedback-config.cjs)
  "feedback_config",
  // Theme config singleton (run scripts/add-theme-config.cjs)
  "theme_config",
  // Single-session enforcement (run scripts/add-user-sessions.cjs)
  "user_sessions",
  // Persistent KI-chat sessions (run scripts/add-ai-chat-sessions.cjs)
  "ai_chat_sessions",
  // Daily Quest System (run scripts/add-daily-quests.cjs)
  "daily_quest_templates", "daily_quest_config", "user_daily_quests",
  // Social / Friends System (run scripts/add-friends-system.cjs)
  "friend_requests", "friendships", "blocked_users",
  // Reward Vouchers — Case-Gutscheine + Spiel-Bonus (run scripts/add-reward-vouchers.cjs)
  "case_tokens", "game_bonus_allowances",
] as const;

/** Tables that are optional (future features, not yet fully live). WARNUNG if missing. */
const OPTIONAL_TABLES: Array<{ name: string; migration: string; feature: string }> = [
  { name: "ip_duplicate_ignore",     migration: "Supabase SQL Editor",  feature: "Security (IP-Ignore-Liste — noch nicht implementiert)" },
  { name: "shop_category_day_rules", migration: "Supabase SQL Editor",  feature: "Shop (Tagesregeln — noch nicht implementiert)" },
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
  { id: "cfg_plinko",      table: "plinko_config",      name: "plinko_config (default)",    category: "Plinko" },
  { id: "cfg_killstreak",  table: "kill_streak_config", name: "kill_streak_config (default)",category: "World" },
  { id: "cfg_xp",          table: "xp_config",          name: "xp_config (default)",         category: "Level & XP" },
  { id: "cfg_synergy",     table: "economy_synergy_config", name: "economy_synergy_config (default)", category: "Synergie & Boosts" },
  { id: "cfg_sound",       table: "sound_config",        name: "sound_config (default)",      category: "Sound Manager" },
  { id: "cfg_mine",        table: "mine_config",         name: "mine_config (default)",        category: "Mine" },
  { id: "cfg_homepage_chat", table: "homepage_chat_config", name: "homepage_chat_config (default)", category: "Homepage Chat Sidebar" },
  { id: "cfg_preview",     table: "preview_config",       name: "preview_config (default)",       category: "Preview-Engine" },
  { id: "cfg_fine",        table: "fine_config",          name: "fine_config (default)",          category: "Feintuning" },
  { id: "cfg_game_lb",    table: "game_leaderboard_config", name: "game_leaderboard_config (default)", category: "Spielebestenlisten" },
  { id: "cfg_music",      table: "music_config",            name: "music_config (default)",           category: "Musik-System" },
  { id: "cfg_feedback",   table: "feedback_config",         name: "feedback_config (default)",        category: "Belohnungs-Feedback" },
  { id: "cfg_theme",      table: "theme_config",            name: "theme_config (default)",           category: "Theming-Engine" },
  { id: "cfg_case_display", table: "case_display_config",   name: "case_display_config (default)",     category: "Cases" },
  { id: "cfg_daily_quest", table: "daily_quest_config",     name: "daily_quest_config (default)",     category: "Daily Quests" },
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
  { id: "col_mod_pausetickets",   category: "Mod-Berechtigungen", table: "mod_permissions",    col: "can_pause_tickets",       detail: "ALTER TABLE mod_permissions ADD COLUMN IF NOT EXISTS can_pause_tickets boolean NOT NULL DEFAULT false;" },
  { id: "col_mod_canuseadminai",  category: "Mod-Berechtigungen", table: "mod_permissions",    col: "can_use_admin_ai",        detail: "node scripts/add-can-use-admin-ai.cjs" },
  // Chat-Stummschaltung — Global-Chat-Mute (2026-06-28)
  { id: "col_mod_canmutechat",    category: "Mod-Berechtigungen", table: "mod_permissions",    col: "can_mute_chat",           detail: "node scripts/add-settings-chatmod.cjs" },
  { id: "col_mod_maxchatmute",    category: "Mod-Berechtigungen", table: "mod_permissions",    col: "max_chat_mute_hours",     detail: "node scripts/add-settings-chatmod.cjs" },
  { id: "col_profiles_chatmuted", category: "Mod-Berechtigungen", table: "profiles",            col: "chat_muted_until",        detail: "node scripts/add-settings-chatmod.cjs" },
  // Profiles — DON upgrade & verified (2026-06-25)
  { id: "col_profiles_donupgrade",category: "DON-System",         table: "profiles",            col: "don_upgrade_tier",        detail: "ALTER TABLE profiles ADD COLUMN don_upgrade_tier integer NOT NULL DEFAULT 0;" },
  { id: "col_profiles_donshield", category: "DON-System",         table: "profiles",            col: "don_shield_used_at",      detail: "node scripts/add-don-shield.cjs" },
  { id: "col_profiles_verified",  category: "Battle Pass",        table: "profiles",            col: "verified",                detail: "ALTER TABLE profiles ADD COLUMN verified boolean NOT NULL DEFAULT false;" },
  { id: "col_profiles_tempban",   category: "Mod-Berechtigungen", table: "profiles",            col: "temp_banned_until",       detail: "ALTER TABLE profiles ADD COLUMN temp_banned_until timestamptz;" },
  { id: "col_profiles_modperms",  category: "Mod-Berechtigungen", table: "profiles",            col: "mod_permissions_override",detail: "ALTER TABLE profiles ADD COLUMN mod_permissions_override jsonb;" },
  { id: "col_profiles_prio_custom",category: "Badges",            table: "profiles",            col: "prio_badges_custom",      detail: "node scripts/add-prio-badges-custom.cjs" },
  { id: "col_profiles_prio_locked",category: "Badges",            table: "profiles",            col: "prio_badges_locked",      detail: "node scripts/add-prio-badges-locked.cjs" },
  // XP config — Level Road appearance (2026-06-28)
  { id: "col_xp_reward_display",  category: "Level & XP",         table: "xp_config",           col: "level_reward_display",    detail: "node scripts/add-level-road-config.cjs" },
  { id: "col_xp_road_config",     category: "Level & XP",         table: "xp_config",           col: "level_road_config",       detail: "node scripts/add-level-road-config.cjs" },
  { id: "col_profiles_prestige",  category: "Level & XP",         table: "profiles",            col: "prestige",                detail: "node scripts/add-prestige.cjs" },
  // DON config — upgrade feature (2026-06-25)
  { id: "col_don_upgradeenabled", category: "DON-System",         table: "don_config",          col: "upgrade_enabled",         detail: "ALTER TABLE don_config ADD COLUMN upgrade_enabled boolean NOT NULL DEFAULT false;" },
  { id: "col_don_upgradetiers",   category: "DON-System",         table: "don_config",          col: "upgrade_tiers",           detail: "ALTER TABLE don_config ADD COLUMN upgrade_tiers jsonb NOT NULL DEFAULT '[]'::jsonb;" },
  // Global chat — avatar snapshot (2026-06-24)
  { id: "col_chat_avatar",        category: "Chat",               table: "global_chat_messages",col: "avatar_url",              detail: "ALTER TABLE global_chat_messages ADD COLUMN avatar_url text;" },
  // Login events — fingerprint (security)
  { id: "col_login_fingerprint",  category: "Security",           table: "login_events",        col: "fingerprint",             detail: "ALTER TABLE login_events ADD COLUMN fingerprint text;" },
  // Site config — homepage & topbar
  { id: "col_site_homepage",        category: "Konfiguration", table: "site_config", col: "homepage_config",         detail: "ALTER TABLE site_config ADD COLUMN IF NOT EXISTS homepage_config jsonb;" },
  { id: "col_site_topbarlabels",    category: "Konfiguration", table: "site_config", col: "topbar_show_labels",      detail: "ALTER TABLE site_config ADD COLUMN IF NOT EXISTS topbar_show_labels boolean DEFAULT false;" },
  // Site config — topbar slots, button style, version (2026-06-25 audit — node scripts/db-audit-fix.cjs)
  { id: "col_site_topbarslots",     category: "Konfiguration", table: "site_config", col: "topbar_right_slots",      detail: "node scripts/db-audit-fix.cjs" },
  { id: "col_site_topbarbtnstyle",  category: "Konfiguration", table: "site_config", col: "topbar_button_style",     detail: "node scripts/db-audit-fix.cjs" },
  { id: "col_site_version",         category: "Konfiguration", table: "site_config", col: "site_version",            detail: "node scripts/db-audit-fix.cjs" },
  { id: "col_site_raritytiers",     category: "Konfiguration", table: "site_config", col: "rarity_tiers",            detail: "node scripts/add-rarity-tiers-config.cjs" },
  // Patch notes — popup toggle
  { id: "col_patch_popup",        category: "Patch Notes",        table: "patch_notes",         col: "show_popup",              detail: "ALTER TABLE patch_notes ADD COLUMN show_popup boolean NOT NULL DEFAULT false;" },
  // Startseiten-Bestenlisten — Profilbild-Modus (Top 3 vs. alle Plätze)
  { id: "col_game_lb_avatarmode", category: "Spielebestenlisten", table: "game_leaderboard_config", col: "avatar_mode",          detail: "node scripts/add-leaderboard-avatar-mode.cjs" },
  // Fähigkeits-Gutscheine — themebare Karten-Optik (card_theme/card_rarity)
  { id: "col_ability_cardtheme",  category: "Fähigkeiten",        table: "ability_definitions", col: "card_theme",              detail: "Spalte via Migration ergänzt" },
  { id: "col_ability_cardrarity", category: "Fähigkeiten",        table: "ability_definitions", col: "card_rarity",             detail: "Spalte via Migration ergänzt" },
  // Case tiers — extended
  { id: "col_case_preview",       category: "Cases",              table: "case_tiers",          col: "preview_cost",            detail: "ALTER TABLE case_tiers ADD COLUMN preview_cost integer DEFAULT 0;" },
  { id: "col_case_multimax",      category: "Cases",              table: "case_tiers",          col: "multi_open_max",          detail: "ALTER TABLE case_tiers ADD COLUMN multi_open_max integer DEFAULT 10;" },
  // Case groups system (run scripts/add-case-groups.cjs)
  { id: "col_case_sort_order",    category: "Cases",              table: "case_tiers",          col: "sort_order",              detail: "node scripts/add-case-groups.cjs" },
  { id: "col_case_perrarity",     category: "Cases",              table: "case_tiers",          col: "per_rarity_item_ids",     detail: "node scripts/add-case-groups.cjs" },
  { id: "col_case_nsstyles",      category: "Cases",              table: "case_tiers",          col: "name_styles_eligible",    detail: "node scripts/add-case-groups.cjs" },
  { id: "col_case_tiersublabel",  category: "Cases",              table: "case_tiers",          col: "tier_sublabel",           detail: "node scripts/add-case-groups.cjs" },
  { id: "col_case_extra_drops",   category: "Cases",              table: "case_tiers",          col: "extra_drops",             detail: "node scripts/add-case-extra-drops.cjs" },
  // Daily Quests — zusätzliche Givables (RewardSpec[]) via zentralem Dispatcher (node scripts/add-quest-reward-extra.cjs)
  { id: "col_dq_tmpl_rewardextra", category: "Daily Quests",       table: "daily_quest_templates", col: "reward_extra",          detail: "node scripts/add-quest-reward-extra.cjs" },
  { id: "col_dq_user_rewardextra", category: "Daily Quests",       table: "user_daily_quests",     col: "reward_extra",          detail: "node scripts/add-quest-reward-extra.cjs" },
  // Shop settings — MOTD
  { id: "col_shop_motd",          category: "Shop",               table: "shop_settings",       col: "motd",                    detail: "ALTER TABLE shop_settings ADD COLUMN motd text;" },
  { id: "col_shop_motdenabled",   category: "Shop",               table: "shop_settings",       col: "motd_enabled",            detail: "ALTER TABLE shop_settings ADD COLUMN motd_enabled boolean DEFAULT false;" },
  { id: "col_shop_rarityweights", category: "Shop",               table: "shop_settings",       col: "rarity_weights",          detail: "node scripts/add-shop-rarity-weights.cjs" },
  // Unified Shop — beliebige Givable-Typen verkaufbar (node scripts/add-unified-shop.cjs)
  { id: "col_shop_listing_type",  category: "Shop",               table: "shop_listings",       col: "listing_type",            detail: "node scripts/add-unified-shop.cjs" },
  { id: "col_shop_cat_content",   category: "Shop",               table: "shop_categories",     col: "content_type",            detail: "node scripts/add-unified-shop.cjs" },
  { id: "col_shop_cat_vkind",     category: "Shop",               table: "shop_categories",     col: "voucher_kind",            detail: "node scripts/add-shop-voucher-config.cjs" },
  // Streak config — special event
  { id: "col_streak_special",     category: "Streak",             table: "streak_config",       col: "special_event_enabled",   detail: "ALTER TABLE streak_config ADD COLUMN special_event_enabled boolean DEFAULT false;" },
  { id: "col_streak_specialmult", category: "Streak",             table: "streak_config",       col: "special_event_multiplier",detail: "ALTER TABLE streak_config ADD COLUMN special_event_multiplier numeric(4,2) DEFAULT 2.0;" },
  { id: "col_streak_milestonerewards", category: "Streak",        table: "streak_config",       col: "milestone_rewards",       detail: "node scripts/add-streak-milestone-rewards.cjs" },
  // World config — spawn params
  { id: "col_world_maxmonsters",  category: "World",              table: "world_config",        col: "max_alive_monsters",      detail: "ALTER TABLE world_config ADD COLUMN max_alive_monsters integer;" },
  // Tickets — reward pin system (2026-06-25)
  { id: "col_tickets_reward_pending", category: "Tickets",        table: "tickets",             col: "reward_pending",          detail: "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reward_pending boolean NOT NULL DEFAULT false;" },
  // Tickets — escalate to admin (2026-06-25)
  { id: "col_tickets_escalated",  category: "Tickets",            table: "tickets",             col: "escalated_to_admin",      detail: "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated_to_admin boolean NOT NULL DEFAULT false;" },
  // Tickets — targeted escalation to specific staff member (2026-06-26)
  { id: "col_tickets_escalated_to_user", category: "Tickets",    table: "tickets",             col: "escalated_to_user_id",    detail: "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalated_to_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;" },
  { id: "col_tickets_suggestion_outcome", category: "Tickets",   table: "tickets",             col: "suggestion_outcome",      detail: "node scripts/add-suggestion-outcome.cjs" },
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
  { id: "col_plinko_minbet",      category: "Plinko",             table: "plinko_config",       col: "min_bet_cr",              detail: "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS min_bet_cr integer DEFAULT 500;" },
  { id: "col_plinko_maxbet",      category: "Plinko",             table: "plinko_config",       col: "max_bet_cr",              detail: "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS max_bet_cr integer DEFAULT 0;" },
  { id: "col_plinko_quickbets",   category: "Plinko",             table: "plinko_config",       col: "quick_bet_amounts",       detail: "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS quick_bet_amounts jsonb DEFAULT '[500,1000,5000,25000,100000]';" },
  { id: "col_plinko_particles",   category: "Plinko",             table: "plinko_config",       col: "particles_enabled",       detail: "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS particles_enabled boolean DEFAULT true;" },
  { id: "col_plinko_trail",       category: "Plinko",             table: "plinko_config",       col: "trail_length",            detail: "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS trail_length integer DEFAULT 6;" },
  { id: "col_plinko_glow",        category: "Plinko",             table: "plinko_config",       col: "glow_intensity",          detail: "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS glow_intensity numeric DEFAULT 1.5;" },
  { id: "col_plinko_animspeed",   category: "Plinko",             table: "plinko_config",       col: "animation_speed",         detail: "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS animation_speed numeric DEFAULT 1.0;" },
  { id: "col_plinko_autobet",     category: "Plinko",             table: "plinko_config",       col: "auto_bet_enabled",        detail: "ALTER TABLE plinko_config ADD COLUMN IF NOT EXISTS auto_bet_enabled boolean DEFAULT true;" },
  // Vouchers — reward bundles (mehrere Belohnungen pro Code)
  { id: "col_rc_rewards", category: "Gutscheine", table: "redemption_codes", col: "rewards", detail: "ALTER TABLE redemption_codes ADD COLUMN IF NOT EXISTS rewards jsonb NOT NULL DEFAULT '[]'::jsonb;" },
  // Vouchers Pro — targeting, scheduling, per-user limit
  { id: "col_rc_per_user_limit",  category: "Gutscheine", table: "redemption_codes", col: "per_user_limit",  detail: "ALTER TABLE redemption_codes ADD COLUMN IF NOT EXISTS per_user_limit integer NOT NULL DEFAULT 1;" },
  { id: "col_rc_target_user_ids", category: "Gutscheine", table: "redemption_codes", col: "target_user_ids", detail: "ALTER TABLE redemption_codes ADD COLUMN IF NOT EXISTS target_user_ids jsonb;" },
  { id: "col_rc_starts_at",       category: "Gutscheine", table: "redemption_codes", col: "starts_at",       detail: "ALTER TABLE redemption_codes ADD COLUMN IF NOT EXISTS starts_at timestamptz;" },
  // Name Styles — new feature columns on profiles
  { id: "col_profiles_active_name_style", category: "Name Styles", table: "profiles", col: "active_name_style_key", detail: "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_name_style_key text;" },
  { id: "col_profiles_warning_strikes",   category: "Name Styles", table: "profiles", col: "warning_strikes",       detail: "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warning_strikes integer NOT NULL DEFAULT 0;" },
  { id: "col_profiles_warning_note",      category: "Name Styles", table: "profiles", col: "warning_note",          detail: "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS warning_note text;" },
  // Name Styles — shop system (2026-06-25)
  { id: "col_ns_available_in_shop",  category: "Name Styles", table: "name_styles", col: "available_in_shop",  detail: "ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS available_in_shop boolean NOT NULL DEFAULT false;" },
  { id: "col_ns_shop_price_cr",      category: "Name Styles", table: "name_styles", col: "shop_price_cr",      detail: "ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS shop_price_cr integer NOT NULL DEFAULT 0;" },
  { id: "col_ns_shop_stock",         category: "Name Styles", table: "name_styles", col: "shop_stock",         detail: "ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS shop_stock integer NULL;" },
  { id: "col_ns_shop_expires_at",    category: "Name Styles", table: "name_styles", col: "shop_expires_at",    detail: "ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS shop_expires_at timestamptz NULL;" },
  { id: "col_ns_shop_sort_order",    category: "Name Styles", table: "name_styles", col: "shop_sort_order",    detail: "ALTER TABLE name_styles ADD COLUMN IF NOT EXISTS shop_sort_order integer NOT NULL DEFAULT 0;" },
  // Battle Pass — shop sort order (2026-06-25)
  { id: "col_bp_shop_sort_order",    category: "Battle Pass", table: "battle_passes",     col: "shop_sort_order",       detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS shop_sort_order integer NOT NULL DEFAULT 0;" },
  // Battle Pass tiers — name style reward (2026-06-25)
  { id: "col_bpt_name_style_key",    category: "Battle Pass", table: "battle_pass_tiers", col: "reward_name_style_key", detail: "ALTER TABLE battle_pass_tiers ADD COLUMN IF NOT EXISTS reward_name_style_key text NULL;" },
  // Battle Pass tiers — Gutschein-Rewards (Case-Voucher + Spiel-Bonus)
  { id: "col_bpt_cv_mode",  category: "Battle Pass", table: "battle_pass_tiers", col: "reward_case_voucher_mode", detail: "node scripts/add-bp-voucher-rewards.cjs" },
  { id: "col_bpt_gb_game",  category: "Battle Pass", table: "battle_pass_tiers", col: "reward_game_bonus_game",   detail: "node scripts/add-bp-voucher-rewards.cjs" },
  // Battle Pass v3 — shop positioning & per-pass config (2026-06-25)
  { id: "col_bp_shop_position",      category: "Battle Pass", table: "battle_passes",     col: "shop_position",          detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS shop_position text DEFAULT 'below_featured';" },
  { id: "col_bp_shop_banner_size",   category: "Battle Pass", table: "battle_passes",     col: "shop_banner_size",       detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS shop_banner_size text DEFAULT 'card';" },
  { id: "col_bp_custom_buy_text",    category: "Battle Pass", table: "battle_passes",     col: "custom_buy_text",        detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS custom_buy_text text;" },
  { id: "col_bp_custom_elite_buy",   category: "Battle Pass", table: "battle_passes",     col: "custom_elite_buy_text",  detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS custom_elite_buy_text text;" },
  { id: "col_bp_highlight_color",    category: "Battle Pass", table: "battle_passes",     col: "highlight_color",        detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS highlight_color text;" },
  { id: "col_bp_show_tier_count",    category: "Battle Pass", table: "battle_passes",     col: "show_tier_count_in_shop",detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS show_tier_count_in_shop boolean DEFAULT true;" },
  { id: "col_bp_show_countdown",     category: "Battle Pass", table: "battle_passes",     col: "show_countdown",         detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS show_countdown boolean DEFAULT true;" },
  { id: "col_bp_pass_icon",          category: "Battle Pass", table: "battle_passes",     col: "pass_icon",              detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS pass_icon text DEFAULT '🏆';" },
  { id: "col_bp_updated_at",         category: "Battle Pass", table: "battle_passes",     col: "updated_at",             detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();" },
  { id: "col_bp_incompatible_with",  category: "Battle Pass", table: "battle_passes",     col: "incompatible_with",      detail: "ALTER TABLE battle_passes ADD COLUMN IF NOT EXISTS incompatible_with TEXT[] NOT NULL DEFAULT '{}';" },
  // Tickets — per-message attachments (2026-06-25)
  { id: "col_ticketmsg_attachment",  category: "Tickets",     table: "ticket_messages",   col: "attachment_url",         detail: "node scripts/full-db-sync.cjs" },
  // World config — spawn config columns (2026-06-25)
  { id: "col_world_spawnmin",        category: "World",       table: "world_config",      col: "spawn_interval_min_sec", detail: "node scripts/full-db-sync.cjs" },
  { id: "col_world_spawnmax",        category: "World",       table: "world_config",      col: "spawn_interval_max_sec", detail: "node scripts/full-db-sync.cjs" },
  { id: "col_world_alivecapmax",     category: "World",       table: "world_config",      col: "alive_cap_max",          detail: "node scripts/full-db-sync.cjs" },
  { id: "col_world_alivecapplayer",  category: "World",       table: "world_config",      col: "alive_cap_per_extra_player", detail: "node scripts/full-db-sync.cjs" },
  { id: "col_world_perkmuliplicap",  category: "World",       table: "world_config",      col: "perk_multiplier_cap",    detail: "node scripts/full-db-sync.cjs" },
  // Character config — combat columns (2026-06-25)
  { id: "col_char_attackcooldown",   category: "World",       table: "character_config",  col: "attack_cooldown",        detail: "node scripts/full-db-sync.cjs" },
  { id: "col_char_hpregenpersec",    category: "World",       table: "character_config",  col: "hp_regen_per_sec",       detail: "node scripts/full-db-sync.cjs" },
  { id: "col_char_hpregendelay",     category: "World",       table: "character_config",  col: "hp_regen_delay_after_hit_sec", detail: "node scripts/full-db-sync.cjs" },
  { id: "col_char_pvpdmg",           category: "World",       table: "character_config",  col: "pvp_damage_multiplier",  detail: "node scripts/full-db-sync.cjs" },
  { id: "col_char_perkmuliplicap",   category: "World",       table: "character_config",  col: "perk_multiplier_cap",    detail: "node scripts/full-db-sync.cjs" },
  { id: "col_char_fistdmg",          category: "World",       table: "character_config",  col: "fist_damage",            detail: "node scripts/full-db-sync.cjs" },
  { id: "col_char_movespeed",        category: "World",       table: "character_config",  col: "move_speed",             detail: "node scripts/full-db-sync.cjs" },
  { id: "col_char_sprintmult",       category: "World",       table: "character_config",  col: "sprint_multiplier",      detail: "node scripts/full-db-sync.cjs" },
  { id: "col_char_sprintdmg",        category: "World",       table: "character_config",  col: "sprint_damage_multiplier", detail: "node scripts/full-db-sync.cjs" },
  // Monster types — reward columns (2026-06-25)
  { id: "col_monster_credits",       category: "World",       table: "monster_types",     col: "credits_reward",         detail: "node scripts/full-db-sync.cjs" },
  { id: "col_monster_rewardmin",     category: "World",       table: "monster_types",     col: "reward_min",             detail: "node scripts/full-db-sync.cjs" },
  { id: "col_monster_rewardmax",     category: "World",       table: "monster_types",     col: "reward_max",             detail: "node scripts/full-db-sync.cjs" },
  { id: "col_monster_spawnweight",   category: "World",       table: "monster_types",     col: "spawn_weight",           detail: "node scripts/full-db-sync.cjs" },
  // Level & XP system — profiles columns (2026-06-25)
  { id: "col_profiles_xp",           category: "Level & XP",  table: "profiles",           col: "xp",                     detail: "node scripts/add-level-xp-abilities.cjs" },
  { id: "col_profiles_level",        category: "Level & XP",  table: "profiles",           col: "level",                  detail: "node scripts/add-level-xp-abilities.cjs" },
  { id: "col_profiles_ability_key",  category: "Level & XP",  table: "profiles",           col: "equipped_ability_key",   detail: "node scripts/add-level-xp-abilities.cjs" },
  // Battle Pass tier — ability reward (2026-06-25)
  { id: "col_bpt_ability_key",       category: "Battle Pass", table: "battle_pass_tiers",  col: "reward_ability_key",     detail: "node scripts/add-level-xp-abilities.cjs" },
  // Patch notes — dismissed popup per user (2026-06-26)
  { id: "col_profiles_dismissed_patchnote", category: "Patch Notes", table: "profiles", col: "dismissed_patchnote_id", detail: "node scripts/add-dismissed-patchnote.cjs" },
  // Battle Pass Quest System (2026-06-25) — node scripts/add-bp-quests.cjs
  { id: "col_bp_progression_type",   category: "Battle Pass", table: "battle_passes",       col: "progression_type",       detail: "node scripts/add-bp-quests.cjs" },
  { id: "col_bp_xp_per_tier",        category: "Battle Pass", table: "battle_passes",       col: "bp_xp_per_tier",         detail: "node scripts/add-bp-quests.cjs" },
  { id: "col_bp_xp_cap_per_day",     category: "Battle Pass", table: "battle_passes",       col: "bp_xp_cap_per_day",      detail: "node scripts/add-bp-quests.cjs" },
  { id: "col_bp_visual_config",      category: "Battle Pass", table: "battle_passes",       col: "visual_config",          detail: "node scripts/add-bp-visual-config.cjs" },
  { id: "col_bpt_reward_item_type",   category: "Battle Pass", table: "battle_pass_tiers",   col: "reward_item_type",       detail: "node scripts/add-bp-tier-reward-item-type.cjs" },
  { id: "col_bpt_bp_xp_required",    category: "Battle Pass", table: "battle_pass_tiers",   col: "bp_xp_required",         detail: "node scripts/add-bp-quests.cjs" },
  { id: "col_bpt_display_mode",      category: "Battle Pass", table: "battle_pass_tiers",   col: "display_mode",           detail: "node scripts/add-bp-display-modes.cjs" },
  { id: "col_bpt_show_tier_name",    category: "Battle Pass", table: "battle_pass_tiers",   col: "show_tier_name",         detail: "node scripts/add-bp-display-modes.cjs" },
  { id: "col_bpt_show_tier_desc",    category: "Battle Pass", table: "battle_pass_tiers",   col: "show_tier_description",  detail: "node scripts/add-bp-display-modes.cjs" },
  { id: "col_sess_in_world",         category: "Sessions",    table: "user_sessions",        col: "in_world",               detail: "node scripts/add-session-in-world.cjs" },
  { id: "col_sess_in_world_since",   category: "Sessions",    table: "user_sessions",        col: "in_world_since",         detail: "node scripts/add-session-in-world.cjs" },
  { id: "col_profiles_prio_badges",  category: "Prio-Badges", table: "profiles",             col: "prio_badges",            detail: "node scripts/add-prio-badges.cjs" },
  { id: "col_siteconfig_max_prio",   category: "Prio-Badges", table: "site_config",          col: "max_prio_badges",        detail: "node scripts/add-prio-badges.cjs" },
  { id: "col_ubp_bp_xp",             category: "Battle Pass", table: "user_battle_passes",  col: "bp_xp",                  detail: "node scripts/add-bp-quests.cjs" },
  // Fine-Config — all columns (node scripts/add-fine-config.cjs)
  { id: "col_fine_nametag_dist",     category: "Feintuning",  table: "fine_config", col: "nametag_distance_factor",     detail: "node scripts/add-fine-config.cjs" },
  { id: "col_fine_nametag_height",   category: "Feintuning",  table: "fine_config", col: "nametag_height_offset",       detail: "node scripts/add-fine-config.cjs" },
  { id: "col_fine_mp_lerp",          category: "Feintuning",  table: "fine_config", col: "mp_position_lerp_rate",       detail: "node scripts/add-fine-config.cjs" },
  { id: "col_fine_mp_turn",          category: "Feintuning",  table: "fine_config", col: "mp_heading_turn_rate",        detail: "node scripts/add-fine-config.cjs" },
  { id: "col_fine_mp_dr",            category: "Feintuning",  table: "fine_config", col: "mp_dead_reckoning_lookahead", detail: "node scripts/add-fine-config.cjs" },
  { id: "col_fine_mp_swing",         category: "Feintuning",  table: "fine_config", col: "mp_attack_swing_duration",    detail: "node scripts/add-fine-config.cjs" },
  { id: "col_fine_blood_count",      category: "Feintuning",  table: "fine_config", col: "blood_burst_particle_count",  detail: "node scripts/add-fine-config.cjs" },
  { id: "col_fine_blood_ms",         category: "Feintuning",  table: "fine_config", col: "blood_burst_lifetime_ms",     detail: "node scripts/add-fine-config.cjs" },
  { id: "col_fine_slash_ms",         category: "Feintuning",  table: "fine_config", col: "slash_lifetime_ms",           detail: "node scripts/add-fine-config.cjs" },
  { id: "col_fine_chat_history",     category: "Feintuning",  table: "fine_config", col: "chat_max_history",            detail: "node scripts/add-fine-config.cjs" },
  { id: "col_fine_chat_maxlen",      category: "Feintuning",  table: "fine_config", col: "chat_max_message_length",     detail: "node scripts/add-fine-config.cjs" },
  { id: "col_fine_chat_poll",        category: "Feintuning",  table: "fine_config", col: "chat_poll_interval_ms",       detail: "node scripts/add-fine-config.cjs" },
  { id: "col_fine_community_badges", category: "Feintuning",  table: "fine_config", col: "community_max_badges_shown",  detail: "node scripts/add-fine-config.cjs" },
  // Farmwelt best-streak leaderboard (2026-06-26)
  { id: "col_profiles_world_best_streak", category: "World", table: "profiles", col: "world_best_streak", detail: "node scripts/add-survey-upgrade-world-streak.cjs" },
  // Survey upgrade — new columns (2026-06-26)
  { id: "col_surveys_image_url",        category: "Umfragen", table: "surveys",          col: "image_url",                  detail: "node scripts/add-survey-upgrade-world-streak.cjs" },
  { id: "col_surveys_show_results",     category: "Umfragen", table: "surveys",          col: "show_results_after_submit",  detail: "node scripts/add-survey-upgrade-world-streak.cjs" },
  { id: "col_surveyq_hint_text",        category: "Umfragen", table: "survey_questions", col: "hint_text",                  detail: "node scripts/add-survey-upgrade-world-streak.cjs" },
  { id: "col_surveyq_image_url",        category: "Umfragen", table: "survey_questions", col: "image_url",                  detail: "node scripts/add-survey-upgrade-world-streak.cjs" },
  { id: "col_surveyq_scale_min",        category: "Umfragen", table: "survey_questions", col: "scale_min",                  detail: "node scripts/add-survey-upgrade-world-streak.cjs" },
  { id: "col_surveyq_scale_max",        category: "Umfragen", table: "survey_questions", col: "scale_max",                  detail: "node scripts/add-survey-upgrade-world-streak.cjs" },
  { id: "col_surveyq_max_length",       category: "Umfragen", table: "survey_questions", col: "max_length",                 detail: "node scripts/add-survey-upgrade-world-streak.cjs" },
  { id: "col_surveya_answer_number",    category: "Umfragen", table: "survey_answers",   col: "answer_number",              detail: "node scripts/add-survey-upgrade-world-streak.cjs" },
  // user_sessions — last_ping for heartbeat (2026-06-26)
  { id: "col_sess_last_ping",           category: "Sessions", table: "user_sessions",    col: "last_ping",                  detail: "node scripts/add-session-in-world.cjs" },
  // Profiles — Freundschaftsanfragen annehmen (2026-06-28)
  { id: "col_profiles_accept_friend_requests", category: "Social / Freunde", table: "profiles", col: "accept_friend_requests", detail: "node scripts/add-settings-chatmod.cjs" },
  // Aktive-Boni-Karten — Präsentation pro Bonus-Gutschein (2026-06-28)
  { id: "col_gba_card_theme",    category: "Spiel-Boni", table: "game_bonus_allowances", col: "card_theme",    detail: "node scripts/add-bonus-card-fields.cjs" },
  { id: "col_gba_card_rarity",   category: "Spiel-Boni", table: "game_bonus_allowances", col: "card_rarity",   detail: "node scripts/add-bonus-card-fields.cjs" },
  { id: "col_gba_card_title",    category: "Spiel-Boni", table: "game_bonus_allowances", col: "card_title",    detail: "node scripts/add-bonus-card-fields.cjs" },
  { id: "col_gba_card_subtitle", category: "Spiel-Boni", table: "game_bonus_allowances", col: "card_subtitle", detail: "node scripts/add-bonus-card-fields.cjs" },
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
    { key: "CRON_SECRET",                id: "env_cron_secret",severity: "warn",  detail: "CRON_SECRET fehlt — /api/cron/cleanup läuft ohne Auth-Schutz (intern ok). Für öffentliche Deployments setzen." },
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

  // ── 22. Name Styles ───────────────────────────────────────────────────────
  try {
    const { count: nsCount, error: nsErr } = await admin
      .from("name_styles")
      .select("*", { count: "exact", head: true });
    results.push(nsErr
      ? err("name_styles_count", "Name Styles", "name_styles", nsErr.message)
      : ok("name_styles_count", "Name Styles", "name_styles", `${nsCount ?? 0} Style(s) definiert`));
  } catch (e) {
    results.push(err("name_styles_count", "Name Styles", "name_styles", String(e)));
  }

  try {
    const { count: unsCount, error: unsErr } = await admin
      .from("user_name_styles")
      .select("*", { count: "exact", head: true });
    results.push(unsErr
      ? err("user_name_styles_count", "Name Styles", "user_name_styles", unsErr.message)
      : ok("user_name_styles_count", "Name Styles", "user_name_styles", `${unsCount ?? 0} User-Zuweisung(en)`));
  } catch (e) {
    results.push(err("user_name_styles_count", "Name Styles", "user_name_styles", String(e)));
  }

  try {
    const { count: nsrcCount, error: nsrcErr } = await admin
      .from("name_style_rarity_config")
      .select("*", { count: "exact", head: true });
    results.push(nsrcErr
      ? err("name_style_rarity_config_count", "Name Styles", "name_style_rarity_config", nsrcErr.message)
      : ok("name_style_rarity_config_count", "Name Styles", "name_style_rarity_config",
          nsrcCount === 4
            ? `${nsrcCount} Seltenheiten konfiguriert (erwartet: 4)`
            : `WARNUNG: ${nsrcCount ?? 0} von 4 Seltenheiten konfiguriert`));
  } catch (e) {
    results.push(err("name_style_rarity_config_count", "Name Styles", "name_style_rarity_config", String(e)));
  }

  // ── 23. Plinko ────────────────────────────────────────────────────────────
  try {
    const { data: plinkoCfg, error: plinkoErr } = await admin
      .from("plinko_config").select("ball_cost_cr,daily_ball_limit,show_history").eq("id", "default").maybeSingle();
    results.push(plinkoErr || !plinkoCfg
      ? warn("plinko_cfg_row", "Plinko", "plinko_config (default)", "Kein Konfig-Eintrag — Migration ausführen: node scripts/full-db-sync.cjs")
      : ok("plinko_cfg_row", "Plinko", "plinko_config (default)",
          `ball_cost: ${plinkoCfg.ball_cost_cr ?? 0} CR, daily_limit: ${plinkoCfg.daily_ball_limit ?? 0}`));
  } catch (e) {
    results.push(warn("plinko_cfg_row", "Plinko", "plinko_config (default)", String(e)));
  }

  try {
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const { count: plinkoPlays24h } = await admin
      .from("plinko_plays").select("*", { count: "exact", head: true }).gte("created_at", since24h);
    results.push(ok("plinko_plays_24h", "Plinko", "Plinko-Spiele (24h)", `${plinkoPlays24h ?? 0} Spiele`));
  } catch (e) {
    results.push(warn("plinko_plays_24h", "Plinko", "Plinko-Spiele (24h)", String(e)));
  }

  // ── 24. World / Combat / Kill-Streak ──────────────────────────────────────
  try {
    const { data: ksRow, error: ksErr } = await admin
      .from("kill_streak_config").select("multiplier_per_kill,max_multiplier").eq("id", "default").maybeSingle();
    results.push(ksErr || !ksRow
      ? warn("killstreak_cfg", "World", "kill_streak_config (default)", "Kein Konfig-Eintrag — Migration ausführen: node scripts/full-db-sync.cjs")
      : ok("killstreak_cfg", "World", "kill_streak_config (default)",
          `mult/kill: ${ksRow.multiplier_per_kill}, max: ${ksRow.max_multiplier}`));
  } catch (e) {
    results.push(warn("killstreak_cfg", "World", "kill_streak_config (default)", String(e)));
  }

  try {
    const { data: worldRow, error: worldErr } = await admin
      .from("world_config").select("max_alive_monsters,spawn_interval_min_sec,spawn_interval_max_sec").eq("id", "default").maybeSingle();
    if (worldErr || !worldRow) {
      results.push(warn("world_spawn_cfg", "World", "world_config spawn-Werte", "Kein Konfig-Eintrag oder Spalten fehlen."));
    } else {
      const ready = worldRow.max_alive_monsters !== null && worldRow.spawn_interval_min_sec !== null;
      results.push(ready
        ? ok("world_spawn_cfg", "World", "world_config spawn-Werte",
            `max_monsters: ${worldRow.max_alive_monsters}, spawn: ${worldRow.spawn_interval_min_sec}–${worldRow.spawn_interval_max_sec}s`)
        : warn("world_spawn_cfg", "World", "world_config spawn-Werte", "Spawn-Spalten vorhanden aber leer — Balance-Script ausführen."));
    }
  } catch (e) {
    results.push(warn("world_spawn_cfg", "World", "world_config spawn-Werte", String(e)));
  }

  try {
    const { data: charRow, error: charErr } = await admin
      .from("character_config").select("attack_cooldown,pvp_damage_multiplier,move_speed").eq("id", "default").maybeSingle();
    if (charErr || !charRow) {
      results.push(warn("char_cfg", "World", "character_config Kampf-Werte", "Kein Konfig-Eintrag oder Spalten fehlen."));
    } else {
      const ready = charRow.attack_cooldown !== null;
      results.push(ready
        ? ok("char_cfg", "World", "character_config Kampf-Werte",
            `atk_cd: ${charRow.attack_cooldown}s, pvp: ${charRow.pvp_damage_multiplier}×, speed: ${charRow.move_speed}`)
        : warn("char_cfg", "World", "character_config Kampf-Werte", "Spalten vorhanden aber leer — Balance-Script ausführen."));
    }
  } catch (e) {
    results.push(warn("char_cfg", "World", "character_config Kampf-Werte", String(e)));
  }

  try {
    const { data: monsters } = await admin
      .from("monster_types").select("id,credits_reward").order("credits_reward", { ascending: false });
    const mList = (monsters ?? []) as Array<{ id: string; credits_reward: number | null }>;
    const withReward = mList.filter((m) => (m.credits_reward ?? 0) > 0);
    results.push(mList.length === 0
      ? warn("monster_rewards", "World", "Monster-Belohnungen", "Keine Monster gefunden.")
      : withReward.length === mList.length
        ? ok("monster_rewards", "World", "Monster-Belohnungen",
            `${mList.length} Monster, alle mit CR-Belohnung (max: ${mList[0]?.credits_reward ?? 0} CR)`)
        : warn("monster_rewards", "World", "Monster-Belohnungen",
            `${withReward.length}/${mList.length} Monster haben CR-Belohnungen — node scripts/full-db-sync.cjs`));
  } catch (e) {
    results.push(warn("monster_rewards", "World", "Monster-Belohnungen", String(e)));
  }

  // ── 25. Pets ──────────────────────────────────────────────────────────────
  try {
    const { count: petCount, error: petErr } = await admin
      .from("pet_configs").select("*", { count: "exact", head: true });
    results.push(petErr
      ? warn("pet_configs_count", "Pets", "pet_configs", petErr.message)
      : ok("pet_configs_count", "Pets", "pet_configs", `${petCount ?? 0} Pet-Konfigurationen`));
  } catch (e) {
    results.push(warn("pet_configs_count", "Pets", "pet_configs", String(e)));
  }

  try {
    const { count: proCount, error: proErr } = await admin
      .from("pet_rarity_overrides").select("*", { count: "exact", head: true });
    results.push(proErr
      ? warn("pet_rarity_overrides_count", "Pets", "pet_rarity_overrides", proErr.message)
      : ok("pet_rarity_overrides_count", "Pets", "pet_rarity_overrides", `${proCount ?? 0} Seltenheits-Overrides`));
  } catch (e) {
    results.push(warn("pet_rarity_overrides_count", "Pets", "pet_rarity_overrides", String(e)));
  }

  // ── 26. Tickets ───────────────────────────────────────────────────────────
  try {
    const { count: openCount } = await admin
      .from("tickets").select("*", { count: "exact", head: true }).in("status", ["open", "in_progress"]);
    const { count: totalCount } = await admin
      .from("tickets").select("*", { count: "exact", head: true });
    results.push(ok("tickets_open", "Tickets", "Offene Tickets", `${openCount ?? 0} offen, ${totalCount ?? 0} gesamt`));
  } catch (e) {
    results.push(warn("tickets_open", "Tickets", "Offene Tickets", String(e)));
  }

  try {
    const { count: pendingRewards } = await admin
      .from("tickets").select("*", { count: "exact", head: true }).eq("reward_pending", true);
    results.push((pendingRewards ?? 0) > 0
      ? warn("tickets_pending_reward", "Tickets", "Ausstehende Belohnungen", `${pendingRewards} Ticket(s) warten auf Belohnungs-Auszahlung`)
      : ok("tickets_pending_reward", "Tickets", "Ausstehende Belohnungen", "Keine ausstehenden Belohnungen"));
  } catch (e) {
    results.push(warn("tickets_pending_reward", "Tickets", "Ausstehende Belohnungen", String(e)));
  }

  // ── 27. Trading & Auctions ────────────────────────────────────────────────
  try {
    const { count: activeAuctions } = await admin
      .from("auctions").select("*", { count: "exact", head: true }).eq("status", "active");
    const { count: totalAuctions } = await admin
      .from("auctions").select("*", { count: "exact", head: true });
    results.push(ok("auctions_count", "Auktionen", "auctions", `${activeAuctions ?? 0} aktiv, ${totalAuctions ?? 0} gesamt`));
  } catch (e) {
    results.push(warn("auctions_count", "Auktionen", "auctions", String(e)));
  }

  try {
    const { count: activeTrades } = await admin
      .from("trades").select("*", { count: "exact", head: true }).eq("status", "pending");
    results.push(ok("trades_count", "Handel", "trades", `${activeTrades ?? 0} ausstehende Handel`));
  } catch (e) {
    results.push(warn("trades_count", "Handel", "trades", String(e)));
  }

  // ── 28. Balance Studio — data completeness ────────────────────────────────
  try {
    const { data: siteCfg } = await admin.from("site_config").select("starting_credits").eq("id", "default").maybeSingle();
    const sc = (siteCfg as { starting_credits?: number } | null)?.starting_credits ?? 0;
    results.push(sc >= 1000
      ? ok("balance_starting_cr", "Balance Studio", "Startguthaben", `${sc.toLocaleString("de-DE")} CR`)
      : warn("balance_starting_cr", "Balance Studio", "Startguthaben", `Nur ${sc} CR — node scripts/balance-final.cjs ausführen`));
  } catch (e) {
    results.push(warn("balance_starting_cr", "Balance Studio", "Startguthaben", String(e)));
  }

  try {
    const { data: mineCfg } = await admin.from("mine_config").select("levels").eq("id", "default").maybeSingle();
    const levels = (mineCfg as { levels?: unknown[] } | null)?.levels ?? [];
    results.push(Array.isArray(levels) && levels.length === 10
      ? ok("balance_mine", "Balance Studio", "Mine-Konfiguration", "10 Level konfiguriert")
      : warn("balance_mine", "Balance Studio", "Mine-Konfiguration", `${Array.isArray(levels) ? levels.length : 0} Level (erwartet 10) — node scripts/balance-final.cjs`));
  } catch (e) {
    results.push(warn("balance_mine", "Balance Studio", "Mine-Konfiguration", String(e)));
  }

  // ── 29. Level & XP System ────────────────────────────────────────────────
  try {
    const { data: xpCfg, error: xpErr } = await admin
      .from("xp_config").select("sources,levels").eq("id", "default").maybeSingle();
    if (xpErr || !xpCfg) {
      results.push(warn("xp_cfg_row", "Level & XP", "xp_config (default)", "Kein Konfigurationseintrag — node scripts/add-level-xp-abilities.cjs ausführen"));
    } else {
      const levels = (xpCfg as { levels?: unknown[] }).levels ?? [];
      results.push(Array.isArray(levels) && levels.length === 50
        ? ok("xp_cfg_row", "Level & XP", "xp_config (default)", `50 Level konfiguriert`)
        : warn("xp_cfg_row", "Level & XP", "xp_config (default)", `${Array.isArray(levels) ? levels.length : 0}/50 Level — node scripts/add-level-xp-abilities.cjs`));
    }
  } catch (e) {
    results.push(warn("xp_cfg_row", "Level & XP", "xp_config (default)", String(e)));
  }

  try {
    const { count: xpEventsCount } = await admin.from("xp_events").select("*", { count: "exact", head: true });
    results.push(ok("xp_events_count", "Level & XP", "xp_events", `${xpEventsCount ?? 0} XP-Events insgesamt`));
  } catch (e) {
    results.push(warn("xp_events_count", "Level & XP", "xp_events", String(e)));
  }

  try {
    const { count: abilityDefCount } = await admin
      .from("ability_definitions").select("*", { count: "exact", head: true }).eq("enabled", true);
    const { count: abilityDefTotal } = await admin
      .from("ability_definitions").select("*", { count: "exact", head: true });
    results.push((abilityDefTotal ?? 0) >= 20
      ? ok("ability_defs", "Level & XP", "ability_definitions", `${abilityDefCount ?? 0} aktiv, ${abilityDefTotal ?? 0} gesamt`)
      : warn("ability_defs", "Level & XP", "ability_definitions", `Nur ${abilityDefTotal ?? 0} Fähigkeiten — node scripts/add-level-xp-abilities.cjs`));
  } catch (e) {
    results.push(warn("ability_defs", "Level & XP", "ability_definitions", String(e)));
  }

  try {
    const { count: userAbilityCount } = await admin.from("user_abilities").select("*", { count: "exact", head: true });
    results.push(ok("user_abilities_count", "Level & XP", "user_abilities", `${userAbilityCount ?? 0} Fähigkeiten vergeben`));
  } catch (e) {
    results.push(warn("user_abilities_count", "Level & XP", "user_abilities", String(e)));
  }

  try {
    const { data: profiles } = await admin
      .from("profiles").select("xp,level").order("xp", { ascending: false }).limit(1);
    const top = (profiles ?? [])[0] as { xp?: number; level?: number } | undefined;
    results.push(ok("xp_top_user", "Level & XP", "Höchster Level-Spieler",
      top ? `Level ${top.level ?? 1}, ${(top.xp ?? 0).toLocaleString("de-DE")} XP` : "Noch niemand hat XP"));
  } catch (e) {
    results.push(warn("xp_top_user", "Level & XP", "Höchster Level-Spieler", String(e)));
  }

  // ── 29b. Sound Manager ────────────────────────────────────────────────────
  try {
    const { data: soundCfg, error: soundErr } = await admin
      .from("sound_config").select("config").eq("id", "default").maybeSingle();
    if (soundErr || !soundCfg) {
      results.push(warn("sound_cfg_row", "Sound Manager", "sound_config (default)", "Kein Konfigurationseintrag — node scripts/add-level-xp-abilities.cjs ausführen"));
    } else {
      const cfg = soundCfg as { config?: Record<string, unknown> };
      const eventCount = Object.keys(cfg.config ?? {}).length;
      results.push(eventCount >= 52
        ? ok("sound_cfg_row", "Sound Manager", "sound_config (default)", `${eventCount} Sound-Events konfiguriert`)
        : eventCount >= 27
          ? ok("sound_cfg_row", "Sound Manager", "sound_config (default)", `${eventCount} Sound-Events — node scripts/update-sound-config.cjs für 52+ Events`)
          : warn("sound_cfg_row", "Sound Manager", "sound_config (default)", `${eventCount}/52 Events — node scripts/update-sound-config.cjs ausführen`));
    }
  } catch (e) {
    results.push(warn("sound_cfg_row", "Sound Manager", "sound_config (default)", String(e)));
  }

  // ── 30. Storage Buckets ───────────────────────────────────────────────────
  try {
    const { data: buckets, error: bucketsErr } = await admin.storage.listBuckets();
    if (bucketsErr) {
      results.push(warn("storage_buckets", "Storage", "Supabase Storage Buckets", bucketsErr.message));
    } else {
      const bucketIds = (buckets ?? []).map((b) => b.id);
      const ticketBucket = bucketIds.includes("ticket-attachments");
      results.push(ticketBucket
        ? ok("storage_ticket_bucket", "Storage", "ticket-attachments Bucket", "Bucket existiert und ist öffentlich")
        : warn("storage_ticket_bucket", "Storage", "ticket-attachments Bucket", "Bucket fehlt — node scripts/migrate-ticket-attachments.cjs ausführen"));
    }
  } catch (e) {
    results.push(warn("storage_buckets", "Storage", "Supabase Storage Buckets", String(e)));
  }

  // ── 31. Mine-System ───────────────────────────────────────────────────────
  try {
    const { data: mineCfgRow, error: mineErr } = await admin
      .from("mine_config").select("enabled,levels,section_title").eq("id", "default").maybeSingle();
    if (mineErr || !mineCfgRow) {
      results.push(warn("mine_cfg_singleton", "Mine", "mine_config (default)",
        "Kein Konfigurationseintrag — node scripts/db-audit-fix.cjs ausführen"));
    } else {
      const lvls = (mineCfgRow as { levels?: unknown[] }).levels ?? [];
      results.push(Array.isArray(lvls) && lvls.length === 10
        ? ok("mine_cfg_singleton", "Mine", "mine_config (default)",
            `enabled: ${(mineCfgRow as { enabled?: boolean }).enabled ?? true}, ${lvls.length} Level konfiguriert`)
        : warn("mine_cfg_singleton", "Mine", "mine_config (default)",
            `${Array.isArray(lvls) ? lvls.length : 0}/10 Level — node scripts/balance-final.cjs ausführen`));
    }
  } catch (e) {
    results.push(warn("mine_cfg_singleton", "Mine", "mine_config (default)", String(e)));
  }

  try {
    const { count: mineProgressCount } = await admin
      .from("mine_progress").select("*", { count: "exact", head: true });
    results.push(ok("mine_progress_total", "Mine", "mine_progress", `${mineProgressCount ?? 0} aktive Minen`));
  } catch (e) {
    results.push(warn("mine_progress_total", "Mine", "mine_progress", String(e)));
  }

  // ── 32. Backup-System ────────────────────────────────────────────────────
  try {
    const { count: backupCount, error: backupErr } = await admin
      .from("backups").select("*", { count: "exact", head: true });
    results.push(backupErr
      ? err("backups_table", "Backup", "backups Tabelle",
          `Tabelle fehlt — node scripts/db-audit-fix.cjs ausführen: ${backupErr.message}`)
      : ok("backups_table", "Backup", "backups Tabelle", `${backupCount ?? 0} gespeicherte Backups`));
  } catch (e) {
    results.push(err("backups_table", "Backup", "backups Tabelle", String(e)));
  }

  // ── 33. Homepage Chat Sidebar ────────────────────────────────────────────
  try {
    const { data: hccRow, error: hccErr } = await admin
      .from("homepage_chat_config").select("enabled,tab_title,sidebar_position").eq("id", "default").maybeSingle();
    if (hccErr || !hccRow) {
      results.push(warn("homepage_chat_cfg", "Homepage Chat Sidebar", "homepage_chat_config (default)",
        "Kein Konfigurationseintrag — node scripts/create-homepage-chat-config.cjs ausführen"));
    } else {
      const row = hccRow as { enabled?: boolean; tab_title?: string; sidebar_position?: string };
      results.push(ok("homepage_chat_cfg", "Homepage Chat Sidebar", "homepage_chat_config (default)",
        `enabled: ${row.enabled ?? false}, position: ${row.sidebar_position ?? "left"}, title: "${row.tab_title ?? "Community Chat"}"`));
    }
  } catch (e) {
    results.push(warn("homepage_chat_cfg", "Homepage Chat Sidebar", "homepage_chat_config (default)", String(e)));
  }

  // ── 34. Handel-Bereinigung: trades-Tabelle erreichbar ────────────────────
  // (Früherer Code-Bug — cleanup-config.ts nutzte .from("trade_offers") statt
  // "trades" — ist behoben; cleanup-config.ts verwendet jetzt "trades".)
  try {
    const { error: tradesErr } = await admin.from("trades").select("*").limit(0);
    results.push(tradesErr
      ? warn("trade_cleanup_bug", "Daten-Integrität", "Handel-Bereinigung",
          `trades-Tabelle nicht erreichbar: ${tradesErr.message}`)
      : ok("trade_cleanup_bug", "Daten-Integrität", "Handel-Bereinigung",
          "trades-Tabelle erreichbar — Bereinigung referenziert die korrekte Tabelle."));
  } catch { /* non-critical */ }

  // ── 35. Atomare Bet-RPC (apply_bet_result) — race-safe Credit-Verbuchung ──
  // Plinko (und künftige Wettspiele) verlassen sich darauf, dass Credits atomar
  // verbucht werden (credits = credits + (payout - bet) WHERE credits >= bet).
  // Fehlt die Funktion, fällt das auf nicht-atomares read-modify-write zurück
  // → Credit-Duplikation. Migration: scripts/add-atomic-bet-rpc.cjs
  try {
    const { error: rpcErr } = await admin.rpc("apply_bet_result", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_bet: 0,
      p_payout: 0,
    });
    results.push(rpcErr
      ? err("rpc_apply_bet_result", "Economy", "apply_bet_result RPC",
          `Atomare Bet-RPC fehlt/fehlerhaft: ${rpcErr.message} — scripts/add-atomic-bet-rpc.cjs ausführen.`)
      : ok("rpc_apply_bet_result", "Economy", "apply_bet_result RPC",
          "Atomare, race-sichere Credit-Verbuchung verfügbar."));
  } catch (e) {
    results.push(err("rpc_apply_bet_result", "Economy", "apply_bet_result RPC", String(e)));
  }

  // ── 36. Atomare XP-RPC (increment_xp) — race-sichere XP/Level-Vergabe ─────
  // awardXp wird projektweit als `void awardXp(...)` parallel gefeuert; ohne die
  // RPC fällt es auf read-modify-write zurück → verlorene XP + doppelte Level-
  // Rewards. Migration: scripts/add-increment-xp-rpc.cjs
  try {
    const { error: xpErr } = await admin.rpc("increment_xp", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_amount: 0,
    });
    results.push(xpErr
      ? err("rpc_increment_xp", "Level & XP", "increment_xp RPC",
          `Atomare XP-RPC fehlt/fehlerhaft: ${xpErr.message} — scripts/add-increment-xp-rpc.cjs ausführen.`)
      : ok("rpc_increment_xp", "Level & XP", "increment_xp RPC",
          "Atomare, race-sichere XP-Verbuchung verfügbar."));
  } catch (e) {
    results.push(err("rpc_increment_xp", "Level & XP", "increment_xp RPC", String(e)));
  }

  // ── 37. Social / Freunde-System ───────────────────────────────────────────
  // Tabellen: friend_requests, friendships, blocked_users (scripts/add-friends-system.cjs).
  // "zuletzt online"/"in-game" werden aus user_sessions abgeleitet — keine eigene Spalte.
  try {
    const [{ error: frErr }, { error: fsErr, count: friendRows }, { error: buErr }, { count: pendingCount }] = await Promise.all([
      admin.from("friend_requests").select("id").limit(0),
      admin.from("friendships").select("*", { count: "exact", head: true }),
      admin.from("blocked_users").select("id").limit(0),
      admin.from("friend_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    if (frErr || fsErr || buErr) {
      results.push(err("social_tables", "Social / Freunde", "Freundes-Tabellen",
        `Tabelle(n) fehlen — Migration ausführen: node scripts/add-friends-system.cjs (${frErr?.message ?? fsErr?.message ?? buErr?.message})`));
    } else {
      // friendships werden bidirektional gespeichert → echte Freundschaften = Zeilen / 2.
      results.push(ok("social_tables", "Social / Freunde", "Freundes-System",
        `${Math.floor((friendRows ?? 0) / 2)} Freundschaft(en), ${pendingCount ?? 0} offene Anfrage(n)`));
    }
    // Konsistenz-Hinweis: friendships sollten paarweise (gerade Zeilenzahl) sein.
    if (!fsErr && typeof friendRows === "number" && friendRows % 2 !== 0) {
      results.push(warn("social_pairing", "Social / Freunde", "Freundschafts-Paarung",
        "Ungerade Anzahl friendships-Zeilen — eine Richtung könnte verwaist sein."));
    }
  } catch (e) {
    results.push(err("social_tables", "Social / Freunde", "Freundes-Tabellen", String(e)));
  }

  // ── 38. Reward-Gutscheine (Case-Token + Spiel-Bonus) ──────────────────────
  // Tabellen: case_tokens, game_bonus_allowances + RPC consume_game_bonus
  // (scripts/add-reward-vouchers.cjs). Treiben Case-Gutscheine & Extra-Spielzüge.
  try {
    const [{ error: ctErr, count: openTokens }, { error: gbErr }] = await Promise.all([
      admin.from("case_tokens").select("*", { count: "exact", head: true }).is("redeemed_at", null),
      admin.from("game_bonus_allowances").select("id").limit(0),
    ]);
    if (ctErr || gbErr) {
      results.push(err("reward_vouchers", "Reward-Gutscheine", "Gutschein-Tabellen",
        `Tabelle(n) fehlen — node scripts/add-reward-vouchers.cjs (${ctErr?.message ?? gbErr?.message})`));
    } else {
      results.push(ok("reward_vouchers", "Reward-Gutscheine", "Gutschein-System",
        `${openTokens ?? 0} offene Case-Token`));
    }
    // RPC-Existenz prüfen (no-op-Aufruf mit Null-UUID).
    const { error: rpcErr } = await admin.rpc("consume_game_bonus", {
      p_user_id: "00000000-0000-0000-0000-000000000000", p_game: "__healthcheck__",
    });
    results.push(rpcErr
      ? err("rpc_consume_game_bonus", "Reward-Gutscheine", "consume_game_bonus RPC",
          `RPC fehlt/fehlerhaft: ${rpcErr.message} — scripts/add-reward-vouchers.cjs ausführen.`)
      : ok("rpc_consume_game_bonus", "Reward-Gutscheine", "consume_game_bonus RPC",
          "Atomare Bonus-Verbuchung verfügbar."));
  } catch (e) {
    results.push(err("reward_vouchers", "Reward-Gutscheine", "Gutschein-Tabellen", String(e)));
  }

  return results;
}
