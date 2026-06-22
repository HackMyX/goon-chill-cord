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
