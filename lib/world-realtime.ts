"use client";

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Single shared room for now — every player in the 3D World ends up on the
 * same realtime channel. Sharding into multiple rooms (if the player count
 * ever needs it) only means changing this one constant into a parameter;
 * nothing else here assumes a single room.
 */
const WORLD_ROOM = "main";
/** Exported so lib/actions/pvp.ts's server-side broadcast (lib/realtime-
 * server.ts, a plain REST POST — server actions have no live socket
 * subscription to reuse) targets the exact same topic string this
 * module's browser-side channel subscribes to. */
export const WORLD_CHANNEL_NAME = `world-room:${WORLD_ROOM}`;

/** One player's transform, broadcast ~10×/sec (see Player.tsx's existing
 * STATS_SYNC_INTERVAL throttle, reused for this same tick) — never at full
 * frame rate, this is a presence/visuals feed, not a physics-tick replay.
 * `hp` rides along so a remote player's health bar (if ever shown) doesn't
 * need a second channel; `moving`/`sprinting` are cosmetic-only flags so a
 * remote avatar's walk-cycle can react without guessing from position
 * deltas (those are noisy at 10Hz and would lag a full update behind). */
export interface WorldTransformPayload {
  id: string;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  moving: boolean;
  sprinting: boolean;
}

/** Server-authored (lib/actions/pvp.ts via lib/realtime-server.ts), never
 * sent by a browser client directly — a landed PvP hit's damage amount is
 * always rolled server-side from the attacker's actually-equipped weapon,
 * the same "client claims an attempt, server decides the number" split
 * lib/actions/monsters.ts already uses for monster kills. Every tab in the
 * room receives this broadcast: the target's own Player.tsx applies
 * `amount` to its local `combatRef.current.hp`; every *other* tab's
 * remote-players.tsx uses it purely as a "play a hit effect on this
 * avatar" cue, never to touch HP it doesn't own. */
export interface PvpDamagePayload {
  targetUserId: string;
  attackerId: string;
  amount: number;
}

/**
 * Deliberately separate from lib/presence.ts's PRESENCE_CHANNEL
 * ("site-presence") — that channel's only job is the Community page's
 * sitewide online dot, and is subscribed to by every logged-in tab on the
 * entire site, not just players inside /world. Piping 10Hz position
 * broadcasts through it would flood every other page's tab with traffic it
 * has no use for. This module follows the exact same lazy-singleton,
 * subscribe-once pattern as lib/presence-client.ts (see its top comment for
 * why: `createBrowserClient` returns a cached client, so two independent
 * `supabase.channel(name)` calls from different components resolve to the
 * same underlying channel object, and a second `.on()` call after the first
 * caller's `.subscribe()` throws) — just with a second listener kind
 * (`broadcast`) layered on top of the same `presence` join/leave roster.
 */
let channel: RealtimeChannel | null = null;
let subscribed = false;
const transformListeners = new Set<(payload: WorldTransformPayload) => void>();
const rosterListeners = new Set<(onlineUserIds: Set<string>) => void>();
const pvpDamageListeners = new Set<(payload: PvpDamagePayload) => void>();

function currentRoster(ch: RealtimeChannel): Set<string> {
  const state = ch.presenceState() as Record<string, { user_id?: string }[]>;
  const ids = new Set<string>();
  for (const presences of Object.values(state)) {
    for (const p of presences) {
      if (p.user_id) ids.add(p.user_id);
    }
  }
  return ids;
}

function ensureWorldChannel(): RealtimeChannel {
  if (channel) return channel;

  const supabase = createClient();
  // self: false (the default) so a tab never receives its own broadcast —
  // Player.tsx already drives its own local position every frame, it has
  // no use for an echo of the value it just sent.
  channel = supabase.channel(WORLD_CHANNEL_NAME, {
    config: { presence: { key: "" }, broadcast: { self: false } },
  });
  channel.on("broadcast", { event: "transform" }, ({ payload }) => {
    for (const listener of transformListeners) listener(payload as WorldTransformPayload);
  });
  channel.on("broadcast", { event: "pvp_damage" }, ({ payload }) => {
    for (const listener of pvpDamageListeners) listener(payload as PvpDamagePayload);
  });
  channel.on("presence", { event: "sync" }, () => {
    const ids = currentRoster(channel!);
    for (const listener of rosterListeners) listener(ids);
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") subscribed = true;
  });

  return channel;
}

/** Joins the shared World room's presence roster as `userId` — call once
 * per mounted World session (world-shell.tsx). Returns an untrack
 * function for cleanup on unmount/navigation-away. */
export function joinWorldRoom(userId: string): () => void {
  const ch = ensureWorldChannel();
  let cancelled = false;

  const tryTrack = () => {
    if (cancelled) return;
    if (subscribed) ch.track({ user_id: userId });
    else setTimeout(tryTrack, 50);
  };
  tryTrack();

  return () => {
    cancelled = true;
    if (subscribed) ch.untrack();
  };
}

/** Fire-and-forget position broadcast — no ack, no retry, the next tick
 * 100ms later supersedes a dropped one anyway. No-ops silently if the
 * channel hasn't finished subscribing yet (the first ~50-200ms of a World
 * session), same tolerance the rest of this module has for that window.
 *
 * `httpSend()`, not `send()` — `send()` only delivers over the live
 * WebSocket when the channel's underlying socket is actually connected at
 * that exact instant; whenever it isn't (a transient reconnect, a closed
 * tab elsewhere in the room, anything short of `subscribed` itself going
 * false), it transparently falls back to the same REST endpoint
 * `httpSend()` hits directly — except the SDK logs a console warning every
 * single time it does, and has announced that implicit fallback will be
 * removed in a future version (at which point a `send()` call would just
 * silently fail instead). Calling `httpSend()` ourselves gets the exact
 * same delivery, with no warning and no future breakage to worry about. */
export function broadcastTransform(payload: WorldTransformPayload): void {
  if (!subscribed || !channel) return;
  channel.httpSend("transform", payload).catch(() => {
    // Same fire-and-forget tolerance as above — a dropped tick costs
    // nothing the next one won't supersede.
  });
}

/** Subscribes to every peer's transform broadcasts (not just one id) — the
 * caller filters by `payload.id` itself, since a single subscriber
 * (components/world/remote-players.tsx) fans this out to many per-peer
 * avatar drivers. */
export function subscribeToWorldTransforms(
  onTransform: (payload: WorldTransformPayload) => void
): () => void {
  ensureWorldChannel();
  transformListeners.add(onTransform);
  return () => {
    transformListeners.delete(onTransform);
  };
}

/** Subscribes to every server-broadcast PvP damage event in the room — the
 * caller filters by `payload.targetUserId`/`attackerId` itself, same
 * fan-out-and-filter shape as `subscribeToWorldTransforms`. */
export function subscribeToWorldPvpDamage(onDamage: (payload: PvpDamagePayload) => void): () => void {
  ensureWorldChannel();
  pvpDamageListeners.add(onDamage);
  return () => {
    pvpDamageListeners.delete(onDamage);
  };
}

/** Subscribes to the room's join/leave roster (who's currently present,
 * by user id) — Presence (not broadcast) on purpose, since its built-in
 * untrack-on-disconnect is what makes a closed tab's avatar actually
 * disappear for everyone else without any extra timeout logic. */
export function subscribeToWorldRoster(onSync: (onlineUserIds: Set<string>) => void): () => void {
  const ch = ensureWorldChannel();

  const listener = () => onSync(currentRoster(ch));
  rosterListeners.add(listener);
  // Fire once immediately in case sync already happened before this
  // listener registered.
  listener();

  return () => {
    rosterListeners.delete(listener);
  };
}
