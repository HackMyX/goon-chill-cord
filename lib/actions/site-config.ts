"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";
import {
  DEFAULT_SITE_CONFIG,
  DEFAULT_TOPBAR_RIGHT_SLOTS,
  DEFAULT_HOMEPAGE_CONFIG,
  type SiteConfig,
  type HomepageConfig,
  ALL_HOMEPAGE_CARDS,
} from "@/lib/site-config";
// Import only server-safe name validation — NOT lib/site-logo-icons.ts, which
// imports lucide-react "use client" components.
import { VALID_ICON_NAMES, DEFAULT_ICON_NAME } from "@/lib/icon-svg-paths";

interface SiteConfigRow {
  site_name: string;
  logo_url: string | null;
  logo_icon_name: string;
  starting_credits: number | null;
  currency_name: string | null;
  damage_label: string | null;
  armor_label: string | null;
  rarity_normal_label: string | null;
  rarity_selten_label: string | null;
  rarity_mythisch_label: string | null;
  rarity_ultra_label: string | null;
  perk_speed_label: string | null;
  perk_jump_label: string | null;
  perk_regen_label: string | null;
  topbar_right_slots: string[] | null;
  site_version: string | null;
  topbar_show_labels: boolean | null;
  topbar_button_style: string | null;
  homepage_config: Record<string, unknown> | null;
  max_prio_badges: number | null;
}

function parseHomepageConfig(raw: Record<string, unknown> | null): HomepageConfig {
  const def = DEFAULT_HOMEPAGE_CONFIG;
  if (!raw) return { ...def };
  return {
    heroTitle: typeof raw.heroTitle === "string" ? raw.heroTitle : def.heroTitle,
    heroSubtitle: typeof raw.heroSubtitle === "string" ? raw.heroSubtitle : def.heroSubtitle,
    showStats: typeof raw.showStats === "boolean" ? raw.showStats : def.showStats,
    showLeaderboard: typeof raw.showLeaderboard === "boolean" ? raw.showLeaderboard : def.showLeaderboard,
    showFeatureCards: typeof raw.showFeatureCards === "boolean" ? raw.showFeatureCards : def.showFeatureCards,
    cardOrder: Array.isArray(raw.cardOrder) ? (raw.cardOrder as string[]).filter((id) => ALL_HOMEPAGE_CARDS.includes(id as never)) as typeof def.cardOrder : [...def.cardOrder],
    disabledCards: Array.isArray(raw.disabledCards) ? (raw.disabledCards as string[]).filter((id) => ALL_HOMEPAGE_CARDS.includes(id as never)) as typeof def.disabledCards : [...def.disabledCards],
    announcementEnabled: typeof raw.announcementEnabled === "boolean" ? raw.announcementEnabled : def.announcementEnabled,
    announcementText: typeof raw.announcementText === "string" ? raw.announcementText : def.announcementText,
    announcementColor: (["purple", "amber", "sky", "emerald", "red"] as const).includes(raw.announcementColor as never)
      ? (raw.announcementColor as typeof def.announcementColor)
      : def.announcementColor,
    showStreakLeaderboard: typeof raw.showStreakLeaderboard === "boolean" ? raw.showStreakLeaderboard : def.showStreakLeaderboard,
    leaderboardStyle: raw.leaderboardStyle === "list" ? "list" : "podium",
  };
}

export async function getSiteConfig(): Promise<SiteConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("site_config")
    .select(
      "site_name, logo_url, logo_icon_name, starting_credits, currency_name, damage_label, armor_label, rarity_normal_label, rarity_selten_label, rarity_mythisch_label, rarity_ultra_label, perk_speed_label, perk_jump_label, perk_regen_label, topbar_right_slots, site_version, topbar_show_labels, topbar_button_style, homepage_config, max_prio_badges"
    )
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return DEFAULT_SITE_CONFIG;
  const row = data as SiteConfigRow;
  const def = DEFAULT_SITE_CONFIG;
  return {
    siteName: row.site_name,
    logoUrl: row.logo_url,
    logoIconName: VALID_ICON_NAMES.has(row.logo_icon_name) ? row.logo_icon_name : DEFAULT_ICON_NAME,
    startingCredits: typeof row.starting_credits === "number" ? row.starting_credits : 500,
    currencyName: row.currency_name?.trim() || def.currencyName,
    damageLabel: row.damage_label?.trim() || def.damageLabel,
    armorLabel: row.armor_label?.trim() || def.armorLabel,
    rarityLabels: {
      normal:   row.rarity_normal_label?.trim()   || def.rarityLabels.normal,
      selten:   row.rarity_selten_label?.trim()   || def.rarityLabels.selten,
      mythisch: row.rarity_mythisch_label?.trim() || def.rarityLabels.mythisch,
      ultra:    row.rarity_ultra_label?.trim()    || def.rarityLabels.ultra,
    },
    perkLabels: {
      speed: row.perk_speed_label?.trim() || def.perkLabels.speed,
      jump:  row.perk_jump_label?.trim()  || def.perkLabels.jump,
      regen: row.perk_regen_label?.trim() || def.perkLabels.regen,
    },
    topbarRightSlots: Array.isArray(row.topbar_right_slots) && row.topbar_right_slots.length > 0
      ? row.topbar_right_slots
      : [...DEFAULT_TOPBAR_RIGHT_SLOTS],
    siteVersion: row.site_version?.trim() || "v1.0.0",
    topbarShowLabels: typeof row.topbar_show_labels === "boolean" ? row.topbar_show_labels : false,
    topbarButtonStyle: row.topbar_button_style === "pill" ? "pill" : "icon",
    homepageConfig: parseHomepageConfig(row.homepage_config),
    maxPrioBadges: typeof row.max_prio_badges === "number" ? Math.max(1, Math.min(4, row.max_prio_badges)) : 2,
  };
}

export interface SiteConfigActionResult {
  success: boolean;
  error?: string;
}

export async function updateSiteConfig(input: SiteConfig): Promise<SiteConfigActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  const trimmedName = input.siteName.trim();
  if (!trimmedName) return { success: false, error: "Seitenname darf nicht leer sein." };
  if (trimmedName.length > 60) return { success: false, error: "Seitenname ist zu lang (max. 60 Zeichen)." };

  const trimmedLogo = input.logoUrl?.trim() || null;
  if (trimmedLogo) {
    try {
      new URL(trimmedLogo);
    } catch {
      return { success: false, error: "Logo-URL ist keine gültige URL." };
    }
  }

  const startingCredits = Math.max(0, Math.min(1_000_000, Math.round(input.startingCredits ?? 500)));
  const iconName = VALID_ICON_NAMES.has(input.logoIconName) ? input.logoIconName : DEFAULT_ICON_NAME;

  const currencyName = input.currencyName?.trim().slice(0, 12);
  if (!currencyName) return { success: false, error: "Währungsname darf nicht leer sein." };
  const damageLabel = input.damageLabel?.trim().slice(0, 12);
  if (!damageLabel) return { success: false, error: "Schadens-Label darf nicht leer sein." };
  const armorLabel = input.armorLabel?.trim().slice(0, 12);
  if (!armorLabel) return { success: false, error: "Rüstungs-Label darf nicht leer sein." };

  const rarityNormal   = (input.rarityLabels?.normal   ?? "").trim().slice(0, 20) || DEFAULT_SITE_CONFIG.rarityLabels.normal;
  const raritySelten   = (input.rarityLabels?.selten   ?? "").trim().slice(0, 20) || DEFAULT_SITE_CONFIG.rarityLabels.selten;
  const rarityMythisch = (input.rarityLabels?.mythisch ?? "").trim().slice(0, 20) || DEFAULT_SITE_CONFIG.rarityLabels.mythisch;
  const rarityUltra    = (input.rarityLabels?.ultra    ?? "").trim().slice(0, 20) || DEFAULT_SITE_CONFIG.rarityLabels.ultra;
  const perkSpeed = (input.perkLabels?.speed ?? "").trim().slice(0, 20) || DEFAULT_SITE_CONFIG.perkLabels.speed;
  const perkJump  = (input.perkLabels?.jump  ?? "").trim().slice(0, 20) || DEFAULT_SITE_CONFIG.perkLabels.jump;
  const perkRegen = (input.perkLabels?.regen ?? "").trim().slice(0, 20) || DEFAULT_SITE_CONFIG.perkLabels.regen;

  const hpCfg: HomepageConfig = {
    heroTitle: (input.homepageConfig?.heroTitle ?? "").trim().slice(0, 80),
    heroSubtitle: (input.homepageConfig?.heroSubtitle ?? "").trim().slice(0, 200) || DEFAULT_HOMEPAGE_CONFIG.heroSubtitle,
    showStats: input.homepageConfig?.showStats ?? true,
    showLeaderboard: input.homepageConfig?.showLeaderboard ?? true,
    showFeatureCards: input.homepageConfig?.showFeatureCards ?? true,
    cardOrder: Array.isArray(input.homepageConfig?.cardOrder)
      ? input.homepageConfig.cardOrder.filter((id) => ALL_HOMEPAGE_CARDS.includes(id as never))
      : [...ALL_HOMEPAGE_CARDS],
    disabledCards: Array.isArray(input.homepageConfig?.disabledCards)
      ? input.homepageConfig.disabledCards.filter((id) => ALL_HOMEPAGE_CARDS.includes(id as never))
      : [],
    announcementEnabled: input.homepageConfig?.announcementEnabled ?? false,
    announcementText: (input.homepageConfig?.announcementText ?? "").trim().slice(0, 300),
    announcementColor: (["purple", "amber", "sky", "emerald", "red"] as const).includes(input.homepageConfig?.announcementColor as never)
      ? (input.homepageConfig!.announcementColor)
      : "purple",
    showStreakLeaderboard: input.homepageConfig?.showStreakLeaderboard ?? true,
    leaderboardStyle: input.homepageConfig?.leaderboardStyle === "list" ? "list" : "podium",
  };

  const admin = createAdminClient();
  const { error } = await admin.from("site_config").upsert({
    id: "default",
    site_name: trimmedName,
    logo_url: trimmedLogo,
    logo_icon_name: iconName,
    starting_credits: startingCredits,
    currency_name: currencyName,
    damage_label: damageLabel,
    armor_label: armorLabel,
    rarity_normal_label: rarityNormal,
    rarity_selten_label: raritySelten,
    rarity_mythisch_label: rarityMythisch,
    rarity_ultra_label: rarityUltra,
    perk_speed_label: perkSpeed,
    perk_jump_label: perkJump,
    perk_regen_label: perkRegen,
    topbar_right_slots: Array.isArray(input.topbarRightSlots) && input.topbarRightSlots.length > 0
      ? input.topbarRightSlots
      : null,
    site_version: input.siteVersion?.trim() || "v1.0.0",
    topbar_show_labels: input.topbarShowLabels ?? false,
    topbar_button_style: input.topbarButtonStyle ?? "icon",
    homepage_config: hpCfg,
    max_prio_badges: Math.max(1, Math.min(4, Math.round(input.maxPrioBadges ?? 2))),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    void logDebugEvent({ level: "error", scope: "admin:site-config", message: "Site-Config Speichern fehlgeschlagen", detail: error.message, context: { userId: user.id } });
    return { success: false, error: "Speichern fehlgeschlagen — ist die site_config-Migration eingespielt?" };
  }

  void logActivity("admin:site-config", `Site-Config gespeichert: "${input.siteName}"`, { userId: user.id, siteName: input.siteName });
  revalidatePath("/", "layout");
  return { success: true };
}
