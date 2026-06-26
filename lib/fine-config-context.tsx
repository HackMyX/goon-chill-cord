"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { type FineConfig, DEFAULT_FINE_CONFIG } from "@/lib/fine-config-types";
import { getFineConfig } from "@/lib/actions/fine-config";

const FineConfigContext = createContext<FineConfig>(DEFAULT_FINE_CONFIG);

export function FineConfigProvider({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: FineConfig;
}) {
  const [config, setConfig] = useState<FineConfig>(initial ?? DEFAULT_FINE_CONFIG);

  useEffect(() => {
    // Re-fetch on mount so values are always current even if the server-side
    // fetch was stale (e.g. admin changed the config just before page load).
    getFineConfig().then(setConfig).catch(() => {});
  }, []);

  // Live updates: admin saves broadcast on "fine-config-live" → re-fetch and
  // re-apply tuning values without a reload (AGENTS §3).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("fine-config-live")
      .on("broadcast", { event: "fine_config_changed" }, () => {
        getFineConfig().then(setConfig).catch(() => { /* keep current on error */ });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  return (
    <FineConfigContext.Provider value={config}>
      {children}
    </FineConfigContext.Provider>
  );
}

export function useFineConfig(): FineConfig {
  return useContext(FineConfigContext);
}
