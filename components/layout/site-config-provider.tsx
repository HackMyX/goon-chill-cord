"use client";

import { createContext, useContext } from "react";
import { DEFAULT_SITE_CONFIG, type SiteConfig } from "@/lib/site-config";

/**
 * Sitewide branding, fetched once server-side in the root layout
 * (app/layout.tsx — itself an async Server Component) and handed down
 * through this one Client Component bridge instead of prop-drilling
 * `siteName`/`logoUrl` through every single page that renders TopBar.
 * Same "fetch once at the root, read via a hook anywhere below" shape
 * ConfirmDialogProvider already uses in this same layout for a different
 * concern.
 */
const SiteConfigContext = createContext<SiteConfig>(DEFAULT_SITE_CONFIG);

export function SiteConfigProvider({ config, children }: { config: SiteConfig; children: React.ReactNode }) {
  return <SiteConfigContext.Provider value={config}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig(): SiteConfig {
  return useContext(SiteConfigContext);
}
