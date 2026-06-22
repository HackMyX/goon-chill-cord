"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import type { MonsterTypeConfig } from "@/lib/monsters";
import type { MonsterHandle, MonsterRegistry } from "@/components/world/combat-types";
import type { CharacterConfig } from "@/lib/character-config";
import { broadcastMonsterHit } from "@/lib/world-realtime";

interface RemoteMonsterProps {
  ownerId: string;
  localUserId: string;
  id: string;
  type: MonsterTypeConfig;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  registryRef: MonsterRegistry;
  characterConfig: CharacterConfig;
}

/**
 * Ghost visual of another player's monster — rendered by MonstersField on
 * every client that isn't the owner. No AI loop (it never chases or attacks
 * the local player), but it IS registered in the local MonsterRegistry so
 * the local player can melee it. `takeDamage` broadcasts `monster_hit` to
 * the owner, who applies the real damage in their own simulation; the visual
 * HP bar updates on the next `monster_sync` snapshot (~250ms later).
 *
 * Slightly transparent so players can instantly distinguish remote monsters
 * from their own.
 */
export function RemoteMonster({
  ownerId,
  localUserId,
  id,
  type,
  x,
  y,
  z,
  hp,
  maxHp,
  registryRef,
  characterConfig,
}: RemoteMonsterProps) {
  const group = useRef<THREE.Group>(null);
  const healthFill = useRef<THREE.Mesh>(null);
  // Lerp target — updated via useEffect when sync arrives, animated in useFrame.
  const targetPos = useRef(new THREE.Vector3(x, y, z));
  // Keep hp/maxHp in refs so the registry handle closure always reads current values.
  const hpRef = useRef(hp);
  const maxHpRef = useRef(maxHp);

  useEffect(() => {
    targetPos.current.set(x, y, z);
  }, [x, y, z]);

  useEffect(() => {
    hpRef.current = hp;
    maxHpRef.current = maxHp;
  }, [hp, maxHp]);

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.position.lerp(targetPos.current, Math.min(1, delta * 8));

    if (healthFill.current) {
      const frac = maxHpRef.current > 0 ? Math.max(0, hpRef.current / maxHpRef.current) : 0;
      healthFill.current.scale.x = Math.max(0.001, frac);
      healthFill.current.position.x = -(1 - frac) * 0.5;
      const mat = healthFill.current.material as THREE.MeshBasicMaterial;
      mat.color.set(frac > 0.5 ? "#4ade80" : frac > 0.2 ? "#facc15" : "#f87171");
    }
  });

  useEffect(() => {
    const handle: MonsterHandle = {
      id,
      typeId: type.id,
      getPosition: () => group.current?.position ?? new THREE.Vector3(x, y, z),
      isAlive: () => true,
      getHp: () => hpRef.current,
      hitRadius: characterConfig.attackHitRadius * type.scale,
      takeDamage: (amount) => {
        broadcastMonsterHit({ attackerId: localUserId, ownerId, monsterId: id, amount });
        return amount;
      },
    };
    registryRef.current.push(handle);
    return () => {
      registryRef.current = registryRef.current.filter((h) => h !== handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable identifiers only; re-registration not needed on position/hp changes
  }, []);

  const isSlime = type.visualKind === "slime";
  const isGhost = type.visualKind === "ghost";
  const REMOTE_OPACITY = 0.65;

  return (
    <group ref={group} position={[x, y, z]} scale={type.scale}>
      {isSlime ? (
        <group position={[0, 0.42, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.42, 14, 10]} />
            <meshStandardMaterial
              color={type.colorHex}
              transparent
              opacity={REMOTE_OPACITY}
              roughness={0.2}
              emissive={type.colorHex}
              emissiveIntensity={0.1}
            />
          </mesh>
        </group>
      ) : (
        <>
          {/* Torso */}
          <mesh position={[0, 1.5, 0]} castShadow>
            <boxGeometry args={[0.5, 0.7, 0.3]} />
            <meshStandardMaterial
              color={type.colorHex}
              transparent
              opacity={isGhost ? REMOTE_OPACITY * 0.6 : REMOTE_OPACITY}
            />
          </mesh>
          {/* Head */}
          <mesh position={[0, 2.05, 0]} castShadow>
            <boxGeometry args={[0.34, 0.34, 0.34]} />
            <meshStandardMaterial
              color={type.colorHex}
              transparent
              opacity={isGhost ? REMOTE_OPACITY * 0.6 : REMOTE_OPACITY}
            />
          </mesh>
          {/* Arms */}
          <mesh position={[-0.32, 1.42, 0]} castShadow>
            <boxGeometry args={[0.2, 0.6, 0.2]} />
            <meshStandardMaterial color={type.colorHex} transparent opacity={REMOTE_OPACITY} />
          </mesh>
          <mesh position={[0.32, 1.42, 0]} castShadow>
            <boxGeometry args={[0.2, 0.6, 0.2]} />
            <meshStandardMaterial color={type.colorHex} transparent opacity={REMOTE_OPACITY} />
          </mesh>
          {/* Legs (not for ghost) */}
          {!isGhost && (
            <>
              <mesh position={[-0.15, 0.85, 0]} castShadow>
                <boxGeometry args={[0.22, 0.85, 0.22]} />
                <meshStandardMaterial color={type.colorHex} transparent opacity={REMOTE_OPACITY} />
              </mesh>
              <mesh position={[0.15, 0.85, 0]} castShadow>
                <boxGeometry args={[0.22, 0.85, 0.22]} />
                <meshStandardMaterial color={type.colorHex} transparent opacity={REMOTE_OPACITY} />
              </mesh>
            </>
          )}
          {isGhost && (
            <mesh position={[0, 0.5, 0]}>
              <coneGeometry args={[0.4, 1.05, 14]} />
              <meshStandardMaterial
                color={type.colorHex}
                transparent
                opacity={0.25}
                emissive={type.colorHex}
                emissiveIntensity={0.2}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </>
      )}

      {/* Health bar + name — purple name tint marks it as a remote monster */}
      <Billboard position={[0, isSlime ? 1.15 : 2.55, 0]}>
        <mesh>
          <planeGeometry args={[1, 0.12]} />
          <meshBasicMaterial color="#1a1a1a" transparent opacity={0.85} />
        </mesh>
        <mesh ref={healthFill} position={[0, 0, 0.001]}>
          <planeGeometry args={[1, 0.1]} />
          <meshBasicMaterial color="#4ade80" toneMapped={false} />
        </mesh>
        <Text position={[0, 0.22, 0]} fontSize={0.16} color="#c084fc" outlineWidth={0.015} outlineColor="#000">
          {type.name}
        </Text>
      </Billboard>
    </group>
  );
}
