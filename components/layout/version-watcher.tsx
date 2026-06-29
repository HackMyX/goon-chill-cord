"use client";

import { useEffect } from "react";
import { BUILD_INFO } from "@/lib/build-info";
import { reportVersionLoaded } from "@/lib/actions/version-log";

export const VERSION_LS_KEY = "gnc_build";
export const VERSION_LS_LOADED_AT = "gnc_build_loaded_at";
export const VERSION_LS_PREV = "gnc_build_prev";

/**
 * Erkennt pro Browser, wenn erstmals eine NEUE Version (neuer Deploy) geladen
 * wurde: merkt den Zeitpunkt in localStorage und meldet es genau einmal ins
 * Debug-Log (`deploy`-Scope). So sieht der Admin dort live, dass das neue
 * Deployment angekommen ist. Rendert nichts. Global im Layout gemountet.
 */
export function VersionWatcher() {
  useEffect(() => {
    try {
      const key = BUILD_INFO.versionKey;
      const prev = localStorage.getItem(VERSION_LS_KEY);
      if (prev === key) return; // gleiche Version → nichts zu tun

      localStorage.setItem(VERSION_LS_KEY, key);
      localStorage.setItem(VERSION_LS_LOADED_AT, new Date().toISOString());
      if (prev) localStorage.setItem(VERSION_LS_PREV, prev);

      // Erste Browser-Session ohne vorherigen Wert NICHT als "neuer Deploy" loggen
      // (sonst loggt jeder Erstbesuch). Nur echte Versionswechsel melden.
      if (prev) {
        void reportVersionLoaded({
          versionKey: key,
          deployName: BUILD_INFO.deployName,
          commitShort: BUILD_INFO.commitShort,
          commitMessage: BUILD_INFO.commitMessage,
          commitRef: BUILD_INFO.commitRef,
          buildTime: BUILD_INFO.buildTime,
          deploymentId: BUILD_INFO.deploymentId,
          vercelEnv: BUILD_INFO.vercelEnv,
        });
      }
    } catch {
      /* localStorage kann blockiert sein — egal, nicht kritisch */
    }
  }, []);

  return null;
}
