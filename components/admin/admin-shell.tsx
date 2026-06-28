"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ScrollText, Coins, Users, Package, Flame, Store, Skull, PawPrint, Gamepad2, Palette, MessageCircle, MessageSquare, Bug, Database, ShieldAlert, Shield, Search, FileText, BarChart3, Sparkles, Trash2, Crown, Wand2, SlidersHorizontal, TrendingUp, Volume2, Eye, Settings2, Music, ListChecks, SwatchBook, Gift, Link2 } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { CasesAdminTab } from "@/components/admin/case-group-editor";
import { UserRowEditor } from "@/components/admin/user-row-editor";
import { ItemsTab } from "@/components/admin/items-tab";
import { AuditTimeline } from "@/components/admin/audit-timeline";
import { StreakConfigEditor } from "@/components/admin/streak-config-editor";
import { ShopTab } from "@/components/admin/shop-tab";
import { MonsterTypeEditor } from "@/components/admin/monster-type-editor";
import { PetConfigEditor } from "@/components/admin/pet-config-editor";
import { KillStreakConfigEditor } from "@/components/admin/kill-streak-config-editor";
import { GamesTab } from "@/components/admin/games-tab";
import { SiteConfigEditor } from "@/components/admin/site-config-editor";
import { DebugLogTab } from "@/components/admin/debug-log-tab";
import { BackupTab } from "@/components/admin/backup-tab";
import { SecurityTab } from "@/components/admin/security-tab";
import { ChatConfigEditor } from "@/components/admin/chat-config-editor";
import { PatchNotesEditor } from "@/components/admin/patchnotes-editor";
import { SurveysTab } from "@/components/admin/surveys-tab";
import { AdminAiChat } from "@/components/admin/admin-ai-chat";
import { BattlePassTab } from "@/components/admin/battle-pass-tab";
import { AiConfigEditor } from "@/components/admin/ai-config-editor";
import { CleanupConfigEditor } from "@/components/admin/cleanup-config-editor";
import { BadgesTab } from "@/components/admin/badges-tab";
import { NameStylesTab } from "@/components/admin/name-styles-tab";
import { BalanceStudioTab } from "@/components/admin/balance-studio-tab";
import { LevelConfigEditor } from "@/components/admin/level-config-editor";
import { GivablesTab } from "@/components/admin/givables-tab";
import { BalanceCockpit } from "@/components/admin/balance-cockpit";
import { EconomySynergyEditor } from "@/components/admin/economy-synergy-editor";
import { SoundConfigEditor } from "@/components/admin/sound-config-editor";
import { MusicConfigEditor } from "@/components/admin/music-config-editor";
import { ThemeConfigEditor } from "@/components/admin/theme-config-editor";
import { PreviewConfigTab } from "@/components/admin/preview-config-tab";
import { DailyQuestsTab } from "@/components/admin/daily-quests-tab";
import HomepageChatConfigEditor from "@/components/admin/homepage-chat-config-editor";
import { FineConfigEditor } from "@/components/admin/fine-config-editor";
import { AdminGuide } from "@/components/admin/admin-guide";
import { TAB_GUIDES, guideSearchText } from "@/lib/admin-guides";
import type { FineConfig } from "@/lib/fine-config-types";
import type { CleanupRule } from "@/lib/cleanup-config";
import type { PatchNote } from "@/lib/patchnotes";
import type { DonConfig } from "@/lib/don-config";
import type { BattlePass } from "@/lib/battle-pass";
import type { PlinkoConfig } from "@/lib/actions/plinko";
import type { SnakeConfig } from "@/lib/snake-config";
import type { MineConfig } from "@/lib/mine-config";
import type { ModPermissions, ChatConfig } from "@/lib/mod";
import { useSoundManager } from "@/lib/sound-manager";
import type { Rarity } from "@/lib/cases";
import type { StreakConfig } from "@/lib/streak";
import type { ShopSettings } from "@/lib/shop";
import type { AdminShopListing } from "@/lib/actions/shop";
import type { MonsterTypeConfig } from "@/lib/monsters";
import type { PetTypeConfig } from "@/lib/pets";
import type { KillStreakConfig } from "@/lib/kill-streak";
import type { WorldSessionConfig } from "@/lib/world-session-config";
import type { CharacterConfig } from "@/lib/character-config";
import type { WorldSpawnConfig } from "@/lib/world-spawn-config";
import type { SiteConfig } from "@/lib/site-config";
import type { XpConfig } from "@/lib/level-system";
import type { SoundConfig } from "@/lib/sound-config";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";
import { createClient } from "@/lib/supabase/client";

export interface AuditLogEntry {
  id: string;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  profiles: { username: string } | null;
}

export interface CaseTierRow {
  id: string;
  group_id: string;
  label: string;
  price: number;
  rarity_weights: Partial<Record<Rarity, number>>;
  enabled: boolean;
  item_types: string[] | null;
  item_ids: string[] | null;
  group_label: string | null;
  group_subtitle: string | null;
  preview_cost: number | null;
  multi_open_max: number | null;
  sort_order: number | null;
  per_rarity_item_ids: Partial<Record<Rarity, string[] | null>> | null;
  name_styles_eligible: boolean | null;
  tier_sublabel: string | null;
  extra_drops: unknown;
  updated_at: string;
}

export interface CaseGroupRow {
  id: string;
  title: string;
  subtitle: string | null;
  icon_name: string;
  item_types: string[];
  display_order: number;
  enabled: boolean;
  accent_color: string | null;
  is_custom: boolean;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  username: string;
  credits: number;
  role: string;
  cases_opened: number;
  support_banned?: boolean;
  verified?: boolean;
  warning_strikes?: number;
  warning_note?: string;
}

export interface ItemRow {
  id: string;
  name: string;
  rarity: Rarity;
  type: string;
  price_cr: number;
  damage: number | null;
  armor: number;
  perk_type: "none" | "speed_boost" | "jump_boost" | "hp_regen_boost";
  perk_magnitude: number;
  shield_hp: number;
  shield_regen_cooldown_sec: number;
}

interface AdminShellProps {
  credits: number;
  streakDays: number;
  auditLog: AuditLogEntry[];
  caseGroups: CaseGroupRow[];
  caseTiers: CaseTierRow[];
  profiles: ProfileRow[];
  items: ItemRow[];
  streakConfig: StreakConfig;
  shopSettings: ShopSettings;
  todayShopListings: AdminShopListing[];
  tomorrowShopListings: AdminShopListing[];
  monsterTypes: MonsterTypeConfig[];
  petTypes: PetTypeConfig[];
  killStreakConfig: KillStreakConfig;
  worldSessionConfig: WorldSessionConfig;
  characterConfig: CharacterConfig;
  worldSpawnConfig: WorldSpawnConfig;
  siteConfig: SiteConfig;
  modPermissions: ModPermissions;
  chatConfig: ChatConfig;
  patchNotes: PatchNote[];
  donConfig: DonConfig;
  snakeConfig: SnakeConfig;
  mineConfig: MineConfig;
  cleanupRules: CleanupRule[];
  battlePasses: BattlePass[];
  battlePassMigrationNeeded?: boolean;
  plinkoConfig: PlinkoConfig;
  xpConfig: XpConfig;
  soundConfig: SoundConfig;
  fineConfig: FineConfig;
}

type Tab = "balance" | "economy" | "streak" | "shop" | "users" | "items" | "monsters" | "pets" | "games" | "branding" | "audit" | "chat" | "homepage_chat" | "debug" | "backup" | "security" | "patchnotes" | "surveys" | "ki" | "cleanup" | "battlepass" | "badges" | "namestyles" | "level_xp" | "givables" | "sounds" | "music" | "theme" | "preview_config" | "fine_config" | "daily_quests" | "synergy";

const SEARCH_INDEX: { label: string; tab: Tab; keywords: string[]; description: string; anchor?: string }[] = [
  { label: "Täglicher Bonus", tab: "streak", keywords: ["streak", "daily", "reward", "login", "bonus", "tage", "ablauf"], description: "Streak-Belohnungen, Meilensteine, Wochenenbonus" },
  { label: "Case-Preise & Gruppen", tab: "economy", keywords: ["cases", "preis", "gruppe", "rarity", "items", "öffnen"], description: "Case-Konfiguration und Preise" },
  { label: "Shop MOTD", tab: "shop", keywords: ["shop", "motd", "banner", "listing", "verkauf"], description: "Shop-Artikel und Tages-Rotation" },
  { label: "Monster-Konfiguration", tab: "monsters", keywords: ["monster", "zombie", "hp", "schaden", "spawn", "belohnung"], description: "Monster-HP, Schaden, Belohnungen" },
  { label: "Kill-Streak", tab: "monsters", keywords: ["killstreak", "streak", "kills", "multiplikator", "welt"], description: "Kill-Streak Multiplikator und Cap" },
  { label: "Startseiten-Bestenlisten", tab: "games", keywords: ["bestenliste", "bestenlisten", "leaderboard", "startseite", "homepage", "profilbild", "profilbilder", "avatar", "top 3", "top3", "spielelisten", "rangliste", "platzierung"], description: "Spielelisten auf der Startseite: Reihenfolge, Limit, Profilbilder (nur Top 3 oder alle Plätze)" },
  { label: "Snake Speed & Credits", tab: "games", keywords: ["snake", "geschwindigkeit", "credits", "mode", "apfel"], description: "Snake-Spielmodi und Credit-Limits" },
  { label: "Plinko Einsatz & Limits", tab: "games", keywords: ["plinko", "einsatz", "kugel", "risk", "multiplier", "limit"], description: "Plinko-Konfiguration und Multiplikatoren" },
  { label: "Mine Levels", tab: "games", keywords: ["mine", "level", "upgrade", "abbau", "lager"], description: "Mine-Konfiguration und Level-Kosten" },
  { label: "DON Konfiguration", tab: "games", keywords: ["don", "double", "nothing", "münze", "limit", "flip"], description: "Double or Nothing Flip-Limits" },
  { label: "Welt-Session", tab: "games", keywords: ["welt", "pvp", "respawn", "session", "farnwelt"], description: "PvP, Spawn, World-Session" },
  { label: "Charakter-Werte", tab: "games", keywords: ["charakter", "speed", "jump", "angriff", "rüstung", "hp"], description: "Charakter-Werte und Combat" },
  { label: "Battle Pass", tab: "battlepass", keywords: ["battlepass", "bp", "tier", "premium", "elite", "quest", "xp"], description: "Battle Pass Tiers und Quests" },
  { label: "Daily Quests", tab: "daily_quests", keywords: ["daily", "quest", "tagesquest", "aufgabe", "belohnung", "fortschritt"], description: "Tägliche Quests für alle Spieler" },
  { label: "Synergie & Boosts", tab: "synergy", keywords: ["synergie", "boost", "multiplikator", "level", "skalierung", "battle pass", "querfluss", "wochenende", "happy hour", "event", "xp", "credits", "verbindung"], description: "Level/BP/Quests verbinden, Zeit-Boosts, Level-Staffelung" },
  { label: "Level & XP Quellen", tab: "level_xp", keywords: ["level", "xp", "erfahrung", "aufstieg", "quellen"], description: "XP-Quellen und Level-Definitionen" },
  { label: "Fähigkeiten", tab: "givables", keywords: ["fähigkeit", "ability", "mine", "speed", "boost", "rüstung"], description: "Fähigkeiten-Definitionen und Grants" },
  { label: "Gutscheine", tab: "givables", keywords: ["gutschein", "voucher", "code", "redeem", "einlösen", "geschenk"], description: "Einlösbare Codes erstellen und verwalten" },
  { label: "Sound-Einstellungen", tab: "sounds", keywords: ["sound", "ton", "lautstärke", "audio"], description: "Sound-Events und Lautstärken" },
  { label: "Hintergrundmusik", tab: "music", keywords: ["musik", "music", "bgm", "hintergrund", "track", "loop", "arcade", "chill", "adventure", "fade", "lautstärke"], description: "BGM pro Seite zuweisen, Track-Bibliothek verwalten" },
  { label: "Theming / Designs", tab: "theme", keywords: ["theme", "design", "farbe", "color", "palette", "skin", "darkmode", "neon", "cyber", "matrix", "vaporwave", "look", "stil", "akzentfarbe"], description: "Seitenweites Gesamt-Design wählen (Farben, Glow), Live-Vorschau" },
  { label: "Preview-Engine", tab: "preview_config", keywords: ["preview", "vorschau", "3d", "rotation", "zoom", "partikel", "glow", "badge", "item", "namestyle"], description: "Vorschau-Engine Konfiguration für Items, Badges, Name-Styles" },
  { label: "Name-Styles", tab: "namestyles", keywords: ["namestyle", "name", "animation", "shimmer", "rainbow", "glitch"], description: "Name-Stil Katalog und Shop" },
  { label: "Badges & Sondertags", tab: "badges", keywords: ["badge", "tag", "sondertag", "vergabe", "farbe"], description: "Badge-Definitionen und Vergaben" },
  { label: "Chat-Einstellungen", tab: "chat", keywords: ["chat", "nachrichten", "filter", "rate", "limit", "global"], description: "Chat-Konfiguration und Moderation" },
  { label: "Homepage Chat Sidebar", tab: "homepage_chat", keywords: ["homepage", "sidebar", "chat", "startseite", "glassmorphism", "offen"], description: "Chat-Sidebar auf der Startseite konfigurieren" },
  { label: "Startseite Konfiguration", tab: "branding", keywords: ["branding", "logo", "startseite", "homepage", "karten", "topbar"], description: "Site-Konfiguration und Homepage-Design" },
  { label: "Patchnotes", tab: "patchnotes", keywords: ["patch", "notes", "update", "popup", "changelog"], description: "Patchnotes und Update-Popups" },
  { label: "Umfragen", tab: "surveys", keywords: ["umfrage", "survey", "frage", "antwort", "abstimmung"], description: "Umfragen erstellen und auswerten" },
  { label: "Nutzer-Verwaltung", tab: "users", keywords: ["user", "nutzer", "profil", "credits", "rolle", "ban"], description: "Nutzer bearbeiten, Credits, Rollen" },
  { label: "Sicherheit", tab: "security", keywords: ["sicherheit", "login", "ip", "duplicate", "ban"], description: "Login-Logs und IP-Duplikate" },
  { label: "Backup", tab: "backup", keywords: ["backup", "export", "sicherung", "daten"], description: "Backups erstellen und verwalten" },
  { label: "Audit-Log", tab: "audit", keywords: ["audit", "log", "verlauf", "aktionen", "history"], description: "Alle Admin-Aktionen im Verlauf" },
  { label: "KI-Assistent", tab: "ki", keywords: ["ki", "ai", "assistent", "gpt", "groq", "chat", "admin"], description: "KI-Assistent und API-Schlüssel" },
  { label: "Verlaufs-Bereinigung", tab: "cleanup", keywords: ["cleanup", "bereinigung", "löschen", "retention", "logs", "chat"], description: "Automatische Bereinigung alter Daten" },
  { label: "Items", tab: "items", keywords: ["item", "waffe", "rüstung", "schild", "perk", "preis", "selten"], description: "Item-Katalog und Preise" },
  { label: "Pets", tab: "pets", keywords: ["pet", "tier", "haustier", "hund", "katze", "drache"], description: "Pet-Spezies und Stats" },
  { label: "Feintuning", tab: "fine_config", keywords: ["feintuning", "fine", "nametag", "lerp", "sync", "blut", "partikel", "chat", "polling", "badges", "limit", "höhe", "geschwindigkeit", "multiplayer", "dead reckoning", "swing"], description: "Alle feingranularen konfigurierbaren Werte: Nametag, MP-Sync, Hit-Effekte, Chat" },
  { label: "Shop-Automatik & Kategorien", tab: "shop", keywords: ["automatik", "kategorie", "content", "inhalt", "typ", "fähigkeit", "name-style", "badge", "gutschein", "häufigkeit", "anzahl", "seltenheit", "tagesplan", "wochentag", "preisaufschlag", "rotation", "auto-generieren"], description: "Pro Kategorie: welcher Typ (Item/Fähigkeit/Style/Badge/Gutschein), Anzahl/Tag, Seltenheit, Preis, Wochentag-Regeln" },
  { label: "Gutscheine im Shop (Gratis-Cases)", tab: "shop", keywords: ["gutschein", "voucher", "gratis case", "case", "shop", "kategorie", "seltenheit"], description: "Gutschein-Kategorie generiert automatisch Gratis-Case-Gutscheine nach Seltenheit" },
  { label: "Fähigkeiten-Effekte & Kombo", tab: "givables", keywords: ["effekt", "effecttype", "effectconfig", "kombo", "case_luck", "glück", "jackpot", "multiplikator", "loss", "rückgabe", "plinko", "snake", "don", "mine", "streak", "boost", "wert", "einheit", "prozent", "chance"], description: "Effekt-Typen (gruppiert + beschrieben), Wert/Einheit, Kombo-Effekte (effectConfig), Shop-Preis" },
  { label: "Fähigkeit im Shop verkaufen", tab: "shop", keywords: ["fähigkeit", "ability", "shop", "verkaufen", "preis", "kategorie", "kaufen"], description: "Fähigkeiten über eine Shop-Kategorie (Inhalt=Fähigkeiten) automatisch verkaufen" },
  { label: "Prestige", tab: "level_xp", keywords: ["prestige", "reset", "neustart", "stern", "xp boost", "max level"], description: "Prestige-System: Reset ab Max-Level für permanenten XP-Boost" },
  { label: "Economy-Generator (Battle Pass)", tab: "battlepass", keywords: ["auto-fill", "generator", "economy", "rarity", "track", "meilenstein", "automatisch"], description: "Battle-Pass-Levels track-gerecht automatisch befüllen" },
];

// ⚠️ KONVENTION FÜR ALLE KIs / ENTWICKLER: Die Admin-Tabs werden IMMER automatisch
// alphabetisch (de) sortiert — siehe `.sort(...)` am Ende dieses Arrays. Neue Tabs
// einfach IRGENDWO in dieses Array einfügen; sie ordnen sich von selbst korrekt ein.
// Führende Emojis/Symbole im Label werden beim Sortieren ignoriert (z. B. „⚡ Balance
// Studio" einsortiert unter „B"). NICHT manuell umsortieren — die Sortierung erledigt das.
const tabSortKey = (label: string) => label.replace(/^[^\p{L}\p{N}]+/u, "").trim();

const TABS = ([
  { id: "audit",          label: "Audit-Log",           icon: ScrollText },
  { id: "backup",         label: "Backup",               icon: Database },
  { id: "badges",         label: "Badges",               icon: Crown },
  { id: "balance",        label: "⚡ Balance Studio",    icon: SlidersHorizontal },
  { id: "battlepass",     label: "Battle Pass",          icon: Sparkles },
  { id: "branding",       label: "Branding",             icon: Palette },
  { id: "chat",           label: "Chat",                 icon: MessageCircle },
  { id: "streak",         label: "Daily-Streak",         icon: Flame },
  { id: "debug",          label: "Debug Log",            icon: Bug },
  { id: "economy",        label: "Economy & Cases",      icon: Coins },
  { id: "givables",       label: "Givables",             icon: Gift },
  { id: "fine_config",    label: "Feintuning",           icon: Settings2 },
  { id: "games",          label: "Games",                icon: Gamepad2 },
  { id: "items",          label: "Items",                icon: Package },
  { id: "ki",             label: "KI-Assistent",         icon: Sparkles },
  { id: "level_xp",       label: "Level & XP",           icon: TrendingUp },
  { id: "monsters",       label: "Monster",              icon: Skull },
  { id: "namestyles",     label: "Name-Styles",          icon: Wand2 },
  { id: "patchnotes",     label: "Patch Notes",          icon: FileText },
  { id: "pets",           label: "Pets",                 icon: PawPrint },
  { id: "preview_config", label: "Preview-Engine",       icon: Eye },
  { id: "shop",           label: "Shop",                 icon: Store },
  { id: "security",       label: "Sicherheit",           icon: ShieldAlert },
  { id: "sounds",         label: "Sound Manager",        icon: Volume2 },
  { id: "music",          label: "Hintergrundmusik",     icon: Music },
  { id: "theme",          label: "Theming / Designs",    icon: SwatchBook },
  { id: "homepage_chat",  label: "Startseite Chat",      icon: MessageSquare },
  { id: "surveys",        label: "Umfragen",             icon: BarChart3 },
  { id: "users",          label: "User-Management",      icon: Users },
  { id: "cleanup",        label: "Verlaufs-Bereinigung", icon: Trash2 },
  { id: "daily_quests",  label: "Daily Quests",          icon: ListChecks },
  { id: "synergy",       label: "Synergie & Boosts",     icon: Link2 },
] as { id: Tab; label: string; icon: typeof Coins }[]).sort((a, b) => tabSortKey(a.label).localeCompare(tabSortKey(b.label), "de"));

const tabById = (id: Tab) => TABS.find((t) => t.id === id)!;

// Kurzbeschreibung pro Tab — als Tooltip am Button + in den Such-Ergebnissen.
const TAB_DESC: Record<Tab, string> = {
  balance: "Schnelles Balancing aller Spiele in einer Tabelle (Credits, Limits, Multiplikatoren).",
  economy: "Cases: Gruppen, Tiers, Seltenheits-Töpfe, Item-Pools, Extra-Drops.",
  streak: "Tägliche Login-Belohnung, Meilensteine, Wochenend-/Event-Bonus, Gnadenzeit.",
  shop: "Tages-Shop: Automatik (Items/Fähigkeiten/Styles/Badges/Gutscheine), Kategorien, Tagesplan, Preise.",
  users: "Nutzer suchen & bearbeiten: Credits, Rolle, Verifizierung, Bans.",
  items: "Item-Katalog: Werte (Schaden/Rüstung/Perks/Schild), Seltenheit, Preise.",
  monsters: "Monster-Werte (HP, Schaden, Tempo, Spawn, Belohnung) + Kill-Streak-Multiplikator.",
  pets: "Pet-Spezies, Stats und Aggro-Verhalten.",
  games: "Alle Spiele einzeln: Snake, Plinko, DON, Mine, Welt/PvP, Charakter, Startseiten-Bestenlisten.",
  branding: "Seitenname, Logo, Topbar-Slots, Startseiten-Karten, Ankündigungen.",
  audit: "Verlauf aller Admin-Aktionen (live).",
  chat: "Globaler Chat: Filter, Rate-Limits, Moderation, Prio-Badges.",
  homepage_chat: "Chat-Sidebar auf der Startseite (Sichtbarkeit, Glas-Effekt).",
  debug: "Server-Debug-Logs für Fehlersuche.",
  backup: "Daten-Backups erstellen, ansehen, wiederherstellen.",
  security: "Login-Events, Fingerprints, IP-Duplikate, Device-Bans.",
  patchnotes: "Patch Notes schreiben + Update-Popup steuern.",
  surveys: "Umfragen erstellen, Fragen, Antworten auswerten.",
  ki: "KI-Assistent + API-Schlüssel (Groq).",
  cleanup: "Automatische Bereinigung alter Logs/Chats/Daten (Retention).",
  battlepass: "Battle Pass: Tracks, Tiers, Reward-Mix, Economy-Generator, Quests, Shop-Sichtbarkeit.",
  badges: "Badge-Definitionen + Vergabe (auto & manuell).",
  namestyles: "Name-Style-Katalog, Animationen, Shop-Verfügbarkeit, Case-Drops.",
  level_xp: "Level-Kurve, XP-Quellen pro Aktion, Level-Belohnungen, Prestige.",
  givables: "Vergebbare Inhalte in EINEM Menü: Fähigkeiten (Effekt-Typen, Kombo, Vergabe) + Gutschein-Codes (Bündel, Bulk, Direkt-Vergabe).",
  sounds: "Sound-Events und Lautstärken.",
  music: "Hintergrundmusik pro Seite, Track-Bibliothek, Fades.",
  theme: "Gesamt-Design der Seite (Farben, Glow, Presets) mit Live-Vorschau.",
  preview_config: "3D-Vorschau-Engine: Rotation, Zoom, Partikel, Glow pro Subjekt.",
  fine_config: "Feingranulare Werte: Nametags, Multiplayer-Sync, Hit-Effekte, Chat-Polling.",
  daily_quests: "Tägliche Quests: Vorlagen, Ziele, Belohnungen, Schwierigkeit.",
  synergy: "Verbindet Level/BP/Quests, Zeit-Boosts (Wochenende/Happy Hour), Level-Staffelung.",
};

// Logische Gruppierung der Tabs für eine aufgeräumte Übersicht.
// NEUE TABS: in TABS oben einfügen UND hier in eine Gruppe aufnehmen (+ TAB_DESC).
const TAB_GROUPS: { title: string; icon: typeof Coins; tabs: Tab[] }[] = [
  { title: "Spiele & Welt", icon: Gamepad2, tabs: ["games", "monsters", "pets", "balance"] },
  { title: "Wirtschaft", icon: Coins, tabs: ["economy", "shop", "items"] },
  { title: "Belohnungen & Fortschritt", icon: Sparkles, tabs: ["battlepass", "daily_quests", "streak", "level_xp", "synergy", "givables"] },
  { title: "Kosmetik", icon: SwatchBook, tabs: ["badges", "namestyles", "preview_config"] },
  { title: "Community & Inhalte", icon: MessageCircle, tabs: ["chat", "homepage_chat", "surveys", "patchnotes", "users"] },
  { title: "Design & Medien", icon: Palette, tabs: ["branding", "theme", "sounds", "music"] },
  { title: "System & Wartung", icon: Shield, tabs: ["security", "ki", "audit", "debug", "backup", "cleanup", "fine_config"] },
];

// Kombinierter Such-Index: die kuratierten Einträge (spezifische Einstellungen)
// PLUS ein Basis-Eintrag pro Tab (Label + Beschreibung), damit JEDER Tab auch über
// seine Beschreibung/Wörter gefunden wird — nicht nur über die kuratierten Keywords.
const ADMIN_SEARCH: { label: string; tab: Tab; keywords: string[]; description: string; anchor?: string }[] = [
  ...SEARCH_INDEX,
  // Pro Tab ein Basis-Eintrag — die keywords enthalten den KOMPLETTEN Guide-Text,
  // sodass die Suche jedes Wort aus jeder Guide-Zeile findet.
  ...TABS.map((t) => {
    // Givables vereint die früheren Tabs abilities + vouchers — deren Guide-Text
    // wird unter dem givables-Tab durchsuchbar gemacht.
    const guideIds = t.id === "givables" ? ["abilities", "vouchers"] : [t.id];
    const txt = guideIds.map((id) => { const g = TAB_GUIDES[id]; return g ? guideSearchText(g) : ""; }).join(" ");
    return { label: t.label, tab: t.id, keywords: [t.id, txt], description: TAB_DESC[t.id] };
  }),
];

export function AdminShell({
  credits: initialCredits,
  streakDays,
  auditLog: initialAuditLog,
  caseGroups,
  caseTiers,
  profiles: initialProfiles,
  items: initialItems,
  streakConfig,
  shopSettings,
  todayShopListings,
  tomorrowShopListings,
  monsterTypes,
  petTypes,
  killStreakConfig,
  worldSessionConfig,
  characterConfig,
  worldSpawnConfig,
  siteConfig,
  modPermissions: _modPermissions,
  chatConfig,
  patchNotes,
  donConfig,
  snakeConfig,
  mineConfig,
  cleanupRules,
  battlePasses,
  battlePassMigrationNeeded = false,
  plinkoConfig,
  xpConfig,
  soundConfig,
  fineConfig,
}: AdminShellProps) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const qTab = searchParams.get("tab");
    return (qTab && TABS.some((t) => t.id === qTab) ? qTab : "economy") as Tab;
  });
  const [items, setItems] = useState(initialItems);
  const [credits, setCredits] = useState(initialCredits);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [auditLog, setAuditLog] = useState(initialAuditLog);
  const [userSearch, setUserSearch] = useState("");
  const [adminSearch, setAdminSearch] = useState("");
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setCredits(row.credits);
  });

  // Live-update user list: reflect credit/role/ban changes by any admin or
  // server action without requiring a page reload.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-profiles-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const row = payload.new as ProfileRow;
          setProfiles((prev) =>
            prev.map((p) => (p.id === row.id ? { ...p, ...row } : p))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profiles" },
        (payload) => {
          const row = payload.new as ProfileRow;
          setProfiles((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            // Prepend new registrations — they have no cases opened yet so
            // they'd fall to the bottom of a credits sort anyway.
            return [row, ...prev];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Live-update audit log: new entries appear instantly without page reload.
  // NOTE: audit_logs Realtime must be enabled in Supabase → Table Editor →
  // audit_logs → Realtime toggle (same way profiles table is enabled).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-audit-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        (payload) => {
          const row = payload.new as {
            id: string;
            user_id: string;
            action: string;
            payload: Record<string, unknown> | null;
            created_at: string;
          };
          // Resolve the actor username from the profiles list in memory — avoids
          // a separate fetch while still showing the correct name in most cases.
          const actorName = profilesRef.current.find((p) => p.id === row.user_id)?.username ?? null;
          const entry: AuditLogEntry = {
            id: row.id,
            action: row.action,
            payload: row.payload,
            created_at: row.created_at,
            profiles: actorName ? { username: actorName } : null,
          };
          setAuditLog((prev) => [entry, ...prev].slice(0, 100));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const sound = useSoundManager();

  // Exakt-Sprung zu einer Item-Zeile (virtualisierte Liste): ItemsTab scrollt
  // selbst zum Item; n steigt bei jedem Sprung, damit auch derselbe Eintrag erneut greift.
  const [itemFocus, setItemFocus] = useState<{ id: string; n: number } | null>(null);

  // Wechselt zum Tab und scrollt zu einem Anker (#anchor) — Fallback: Tab-Anfang.
  // Wird vom Such-Sprung UND vom Balance-Cockpit ("Bearbeiten") genutzt.
  const goToTab = (tabId: string, anchor?: string) => {
    setTab(tabId as Tab);
    setAdminSearch("");
    if (tabId === "items" && anchor?.startsWith("item-row-")) {
      setItemFocus((prev) => ({ id: anchor.slice("item-row-".length), n: (prev?.n ?? 0) + 1 }));
    }
    setTimeout(() => {
      const el = (anchor ? document.getElementById(anchor) : null) ?? document.getElementById("admin-tab-top");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 90);
  };

  const filteredProfiles =
    userSearch.trim().length > 0
      ? profiles.filter(
          (p) =>
            p.username.toLowerCase().includes(userSearch.toLowerCase()) ||
            p.id.toLowerCase().startsWith(userSearch.toLowerCase())
        )
      : profiles;

  const activeSearchQuery = adminSearch.trim().toLowerCase();
  // Tokenize the query so "plinko bonus" matches an entry mentioning both words
  // anywhere (label/description/keywords) — not only an exact substring.
  const queryTokens = activeSearchQuery.split(/\s+/).filter(Boolean);
  const filteredSearch = activeSearchQuery
    ? (() => {
        const seen = new Set<string>();
        return ADMIN_SEARCH.filter((entry) => {
          const hay = `${entry.label} ${entry.description} ${entry.keywords.join(" ")}`.toLowerCase();
          if (!queryTokens.every((tok) => hay.includes(tok))) return false;
          const key = `${entry.label}|${entry.tab}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      })()
    : [];
  const matchingTabIds = new Set(filteredSearch.map((r) => r.tab));
  const displayedTabs = activeSearchQuery
    ? TABS.filter((t) => matchingTabIds.has(t.id))
    : TABS;

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} isAdmin={true} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-4 flex items-center gap-4">
          <Link
            href="/"
            onMouseEnter={sound.hover}
            onClick={sound.click}
            className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Link>
          <Link
            href="/mod"
            onMouseEnter={sound.hover}
            onClick={sound.click}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-500/15 px-4 py-1.5 text-sm font-bold text-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.15)] transition-all hover:border-sky-400/70 hover:bg-sky-500/25 hover:shadow-[0_0_18px_rgba(14,165,233,0.3)] hover:text-sky-200"
          >
            <Shield className="h-4 w-4" />
            Mod-Panel — Verwarnungen, Bans &amp; mehr
          </Link>
        </div>
        <h1 className="glow-text mb-6 text-2xl font-extrabold text-zinc-50">Admin-Panel</h1>

        {/* ── Global Admin Search ─────────────────────────────── */}
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Admin suchen… (z.B. 'Sound', 'Credits', 'Ban'…)"
            value={adminSearch}
            onChange={(e) => setAdminSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-9 pr-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-purple-400/60"
          />
          {adminSearch.trim() && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-2xl">
              {filteredSearch.length === 0 ? (
                <p className="px-4 py-3 text-sm text-zinc-500">Kein Ergebnis für „{adminSearch}"</p>
              ) : (
                filteredSearch.slice(0, 8).map((result, i) => (
                  <button
                    key={i}
                    onClick={() => { sound.click(); goToTab(result.tab, result.anchor); }}
                    onMouseEnter={sound.hover}
                    className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-white/5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-100">{result.label}</span>
                      <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-300">{tabById(result.tab).label.replace(/^[^\p{L}\p{N}]+/u, "").trim()}</span>
                    </div>
                    <span className="text-xs text-zinc-500">{result.description}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {(() => {
          const TabBtn = (t: { id: Tab; label: string; icon: typeof Coins }) => (
            <button
              key={t.id}
              title={TAB_DESC[t.id]}
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); setTab(t.id); }}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? "border-purple-400 bg-purple-500/15 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.45)]"
                  : "border-white/10 text-zinc-400 hover:border-white/30"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          );
          // Während der Suche: flache Liste der Treffer. Sonst: logische Gruppen.
          if (activeSearchQuery) {
            return (
              <div className="mb-6 flex flex-wrap gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {displayedTabs.map((t) => TabBtn(t))}
              </div>
            );
          }
          return (
            <div className="mb-6 flex flex-col gap-4">
              {TAB_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                    <group.icon className="h-3.5 w-3.5" /> {group.title}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.tabs.map((id) => TabBtn(tabById(id)))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        <div id="admin-tab-top" className="scroll-mt-4" />
        {TAB_GUIDES[tab] && <AdminGuide content={TAB_GUIDES[tab]} />}

        {tab === "balance" && (
          <>
            <BalanceCockpit
              onJump={goToTab}
              items={items}
              caseTiers={caseTiers}
              mineConfig={mineConfig}
              snakeConfig={snakeConfig}
              donConfig={donConfig}
              plinkoConfig={plinkoConfig}
              streakConfig={streakConfig}
              shopSettings={shopSettings}
              xpConfig={xpConfig}
              battlePasses={battlePasses}
              monsterTypes={monsterTypes}
            />
            <BalanceStudioTab />
          </>
        )}

        {tab === "economy" && (
          <CasesAdminTab caseGroups={caseGroups} caseTiers={caseTiers} items={items} />
        )}

        {tab === "streak" && <StreakConfigEditor config={streakConfig} />}

        {tab === "shop" && (
          <ShopTab
            settings={shopSettings}
            todayListings={todayShopListings}
            tomorrowListings={tomorrowShopListings}
            items={items}
          />
        )}

        {tab === "users" && (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Username oder ID suchen…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-9 pr-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-purple-400/60"
              />
            </div>
            {filteredProfiles.length === 0 && (
              <p className="text-sm text-zinc-500">Kein User gefunden.</p>
            )}
            {filteredProfiles.map((profile) => (
              <UserRowEditor key={profile.id} profile={profile} />
            ))}
          </div>
        )}

        {tab === "items" && <ItemsTab items={items} setItems={setItems} focus={itemFocus} />}

        {tab === "monsters" && (
          <div className="flex flex-col gap-3">
            <KillStreakConfigEditor config={killStreakConfig} />
            <p className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3 text-xs text-zinc-400">
              Diese {monsterTypes.length} Monster-Varianten sind fest — hier lassen sich alle ihre Werte
              (Leben, Schaden, Tempo, Reichweiten, Belohnung, Spawn-Häufigkeit, Farbe) bearbeiten oder eine
              Variante komplett deaktivieren. Neue Varianten hinzufügen ist bewusst nicht Teil dieser Ansicht.
            </p>
            {monsterTypes.map((type) => (
              <MonsterTypeEditor key={type.id} type={type} />
            ))}
          </div>
        )}

        {tab === "pets" && (
          <div className="flex flex-col gap-3">
            <p className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3 text-xs text-zinc-400">
              Diese Pet-Spezies sind fest — jede equipte Pet-Item wird anhand ihres Namens einer
              dieser Spezies zugeordnet (Hund/Katze/Phönix/Drache/Geist, alles andere fällt unter
              „Sonstiges Haustier"). Pets greifen Monster in ihrem Aggro-Radius eigenständig an.
            </p>
            {petTypes.map((type) => (
              <PetConfigEditor key={type.id} type={type} />
            ))}
          </div>
        )}

        {tab === "games" && (
          <GamesTab
            worldSessionConfig={worldSessionConfig}
            characterConfig={characterConfig}
            worldSpawnConfig={worldSpawnConfig}
            topProfiles={profiles}
            donConfig={donConfig}
            snakeConfig={snakeConfig}
            mineConfig={mineConfig}
            plinkoConfig={plinkoConfig}
          />
        )}

        {tab === "branding" && <SiteConfigEditor config={siteConfig} />}

        {tab === "audit" && (
          <AuditTimeline
            entries={auditLog.map((entry) => ({
              ...entry,
              actor: entry.profiles?.username,
            }))}
          />
        )}


        {tab === "chat" && <ChatConfigEditor initialConfig={chatConfig} />}

        {tab === "homepage_chat" && <HomepageChatConfigEditor />}

        {tab === "debug" && <DebugLogTab />}

        {tab === "backup" && <BackupTab />}

        {tab === "security" && <SecurityTab />}

        {tab === "surveys" && <SurveysTab />}

        {tab === "patchnotes" && <PatchNotesEditor initialNotes={patchNotes} />}

        {tab === "cleanup" && <CleanupConfigEditor rules={cleanupRules} />}

        {tab === "battlepass" && <BattlePassTab initialPasses={battlePasses} migrationNeeded={battlePassMigrationNeeded} />}

        {tab === "badges" && <BadgesTab profiles={profiles.map(p => ({ id: p.id, username: p.username, role: p.role }))} />}

        {tab === "namestyles" && <NameStylesTab profiles={profiles} />}

        {tab === "level_xp" && (
          <LevelConfigEditor
            initialConfig={xpConfig}
            profiles={profiles.map((p) => ({ id: p.id, username: p.username }))}
          />
        )}

        {tab === "givables" && (
          <GivablesTab profiles={profiles.map((p) => ({ id: p.id, username: p.username }))} />
        )}

        {tab === "sounds" && (
          <SoundConfigEditor initialConfig={soundConfig} />
        )}

        {tab === "music" && <MusicConfigEditor />}

        {tab === "theme" && <ThemeConfigEditor />}

        {tab === "preview_config" && <PreviewConfigTab />}

        {tab === "fine_config" && <FineConfigEditor initial={fineConfig} />}

        {tab === "daily_quests" && <DailyQuestsTab currencyName={siteConfig.currencyName} />}
        {tab === "synergy" && <EconomySynergyEditor />}

        {tab === "ki" && (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <AiConfigEditor />
            <div style={{ height: "calc(100vh - 420px)", minHeight: "460px" }}>
              <AdminAiChat context="admin" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
