"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WORLD_RADIUS } from "@/lib/world-config";
import { DEFAULT_WORLD_ENVIRONMENT, type WorldEnvironmentConfig } from "@/lib/world-environment-config";
import type { Obstacle } from "@/lib/world-obstacles";
import type { CombatSharedState } from "@/components/world/combat-types";

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

const STONE_TONES = ["#4b4842", "#524d44", "#45433d", "#565049", "#403e38"];

/** Hauswand: verwitterter Stein (Farbe variiert je Position) + zerbröckelte
 * Oberkante; hohe (heile) Wände bekommen ein warm glühendes Fenster. */
function RuinWall({ o }: { o: Obstacle }) {
  const hx = o.hx ?? 0.22;
  const hz = o.hz ?? 0.22;
  const h = o.h ?? 2;
  const tone = STONE_TONES[Math.abs(Math.round(o.x * 7 + o.z * 13)) % STONE_TONES.length];
  const alongX = hx > hz;
  const tall = h > 2.3;
  const long = (o.len ?? 0) > 1.7;
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[hx * 2, h, hz * 2]} />
        <meshStandardMaterial color={tone} emissive="#140d08" emissiveIntensity={0.16} roughness={0.97} />
      </mesh>
      {/* zerbröckelte Oberkante */}
      <mesh position={[0, h, 0]} castShadow>
        <boxGeometry args={[hx * 2 * 0.72, 0.14, hz * 2 * 0.72]} />
        <meshStandardMaterial color="#39372f" roughness={1} flatShading />
      </mesh>
      {tall && long && (
        <mesh position={[0, h * 0.55, 0]}>
          <boxGeometry args={[alongX ? 0.6 : hx * 2 + 0.03, 0.52, alongX ? hz * 2 + 0.03 : 0.6]} />
          <meshBasicMaterial color="#ffcf85" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Dach eines (fast heilen) Hauses — leicht überstehende Platte + flacher First. */
function Roof({ o }: { o: Obstacle }) {
  const hx = o.hx ?? 2;
  const hz = o.hz ?? 2;
  const base = o.h ?? 2.5;
  const radius = Math.hypot(hx, hz) * 1.02;
  return (
    <group position={[o.x, base, o.z]}>
      {/* Traufe / Dachkante */}
      <mesh position={[0, 0.06, 0]} castShadow>
        <boxGeometry args={[hx * 2 + 0.3, 0.16, hz * 2 + 0.3]} />
        <meshStandardMaterial color="#2a1d16" roughness={1} />
      </mesh>
      {/* Spitzdach (4-seitige Pyramide, achsen-ausgerichtet) */}
      <mesh position={[0, 0.62, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[radius, 1.15, 4]} />
        <meshStandardMaterial color="#3b2a22" roughness={0.95} flatShading />
      </mesh>
    </group>
  );
}

/** Verlassene Straßenlaterne — Pfosten + flackernd-glühendes Licht oben. */
function LampPost({ o }: { o: Obstacle }) {
  const tint = ["#fbbf24", "#a855f7", "#38bdf8"][o.hue ?? 0];
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 2.6, 6]} />
        <meshStandardMaterial color="#2a2a30" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh position={[0.18, 2.5, 0]}>
        <boxGeometry args={[0.4, 0.08, 0.08]} />
        <meshStandardMaterial color="#2a2a30" />
      </mesh>
      <mesh position={[0.34, 2.4, 0]}>
        <sphereGeometry args={[0.13, 10, 10]} />
        <meshBasicMaterial color={tint} toneMapped={false} />
      </mesh>
      {/* weicher Boden-Lichtschein (statt teurem PointLight pro Laterne) */}
      <mesh position={[0.34, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.6, 16]} />
        <meshBasicMaterial color={tint} transparent opacity={0.1} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Holzkiste / Trümmerstück (überspringbar). */
function Crate({ o }: { o: Obstacle }) {
  const s = (o.hx ?? 0.4) * 2;
  return (
    <mesh position={[o.x, s * 0.5, o.z]} rotation={[0, o.rot ?? 0, 0]} castShadow>
      <boxGeometry args={[s, s, s]} />
      <meshStandardMaterial color="#6b4f2a" emissive="#160d05" emissiveIntensity={0.2} roughness={0.9} flatShading />
    </mesh>
  );
}

/** Faded die Materialien einer Gruppe sanft Richtung `target`-Opazität. */
function fadeGroup(g: THREE.Object3D, target: number) {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const m = mesh.material as (THREE.Material & { opacity: number }) | undefined;
    if (m && !Array.isArray(m)) {
      m.transparent = true;
      m.opacity += (target - m.opacity) * 0.16;
      mesh.visible = m.opacity > 0.04;
    }
  });
}

/**
 * Stadt-Strukturen (Wände + Dächer + Kisten) MIT Sicht-Lösung: steht der Spieler
 * unter einem Dach (= in einem Haus), blendet das Dach aus → man sieht hinein.
 * Wände nahe am Spieler (oder die ganze Hauswand, wenn man drin ist) werden
 * durchsichtig → man sieht sich selbst + das Geschehen, auch im Gebäude.
 */
function CityStructures({
  walls, roofs, crates, combatRef,
}: {
  walls: Obstacle[];
  roofs: Obstacle[];
  crates: Obstacle[];
  combatRef?: React.RefObject<CombatSharedState | null>;
}) {
  const wallGroups = useRef<(THREE.Group | null)[]>([]);
  const roofGroups = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const p = combatRef?.current?.playerPos;
    if (!p) return;
    let underRoof = false;
    for (const o of roofs) {
      if (Math.abs(p.x - o.x) < (o.hx ?? 2) && Math.abs(p.z - o.z) < (o.hz ?? 2)) { underRoof = true; break; }
    }
    roofs.forEach((o, i) => {
      const g = roofGroups.current[i];
      if (!g) return;
      const under = Math.abs(p.x - o.x) < (o.hx ?? 2) + 0.4 && Math.abs(p.z - o.z) < (o.hz ?? 2) + 0.4;
      fadeGroup(g, under ? 0 : 1);
    });
    walls.forEach((o, i) => {
      const g = wallGroups.current[i];
      if (!g) return;
      const hx = o.hx ?? 0.22;
      const hz = o.hz ?? 0.22;
      const cx = Math.max(o.x - hx, Math.min(p.x, o.x + hx));
      const cz = Math.max(o.z - hz, Math.min(p.z, o.z + hz));
      const d = Math.hypot(p.x - cx, p.z - cz);
      const near = d < 3.4 || (underRoof && d < 9);
      fadeGroup(g, near ? 0.2 : 1);
    });
  });
  return (
    <>
      {walls.map((o, i) => (
        <group key={`w${i}`} ref={(el) => { wallGroups.current[i] = el; }}>
          <RuinWall o={o} />
        </group>
      ))}
      {roofs.map((o, i) => (
        <group key={`rf${i}`} ref={(el) => { roofGroups.current[i] = el; }}>
          <Roof o={o} />
        </group>
      ))}
      {crates.map((o, i) => (
        <Crate key={`c${i}`} o={o} />
      ))}
    </>
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
  combatRef,
}: {
  env?: WorldEnvironmentConfig;
  /** Kollidierbare Strukturen (Bäume/Felsen/Ruinen/Monument) — gemeinsame
   * Quelle mit der Physik (lib/world-obstacles.ts). */
  obstacles?: Obstacle[];
  /** Für die Sicht-Lösung in Gebäuden (Dächer/Wände faden weg). */
  combatRef?: React.RefObject<CombatSharedState | null>;
}) {
  const dens = (base: number, mul: number) => Math.max(0, Math.round(base * mul));
  const grassCount = dens(110, env.grassDensity);
  const mushroomCount = dens(46, env.mushroomDensity);
  const fireflyCount = dens(80, env.fireflyDensity);
  // Bäume/Felsen/Ruinen kommen aus der geteilten Hindernis-Liste (= Kollision).
  const trees = useMemo(() => obstacles.filter((o) => o.kind === "tree"), [obstacles]);
  const rocks = useMemo(() => obstacles.filter((o) => o.kind === "rock"), [obstacles]);
  const ruins = useMemo(() => obstacles.filter((o) => o.kind === "ruin"), [obstacles]);
  const walls = useMemo(() => obstacles.filter((o) => o.kind === "wall"), [obstacles]);
  const lamps = useMemo(() => obstacles.filter((o) => o.kind === "lamp"), [obstacles]);
  const crates = useMemo(() => obstacles.filter((o) => o.kind === "crate"), [obstacles]);
  const roofs = useMemo(() => obstacles.filter((o) => o.kind === "roof"), [obstacles]);

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
      <CityStructures walls={walls} roofs={roofs} crates={crates} combatRef={combatRef} />
      {lamps.map((o, i) => (
        <LampPost key={`l${i}`} o={o} />
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
