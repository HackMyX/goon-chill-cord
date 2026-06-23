"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CharacterModel, type CharacterLimbRefs } from "@/components/world/character-model";
import { angleDelta } from "@/components/world/player";
import { BloodBurst, BLOOD_BURST_LIFETIME_MS } from "@/components/world/hit-fx";
import { getPublicLoadout, type RemoteLoadout } from "@/lib/actions/world";
import {
  subscribeToWorldRoster,
  subscribeToWorldTransforms,
  subscribeToWorldPvpDamage,
} from "@/lib/world-realtime";
import { debugWarn } from "@/lib/debug";
import type { RemotePlayerRegistry } from "@/components/world/combat-types";

const POSITION_LERP_RATE = 14;
const HEADING_TURN_RATE = 12;
// Dead-reckoning: max look-ahead window (seconds). Keeps prediction
// from overshooting when a sync is late or the peer stops abruptly.
const DR_MAX_LOOKAHEAD = 0.12;

let pvpBloodBurstSeq = 0;

interface RemotePlayersProps {
  /** Own user id — never rendered as a remote avatar, even if it briefly
   * shows up in the room roster (it shouldn't, since broadcast/presence are
   * keyed by id and `broadcast: { self: false }` already excludes the echo,
   * but the roster is presence-based and worth guarding independently). */
  selfUserId: string;
  /** Shared with Player.tsx's own melee scan (components/world/scene.tsx
   * owns the ref) — each mounted avatar below registers itself here so a
   * local swing can also consider other players as targets, not just
   * monsters. See combat-types.ts' RemotePlayerHandle for why there's no
   * `takeDamage` on it. */
  registryRef: RemotePlayerRegistry;
}

/**
 * Renders every *other* player currently in the World as a fully-equipped
 * `CharacterModel` — no input, no physics, just lerping toward the latest
 * 10Hz transform broadcast (lib/world-realtime.ts) from that peer's own
 * Player.tsx, plus a blood-burst reaction whenever a server-broadcast
 * "pvp_damage" event names this avatar as the target (the actual HP change
 * happens on that peer's own tab, not here — this is purely the visual
 * "I just watched someone else land a hit" cue for every other observer).
 */
export function RemotePlayers({ selfUserId, registryRef }: RemotePlayersProps) {
  const [peerIds, setPeerIds] = useState<string[]>([]);

  useEffect(() => {
    return subscribeToWorldRoster((onlineUserIds) => {
      const ids = [...onlineUserIds].filter((id) => id !== selfUserId);
      setPeerIds(ids);
    });
  }, [selfUserId]);

  return (
    <>
      {peerIds.map((id) => (
        <RemotePlayerAvatar key={id} userId={id} registryRef={registryRef} />
      ))}
    </>
  );
}

/** One peer's loadout never changes mid-session in practice (re-equipping
 * requires leaving the World), so it's fetched once on mount and cached
 * for the avatar's lifetime — never re-fetched per transform tick. */
function useRemoteLoadout(userId: string): RemoteLoadout | null {
  const [loadout, setLoadout] = useState<RemoteLoadout | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicLoadout(userId).then((res) => {
      if (cancelled) return;
      if (!res.success || !res.loadout) {
        debugWarn("World", "getPublicLoadout failed for peer", { userId, error: res.error });
        return;
      }
      setLoadout(res.loadout);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return loadout;
}

function RemotePlayerAvatar({
  userId,
  registryRef,
}: {
  userId: string;
  registryRef: RemotePlayerRegistry;
}) {
  const loadout = useRemoteLoadout(userId);
  const group = useRef<THREE.Group>(null);
  const limbs = useRef<CharacterLimbRefs>(null);
  // Mutable target, not React state — updated up to 10×/sec by the
  // broadcast subscription below, read every render frame by useFrame.
  // Same "ref for hot data, state for what actually needs a re-render"
  // split Player.tsx uses throughout.
  const target = useRef({ x: 0, z: 0, yaw: 0 });
  const velocity = useRef({ vx: 0, vz: 0 });
  const lastSyncTime = useRef(0);
  const prevSyncPos = useRef({ x: 0, z: 0 });
  const hasReceivedFirst = useRef(false);
  const walkClock = useRef(0);
  const walkAmplitude = useRef(0);
  const movingRef = useRef(false);
  const sprintingRef = useRef(false);
  const [bloodBursts, setBloodBursts] = useState<{ id: number }[]>([]);

  // Registers this avatar into the shared registry Player.tsx's melee scan
  // reads — and into the bargain, gives the scan a live `getPosition()`
  // that always reflects this exact lerped/rendered position, the same
  // "where the attacker visually sees them standing" value the PvP server
  // action validates against.
  useEffect(() => {
    const handle = { id: userId, getPosition: () => group.current?.position ?? new THREE.Vector3() };
    // Read/write `registryRef.current` directly on both ends, never via a
    // local variable captured once at mount — see components/world/
    // monster.tsx's matching comment (same registry pattern) for the
    // stale-array race this avoids: capturing the array once and filtering
    // that captured reference in the cleanup can silently overwrite
    // `.current` with a snapshot that predates another player's
    // mount/unmount, dropping a currently-present remote player out of
    // the registry entirely.
    registryRef.current.push(handle);
    return () => {
      registryRef.current = registryRef.current.filter((h) => h !== handle);
    };
  }, [userId, registryRef]);

  useEffect(() => {
    return subscribeToWorldPvpDamage((payload) => {
      if (payload.targetUserId !== userId) return;
      const id = ++pvpBloodBurstSeq;
      setBloodBursts((curr) => [...curr, { id }]);
      setTimeout(() => setBloodBursts((curr) => curr.filter((b) => b.id !== id)), BLOOD_BURST_LIFETIME_MS);
    });
  }, [userId]);

  useEffect(() => {
    return subscribeToWorldTransforms((payload) => {
      if (payload.id !== userId) return;

      const now = performance.now();
      if (!hasReceivedFirst.current) {
        hasReceivedFirst.current = true;
        target.current = { x: payload.x, z: payload.z, yaw: payload.yaw };
        prevSyncPos.current = { x: payload.x, z: payload.z };
        lastSyncTime.current = now;
        velocity.current = { vx: 0, vz: 0 };
        const g = group.current;
        if (g) {
          g.position.set(payload.x, 0, payload.z);
          g.rotation.y = payload.yaw;
        }
      } else {
        const dtSec = Math.max(0.05, (now - lastSyncTime.current) / 1000);
        if (payload.moving) {
          // Derive velocity (units/sec) from position delta between syncs.
          velocity.current.vx = (payload.x - prevSyncPos.current.x) / dtSec;
          velocity.current.vz = (payload.z - prevSyncPos.current.z) / dtSec;
        } else {
          // Peer stopped — zero out so we don't overshoot into a wall.
          velocity.current = { vx: 0, vz: 0 };
        }
        prevSyncPos.current = { x: payload.x, z: payload.z };
        lastSyncTime.current = now;
        target.current = { x: payload.x, z: payload.z, yaw: payload.yaw };
      }

      movingRef.current = payload.moving;
      sprintingRef.current = payload.sprinting;
    });
  }, [userId]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g || !hasReceivedFirst.current) return;

    // Dead-reckoning: extrapolate ahead by how long it's been since the last
    // sync (capped at DR_MAX_LOOKAHEAD so a late packet can't fling the avatar
    // far off course). When the peer is standing still velocity is zero so the
    // predicted position equals the authoritative one — no drift.
    const timeSinceSync = Math.min((performance.now() - lastSyncTime.current) / 1000, DR_MAX_LOOKAHEAD);
    const predX = target.current.x + velocity.current.vx * timeSinceSync;
    const predZ = target.current.z + velocity.current.vz * timeSinceSync;

    g.position.x = THREE.MathUtils.lerp(g.position.x, predX, Math.min(1, delta * POSITION_LERP_RATE));
    g.position.z = THREE.MathUtils.lerp(g.position.z, predZ, Math.min(1, delta * POSITION_LERP_RATE));
    g.rotation.y += angleDelta(g.rotation.y, target.current.yaw) * Math.min(1, delta * HEADING_TURN_RATE);

    // Cosmetic walk-cycle driven by the peer's own reported moving/sprinting
    // flags (not by locally inferring it from position deltas, which at a
    // 10Hz feed would lag a full sample behind and visibly stutter) — same
    // sine-swing shape Player.tsx uses for the local body, just without any
    // of the jump/attack pose blending this avatar never needs since it has
    // no local combat yet (Phase 1 is visuals-only).
    walkClock.current += delta * (sprintingRef.current ? 12.5 : 8);
    walkAmplitude.current = THREE.MathUtils.lerp(
      walkAmplitude.current,
      movingRef.current ? 1 : 0,
      Math.min(1, delta * 6)
    );
    const swing = Math.sin(walkClock.current) * walkAmplitude.current * (sprintingRef.current ? 0.68 : 0.5);
    const l = limbs.current;
    if (l) {
      if (l.legL.current) l.legL.current.rotation.x = swing;
      if (l.legR.current) l.legR.current.rotation.x = -swing;
      if (l.armL.current) l.armL.current.rotation.x = -swing;
      if (l.armR.current) l.armR.current.rotation.x = swing;
    }
  });

  const equippedByCategory = useMemo(() => loadout?.equippedByCategory ?? {}, [loadout]);

  if (!loadout) return null;

  return (
    <group ref={group} position={[0, 0, 0]}>
      <CharacterModel
        ref={limbs}
        equippedByCategory={equippedByCategory}
        gender={loadout.gender}
        name={loadout.username}
      />
      {bloodBursts.map((b) => (
        <group key={b.id} position={[0, 1.1, 0]}>
          <BloodBurst />
        </group>
      ))}
    </group>
  );
}
