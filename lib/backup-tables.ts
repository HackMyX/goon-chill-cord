/**
 * Config/catalog tables a backup can snapshot — parent tables first,
 * dependents last, so restoreBackup() can insert in this order without
 * foreign-key violations and delete in the reverse. Deliberately excludes
 * live player data (profiles, inventory, trades, auctions, tickets,
 * notifications, audit/debug logs).
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

export type BackupCategory = "config" | "content" | "shop";

export interface BackupTableInfo {
  name: BackupTableName;
  label: string;
  category: BackupCategory;
  description: string;
}

export const BACKUP_TABLE_INFO: BackupTableInfo[] = [
  // ── Konfiguration ──────────────────────────────────────────
  {
    name: "site_config",
    label: "Site-Konfiguration",
    category: "config",
    description: "Seitenname, Logo, Bezeichnungen und Startguthaben",
  },
  {
    name: "shop_settings",
    label: "Shop-Einstellungen",
    category: "config",
    description: "Globale Shop-Parameter und Rotationslogik",
  },
  {
    name: "streak_config",
    label: "Streak-Konfiguration",
    category: "config",
    description: "Daily-Reward-Einstellungen und Meilenstein-Boni",
  },
  {
    name: "kill_streak_config",
    label: "Kill-Streak-Config",
    category: "config",
    description: "Kill-Streak-Multiplikatoren und Schwellenwerte",
  },
  {
    name: "world_config",
    label: "Welt-Konfiguration",
    category: "config",
    description: "Spielwelt-Parameter, Spawn-Einstellungen und Grenzen",
  },
  {
    name: "character_config",
    label: "Charakter-Konfiguration",
    category: "config",
    description: "Standard-Charakter-Eigenschaften und Defaults",
  },
  // ── Inhalte ────────────────────────────────────────────────
  {
    name: "items",
    label: "Item-Katalog",
    category: "content",
    description: "Alle Items mit Stats, Seltenheit, Wert und Typ",
  },
  {
    name: "case_tiers",
    label: "Case-Tiers",
    category: "content",
    description: "Case-Stufen und Drop-Wahrscheinlichkeiten",
  },
  {
    name: "monster_types",
    label: "Monster-Typen",
    category: "content",
    description: "Monster-Definitionen für die Spielwelt",
  },
  {
    name: "pet_configs",
    label: "Pet-Konfigurationen",
    category: "content",
    description: "Haustier-Einstellungen, Boni und Verhalten",
  },
  // ── Shop ───────────────────────────────────────────────────
  {
    name: "shop_categories",
    label: "Shop-Kategorien",
    category: "shop",
    description: "Kategorien und deren Einstellungen",
  },
  {
    name: "shop_category_day_rules",
    label: "Tagesplan-Regeln",
    category: "shop",
    description: "Welche Kategorien an welchen Wochentagen aktiv sind",
  },
  {
    name: "shop_listings",
    label: "Shop-Angebote",
    category: "shop",
    description: "Aktuelle und geplante Angebote im Shop",
  },
];

export const BACKUP_CATEGORY_META: Record<
  BackupCategory,
  { label: string; color: "purple" | "amber" | "emerald" }
> = {
  config: { label: "Konfiguration", color: "purple" },
  content: { label: "Inhalte", color: "amber" },
  shop: { label: "Shop", color: "emerald" },
};
