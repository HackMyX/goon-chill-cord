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
        <mesh
          key={i}
          ref={(el) => { refs.current[i] = el; }}
        >
          <sphereGeometry args={[0.045, 5, 5]} />
          <meshBasicMaterial color="#8b1a1a" transparent opacity={1} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * One-shot diagonal slash trail — shown once per swing.
 * Replaced the old torus ring with 3 stacked planes in a diagonal "slash" orientation
 * so the effect reads as a real weapon swing, not a floating circle.
 * Color is the equipped weapon's rarity color (off-white for bare fists).
 * The `hit` prop triggers a more dramatic scale/glow when the swing connects.
 */
export const SLASH_EFFECT_LIFETIME_MS = 240;

export function SlashEffect({ color, hit = false }: { color: string; hit?: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  // Individual material refs for each layer so opacity is updated without React state.
  const matCore = useRef<THREE.MeshBasicMaterial>(null);
  const matMid  = useRef<THREE.MeshBasicMaterial>(null);
  const matGlow = useRef<THREE.MeshBasicMaterial>(null);
  const matLine = useRef<THREE.MeshBasicMaterial>(null);
  const age = useRef(0);

  useFrame((_, delta) => {
    age.current += delta;
    const g = groupRef.current;
    if (!g) return;
    const t = Math.min(1, age.current / (SLASH_EFFECT_LIFETIME_MS / 1000));

    // Quick pop-in using an eased curve, then hold slightly, then vanish
    const popT = Math.min(1, t / 0.30);
    const pop = Math.sin(popT * Math.PI * 0.5); // ease-out ramp to 1
    const maxScale = hit ? 1.55 : 1.15;
    g.scale.setScalar(0.25 + pop * maxScale);

    // Sweep the slash slightly as it fades — reads as genuine motion, not a static decal
    g.rotation.z = THREE.MathUtils.lerp(-1.05, -0.35, Math.min(1, t / 0.65));

    const fade = Math.max(0, 1 - t);
    const hitBoost = hit ? 1.25 : 1.0;
    if (matCore.current) matCore.current.opacity = Math.min(1, fade * 0.95 * hitBoost);
    if (matMid.current)  matMid.current.opacity  = Math.min(1, fade * 0.60 * hitBoost);
    if (matGlow.current) matGlow.current.opacity = Math.min(1, fade * 0.20 * hitBoost);
    if (matLine.current) matLine.current.opacity = Math.min(1, fade * 0.80 * hitBoost);
  });

  return (
    // Initial rotation sets the diagonal angle; useFrame sweeps it further
    <group ref={groupRef} rotation={[0, 0, -1.05]}>
      {/* Soft glow halo behind the slash — wide, very transparent */}
      <mesh>
        <planeGeometry args={[1.85, 0.55]} />
        <meshBasicMaterial
          ref={matGlow}
          color={color}
          transparent
          opacity={0.20}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Mid layer — slightly narrower, medium opacity */}
      <mesh position={[0, 0, 0.004]}>
        <planeGeometry args={[1.45, 0.10]} />
        <meshBasicMaterial
          ref={matMid}
          color={color}
          transparent
          opacity={0.60}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Core slash — bright thin line, the sharpest part */}
      <mesh position={[0, 0, 0.008]}>
        <planeGeometry args={[1.55, 0.055]} />
        <meshBasicMaterial
          ref={matCore}
          color={color}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Second offset slash — angled slightly differently for depth */}
      <mesh position={[0.06, 0.16, 0.006]} rotation={[0, 0, 0.22]}>
        <planeGeometry args={[0.85, 0.048]} />
        <meshBasicMaterial
          ref={matLine}
          color={color}
          transparent
          opacity={0.80}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
