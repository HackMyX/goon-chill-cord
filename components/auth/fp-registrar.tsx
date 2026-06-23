"use client";

import { useEffect } from "react";
import { registerFingerprint } from "@/lib/actions/fingerprint";

/**
 * Computes a browser fingerprint client-side via FingerprintJS and registers
 * it server-side. Runs silently on every page — this ensures the cookie is
 * set even on the landing page *before* the user clicks "Login with Discord",
 * so the auth callback can read it immediately and check against device_bans.
 */
export function FpRegistrar() {
  useEffect(() => {
    (async () => {
      try {
        const FingerprintJS = (await import("@fingerprintjs/fingerprintjs")).default;
        const fp = await FingerprintJS.load({ monitoring: false });
        const result = await fp.get();
        const visitorId = result.visitorId;

        // Persist in a first-party cookie so the auth callback (server-side) can read it.
        // 90 days, SameSite=Lax — not HttpOnly intentionally so this client code can also read it.
        const maxAge = 90 * 24 * 3600;
        document.cookie = `_fp=${visitorId}; path=/; max-age=${maxAge}; SameSite=Lax`;

        // Also store on the server (login_events row, if user is logged in)
        await registerFingerprint(visitorId);
      } catch {
        // Non-blocking — if FingerprintJS fails, auth still works normally.
      }
    })();
  }, []);

  return null;
}
