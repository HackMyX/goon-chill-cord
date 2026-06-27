"use client";

import { useEffect } from "react";
import { getClientSettings, subscribeClientSettings } from "@/lib/client-settings";

/**
 * Applies global client-only preferences to the document. Currently the
 * reduced-motion toggle → `<html data-reduced-motion="1">`, which globals.css
 * uses to near-instant all CSS animations/transitions. Mounted once in the
 * root layout; reacts live to changes from the profile's Client-Settings.
 */
export function ClientPrefsApplier() {
  useEffect(() => {
    const apply = (s: { reducedMotion: boolean }) => {
      const el = document.documentElement;
      if (s.reducedMotion) el.setAttribute("data-reduced-motion", "1");
      else el.removeAttribute("data-reduced-motion");
    };
    apply(getClientSettings());
    return subscribeClientSettings(apply);
  }, []);
  return null;
}
