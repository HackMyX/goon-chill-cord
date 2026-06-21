"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackPresence } from "@/lib/presence-client";

/**
 * Mounted once, globally (app/layout.tsx), for every page — tracks the
 * logged-in user as "online" on the shared presence channel
 * (lib/presence-client.ts) for as long as this tab is open. Does nothing
 * for logged-out visitors. This is the *write* side of the Community
 * page's online indicator (components/community/player-list-shell.tsx
 * reads the same channel via subscribeToPresence()).
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let untrack: (() => void) | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      untrack = trackPresence(user.id);
    });

    return () => {
      cancelled = true;
      untrack?.();
    };
  }, []);

  return null;
}
