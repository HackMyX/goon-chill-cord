/**
 * The fixed list of config/catalog tables a backup snapshots — parent
 * tables first, dependents last, since restoreBackup() inserts in this
 * order (and deletes in the reverse of it) to never violate a foreign key
 * mid-restore. Deliberately excludes live player data (profiles,
 * inventory, trades, auctions, tickets, notifications, audit/debug logs)
 * — restoring those would wipe every player's progress, which is not what
 * "back up the site" should casually mean. `shop_categories` and
 * `shop_category_day_rules` are listed even before they necessarily exist
 * in the DB — lib/actions/backup.ts skips any table that errors on
 * select/delete, so this list can be the eventual full set without
 * breaking today.
 */
export const BACKUP_TABLES = [
  "items",
  "shop_categories",
  "case_tiers",
  "monster_types",
  "pet_configs",
  "site_config",
  "shop_settings",
  "streak_config",
  "kill_streak_config",
  "world_config",
  "character_config",
  "shop_category_day_rules",
  "shop_listings",
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];
