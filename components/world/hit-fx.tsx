"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 7;
// Stable, render-safe array purely for JSX's `.map()` key/structure —
// PARTICLE_COUNT is a constant, so this never needs to be random or even
// recomputed; the actual per-particle randomness lives in `velocities`
// below, assigned in a mount effect rather than during render (see its
// comment for why).
const PARTICLE_INDICES = Array.from({ length: PARTICLE_COUNT }, (_, i) => i);

/** One-shot outward-flying particle burst — the visual landing-confirmation
 * for a melee hit (small dark-red flecks that pop out from the hit point
 * and arc/fade under a second), mounted by the hit target itself
 * (components/world/monster.tsx) into a short-lived state list and removed
 * after `BLOOD_BURST_LIFETIME_MS` — the exact same "spawn into a list,
 * setTimeout removes it" idiom that file already uses for its floating
 * damage numbers, just for this second kind of one-shot popup. */
export const BLOOD_BURST_LIFETIME_MS = 500;

export function BloodBurst() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  // Random per-particle outward velocity — `Math.random()` is impure, so it
  // can't run during render (React Compiler's purity rule); populated once
  // in a mount effect instead, same as monster.tsx randomizing its own
  // attack-cooldown phase in a `useEffect` rather than at the ref's
  // declaration. Every burst still gets a slightly different scatter,
  // just assigned a tick after mount instead of synchronously — invisible
  // at 60fps for a one-shot effect like this.
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
      // Simple gravity-arced fling: constant horizontal drift, vertical
      // velocity decays under a fixed "gravity" so each fleck visibly
      // arcs and falls rather than flying in a dead-straight line.
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
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.045, 5, 5]} />
          <meshBasicMaterial color="#8b1a1a" transparent opacity={1} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** One-shot glowing arc — the weapon-swing "punch" Player.tsx mounts once
 * per attack (into a short-lived state list, same idiom as this file's own
 * BloodBurst above), positioned just in front of the player's swinging
 * arm. A plain rotation.x arm-raise alone read as "the arm just flies up",
 * with nothing to actually sell the hit as a *swing* through space — this
 * sweeps a crescent across the same arc the arm travels and fades out
 * immediately after, the same "slash trail" read action games use to make
 * a melee hit feel like it has real mass behind it. `color` is the
 * equipped weapon's own rarity color (falls back to a plain
 * off-white for bare fists), so a rarer weapon's swing visibly reads as
 * rarer too, not just hits harder. */
export const SLASH_EFFECT_LIFETIME_MS = 220;

export function SlashEffect({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const age = useRef(0);

  useFrame((_, delta) => {
    age.current += delta;
    const m = ref.current;
    if (!m) return;
    const lifetimeSec = SLASH_EFFECT_LIFETIME_MS / 1000;
    const t = Math.min(1, age.current / lifetimeSec);
    // Sweeps across the first ~55% of its life (matching the arm's own
    // fast-out swing timing in player.tsx), then just holds/fades — the
    // visual trail a real blade leaves hanging in the air a beat after
    // the swing itself has already passed through. Scale punches out past
    // 1 before settling (a quick "pop", not a flat linear grow) for more
    // visible impact.
    m.rotation.z = THREE.MathUtils.lerp(-1.3, 0.65, Math.min(1, t / 0.55));
    const pop = Math.sin(Math.min(1, t / 0.4) * Math.PI * 0.5);
    m.scale.setScalar(0.85 + pop * 0.55);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 1 - t);
  });

  return (
    <mesh ref={ref} rotation={[0, 0, -1.3]}>
      <torusGeometry args={[0.55, 0.06, 8, 24, Math.PI * 0.95]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.95}
        toneMapped={false}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
