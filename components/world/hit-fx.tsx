"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 7;
const PARTICLE_INDICES = Array.from({ length: PARTICLE_COUNT }, (_, i) => i);

/** One-shot outward-flying particle burst on a melee hit. */
export const BLOOD_BURST_LIFETIME_MS = 500;

export function BloodBurst() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const velocities = useRef<{ x: number; y: number; z: number }[]>(
    PARTICLE_INDICES.map(() => ({ x: 0, y: 0, z: 0 }))
  );
  const age = useRef(0);

  useEffect(() => {
    velocities.current = PARTICLE_INDICES.map(() => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 1.4;
      return {
        x: Math.cos(angle) * speed,
        y: 1.4 + Math.random() * 1.6,
        z: Math.sin(angle) * speed,
      };
    });
  }, []);

  useFrame((_, delta) => {
    age.current += delta;
    const lifetimeSec = BLOOD_BURST_LIFETIME_MS / 1000;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const v = velocities.current[i];
      m.position.x += v.x * delta;
      m.position.z += v.z * delta;
      m.position.y += (v.y - age.current * 9) * delta;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - age.current / lifetimeSec);
    }
  });

  return (
    <group>
      {PARTICLE_INDICES.map((i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }}>
          <sphereGeometry args={[0.045, 5, 5]} />
          <meshBasicMaterial color="#8b1a1a" transparent opacity={1} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * One-shot weapon-swing arc trail — uses flat `ringGeometry` (2D arc) NOT
 * `torusGeometry` (3D tube). The flat arc is oriented face-on in the direction
 * the weapon swings, reads as a real slash trail (like the mark a blade leaves
 * through the air), not a floating sausage ring.
 *
 * Two concentric ring layers:
 *   · Outer glow  — wider arc, soft hue, low opacity
 *   · Core arc    — thin, full-brightness weapon-rarity color
 *
 * The `hit` prop makes the effect larger and brighter when the swing connects.
 * Color is the equipped weapon's rarity color (off-white for bare fists).
 */
export const SLASH_EFFECT_LIFETIME_MS = 230;

export function SlashEffect({ color, hit = false }: { color: string; hit?: boolean }) {
  const groupRef  = useRef<THREE.Group>(null);
  const matGlow   = useRef<THREE.MeshBasicMaterial>(null);
  const matCore   = useRef<THREE.MeshBasicMaterial>(null);
  const age       = useRef(0);

  useFrame((_, delta) => {
    age.current += delta;
    const g = groupRef.current;
    if (!g) return;

    const T = SLASH_EFFECT_LIFETIME_MS / 1000;
    const t = Math.min(1, age.current / T);

    // Scale: sharp pop-in over first 30 % of lifetime (ease-out curve).
    // Hit swings reach a larger peak so the player feels the connect.
    const popT  = Math.min(1, t / 0.30);
    const peak  = hit ? 1.40 : 1.05;
    const scale = 0.30 + Math.sin(popT * Math.PI * 0.5) * peak;
    g.scale.setScalar(Math.max(0.30, scale));

    // Arc sweep: rotates from start to end angle over first 55 % of lifetime.
    // Sweep range matches the original torus sweep so the motion feels right.
    g.rotation.z = THREE.MathUtils.lerp(-1.30, 0.60, Math.min(1, t / 0.55));

    // Opacity: instant full brightness → hold until 30 % → decay to 0.
    const HOLD = 0.30;
    const fade = t < HOLD ? 1.0 : Math.max(0, 1.0 - (t - HOLD) / (1.0 - HOLD));

    if (matGlow.current) matGlow.current.opacity = fade * (hit ? 0.44 : 0.24);
    if (matCore.current) matCore.current.opacity = Math.min(1, fade * (hit ? 1.10 : 0.92));
  });

  return (
    // Initial angle: positions the arc at its start orientation.
    // The useFrame sweep above then rotates it to the end angle.
    <group ref={groupRef} rotation={[0, 0, -1.30]}>

      {/* Outer glow — wider ring arc, very transparent, softens edges */}
      <mesh>
        <ringGeometry args={[0.33, 0.72, 44, 1, 0, Math.PI * 0.82]} />
        <meshBasicMaterial
          ref={matGlow}
          color={color}
          transparent
          opacity={0.24}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Core slash arc — thin, fully opaque, the sharp "edge" of the swing */}
      <mesh position={[0, 0, 0.004]}>
        <ringGeometry args={[0.44, 0.61, 44, 1, 0, Math.PI * 0.76]} />
        <meshBasicMaterial
          ref={matCore}
          color={color}
          transparent
          opacity={0.92}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

    </group>
  );
}
