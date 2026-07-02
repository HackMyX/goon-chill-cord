"use client";

/**
 * PARKOUR realtime transport — multiplayer ghost sync for a lobby run.
 *
 * Mirrors lib/world-realtime.ts's design: ONE channel per lobby, held at module
 * scope (a Supabase client caches channels by name, and calling `.on()` after
 * `.subscribe()` throws — so we must reuse the single instance). `self: false`
 * means a tab never receives its own broadcasts (it already drives its local
 * player directly). Positions go over the WebSocket `send()` (~20 Hz), the rarer
 * "finished"/"config changed" cues piggyback on the same channel.
 *
 * Moving platforms are a deterministic function of (period, phase, elapsed) and
 * every client shares the lobby's `run_seed` start timestamp, so ghosts and the
 * world stay in lockstep without streaming platform state.
 */

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { EquippedItem } from "@/lib/rarity-colors";

/** High-frequency transform + animation state (~20 Hz). */
export interface ParkourGhostPayload {
  id: string;          // user id
  x: number;
  y: number;
  z: number;
  yaw: number;
  moving: boolean;
  grounded: boolean;
  sprinting: boolean;
  dashing: boolean;
  /** true for a brief window after a hazard knockback → ghosts recoil. */
  hurt: boolean;
  /** true once this player crossed the finish this run. */
  finished: boolean;
}

/** Low-frequency identity: name, gender AND the full equipped cosmetics, so
 * ghosts render as the REAL character. Re-broadcast every few seconds so a
 * late-joiner picks it up. */
export interface ParkourProfilePayload {
  id: string;
  name: string;
  gender: "m" | "w";
  equipped: Record<string, EquippedItem | undefined>;
}

let channel: RealtimeChannel | null = null;
let channelKey: string | null = null;
let subscribed = false;
const ghostListeners = new Set<(p: ParkourGhostPayload) => void>();
const profileListeners = new Set<(p: ParkourProfilePayload) => void>();
const leaveListeners = new Set<(id: string) => void>();
const rosterListeners = new Set<(ids: Set<string>) => void>();

function channelName(lobbyId: string): string {
  return `parkour-room:${lobbyId}`;
}

function ensureChannel(lobbyId: string): RealtimeChannel {
  const name = channelName(lobbyId);
  if (channel && channelKey === name) return channel;
  // Switching lobbies — tear down the old channel first.
  if (channel) {
    try { void createClient().removeChannel(channel); } catch { /* noop */ }
    channel = null;
    subscribed = false;
  }
  const supabase = createClient();
  const ch = supabase.channel(name, { config: { presence: { key: "" }, broadcast: { self: false } } });

  ch.on("broadcast", { event: "ghost" }, ({ payload }) => {
    for (const l of ghostListeners) l(payload as ParkourGhostPayload);
  });
  ch.on("broadcast", { event: "profile" }, ({ payload }) => {
    for (const l of profileListeners) l(payload as ParkourProfilePayload);
  });
  ch.on("broadcast", { event: "leave" }, ({ payload }) => {
    const id = (payload as { id?: string })?.id;
    if (id) for (const l of leaveListeners) l(id);
  });
  ch.on("presence", { event: "sync" }, () => {
    const state = ch.presenceState() as Record<string, { user_id?: string }[]>;
    const ids = new Set<string>();
    for (const arr of Object.values(state)) for (const p of arr) if (p.user_id) ids.add(p.user_id);
    for (const l of rosterListeners) l(ids);
  });

  ch.subscribe((status) => { if (status === "SUBSCRIBED") subscribed = true; });
  channel = ch;
  channelKey = name;
  return ch;
}

/** Join the lobby room's realtime channel + presence. Returns a cleanup fn. */
export function joinParkourRoom(lobbyId: string, userId: string): () => void {
  const ch = ensureChannel(lobbyId);
  let cancelled = false;
  const tryTrack = () => {
    if (cancelled) return;
    if (subscribed) void ch.track({ user_id: userId });
    else setTimeout(tryTrack, 60);
  };
  tryTrack();
  return () => {
    cancelled = true;
    try {
      ch.send({ type: "broadcast", event: "leave", payload: { id: userId } });
      void ch.untrack();
    } catch { /* noop */ }
  };
}

export function broadcastParkourGhost(payload: ParkourGhostPayload): void {
  if (!subscribed || !channel) return;
  try { void channel.send({ type: "broadcast", event: "ghost", payload }); } catch { /* noop */ }
}

export function broadcastParkourProfile(payload: ParkourProfilePayload): void {
  if (!subscribed || !channel) return;
  try { void channel.send({ type: "broadcast", event: "profile", payload }); } catch { /* noop */ }
}

export function subscribeToParkourGhosts(fn: (p: ParkourGhostPayload) => void): () => void {
  ghostListeners.add(fn);
  return () => ghostListeners.delete(fn);
}

export function subscribeToParkourProfile(fn: (p: ParkourProfilePayload) => void): () => void {
  profileListeners.add(fn);
  return () => profileListeners.delete(fn);
}

export function subscribeToParkourLeave(fn: (id: string) => void): () => void {
  leaveListeners.add(fn);
  return () => leaveListeners.delete(fn);
}

export function subscribeToParkourRoster(fn: (ids: Set<string>) => void): () => void {
  rosterListeners.add(fn);
  return () => rosterListeners.delete(fn);
}
