"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Monster, MONSTER_DEATH_CLEANUP_MS } from "@/components/world/monster";
import type { CombatSharedState, MonsterRegistry } from "@/components/world/combat-types";
import {
  pickWeightedMonsterType,
  MAX_ALIVE_MONSTERS,
  SPAWN_INTERVAL_MIN_SEC,
  SPAWN_INTERVAL_MAX_SEC,
  SPAWN_SAFE_RADIUS,
  type MonsterTypeConfig,
} from "@/lib/monsters";
import { streakMobScale, type KillStreakConfig } from "@/lib/kill-streak";
import { WORLD_RADIUS } from "@/lib/world-config";

interface MonsterSpawn {
  id: string;
  type: MonsterTypeConfig;
  position: [number, number, number];
}

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
}: MonstersFieldProps) {
  const [spawns, setSpawns] = useState<MonsterSpawn[]>([]);
  const spawnTimer = useRef(SPAWN_INTERVAL_MIN_SEC);

  useFrame((_, delta) => {
    spawnTimer.current -= delta;
    if (spawnTimer.current > 0) return;
    spawnTimer.current =
      SPAWN_INTERVAL_MIN_SEC + Math.random() * (SPAWN_INTERVAL_MAX_SEC - SPAWN_INTERVAL_MIN_SEC);

    setSpawns((curr) => {
      if (curr.length >= MAX_ALIVE_MONSTERS) return curr;
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
        />
      ))}
    </>
  );
}
