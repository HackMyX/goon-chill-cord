"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { DEFAULT_SITE_CONFIG, DEFAULT_TOPBAR_RIGHT_SLOTS, type SiteConfig } from "@/lib/site-config";
// Import only server-safe name validation — NOT lib/site-logo-icons.ts, which
// imports lucide-react "use client" components. When Next.js bundles this server
// action into the /icon metadata route, that "use client" import triggers a hard
// runtime error ("Attempted to call the default export of Icon.mjs from the server").
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
}

/** Falls back to the code defaults whenever the table doesn't exist yet or
 * is empty — same defensive pattern as every other config getter in this
 * project. Called from the root layout (app/layout.tsx) on every request,
 * so a brand-new install with no row yet still renders the default name/
 * icon instead of erroring out the entire site. */
export async function getSiteConfig(): Promise<SiteConfig> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("site_config")
    .select("site_name, logo_url, logo_icon_name, starting_credits, currency_name, damage_label, armor_label, rarity_normal_label, rarity_selten_label, rarity_mythisch_label, rarity_ultra_label, perk_speed_label, perk_jump_label, perk_regen_label, topbar_right_slots")
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
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { success: false, error: "Speichern fehlgeschlagen — ist die site_config-Migration eingespielt?" };
  }

  // Every page on the site renders TopBar (fed by the root layout's
  // SiteConfigProvider) — revalidating just "/" wouldn't be enough since
  // Next.js path revalidation isn't recursive across unrelated routes.
  // The layout itself isn't a path Next lets you revalidate directly, but
  // revalidating "/" with layout: "layout" busts the shared root layout's
  // cache for every route under it in one call.
  revalidatePath("/", "layout");
  return { success: true };
}
