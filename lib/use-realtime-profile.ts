"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ProfileRealtimeUpdate {
  credits?: number;
  role?: string;
  gender?: string;
  streak_days?: number;
  best_streak_days?: number;
  [key: string]: unknown;
}

/**
 * Subscribes to live UPDATE events on the current user's own `profiles`
 * row — so admin-driven changes (credits set, role changed, ban toggled,
 * item granted) reach an already-open tab immediately instead of requiring
 * a manual reload. Mirrors the per-user channel pattern
 * components/layout/notifications-bell.tsx already uses for `notifications`.
 * Resolves the user id itself (rather than taking it as a prop) so it can
 * be dropped into any shell without threading a new prop through server
 * pages that don't already pass one down.
 */
export function useRealtimeProfile(onUpdate: (row: ProfileRealtimeUpdate) => void) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !active) return;
      channel = supabase
        .channel(`profile-sync:${user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
          (payload) => callbackRef.current(payload.new as ProfileRealtimeUpdate)
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
}

/**
 * Same idea as useRealtimeProfile, but unfiltered — for displays that show
 * *other* players' live data (leaderboard, community player list) rather
 * than just the viewer's own row. `profiles` has RLS disabled (see
 * scripts/enable-realtime-profiles.mjs), so every row's UPDATEs are
 * visible here exactly as they already are to any plain `select()`.
 */
export function useRealtimeAllProfiles(onUpdate: (row: ProfileRealtimeUpdate & { id: string }) => void) {
  const callbackRef = useRef(onUpdate);
  callbackRef.current = onUpdate;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("profile-sync:all")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => callbackRef.current(payload.new as ProfileRealtimeUpdate & { id: string })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
