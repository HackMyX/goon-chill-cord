"use client";

import { useMemo } from "react";
import { WORLD_RADIUS } from "@/lib/world-config";
import { DEFAULT_WORLD_ENVIRONMENT, type WorldEnvironmentConfig } from "@/lib/world-environment-config";

const TRUNK_COLOR = "#2e2015";
const FOLIAGE_COLORS = ["#0e3322", "#163d2a", "#1a4a32"];
const FOLIAGE_EMISSIVES = ["#0a1f14", "#0e2a1c", "#102214"];

function PineTree({ x, z, scale, hue }: { x: number; z: number; scale: number; hue: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 1.2, 8]} />
        <meshStandardMaterial color={TRUNK_COLOR} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <coneGeometry args={[0.85, 1.4, 8]} />
        <meshStandardMaterial color={FOLIAGE_COLORS[hue]} emissive={FOLIAGE_EMISSIVES[hue]} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 2.3, 0]}>
        <coneGeometry args={[0.6, 1.1, 8]} />
        <meshStandardMaterial color={FOLIAGE_COLORS[hue]} emissive={FOLIAGE_EMISSIVES[hue]} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 2.9, 0]}>
        <coneGeometry args={[0.38, 0.85, 8]} />
        <meshStandardMaterial color={FOLIAGE_COLORS[hue]} emissive={FOLIAGE_EMISSIVES[hue]} emissiveIntensity={0.4} />
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
      {/* Main crystal spike */}
      <mesh position={[0, 0.9, 0]}>
        <coneGeometry args={[0.3, 1.8, 6]} />
        <meshStandardMaterial color="#3b1e6d" emissive="#a855f7" emissiveIntensity={1.3} />
      </mesh>
      {/* Smaller secondary crystal beside it for silhouette interest */}
      <mesh position={[0.25, 0.5, 0.1]} rotation={[0, 0.4, 0.3]}>
        <coneGeometry args={[0.12, 0.95, 5]} />
        <meshStandardMaterial color="#2a1350" emissive="#c084fc" emissiveIntensity={1.0} />
      </mesh>
      {/* Base plinth */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.4, 0.45, 0.3, 8]} />
        <meshStandardMaterial color="#1c1330" emissive="#7c3aed" emissiveIntensity={0.3} />
      </mesh>
      {/* Glow orb at ground level — bleeds light onto nearby grass */}
      <mesh position={[0, 0.08, 0]}>
        <sphereGeometry args={[0.22, 8, 8]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.18} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Angular grey boulder — a couple of overlapping low-poly rocks with a faint
 * mossy emissive so they read in the moody lighting. */
function Rock({ x, z, scale, rot }: { x: number; z: number; scale: number; rot: number }) {
  return (
    <group position={[x, 0, z]} scale={scale} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.28, 0]} rotation={[0.3, 0.6, 0.2]} castShadow>
        <dodecahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color="#5b6066" emissive="#1a241c" emissiveIntensity={0.25} flatShading />
      </mesh>
      <mesh position={[0.45, 0.16, 0.2]} rotation={[0.5, 1.1, 0.3]} castShadow>
        <dodecahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#4d5258" emissive="#16201a" emissiveIntensity={0.25} flatShading />
      </mesh>
    </group>
  );
}

/** Broken ancient stone pillar — gives the map "ruins/structures" feel.
 * Cracked column on a base block, with faint purple rune-glow. */
function RuinPillar({ x, z, scale, rot, h }: { x: number; z: number; scale: number; rot: number; h: number }) {
  return (
    <group position={[x, 0, z]} scale={scale} rotation={[0, rot, 0]}>
      {/* base block */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[0.95, 0.24, 0.95]} />
        <meshStandardMaterial color="#3c4048" emissive="#241a3a" emissiveIntensity={0.2} />
      </mesh>
      {/* column shaft */}
      <mesh position={[0, 0.24 + h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.38, h, 10]} />
        <meshStandardMaterial color="#54585f" emissive="#2a1d4a" emissiveIntensity={0.22} />
      </mesh>
      {/* broken cap, slightly tilted */}
      <mesh position={[0.08, 0.24 + h + 0.1, 0.05]} rotation={[0.18, 0.4, 0.12]} castShadow>
        <cylinderGeometry args={[0.36, 0.3, 0.28, 10]} />
        <meshStandardMaterial color="#4a4e55" emissive="#2a1d4a" emissiveIntensity={0.22} />
      </mesh>
      {/* glowing rune band */}
      <mesh position={[0, 0.24 + h * 0.55, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.08, 12, 1, true]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.5} toneMapped={false} side={2} />
      </mesh>
    </group>
  );
}

/** Glowing mushroom — atmospheric ground accent, emissive cap. */
function GlowMushroom({ x, z, scale, color }: { x: number; z: number; scale: number; color: string }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.05, 0.08, 0.36, 6]} />
        <meshStandardMaterial color="#d9c7b8" />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.18, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      {/* soft ground glow */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.35, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} toneMapped={false} />
      </mesh>
    </group>
  );
}

const MUSHROOM_COLORS = ["#22d3ee", "#a855f7", "#34d399", "#f472b6"];

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
 * of the spawn circle), and a ring of glowing crystals marks the border.
 *
 * Trees/crystals used to be tagged `userData.collidable` for a per-frame
 * camera-collision raycast (use-camera-controls.ts) that pulled the camera
 * in front of whichever one it would otherwise clip through — removed
 * (see that file's doc comment) because grazing one of the 70 trees
 * scattered across nearly the whole map was a constant, not occasional,
 * occurrence in normal play, and reads as the camera continuously zooming
 * in and out while walking. No scenery here needs tagging for anything
 * anymore. */
export function Environment({ env = DEFAULT_WORLD_ENVIRONMENT }: { env?: WorldEnvironmentConfig }) {
  const dens = (base: number, mul: number) => Math.max(0, Math.round(base * mul));
  const treeCount = dens(70, env.treeDensity);
  const grassCount = dens(90, env.grassDensity);
  const rockCount = dens(40, env.rockDensity);
  const ruinCount = dens(12, env.ruinDensity);
  const mushroomCount = dens(30, env.mushroomDensity);

  const trees = useMemo(() => {
    const rand = mulberry32(1337);
    const innerRadius = 11;
    const outerRadius = WORLD_RADIUS - 6;
    return Array.from({ length: treeCount }, () => {
      const angle = rand() * Math.PI * 2;
      const radius = innerRadius + rand() * (outerRadius - innerRadius);
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        scale: 0.8 + rand() * 0.7,
        hue: Math.floor(rand() * FOLIAGE_COLORS.length),
      };
    });
  }, [treeCount]);

  const grassTufts = useMemo(() => {
    const rand = mulberry32(4242);
    const outerRadius = WORLD_RADIUS - 4;
    return Array.from({ length: grassCount }, () => {
      const angle = rand() * Math.PI * 2;
      const radius = 2 + rand() * (outerRadius - 2);
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
    });
  }, [grassCount]);

  const rocks = useMemo(() => {
    const rand = mulberry32(7654);
    const outerRadius = WORLD_RADIUS - 6;
    return Array.from({ length: rockCount }, () => {
      const angle = rand() * Math.PI * 2;
      const radius = 9 + rand() * (outerRadius - 9);
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        scale: 0.55 + rand() * 0.9,
        rot: rand() * Math.PI * 2,
      };
    });
  }, [rockCount]);

  // Ruins clustered in a few spots (statt gleichmäßig verteilt) → wirkt wie
  // verfallene Bauwerke/Plätze, nicht wie Deko-Streuung.
  const ruins = useMemo(() => {
    const rand = mulberry32(31337);
    const clusters = Math.max(1, Math.ceil(ruinCount / 4));
    const out: { x: number; z: number; scale: number; rot: number; h: number }[] = [];
    for (let cl = 0; cl < clusters && out.length < ruinCount; cl++) {
      const ca = rand() * Math.PI * 2;
      const cr = 16 + rand() * (WORLD_RADIUS - 22);
      const cx = Math.cos(ca) * cr;
      const cz = Math.sin(ca) * cr;
      const per = Math.min(4, ruinCount - out.length);
      for (let i = 0; i < per; i++) {
        out.push({
          x: cx + (rand() - 0.5) * 4.5,
          z: cz + (rand() - 0.5) * 4.5,
          scale: 0.85 + rand() * 0.7,
          rot: rand() * Math.PI * 2,
          h: 1.1 + rand() * 1.6,
        });
      }
    }
    return out;
  }, [ruinCount]);

  const mushrooms = useMemo(() => {
    const rand = mulberry32(5150);
    const outerRadius = WORLD_RADIUS - 5;
    return Array.from({ length: mushroomCount }, () => {
      const angle = rand() * Math.PI * 2;
      const radius = 7 + rand() * (outerRadius - 7);
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        scale: 0.7 + rand() * 1.1,
        color: MUSHROOM_COLORS[Math.floor(rand() * MUSHROOM_COLORS.length)],
      };
    });
  }, [mushroomCount]);

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
      {rocks.map((r, i) => (
        <Rock key={i} x={r.x} z={r.z} scale={r.scale} rot={r.rot} />
      ))}
      {ruins.map((r, i) => (
        <RuinPillar key={i} x={r.x} z={r.z} scale={r.scale} rot={r.rot} h={r.h} />
      ))}
      {mushrooms.map((m, i) => (
        <GlowMushroom key={i} x={m.x} z={m.z} scale={m.scale} color={m.color} />
      ))}
      {borderCrystals.map((c, i) => (
        <BorderCrystal key={i} x={c.x} z={c.z} scale={c.scale} />
      ))}
    </>
  );
}
