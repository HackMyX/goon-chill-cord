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
  | "tickets_closed"
  | "trade_offers_done"
  | "auctions_done";

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
  { label: string; description: string; defaultRetentionDays: number }
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
    label: "Admin Audit-Log",
    description: "Protokoll aller Admin-Aktionen",
    defaultRetentionDays: 365,
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
