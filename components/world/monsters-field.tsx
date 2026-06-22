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
import type { CombatSharedState, MonsterRegistry } from "@/components/world/combat-types";
import {
  pickWeightedMonsterType,
  monstersAliveCapForPlayers,
  spawnIntervalScaleForPlayers,
  SPAWN_INTERVAL_MIN_SEC,
  SPAWN_INTERVAL_MAX_SEC,
  SPAWN_SAFE_RADIUS,
  type MonsterTypeConfig,
} from "@/lib/monsters";
import { streakMobScale, type KillStreakConfig } from "@/lib/kill-streak";
import type { CharacterConfig } from "@/lib/character-config";
import { WORLD_RADIUS } from "@/lib/world-config";
import { subscribeToWorldRoster } from "@/lib/world-realtime";

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
}

let spawnSeq = 0;

function randomSpawnPosition(): [number, number, number] {
  const angle = Math.random() * Math.PI * 2;
  const radius = SPAWN_SAFE_RADIUS + Math.random() * (WORLD_RADIUS - SPAWN_SAFE_RADIUS - 6);
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
}

/**
 * Owns the spawn timer and the (small, infrequent — only changes on
 * spawn/despawn) list of currently-present monsters. Each `<Monster>`
 * manages its own AI/health/animation imperatively; this component's job
 * is purely "decide when a new one should appear, and stop rendering one
 * once its death animation has finished".
 */
export function MonstersField({
  monsterTypes,
  combatRef,
  registryRef,
  killStreakConfig,
  streakKillCount,
  onMonsterKilled,
  characterConfig,
}: MonstersFieldProps) {
  const [spawns, setSpawns] = useState<MonsterSpawn[]>([]);
  // Owned here, not by each Monster — see monster.tsx's onThrow doc
  // comment: this field has no position/scale transform of its own
  // (unlike each <Monster>, which is positioned+scaled per spawn), so it's
  // the right place to render projectiles in real world-space coordinates.
  const [projectiles, setProjectiles] = useState<LiveProjectile[]>([]);
  const spawnTimer = useRef(SPAWN_INTERVAL_MIN_SEC);
  // Live room population (lib/world-realtime.ts), always >= 1 (yourself) —
  // read in a ref, not React state, since useFrame below reads it every
  // tick and a roster sync re-rendering this whole field would be wasted
  // work. See lib/monsters.ts' monstersAliveCapForPlayers/
  // spawnIntervalScaleForPlayers doc comments for why a busier room means
  // *this client's own* spawn pool grows, not a shared one.
  const playerCount = useRef(1);

  useEffect(() => {
    return subscribeToWorldRoster((onlineUserIds) => {
      playerCount.current = Math.max(1, onlineUserIds.size);
    });
  }, []);

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
    const intervalScale = spawnIntervalScaleForPlayers(playerCount.current);
    spawnTimer.current =
      (SPAWN_INTERVAL_MIN_SEC + Math.random() * (SPAWN_INTERVAL_MAX_SEC - SPAWN_INTERVAL_MIN_SEC)) *
      intervalScale;

    setSpawns((curr) => {
      if (curr.length >= monstersAliveCapForPlayers(playerCount.current)) return curr;
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
      return [...curr, { id: `m${++spawnSeq}`, type: scaledType, position: randomSpawnPosition() }];
    });
  });

  function handleDied(spawnId: string, typeId: string) {
    onMonsterKilled(typeId);
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
    </>
  );
}
