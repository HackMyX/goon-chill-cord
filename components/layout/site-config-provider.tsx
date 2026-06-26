"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSiteConfig } from "@/lib/actions/site-config";
import { DEFAULT_SITE_CONFIG, type SiteConfig } from "@/lib/site-config";

/**
 * Sitewide branding, fetched once server-side in the root layout
 * (app/layout.tsx — itself an async Server Component) and handed down
 * through this one Client Component bridge instead of prop-drilling
 * `siteName`/`logoUrl` through every single page that renders TopBar.
 * Same "fetch once at the root, read via a hook anywhere below" shape
 * ConfirmDialogProvider already uses in this same layout for a different
 * concern.
 *
 * Live updates: an admin save broadcasts on the "site-config-live" channel
 * (lib/actions/site-config.ts → updateSiteConfig). We re-fetch and re-apply
 * the config so name/logo/topbar/homepage change for every user without a
 * reload — mirrors ThemeProvider / MusicPlayer (AGENTS §3).
 */
const SiteConfigContext = createContext<SiteConfig>(DEFAULT_SITE_CONFIG);

export function SiteConfigProvider({ config, children }: { config: SiteConfig; children: React.ReactNode }) {
  const [liveConfig, setLiveConfig] = useState<SiteConfig>(config);

  // Keep in sync if the server-provided config changes (e.g. route revalidation).
  useEffect(() => { setLiveConfig(config); }, [config]);

  // Subscribe to live admin saves and re-fetch the fresh config.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("site-config-live")
      .on("broadcast", { event: "site_config_changed" }, () => {
        getSiteConfig().then(setLiveConfig).catch(() => { /* keep current on error */ });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  return <SiteConfigContext.Provider value={liveConfig}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig(): SiteConfig {
  return useContext(SiteConfigContext);
}
