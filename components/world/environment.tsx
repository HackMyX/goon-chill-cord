"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_RADIUS } from "@/lib/world-config";
import { DEFAULT_WORLD_ENVIRONMENT, type WorldEnvironmentConfig } from "@/lib/world-environment-config";
import type { Obstacle } from "@/lib/world-obstacles";

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
      <mesh position={[0, 0.28, 0]} rotation={[0.3, 0.6, 0.2]}>
        <dodecahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color="#5b6066" emissive="#1a241c" emissiveIntensity={0.25} flatShading />
      </mesh>
      <mesh position={[0.45, 0.16, 0.2]} rotation={[0.5, 1.1, 0.3]}>
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
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.95, 0.24, 0.95]} />
        <meshStandardMaterial color="#3c4048" emissive="#241a3a" emissiveIntensity={0.2} />
      </mesh>
      {/* column shaft */}
      <mesh position={[0, 0.24 + h / 2, 0]}>
        <cylinderGeometry args={[0.32, 0.38, h, 10]} />
        <meshStandardMaterial color="#54585f" emissive="#2a1d4a" emissiveIntensity={0.22} />
      </mesh>
      {/* broken cap, slightly tilted */}
      <mesh position={[0.08, 0.24 + h + 0.1, 0.05]} rotation={[0.18, 0.4, 0.12]}>
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
const FIREFLY_COLORS = ["#fde68a", "#a855f7", "#22d3ee", "#86efac"];

/** Schwebende, langsam treibende & funkelnde Glühpartikel in der Luft —
 * füllt den Himmelsraum mit Leben und ist sofort von überall sichtbar. */
function Fireflies({ count }: { count: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const bases = useMemo(() => {
    const rand = mulberry32(20240);
    const reach = WORLD_RADIUS - 5;
    return Array.from({ length: count }, () => ({
      x: (rand() - 0.5) * 2 * reach,
      y: 0.6 + rand() * 5.5,
      z: (rand() - 0.5) * 2 * reach,
      phase: rand() * Math.PI * 2,
      speed: 0.25 + rand() * 0.7,
      amp: 0.3 + rand() * 1.0,
      color: FIREFLY_COLORS[Math.floor(rand() * FIREFLY_COLORS.length)],
    }));
  }, [count]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      const b = bases[i];
      if (!m || !b) continue;
      m.position.x = b.x + Math.sin(t * b.speed + b.phase) * b.amp;
      m.position.y = b.y + Math.sin(t * b.speed * 0.7 + b.phase) * b.amp * 0.7;
      m.position.z = b.z + Math.cos(t * b.speed * 0.8 + b.phase) * b.amp;
      m.scale.setScalar(0.55 + 0.45 * Math.sin(t * 2.2 + b.phase)); // funkeln
    }
  });

  return (
    <group>
      {bases.map((b, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} position={[b.x, b.y, b.z]}>
          <sphereGeometry args={[0.07, 6, 6]} />
          <meshBasicMaterial color={b.color} transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Leuchtendes Monument direkt im Blickfeld des Spawns (Spieler schaut anfangs
 * Richtung −z) — Obelisk + orbitierende Kristall-Shards + rotierender Runen-
 * Kreis am Boden. Das „Wahrzeichen" der Welt. */
function CentralMonument() {
  const ringRef = useRef<THREE.Group>(null);
  const shardsRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef.current) ringRef.current.rotation.z = t * 0.18;
    if (shardsRef.current) shardsRef.current.rotation.y = t * 0.5;
  });
  return (
    <group position={[0, 0, -9]}>
      <mesh position={[0, 2.6, 0]}>
        <coneGeometry args={[0.75, 5.0, 6]} />
        <meshStandardMaterial color="#3b1e6d" emissive="#a855f7" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[1.1, 1.35, 0.8, 8]} />
        <meshStandardMaterial color="#1c1330" emissive="#7c3aed" emissiveIntensity={0.45} />
      </mesh>
      <pointLight position={[0, 3.2, 0]} color="#a855f7" intensity={24} distance={24} decay={2} />
      <group ref={shardsRef} position={[0, 2.8, 0]}>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 1.7, Math.sin(i) * 0.5, Math.sin(a) * 1.7]} rotation={[0.5, a, 0.3]}>
              <octahedronGeometry args={[0.24, 0]} />
              <meshStandardMaterial color="#c084fc" emissive="#c084fc" emissiveIntensity={1.3} />
            </mesh>
          );
        })}
      </group>
      <group ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <mesh>
          <ringGeometry args={[2.5, 2.8, 48]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.55} toneMapped={false} side={2} />
        </mesh>
        <mesh>
          <ringGeometry args={[1.7, 1.8, 6]} />
          <meshBasicMaterial color="#c084fc" transparent opacity={0.45} toneMapped={false} side={2} />
        </mesh>
      </group>
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
export function Environment({
  env = DEFAULT_WORLD_ENVIRONMENT,
  obstacles = [],
}: {
  env?: WorldEnvironmentConfig;
  /** Kollidierbare Strukturen (Bäume/Felsen/Ruinen/Monument) — gemeinsame
   * Quelle mit der Physik (lib/world-obstacles.ts). */
  obstacles?: Obstacle[];
}) {
  const dens = (base: number, mul: number) => Math.max(0, Math.round(base * mul));
  const grassCount = dens(110, env.grassDensity);
  const mushroomCount = dens(46, env.mushroomDensity);
  const fireflyCount = dens(80, env.fireflyDensity);
  // Bäume/Felsen/Ruinen kommen aus der geteilten Hindernis-Liste (= Kollision).
  const trees = useMemo(() => obstacles.filter((o) => o.kind === "tree"), [obstacles]);
  const rocks = useMemo(() => obstacles.filter((o) => o.kind === "rock"), [obstacles]);
  const ruins = useMemo(() => obstacles.filter((o) => o.kind === "ruin"), [obstacles]);

  const grassTufts = useMemo(() => {
    const rand = mulberry32(4242);
    const outerRadius = WORLD_RADIUS - 4;
    return Array.from({ length: grassCount }, () => {
      const angle = rand() * Math.PI * 2;
      const radius = 2 + rand() * (outerRadius - 2);
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
    });
  }, [grassCount]);

  const mushrooms = useMemo(() => {
    const rand = mulberry32(5150);
    const outerRadius = WORLD_RADIUS - 5;
    return Array.from({ length: mushroomCount }, () => {
      const angle = rand() * Math.PI * 2;
      const radius = 4 + rand() * (outerRadius - 4);
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
        <PineTree key={i} x={t.x} z={t.z} scale={t.scale} hue={t.hue ?? 0} />
      ))}
      {grassTufts.map((g, i) => (
        <GrassTuft key={i} x={g.x} z={g.z} />
      ))}
      {rocks.map((r, i) => (
        <Rock key={i} x={r.x} z={r.z} scale={r.scale} rot={r.rot ?? 0} />
      ))}
      {ruins.map((r, i) => (
        <RuinPillar key={i} x={r.x} z={r.z} scale={r.scale} rot={r.rot ?? 0} h={r.h ?? 1.5} />
      ))}
      {mushrooms.map((m, i) => (
        <GlowMushroom key={i} x={m.x} z={m.z} scale={m.scale} color={m.color} />
      ))}
      {borderCrystals.map((c, i) => (
        <BorderCrystal key={i} x={c.x} z={c.z} scale={c.scale} />
      ))}
      {fireflyCount > 0 && <Fireflies count={fireflyCount} />}
      {env.monument && <CentralMonument />}
    </>
  );
}
