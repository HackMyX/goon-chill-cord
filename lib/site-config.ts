import { DEFAULT_SITE_LOGO_ICON } from "@/lib/site-logo-icons";

/**
 * Sitewide branding — the name shown top-left in components/layout/top-
 * bar.tsx (and as the browser tab title, app/layout.tsx's generateMetadata,
 * and the logged-out homepage app/page.tsx) plus a logo, either a custom
 * image or one of lib/site-logo-icons.ts' curated icon choices. Same "code
 * defaults, DB override" shape as every other admin config in this
 * project; see lib/actions/site-config.ts for the fetch-and-fallback.
 */
export interface SiteConfig {
  siteName: string;
  /** Takes priority over `logoIconName` when set — a custom hosted image
   * URL (this project has no file-upload/storage pipeline, so the admin
   * editor takes a URL rather than a file picker). Null/empty = use the
   * icon below instead. */
  logoUrl: string | null;
  /** One of lib/site-logo-icons.ts' SITE_LOGO_ICONS keys — the "choose
   * from many" logo option when there's no custom image URL. Always a
   * valid fallback (defaults to the original Gamepad2), so the logo
   * never has a genuinely empty state. */
  logoIconName: string;
  /** Credits awarded to a new user upon first signup. Read by the
   * handle_new_user PostgreSQL trigger — run scripts/add-starting-credits.mjs
   * once to add the column and update the trigger. */
  startingCredits: number;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  siteName: "Goon'n Chill Cord",
  logoUrl: null,
  logoIconName: DEFAULT_SITE_LOGO_ICON,
  startingCredits: 500,
};
