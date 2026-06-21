"use client";

import { useMemo } from "react";
import { WORLD_RADIUS } from "@/lib/world-config";

const TRUNK_COLOR = "#3b2a1d";
const FOLIAGE_COLORS = ["#143d2b", "#1d4a35", "#225a3d"];

function PineTree({ x, z, scale, hue }: { x: number; z: number; scale: number; hue: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 1.2, 8]} />
        <meshStandardMaterial color={TRUNK_COLOR} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <coneGeometry args={[0.85, 1.4, 8]} />
        <meshStandardMaterial color={FOLIAGE_COLORS[hue]} />
      </mesh>
      <mesh position={[0, 2.3, 0]}>
        <coneGeometry args={[0.6, 1.1, 8]} />
        <meshStandardMaterial color={FOLIAGE_COLORS[hue]} />
      </mesh>
      <mesh position={[0, 2.9, 0]}>
        <coneGeometry args={[0.38, 0.85, 8]} />
        <meshStandardMaterial color={FOLIAGE_COLORS[hue]} />
      </mesh>
    </group>
  );
}

function GrassTuft({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 0.4, -0.4, 0.8, -0.8].map((offset, i) => (
        <mesh key={i} position={[offset * 0.3, 0.1, offset * 0.2]} rotation={[0, offset, 0.15]}>
          <coneGeometry args={[0.05, 0.22, 5]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#2f6b3f" : "#3a8050"} />
        </mesh>
      ))}
    </group>
  );
}

/** Glowing crystal pillars ringing the world border — the visual half of
 * the boundary (player.tsx's circular position clamp is the physical
 * half). Lets the edge of the world read as "a place", not an invisible
 * wall you just bump into with no explanation. */
function BorderCrystal({ x, z, scale }: { x: number; z: number; scale: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.9, 0]}>
        <coneGeometry args={[0.3, 1.8, 6]} />
        <meshStandardMaterial color="#3b1e6d" emissive="#a855f7" emissiveIntensity={0.55} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.4, 0.45, 0.3, 8]} />
        <meshStandardMaterial color="#1c1330" />
      </mesh>
    </group>
  );
}

/** Mulberry32 — tiny, deterministic, seedable PRNG. Math.random() at
 * render time would make every tree/grass tuft jump to a new spot on every
 * re-render (equipping an item, etc. all re-render this tree); seeding a
 * PRNG once inside useMemo gives the same "random-looking" scatter every
 * time without that jumpiness, and without hand-placing 100+ coordinates. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scenery scaled to the world's actual size (lib/world-config.ts) instead
 * of a fixed handful of hand-placed spots meant for a much smaller test
 * area — trees and grass now scatter across the full playable radius (clear
 * of the spawn circle), and a ring of glowing crystals marks the border. */
export function Environment() {
  const trees = useMemo(() => {
    const rand = mulberry32(1337);
    const innerRadius = 11;
    const outerRadius = WORLD_RADIUS - 6;
    return Array.from({ length: 70 }, () => {
      const angle = rand() * Math.PI * 2;
      const radius = innerRadius + rand() * (outerRadius - innerRadius);
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        scale: 0.8 + rand() * 0.7,
        hue: Math.floor(rand() * FOLIAGE_COLORS.length),
      };
    });
  }, []);

  const grassTufts = useMemo(() => {
    const rand = mulberry32(4242);
    const outerRadius = WORLD_RADIUS - 4;
    return Array.from({ length: 90 }, () => {
      const angle = rand() * Math.PI * 2;
      const radius = 2 + rand() * (outerRadius - 2);
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
    });
  }, []);

  const borderCrystals = useMemo(() => {
    const count = 28;
    const rand = mulberry32(99);
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      return {
        x: Math.cos(angle) * (WORLD_RADIUS - 1.5),
        z: Math.sin(angle) * (WORLD_RADIUS - 1.5),
        scale: 0.9 + rand() * 0.6,
      };
    });
  }, []);

  return (
    <>
      {trees.map((t, i) => (
        <PineTree key={i} x={t.x} z={t.z} scale={t.scale} hue={t.hue} />
      ))}
      {grassTufts.map((g, i) => (
        <GrassTuft key={i} x={g.x} z={g.z} />
      ))}
      {borderCrystals.map((c, i) => (
        <BorderCrystal key={i} x={c.x} z={c.z} scale={c.scale} />
      ))}
    </>
  );
}
