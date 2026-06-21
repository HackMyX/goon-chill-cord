"use client";

import { createClient } from "@/lib/supabase/client";
import { PRESENCE_CHANNEL } from "@/lib/presence";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * `createBrowserClient` (lib/supabase/client.ts) returns a cached singleton
 * on the client, which means `supabase.channel(PRESENCE_CHANNEL)` called
 * from two different components (presence-heartbeat.tsx *and*
 * player-list-shell.tsx) resolves to the *same* underlying realtime
 * channel object. The first caller to `.subscribe()` locks it — calling
 * `.on("presence", ...)` on it again afterward throws "cannot add
 * presence callbacks after subscribe()", which is exactly the runtime
 * error this module exists to prevent.
 *
 * Single module-level channel, created and subscribed exactly once
 * (lazily, on first use) with its sync listener wired up *before* that
 * one `.subscribe()` call. Every consumer — the heartbeat's `track()` and
 * any number of UI components' `onSync` listeners — goes through this
 * same instance instead of creating their own.
 */
let channel: RealtimeChannel | null = null;
let subscribed = false;
const syncListeners = new Set<() => void>();

function ensureChannel(): RealtimeChannel {
  if (channel) return channel;

  const supabase = createClient();
  channel = supabase.channel(PRESENCE_CHANNEL, { config: { presence: { key: "" } } });
  channel.on("presence", { event: "sync" }, () => {
    for (const listener of syncListeners) listener();
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") subscribed = true;
  });

  return channel;
}

/** Tracks `userId` as present on the shared channel — call once per
 * logged-in session (presence-heartbeat.tsx). */
export function trackPresence(userId: string): () => void {
  const ch = ensureChannel();
  let cancelled = false;

  const tryTrack = () => {
    if (cancelled) return;
    if (subscribed) ch.track({ user_id: userId, online_at: new Date().toISOString() });
    else setTimeout(tryTrack, 50);
  };
  tryTrack();

  return () => {
    cancelled = true;
    if (subscribed) ch.untrack();
  };
}

/** Subscribes to presence-sync events on the shared channel and returns
 * the current set of online user ids (read from the channel's
 * `presenceState()`, keyed by each tracked payload's `user_id`). */
export function subscribeToPresence(onSync: (onlineUserIds: Set<string>) => void): () => void {
  const ch = ensureChannel();

  const listener = () => {
    const state = ch.presenceState() as Record<string, { user_id?: string }[]>;
    const ids = new Set<string>();
    for (const presences of Object.values(state)) {
      for (const p of presences) {
        if (p.user_id) ids.add(p.user_id);
      }
    }
    onSync(ids);
  };

  syncListeners.add(listener);
  // Fire once immediately in case sync already happened before this
  // listener registered (e.g. the heartbeat tracked before this component
  // mounted).
  listener();

  return () => {
    syncListeners.delete(listener);
  };
}
