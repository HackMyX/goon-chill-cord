"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Monster,
  MONSTER_DEATH_CLEANUP_MS,
  ThrownProjectile,
  PROJECTILE_SPEED,
  type ThrowRequest,
} from "@/components/world/monster";
import { RemoteMonster } from "@/components/world/remote-monster";
import type { CombatSharedState, MonsterRegistry } from "@/components/world/combat-types";
import {
  pickWeightedMonsterType,
  type MonsterTypeConfig,
} from "@/lib/monsters";
import type { WorldSpawnConfig } from "@/lib/world-spawn-config";
import { streakMobScale, type KillStreakConfig } from "@/lib/kill-streak";
import type { CharacterConfig } from "@/lib/character-config";
import { WORLD_RADIUS } from "@/lib/world-config";
import {
  subscribeToWorldRoster,
  subscribeToMonsterSync,
  subscribeToMonsterHit,
  subscribeToMonsterKill,
  broadcastMonsterSync,
  broadcastMonsterKill,
  type MonsterSyncPayload,
} from "@/lib/world-realtime";

interface MonsterSpawn {
  id: string;
  type: MonsterTypeConfig;
  position: [number, number, number];
}

interface LiveProjectile extends ThrowRequest {
  id: number;
}

let projectileSeq = 0;

interface MonstersFieldProps {
  userId: string;
  monsterTypes: MonsterTypeConfig[];
  combatRef: React.RefObject<CombatSharedState>;
  registryRef: MonsterRegistry;
  killStreakConfig: KillStreakConfig;
  /** Read fresh at spawn time (not subscribed to) — a monster's stats are
   * fixed for its lifetime once spawned, only *new* spawns reflect however
   * long the streak has run by the time they appear. */
  streakKillCount: number;
  onMonsterKilled: (typeId: string) => void;
  characterConfig: CharacterConfig;
  spawnConfig: WorldSpawnConfig;
}

let spawnSeq = 0;

function randomSpawnPosition(spawnSafeRadius: number): [number, number, number] {
  const angle = Math.random() * Math.PI * 2;
  const radius = spawnSafeRadius + Math.random() * (WORLD_RADIUS - spawnSafeRadius - 6);
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
}

/**
 * Owns the spawn timer and the (small, infrequent — only changes on
 * spawn/despawn) list of currently-present monsters. Each `<Monster>`
 * manages its own AI/health/animation imperatively; this component's job
 * is purely "decide when a new one should appear, and stop rendering one
 * once its death animation has finished".
 *
 * Also handles cross-player monster sync: broadcasts own monster positions
 * and health at ~4Hz, receives remote snapshots and renders ghost versions,
 * processes incoming hit events for own monsters, and routes kill-streak
 * rewards to the correct player (attacker, not owner) on cross-player kills.
 */
export function MonstersField({
  userId,
  monsterTypes,
  combatRef,
  registryRef,
  killStreakConfig,
  streakKillCount,
  onMonsterKilled,
  characterConfig,
  spawnConfig,
}: MonstersFieldProps) {
  const [spawns, setSpawns] = useState<MonsterSpawn[]>([]);
  // Owned here, not by each Monster — see monster.tsx's onThrow doc
  // comment: this field has no position/scale transform of its own
  // (unlike each <Monster>, which is positioned+scaled per spawn), so it's
  // the right place to render projectiles in real world-space coordinates.
  const [projectiles, setProjectiles] = useState<LiveProjectile[]>([]);
  // Remote monsters keyed by ownerId — each owner's entry is replaced on
  // every monster_sync broadcast from that player.
  const [remoteMonsters, setRemoteMonsters] = useState<Map<string, MonsterSyncPayload["monsters"]>>(new Map());

  const spawnTimer = useRef(spawnConfig.spawnIntervalMinSec);
  // Live room population (lib/world-realtime.ts), always >= 1 (yourself) —
  // read in a ref, not React state, since useFrame below reads it every
  // tick and a roster sync re-rendering this whole field would be wasted
  // work. See lib/monsters.ts' monstersAliveCapForPlayers/
  // spawnIntervalScaleForPlayers doc comments for why a busier room means
  // *this client's own* spawn pool grows, not a shared one.
  const playerCount = useRef(1);
  // Ref mirror of spawns so the sync interval (a setInterval, not useFrame)
  // can always read the live list without being in the dependency array and
  // forcing a new interval on every spawn/despawn.
  const spawnsRef = useRef<MonsterSpawn[]>([]);
  // Tracks which remote attacker last hit a given own monster id — used to
  // route kill-streak credit to the correct player when a remote hit is
  // the killing blow.
  const lastRemoteHitterRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    spawnsRef.current = spawns;
  }, [spawns]);

  // Roster: track player count + remove remote monsters for players who left.
  useEffect(() => {
    return subscribeToWorldRoster((onlineUserIds) => {
      playerCount.current = Math.max(1, onlineUserIds.size);
      setRemoteMonsters((prev) => {
        let changed = false;
        const updated = new Map(prev);
        for (const ownerId of updated.keys()) {
          if (!onlineUserIds.has(ownerId)) {
            updated.delete(ownerId);
            changed = true;
          }
        }
        return changed ? updated : prev;
      });
    });
  }, []);

  // Broadcast own monster pool at ~8Hz so other players can render smooth movement.
  useEffect(() => {
    const intervalId = setInterval(() => {
      const ownIds = new Set(spawnsRef.current.map((s) => s.id));
      const snapshot = spawnsRef.current
        .map((s) => {
          // Only look up handles that belong to this player's own spawns.
          const h = registryRef.current.find((h) => h.id === s.id && ownIds.has(h.id));
          if (!h) return null;
          const pos = h.getPosition();
          return {
            id: s.id,
            typeId: s.type.id,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            hp: h.getHp(),
            maxHp: s.type.health,
            alive: h.isAlive(),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      broadcastMonsterSync({ ownerId: userId, monsters: snapshot });
    }, 125);
    return () => clearInterval(intervalId);
  }, [userId, registryRef]);

  // Receive remote players' monster snapshots.
  useEffect(() => {
    return subscribeToMonsterSync((payload) => {
      // self: false on the channel means we never receive our own broadcast,
      // but guard anyway.
      if (payload.ownerId === userId) return;
      setRemoteMonsters((prev) => {
        const updated = new Map(prev);
        updated.set(payload.ownerId, payload.monsters.filter((m) => m.alive));
        return updated;
      });
    });
  }, [userId]);

  // Apply incoming hits from other players on our own monsters.
  useEffect(() => {
    return subscribeToMonsterHit((payload) => {
      if (payload.ownerId !== userId) return;
      const handle = registryRef.current.find((h) => h.id === payload.monsterId);
      if (!handle || !handle.isAlive()) return;
      // Track last remote hitter for kill attribution before applying damage.
      lastRemoteHitterRef.current.set(payload.monsterId, payload.attackerId);
      handle.takeDamage(payload.amount);
    });
  }, [userId, registryRef]);

  // Award kill-streak reward to local player if they are the credited killer.
  useEffect(() => {
    return subscribeToMonsterKill((payload) => {
      if (payload.killerId !== userId) return;
      onMonsterKilled(payload.typeId);
    });
  }, [userId, onMonsterKilled]);

  useFrame((_, delta) => {
    // Monsters/spawning are *not* paused or cleared while the player is
    // dead — the World keeps running normally in the background (an
    // earlier version despawned everything on death, which wasn't what
    // was actually wanted: the player's own character is what falls over
    // and disappears on death — components/world/player.tsx's death-pose
    // animation — not the rest of the world around it). Monster.tsx's own
    // `combatRef.current.dead` check still stops monsters from chasing/
    // attacking a dead, no-longer-present player; that's the only
    // death-related behavior this field needs to care about, and it
    // already lives entirely in Monster.tsx.
    spawnTimer.current -= delta;
    if (spawnTimer.current > 0) return;
    const extra = Math.max(0, playerCount.current - 1);
    const intervalScale = Math.max(
      spawnConfig.spawnIntervalFloor,
      Math.pow(0.85, extra)
    );
    spawnTimer.current =
      (spawnConfig.spawnIntervalMinSec +
        Math.random() * (spawnConfig.spawnIntervalMaxSec - spawnConfig.spawnIntervalMinSec)) *
      intervalScale;
    const aliveCap = Math.min(
      spawnConfig.aliveCapMax,
      spawnConfig.maxAliveMonsters + extra * spawnConfig.aliveCapPerExtraPlayer
    );

    setSpawns((curr) => {
      if (curr.length >= aliveCap) return curr;
      const type = pickWeightedMonsterType(monsterTypes);
      if (!type) return curr;
      const scale = streakMobScale(streakKillCount, killStreakConfig);
      // A fresh object, never mutating the shared `type` config other
      // spawns/the admin panel still read — only this one spawn's copy
      // gets the streak-scaled numbers.
      const scaledType: MonsterTypeConfig =
        scale === 1
          ? type
          : {
              ...type,
              health: Math.round(type.health * scale),
              attackDamage: Math.round(type.attackDamage * scale),
            };
      // Namespace the spawn id with the first 8 chars of userId to avoid id
      // collisions with remote monsters that also use sequential counters.
      return [...curr, { id: `${userId.slice(0, 8)}_m${++spawnSeq}`, type: scaledType, position: randomSpawnPosition(spawnConfig.spawnSafeRadius) }];
    });
  });

  function handleDied(spawnId: string, typeId: string) {
    const remoteKillerId = lastRemoteHitterRef.current.get(spawnId) ?? null;
    lastRemoteHitterRef.current.delete(spawnId);

    if (remoteKillerId !== null && remoteKillerId !== userId) {
      // Remote player landed the killing blow — broadcast the kill so they
      // receive the streak reward rather than us.
      broadcastMonsterKill({ ownerId: userId, monsterId: spawnId, typeId, killerId: remoteKillerId });
    } else {
      // Local player's kill.
      onMonsterKilled(typeId);
    }

    setTimeout(() => {
      setSpawns((curr) => curr.filter((s) => s.id !== spawnId));
    }, MONSTER_DEATH_CLEANUP_MS);
  }

  function handleThrow(request: ThrowRequest) {
    const throwId = ++projectileSeq;
    setProjectiles((curr) => [...curr, { ...request, id: throwId }]);
    const [ox, oy, oz] = request.origin;
    const [tx, ty, tz] = request.target;
    const travelMs = (Math.hypot(tx - ox, ty - oy, tz - oz) / PROJECTILE_SPEED) * 1000 + 100;
    setTimeout(() => setProjectiles((curr) => curr.filter((p) => p.id !== throwId)), travelMs);
  }

  // Build a flat list of all remote monsters for rendering, enriched with
  // their MonsterTypeConfig (looked up by typeId from the monsterTypes prop).
  const remoteMonsterList = Array.from(remoteMonsters.entries()).flatMap(([ownerId, monsters]) =>
    monsters.map((m) => ({ ...m, ownerId }))
  );

  return (
    <>
      {spawns.map((s) => (
        <Monster
          key={s.id}
          id={s.id}
          type={s.type}
          initialPosition={s.position}
          combatRef={combatRef}
          registryRef={registryRef}
          onDied={(typeId) => handleDied(s.id, typeId)}
          onThrow={handleThrow}
          characterConfig={characterConfig}
        />
      ))}
      {projectiles.map((p) => (
        <ThrownProjectile
          key={p.id}
          origin={p.origin}
          target={p.target}
          damage={p.damage}
          color={p.color}
          combatRef={combatRef}
        />
      ))}
      {remoteMonsterList.map((m) => {
        const type = monsterTypes.find((t) => t.id === m.typeId);
        if (!type) return null;
        return (
          <RemoteMonster
            key={`${m.ownerId}_${m.id}`}
            ownerId={m.ownerId}
            localUserId={userId}
            id={m.id}
            type={type}
            x={m.x}
            y={m.y}
            z={m.z}
            hp={m.hp}
            maxHp={m.maxHp}
            registryRef={registryRef}
            characterConfig={characterConfig}
          />
        );
      })}
    </>
  );
}
