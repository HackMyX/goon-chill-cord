"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import type { MonsterTypeConfig } from "@/lib/monsters";
import type { CombatSharedState, MonsterHandle, MonsterRegistry } from "@/components/world/combat-types";
import { BloodBurst, BLOOD_BURST_LIFETIME_MS } from "@/components/world/hit-fx";
import { applyIncomingDamage } from "@/lib/combat";

interface MonsterProps {
  id: string;
  type: MonsterTypeConfig;
  initialPosition: [number, number, number];
  combatRef: React.RefObject<CombatSharedState>;
  registryRef: MonsterRegistry;
  onDied: (typeId: string) => void;
}

let popupSeq = 0;
let bloodBurstSeq = 0;
const DEATH_SINK_DURATION = 1.1;
/** How far past full-health-bar-fade the death sink animation has to run
 * before MonstersField actually unmounts this component — long enough for
 * the sink+fade below to finish, not so long the corpse blocks a new
 * spawn for no reason. */
export const MONSTER_DEATH_CLEANUP_MS = 1300;

function FloatingDamageNumber({ amount }: { amount: number }) {
  const ref = useRef<THREE.Group>(null);
  const age = useRef(0);
  useFrame((_, delta) => {
    age.current += delta;
    const g = ref.current;
    if (!g) return;
    g.position.y = 0.4 + age.current * 0.9;
    const mat = (g.children[0] as unknown as { material?: THREE.Material & { opacity: number } })?.material;
    if (mat) mat.opacity = Math.max(0, 1 - age.current / 0.7);
  });
  return (
    <Billboard ref={ref} position={[0, 0.4, 0]}>
      <Text fontSize={0.32} color="#fca5a5" outlineWidth={0.02} outlineColor="#3f0a0a">
        -{amount}
      </Text>
    </Billboard>
  );
}

/**
 * One spawned enemy — chases + melees the player when in range, shows a
 * floating health bar and damage-number popups, and plays a sink-and-fade
 * death animation before MonstersField unmounts it. AI/visuals are driven
 * entirely by `useFrame` refs (zero React re-renders per frame); the only
 * React state here is the rare, small "which damage numbers are currently
 * floating" list.
 *
 * Registers an imperative MonsterHandle into `registryRef` on mount so
 * Player.tsx's attack scan can find and damage it without any prop
 * drilling back the other way — see components/world/combat-types.ts.
 */
export function Monster({ id, type, initialPosition, combatRef, registryRef, onDied }: MonsterProps) {
  const group = useRef<THREE.Group>(null);
  const upperBody = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const healthFill = useRef<THREE.Mesh>(null);
  const healthGroup = useRef<THREE.Group>(null);

  const health = useRef(type.health);
  const alive = useRef(true);
  // Randomized in the mount effect below, not here — `Math.random()` is an
  // impure call and React Compiler flags impure calls made during render;
  // these only ever need *some* unsynchronized starting phase so every
  // spawned monster doesn't attack/sway in lockstep, so "set once after
  // mount" is just as good as "set at construction".
  const attackCooldownLeft = useRef(0);
  const lunge = useRef(0);
  const walkClock = useRef(0);
  const deathT = useRef(0);
  const hitGlow = useRef(0);
  const torsoMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const [popups, setPopups] = useState<{ id: number; amount: number }[]>([]);
  const [bloodBursts, setBloodBursts] = useState<{ id: number }[]>([]);

  useEffect(() => {
    attackCooldownLeft.current = Math.random() * type.attackCooldown;
    walkClock.current = Math.random() * 10;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only randomized once on mount
  }, []);

  useEffect(() => {
    const handle: MonsterHandle = {
      id,
      typeId: type.id,
      getPosition: () => group.current?.position ?? new THREE.Vector3(...initialPosition),
      isAlive: () => alive.current,
      takeDamage: (amount) => {
        if (!alive.current) return 0;
        health.current = Math.max(0, health.current - amount);
        hitGlow.current = 1;
        const popupId = ++popupSeq;
        setPopups((curr) => [...curr, { id: popupId, amount }]);
        setTimeout(() => setPopups((curr) => curr.filter((p) => p.id !== popupId)), 700);
        const burstId = ++bloodBurstSeq;
        setBloodBursts((curr) => [...curr, { id: burstId }]);
        setTimeout(
          () => setBloodBursts((curr) => curr.filter((b) => b.id !== burstId)),
          BLOOD_BURST_LIFETIME_MS
        );
        if (health.current <= 0) {
          alive.current = false;
          onDied(type.id);
        }
        return amount;
      },
    };
    const registry = registryRef.current;
    registry.push(handle);
    return () => {
      registryRef.current = registry.filter((h) => h !== handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handle captures stable refs only, never needs to re-register
  }, []);

  const limbWidth = type.visualKind === "skeleton" ? 0.16 : 0.22;
  const slouch = type.visualKind === "zombie" ? 0.22 : 0;
  const eyeColor = type.visualKind === "skeleton" ? "#7dd3fc" : "#fca5a5";

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;

    if (!alive.current) {
      deathT.current += delta;
      g.position.y = initialPosition[1] - Math.min(0.9, deathT.current * 0.9);
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, Math.PI / 2.2, Math.min(1, deathT.current * 2));
      g.scale.setScalar(Math.max(0.05, 1 - deathT.current / (DEATH_SINK_DURATION * 1.4)));
      if (healthGroup.current) healthGroup.current.visible = false;
      return;
    }

    const playerPos = combatRef.current.playerPos;
    const dx = playerPos.x - g.position.x;
    const dz = playerPos.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    const moving = dist < type.aggroRange && dist > type.attackRange * 0.7;

    if (moving) {
      const dirX = dx / dist;
      const dirZ = dz / dist;
      g.position.x += dirX * type.moveSpeed * delta;
      g.position.z += dirZ * type.moveSpeed * delta;
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, Math.atan2(dirX, dirZ), Math.min(1, delta * 6));
    }

    attackCooldownLeft.current -= delta;
    if (dist < type.attackRange && attackCooldownLeft.current <= 0) {
      attackCooldownLeft.current = type.attackCooldown;
      lunge.current = 1;
      // applyIncomingDamage itself no-ops while invulnerable, and also
      // handles armor reduction + shield absorption — see lib/combat.ts.
      applyIncomingDamage(combatRef.current, type.attackDamage);
    }
    lunge.current = Math.max(0, lunge.current - delta * 3.5);
    hitGlow.current = Math.max(0, hitGlow.current - delta * 4);
    // Hit-flash: a quick white-hot emissive pulse on the torso material,
    // decaying with hitGlow over ~0.25s — this ref/value pair already
    // existed (set to 1 on takeDamage, decayed every frame) but was never
    // actually applied to anything, so a landed hit had no visual
    // confirmation beyond the floating damage number and health bar.
    if (torsoMaterial.current) {
      torsoMaterial.current.emissive.setRGB(1, 0.25, 0.25);
      torsoMaterial.current.emissiveIntensity = hitGlow.current * 1.4;
    }

    walkClock.current += delta * (moving ? 6.5 : 1.2);
    const swing = moving ? Math.sin(walkClock.current) * 0.45 : Math.sin(walkClock.current) * 0.06;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.8 - lunge.current * 0.5;
    if (armR.current) armR.current.rotation.x = swing * 0.8 - lunge.current * 1.7;
    if (upperBody.current) upperBody.current.rotation.x = slouch + lunge.current * 0.25;

    if (healthFill.current) {
      const frac = Math.max(0, health.current / type.health);
      healthFill.current.scale.x = Math.max(0.001, frac);
      healthFill.current.position.x = -(1 - frac) * 0.5;
      const mat = healthFill.current.material as THREE.MeshBasicMaterial;
      mat.color.set(frac > 0.5 ? "#4ade80" : frac > 0.2 ? "#facc15" : "#f87171");
    }
  });

  return (
    <group ref={group} position={initialPosition} scale={type.scale}>
      <group ref={upperBody} position={[0, 1.1, 0]}>
        <mesh position={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[0.5, 0.7, 0.3]} />
          <meshStandardMaterial ref={torsoMaterial} color={type.colorHex} />
        </mesh>
        <mesh position={[0, 0.95, 0]} castShadow>
          <boxGeometry args={[0.34, 0.34, 0.34]} />
          <meshStandardMaterial color={type.colorHex} />
        </mesh>
        <mesh position={[-0.07, 0.97, 0.18]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
        <mesh position={[0.07, 0.97, 0.18]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} toneMapped={false} />
        </mesh>

        <group ref={armL} position={[-0.32, 0.65, 0]}>
          <mesh position={[0, -0.32, 0]} castShadow>
            <boxGeometry args={[limbWidth, 0.62, limbWidth]} />
            <meshStandardMaterial color={type.colorHex} />
          </mesh>
        </group>
        <group ref={armR} position={[0.32, 0.65, 0]}>
          <mesh position={[0, -0.32, 0]} castShadow>
            <boxGeometry args={[limbWidth, 0.62, limbWidth]} />
            <meshStandardMaterial color={type.colorHex} />
          </mesh>
        </group>
      </group>

      <group ref={legL} position={[-0.15, 0.85, 0]}>
        <mesh position={[0, -0.42, 0]} castShadow>
          <boxGeometry args={[limbWidth + 0.02, 0.85, limbWidth + 0.02]} />
          <meshStandardMaterial color={type.colorHex} />
        </mesh>
      </group>
      <group ref={legR} position={[0.15, 0.85, 0]}>
        <mesh position={[0, -0.42, 0]} castShadow>
          <boxGeometry args={[limbWidth + 0.02, 0.85, limbWidth + 0.02]} />
          <meshStandardMaterial color={type.colorHex} />
        </mesh>
      </group>

      <Billboard ref={healthGroup} position={[0, 2.35, 0]}>
        <mesh>
          <planeGeometry args={[1, 0.12]} />
          <meshBasicMaterial color="#1a1a1a" transparent opacity={0.85} />
        </mesh>
        <mesh ref={healthFill} position={[0, 0, 0.001]}>
          <planeGeometry args={[1, 0.1]} />
          <meshBasicMaterial color="#4ade80" toneMapped={false} />
        </mesh>
        <Text position={[0, 0.22, 0]} fontSize={0.16} color="#e5e7eb" outlineWidth={0.015} outlineColor="#000">
          {type.name}
        </Text>
      </Billboard>

      {popups.map((p) => (
        <FloatingDamageNumber key={p.id} amount={p.amount} />
      ))}

      {bloodBursts.map((b) => (
        <group key={b.id} position={[0, 1.1, 0]}>
          <BloodBurst />
        </group>
      ))}
    </group>
  );
}
