/**
 * Auto-cleanup configuration for all history tables.
 * Each entry defines a retention policy for one data source.
 * Stored in the `cleanup_config` table (one row per source_key, admin-configurable).
 */

export type CleanupSourceKey =
  | "debug_logs"
  | "global_chat_messages"
  | "mod_actions"
  | "login_events"
  | "notifications"
  | "audit_logs"
  | "player_activity"
  | "tickets_closed"
  | "trade_offers_done"
  | "auctions_done";

/**
 * `audit_logs.action` values that represent SPIELER-Aktivität
 * (Gameplay / Wirtschaft / Sozial) — as opposed to Admin/Mod-Audit.
 *
 * Used to split the shared `audit_logs` table into two retention policies:
 *  - rows WHERE action IN (PLAYER_ACTIVITY_ACTIONS)      → source "player_activity" (24h)
 *  - rows WHERE action NOT IN (PLAYER_ACTIVITY_ACTIONS)  → source "audit_logs"      (Admin/Mod-Audit, 90d)
 *
 * Hinweis: enthält bewusst auch ein paar Vorwärts-kompatible Keys
 * (z.B. snake_game, plinko_play, voucher_received, friend_*), die heute
 * evtl. in eigene Tabellen schreiben — schadet nicht (kein Treffer = keine Wirkung),
 * verhindert aber, dass künftige Spieler-Aktionen versehentlich im Admin-Audit landen.
 */
export const PLAYER_ACTIVITY_ACTIONS = [
  // Cases
  "case_open",
  "case_batch_open",
  // Double or Nothing
  "double_or_nothing",
  "don_upgrade_purchase",
  // Snake
  "snake_earn",
  "snake_game",
  // Plinko (schreibt aktuell in plinko_plays — Vorwärts-Kompatibilität)
  "plinko_play",
  // Mine
  "mine_collect",
  "mine_upgrade",
  // Shop
  "shop_purchase",
  // Streak (Daily) + Kill-Streak (Farmwelt)
  "streak_claim",
  "streak_kill",
  "streak_commit",
  "streak_forfeit",
  // Level / XP-Belohnungen
  "level_reward_credits",
  // Auktionen
  "auction_sold",
  "auction_buyout",
  // Trades
  "trade_accepted",
  "trade_declined",
  "trade_cancelled",
  // PvP
  "pvp_hit_attempt",
  // Battle Pass (Spieler-Kauf / Tier-Claim)
  "battle_pass_purchase",
  "battle_pass_tier_claim",
  // Sozial (Vorwärts-Kompatibilität — heute eigene Tabellen)
  "friend_request",
  "friend_accepted",
  "user_blocked",
  // Gutscheine (Vorwärts-Kompatibilität)
  "voucher_received",
] as const;

export interface CleanupRule {
  /** Which table / data source this rule applies to */
  sourceKey: CleanupSourceKey;
  /** Human-readable name shown in the admin UI */
  label: string;
  /** Short description of what gets deleted */
  description: string;
  /** Whether automatic cleanup is enabled for this source */
  enabled: boolean;
  /** Delete rows older than this many days (0 = never run automatically) */
  retentionDays: number;
  /** Last time an auto-cleanup was executed, ISO string */
  lastRunAt: string | null;
  /** How many rows were deleted on the last run */
  lastRunDeleted: number | null;
}

export const CLEANUP_SOURCE_META: Record<
  CleanupSourceKey,
  { label: string; description: string; defaultRetentionDays: number; defaultEnabled?: boolean }
> = {
  debug_logs: {
    label: "Debug-Log",
    description: "Server- und Client-Fehler aus dem Admin-Debug-Tab",
    defaultRetentionDays: 30,
  },
  global_chat_messages: {
    label: "Global Chat-Verlauf",
    description: "Alle Chat-Nachrichten (inkl. System-Nachrichten)",
    defaultRetentionDays: 90,
  },
  mod_actions: {
    label: "Moderations-Aktionen",
    description: "Verwarnung, Bans, Notizen, Credits-Aktionen",
    defaultRetentionDays: 365,
  },
  login_events: {
    label: "Login-Ereignisse",
    description: "IP- und UA-Logins aus dem Sicherheits-Tab",
    defaultRetentionDays: 90,
  },
  notifications: {
    label: "Benachrichtigungen",
    description: "Gelesene Nutzer-Benachrichtigungen",
    defaultRetentionDays: 60,
  },
  audit_logs: {
    label: "Admin/Mod-Audit (audit_logs)",
    description: "Admin-/Mod-Änderungen — alles außer Spieler-Aktivität",
    defaultRetentionDays: 90,
  },
  player_activity: {
    label: "Spieler-Aktivität (audit_logs)",
    description: "Spiel-/Wirtschafts-/Sozial-Aktionen der Spieler",
    defaultRetentionDays: 1,
    defaultEnabled: true, // Standard: Spieler-Logs nach 24h automatisch löschen
  },
  tickets_closed: {
    label: "Geschlossene Tickets",
    description: "Support-Tickets mit Status 'closed'",
    defaultRetentionDays: 180,
  },
  trade_offers_done: {
    label: "Trade-Verlauf",
    description: "Abgeschlossene oder abgelehnte Trade-Angebote",
    defaultRetentionDays: 90,
  },
  auctions_done: {
    label: "Auktions-Verlauf",
    description: "Beendete oder abgelaufene Auktionen",
    defaultRetentionDays: 90,
  },
};

export const ALL_CLEANUP_KEYS = Object.keys(CLEANUP_SOURCE_META) as CleanupSourceKey[];

export const DEFAULT_CLEANUP_RULES: CleanupRule[] = ALL_CLEANUP_KEYS.map((key) => ({
  sourceKey: key,
  ...CLEANUP_SOURCE_META[key],
  enabled: false,
  retentionDays: CLEANUP_SOURCE_META[key].defaultRetentionDays,
  lastRunAt: null,
  lastRunDeleted: null,
}));
