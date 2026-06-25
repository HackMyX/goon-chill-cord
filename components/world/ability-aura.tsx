"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type AbilityEffectType = "world_damage_boost" | "world_hp_regen" | "world_xp_boost" | string | null;

interface AbilityEffectAuraProps {
  effectType: AbilityEffectType;
}

/** 3D ability aura rendered as a sibling of CharacterModel inside the R3F scene.
 * Uses only simple geometries + MeshBasicMaterial so it's perf-safe on mobile.
 * All animations run in useFrame (zero React re-renders per tick). */
export function AbilityEffectAura({ effectType }: AbilityEffectAuraProps) {
  if (!effectType) return null;
  if (effectType === "world_damage_boost") return <DamageBoostAura />;
  if (effectType === "world_hp_regen") return <HpRegenAura />;
  if (effectType === "world_xp_boost") return <XpBoostAura />;
  return null;
}

// ─── Damage Boost — blazing red/orange rings ──────────────────────────────────

function DamageBoostAura() {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const discRef = useRef<THREE.Mesh>(null);
  const spike1Ref = useRef<THREE.Mesh>(null);
  const spike2Ref = useRef<THREE.Mesh>(null);
  const spike3Ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (outerRef.current) {
      outerRef.current.rotation.y = t * 2.2;
      const p = 0.85 + Math.sin(t * 3.5) * 0.15;
      outerRef.current.scale.setScalar(p);
      (outerRef.current.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(t * 4) * 0.2;
    }
    if (innerRef.current) {
      innerRef.current.rotation.y = -t * 1.7;
      const p = 0.9 + Math.sin(t * 2.8 + 1.2) * 0.1;
      innerRef.current.scale.setScalar(p);
    }
    if (discRef.current) {
      (discRef.current.material as THREE.MeshBasicMaterial).opacity = 0.07 + Math.sin(t * 4) * 0.04;
    }

    const spikes = [spike1Ref, spike2Ref, spike3Ref];
    spikes.forEach((ref, i) => {
      if (!ref.current) return;
      const phase = t * 2.5 + (i * Math.PI * 2) / 3;
      const r = 0.55 + Math.sin(t * 3 + i) * 0.1;
      ref.current.position.set(Math.cos(phase) * r, 0.15 + Math.sin(t * 4 + i) * 0.12, Math.sin(phase) * r);
      ref.current.rotation.y = phase + Math.PI / 2;
      (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 5 + i) * 0.3;
    });
  });

  return (
    <group position={[0, 0.02, 0]}>
      {/* Ground glow disc */}
      <mesh ref={discRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.85, 36]} />
        <meshBasicMaterial color="#ff2200" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      {/* Outer rotating ring */}
      <mesh ref={outerRef} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.76, 0.042, 8, 72]} />
        <meshBasicMaterial color="#ff3300" transparent opacity={0.85} />
      </mesh>
      {/* Inner counter-rotating ring */}
      <mesh ref={innerRef} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.52, 0.028, 8, 56]} />
        <meshBasicMaterial color="#ff8800" transparent opacity={0.7} />
      </mesh>
      {/* Floating ember spikes */}
      <mesh ref={spike1Ref}>
        <tetrahedronGeometry args={[0.055]} />
        <meshBasicMaterial color="#ff6600" transparent opacity={0.8} />
      </mesh>
      <mesh ref={spike2Ref}>
        <tetrahedronGeometry args={[0.045]} />
        <meshBasicMaterial color="#ff4400" transparent opacity={0.8} />
      </mesh>
      <mesh ref={spike3Ref}>
        <tetrahedronGeometry args={[0.06]} />
        <meshBasicMaterial color="#ffaa00" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

// ─── HP Regen — healing green orbs ───────────────────────────────────────────

function HpRegenAura() {
  const orb0 = useRef<THREE.Mesh>(null);
  const orb1 = useRef<THREE.Mesh>(null);
  const orb2 = useRef<THREE.Mesh>(null);
  const trail0 = useRef<THREE.Mesh>(null);
  const trail1 = useRef<THREE.Mesh>(null);
  const trail2 = useRef<THREE.Mesh>(null);
  const discRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const RADIUS = 0.62;
    const SPEED = 1.1;

    const orbs = [orb0, orb1, orb2];
    const trails = [trail0, trail1, trail2];
    orbs.forEach((ref, i) => {
      if (!ref.current) return;
      const phase = t * SPEED + (i * Math.PI * 2) / 3;
      const height = 0.8 + i * 0.25 + Math.sin(t * 2.2 + i * 1.3) * 0.18;
      ref.current.position.set(Math.cos(phase) * RADIUS, height, Math.sin(phase) * RADIUS);
      (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(t * 3 + i) * 0.2;
    });
    trails.forEach((ref, i) => {
      if (!ref.current) return;
      const phase = t * SPEED + (i * Math.PI * 2) / 3 - 0.35;
      const height = 0.75 + i * 0.25 + Math.sin(t * 2.2 + i * 1.3 - 0.35) * 0.18;
      ref.current.position.set(Math.cos(phase) * RADIUS * 0.9, height, Math.sin(phase) * RADIUS * 0.9);
      (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 3 + i) * 0.15;
    });
    if (discRef.current) {
      (discRef.current.material as THREE.MeshBasicMaterial).opacity = 0.06 + Math.sin(t * 2) * 0.03;
    }
  });

  return (
    <group>
      {/* Ground glow */}
      <mesh ref={discRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.72, 36]} />
        <meshBasicMaterial color="#00ff66" transparent opacity={0.07} depthWrite={false} />
      </mesh>
      {/* Main orbs */}
      <mesh ref={orb0}><sphereGeometry args={[0.072, 10, 10]} /><meshBasicMaterial color="#00ff88" transparent opacity={0.9} /></mesh>
      <mesh ref={orb1}><sphereGeometry args={[0.066, 10, 10]} /><meshBasicMaterial color="#44ffaa" transparent opacity={0.9} /></mesh>
      <mesh ref={orb2}><sphereGeometry args={[0.076, 10, 10]} /><meshBasicMaterial color="#00ffcc" transparent opacity={0.9} /></mesh>
      {/* Trail ghosts */}
      <mesh ref={trail0}><sphereGeometry args={[0.048, 8, 8]} /><meshBasicMaterial color="#00ff88" transparent opacity={0.35} /></mesh>
      <mesh ref={trail1}><sphereGeometry args={[0.044, 8, 8]} /><meshBasicMaterial color="#44ffaa" transparent opacity={0.35} /></mesh>
      <mesh ref={trail2}><sphereGeometry args={[0.052, 8, 8]} /><meshBasicMaterial color="#00ffcc" transparent opacity={0.35} /></mesh>
    </group>
  );
}

// ─── XP Boost — golden spinning stars ────────────────────────────────────────

function XpBoostAura() {
  const star0 = useRef<THREE.Mesh>(null);
  const star1 = useRef<THREE.Mesh>(null);
  const star2 = useRef<THREE.Mesh>(null);
  const star3 = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const RADIUS = 0.58;
    const SPEED = 1.6;

    const stars = [star0, star1, star2, star3];
    stars.forEach((ref, i) => {
      if (!ref.current) return;
      const phase = t * SPEED + (i * Math.PI * 2) / 4;
      const height = 1.1 + (i % 2) * 0.3 + Math.sin(t * 2.8 + i * 1.5) * 0.22;
      ref.current.position.set(Math.cos(phase) * RADIUS, height, Math.sin(phase) * RADIUS);
      ref.current.rotation.y = t * 4 + i;
      ref.current.rotation.x = t * 2 + i;
      (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 5 + i) * 0.35;
    });

    if (ringRef.current) {
      ringRef.current.rotation.y = t * 0.9;
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 3) * 0.2;
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.y = -t * 1.4;
      (innerRingRef.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 3.5 + 1) * 0.15;
    }
  });

  return (
    <group>
      {/* Spinning gold stars (octahedra) */}
      <mesh ref={star0}><octahedronGeometry args={[0.062]} /><meshBasicMaterial color="#ffcc00" transparent opacity={0.8} /></mesh>
      <mesh ref={star1}><octahedronGeometry args={[0.052]} /><meshBasicMaterial color="#ffaa00" transparent opacity={0.8} /></mesh>
      <mesh ref={star2}><octahedronGeometry args={[0.068]} /><meshBasicMaterial color="#ffe033" transparent opacity={0.8} /></mesh>
      <mesh ref={star3}><octahedronGeometry args={[0.048]} /><meshBasicMaterial color="#ffdd00" transparent opacity={0.8} /></mesh>
      {/* Outer ring on ground */}
      <mesh ref={ringRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.68, 0.032, 8, 64]} />
        <meshBasicMaterial color="#ffcc00" transparent opacity={0.6} />
      </mesh>
      {/* Inner counter-ring */}
      <mesh ref={innerRingRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.46, 0.022, 8, 48]} />
        <meshBasicMaterial color="#ffee88" transparent opacity={0.45} />
      </mesh>
    </group>
  );
}
