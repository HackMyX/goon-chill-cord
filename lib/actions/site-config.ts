"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { DEFAULT_SITE_CONFIG, type SiteConfig } from "@/lib/site-config";
import { SITE_LOGO_ICONS, DEFAULT_SITE_LOGO_ICON } from "@/lib/site-logo-icons";

interface SiteConfigRow {
  site_name: string;
  logo_url: string | null;
  logo_icon_name: string;
  starting_credits: number | null;
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
    .select("site_name, logo_url, logo_icon_name, starting_credits")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return DEFAULT_SITE_CONFIG;
  const row = data as SiteConfigRow;
  return {
    siteName: row.site_name,
    logoUrl: row.logo_url,
    logoIconName: row.logo_icon_name in SITE_LOGO_ICONS ? row.logo_icon_name : DEFAULT_SITE_LOGO_ICON,
    startingCredits: typeof row.starting_credits === "number" ? row.starting_credits : 500,
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
  const iconName = input.logoIconName in SITE_LOGO_ICONS ? input.logoIconName : DEFAULT_SITE_LOGO_ICON;

  const admin = createAdminClient();
  const { error } = await admin.from("site_config").upsert({
    id: "default",
    site_name: trimmedName,
    logo_url: trimmedLogo,
    logo_icon_name: iconName,
    starting_credits: startingCredits,
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
