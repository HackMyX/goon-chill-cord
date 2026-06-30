"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Instances, Instance } from "@react-three/drei";
import * as THREE from "three";
import { WORLD_RADIUS } from "@/lib/world-config";
import { DEFAULT_WORLD_ENVIRONMENT, type WorldEnvironmentConfig } from "@/lib/world-environment-config";
import type { Obstacle, ObstacleKind } from "@/lib/world-obstacles";
import type { CombatSharedState } from "@/components/world/combat-types";
import { MODEL_SWAPPABLE_KINDS, isModelKind, modelForKind } from "@/lib/world-models";
import { WorldModelInstances } from "@/components/world/world-model-instances";

// Post-Apokalypse: tote, verkohlte Stämme + spärliches, vertrocknetes/giftiges Laub.
const TRUNK_COLOR = "#231a13";
const FOLIAGE_COLORS = ["#3a3a1e", "#42381c", "#2e3320"];

/** Verrostete Warn-/Strommasten am Welt-Rand — die optische Hälfte der Grenze
 * (player.tsx's kreisförmiger Position-Clamp ist die physische Hälfte). Lässt den
 * Welt-Rand als "Ort" lesen statt als unsichtbare Wand: ein schiefer Stahlmast mit
 * glimmender Notbefeuerung statt des alten Magie-Kristalls. */
function DeadSpire({ x, z, scale }: { x: number; z: number; scale: number }) {
  return (
    <group position={[x, 0, z]} scale={scale} rotation={[0, 0, (((x * 7 + z * 3) % 10) / 10 - 0.5) * 0.18]}>
      {/* schiefer Stahl-Hauptmast */}
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.08, 0.16, 2.4, 6]} />
        <meshStandardMaterial color="#3a2c20" roughness={0.95} metalness={0.4} />
      </mesh>
      {/* abgeknickte Querstrebe */}
      <mesh position={[0.18, 1.9, 0.05]} rotation={[0, 0.4, 0.5]}>
        <boxGeometry args={[0.55, 0.07, 0.07]} />
        <meshStandardMaterial color="#2e241a" roughness={1} metalness={0.3} />
      </mesh>
      {/* Beton-Fundament */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.38, 0.46, 0.3, 6]} />
        <meshStandardMaterial color="#4a463c" roughness={1} />
      </mesh>
      {/* schwache rote Notbefeuerung oben (kein Magie-Glow) */}
      <mesh position={[0, 2.45, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color="#c2451f" toneMapped={false} />
      </mesh>
      {/* matter Bodenschein der Warnleuchte */}
      <mesh position={[0, 0.06, 0]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshBasicMaterial color="#a83a18" transparent opacity={0.12} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Zerbrochener Beton-Pfeiler mit rostigem Bewehrungsstahl — gibt der Map den
 * "Ruinen/Trümmer"-Look. Gerissene Säule auf Sockel, abgebrochene Krone, keine
 * Magie mehr (statt Runen-Glow ragt verbogener Moniereisen-Stahl heraus). */
function RuinPillar({ x, z, scale, rot, h }: { x: number; z: number; scale: number; rot: number; h: number }) {
  return (
    <group position={[x, 0, z]} scale={scale} rotation={[0, rot, 0]}>
      {/* Beton-Sockel */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.95, 0.24, 0.95]} />
        <meshStandardMaterial color="#54514a" roughness={1} />
      </mesh>
      {/* gerissener Beton-Schaft */}
      <mesh position={[0, 0.24 + h / 2, 0]}>
        <cylinderGeometry args={[0.3, 0.4, h, 8]} />
        <meshStandardMaterial color="#6a675e" roughness={1} flatShading />
      </mesh>
      {/* abgebrochene, gekippte Krone */}
      <mesh position={[0.1, 0.24 + h + 0.08, 0.05]} rotation={[0.22, 0.4, 0.16]}>
        <cylinderGeometry args={[0.34, 0.28, 0.26, 7]} />
        <meshStandardMaterial color="#5c594f" roughness={1} flatShading />
      </mesh>
      {/* herausragender, verbogener Bewehrungsstahl (Rost) */}
      {[0.1, -0.12, 0.02].map((dx, i) => (
        <mesh key={i} position={[dx, 0.24 + h + 0.22 + i * 0.05, dx * 0.6]} rotation={[0.3 + i * 0.2, i, 0.25 - i * 0.15]}>
          <cylinderGeometry args={[0.018, 0.018, 0.5, 4]} />
          <meshStandardMaterial color="#6e3b1e" roughness={1} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Instanced-Renderer: alle gleichartigen Deko-Objekte = 1 Draw-Call statt
// hunderte Einzel-Meshes → massiv schneller (Bäume/Felsen/Gras/Pilze/Kisten). ───

const FOLIAGE_LAYERS = [
  { r: 0.85, h: 1.4, y: 1.6 },
  { r: 0.6, h: 1.1, y: 2.3 },
  { r: 0.38, h: 0.85, y: 2.9 },
];

function InstancedTrees({ trees }: { trees: Obstacle[] }) {
  if (!trees.length) return null;
  return (
    <group>
      <Instances limit={trees.length} range={trees.length} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.16, 0.2, 1.2, 6]} />
        <meshStandardMaterial color={TRUNK_COLOR} />
        {trees.map((t, i) => (
          <Instance key={i} position={[t.x, 0.6 * t.scale, t.z]} scale={t.scale} />
        ))}
      </Instances>
      {FOLIAGE_LAYERS.map((c, li) => (
        <Instances key={li} limit={trees.length} range={trees.length} castShadow frustumCulled={false}>
          <coneGeometry args={[c.r * 0.82, c.h, 6]} />
          <meshStandardMaterial emissive="#1a1608" emissiveIntensity={0.12} roughness={1} flatShading />
          {trees.map((t, i) => (
            <Instance key={i} position={[t.x, c.y * t.scale, t.z]} scale={t.scale} color={FOLIAGE_COLORS[t.hue ?? 0]} />
          ))}
        </Instances>
      ))}
    </group>
  );
}

function InstancedRocks({ rocks }: { rocks: Obstacle[] }) {
  if (!rocks.length) return null;
  return (
    <group>
      <Instances limit={rocks.length} range={rocks.length} castShadow frustumCulled={false}>
        <dodecahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color="#5b6066" emissive="#1a241c" emissiveIntensity={0.25} flatShading />
        {rocks.map((r, i) => (
          <Instance key={i} position={[r.x, 0.28 * r.scale, r.z]} scale={r.scale} rotation={[0.3, (r.rot ?? 0) + 0.6, 0.2]} />
        ))}
      </Instances>
      <Instances limit={rocks.length} range={rocks.length} castShadow frustumCulled={false}>
        <dodecahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#4d5258" emissive="#16201a" emissiveIntensity={0.25} flatShading />
        {rocks.map((r, i) => {
          const rot = r.rot ?? 0;
          return (
            <Instance
              key={i}
              position={[r.x + (0.45 * Math.cos(rot) - 0.2 * Math.sin(rot)) * r.scale, 0.16 * r.scale, r.z + (0.45 * Math.sin(rot) + 0.2 * Math.cos(rot)) * r.scale]}
              scale={r.scale}
              rotation={[0.5, rot + 1.1, 0.3]}
            />
          );
        })}
      </Instances>
    </group>
  );
}

function InstancedGrass({ tufts }: { tufts: { x: number; z: number }[] }) {
  const blades = useMemo(() => {
    const arr: { x: number; z: number; rot: number; color: string }[] = [];
    for (const t of tufts) {
      for (const off of [0, 0.45, -0.45]) {
        arr.push({ x: t.x + off * 0.3, z: t.z + off * 0.2, rot: off, color: off >= 0 ? "#2f6b3f" : "#3a8050" });
      }
    }
    return arr;
  }, [tufts]);
  if (!blades.length) return null;
  return (
    <Instances limit={blades.length} range={blades.length} frustumCulled={false}>
      <coneGeometry args={[0.05, 0.24, 5]} />
      <meshStandardMaterial />
      {blades.map((b, i) => (
        <Instance key={i} position={[b.x, 0.11, b.z]} rotation={[0, b.rot, 0.15]} color={b.color} />
      ))}
    </Instances>
  );
}

function InstancedMushrooms({ mushrooms }: { mushrooms: { x: number; z: number; scale: number; color: string }[] }) {
  if (!mushrooms.length) return null;
  return (
    <group>
      <Instances limit={mushrooms.length} range={mushrooms.length} frustumCulled={false}>
        <cylinderGeometry args={[0.05, 0.08, 0.36, 6]} />
        <meshStandardMaterial color="#d9c7b8" />
        {mushrooms.map((m, i) => (
          <Instance key={i} position={[m.x, 0.18 * m.scale, m.z]} scale={m.scale} />
        ))}
      </Instances>
      <Instances limit={mushrooms.length} range={mushrooms.length} frustumCulled={false}>
        <sphereGeometry args={[0.18, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial toneMapped={false} />
        {mushrooms.map((m, i) => (
          <Instance key={i} position={[m.x, 0.4 * m.scale, m.z]} scale={m.scale} color={m.color} />
        ))}
      </Instances>
    </group>
  );
}

function InstancedCrates({ crates }: { crates: Obstacle[] }) {
  if (!crates.length) return null;
  return (
    <Instances limit={crates.length} range={crates.length} castShadow frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#6b4f2a" emissive="#160d05" emissiveIntensity={0.2} roughness={0.9} flatShading />
      {crates.map((o, i) => {
        // Echte Box: Breite hx*2, Höhe = blockH, Tiefe hz*2 (vorher fälschlich ein
        // Würfel der Seite hx*2 → lange Theken/Regale wurden zu Riesenwürfeln).
        const sx = (o.hx ?? 0.4) * 2;
        const sz = (o.hz ?? o.hx ?? 0.4) * 2;
        const sy = o.blockH ?? sx;
        return <Instance key={i} position={[o.x, sy * 0.5, o.z]} scale={[sx, sy, sz]} rotation={[0, o.rot ?? 0, 0]} />;
      })}
    </Instances>
  );
}

/** Ausgebranntes Auto-Wrack — rostige Karosserie, eingedrückte Kabine, platte
 * Reifen. Box-Kollision (blockH 1.3 → blockiert, Deckung). Geringe Anzahl →
 * je eine kleine Gruppe (kein Instancing nötig). */
function Wreck({ o }: { o: Obstacle }) {
  const s = o.scale ?? 1;
  return (
    <group position={[o.x, 0, o.z]} rotation={[0, o.rot ?? 0, 0]} scale={s}>
      {/* Karosserie */}
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.58, 1.0]} />
        <meshStandardMaterial color="#5a4632" roughness={1} metalness={0.45} flatShading />
      </mesh>
      {/* eingedrückte Kabine (leicht versetzt) */}
      <mesh position={[-0.18, 0.92, 0]} rotation={[0, 0, 0.05]} castShadow>
        <boxGeometry args={[0.95, 0.46, 0.9]} />
        <meshStandardMaterial color="#473829" roughness={1} metalness={0.45} flatShading />
      </mesh>
      {/* Rost-/Brandfleck auf der Haube */}
      <mesh position={[0.65, 0.72, 0]} rotation={[0, 0, -0.06]}>
        <boxGeometry args={[0.7, 0.06, 0.85]} />
        <meshStandardMaterial color="#2e2018" roughness={1} />
      </mesh>
      {/* platte Reifen */}
      {([[0.7, 0.5], [0.7, -0.5], [-0.7, 0.5], [-0.7, -0.5]] as const).map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.16, wz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.24, 0.24, 0.18, 8]} />
          <meshStandardMaterial color="#1b1916" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Trümmerhaufen (Schutt) — zwei instanzierte Brocken-Schichten, niedrig &
 * überspringbar. Instancing → 2 Draw-Calls für alle Haufen. */
function InstancedDebris({ debris }: { debris: Obstacle[] }) {
  if (!debris.length) return null;
  return (
    <group>
      <Instances limit={debris.length} range={debris.length} castShadow frustumCulled={false}>
        <dodecahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#4a443a" emissive="#0e0c08" emissiveIntensity={0.2} roughness={1} flatShading />
        {debris.map((d, i) => (
          <Instance key={i} position={[d.x, 0.18 * d.scale, d.z]} scale={d.scale} rotation={[0.2, d.rot ?? 0, 0.1]} />
        ))}
      </Instances>
      <Instances limit={debris.length} range={debris.length} castShadow frustumCulled={false}>
        <boxGeometry args={[0.5, 0.32, 0.45]} />
        <meshStandardMaterial color="#3e3a32" roughness={1} flatShading />
        {debris.map((d, i) => {
          const rot = d.rot ?? 0;
          return (
            <Instance
              key={i}
              position={[d.x + Math.cos(rot) * 0.42 * d.scale, 0.13 * d.scale, d.z + Math.sin(rot) * 0.42 * d.scale]}
              scale={d.scale}
              rotation={[0.3, rot + 0.7, 0.2]}
            />
          );
        })}
      </Instances>
    </group>
  );
}

// Zonen-Paletten (post-apokalyptisch) — Orte bleiben optisch unterscheidbar,
// aber alles ist verwittert: 0 Dorf (fleckiger Putz/Beton), 1 Markt/Supermarkt
// (grauer Beton + Rost), 2 Ruinenfeld (rußig/verkohlt), 3 Camp (rostiges Wellblech/
// Holz), 4 = tote, vertrocknete Hecke (braun-grün).
const WALL_PALETTES = [
  ["#7a7363", "#6b6457", "#857c6a", "#605949"],
  ["#6a6862", "#5c5a54", "#726f67", "#54524b"],
  ["#3a352c", "#403a30", "#332e26", "#46402f"],
  ["#5e4d36", "#67503a", "#4f4230", "#705a3e"],
  ["#46492a", "#4e5230", "#3c4024", "#545832"], // 4 = tote Hecke (braun-grün)
];
const ROOF_COLORS = ["#6b3f28", "#54524a", "#2e2620", "#7a4a2a", "#3a4030"];

/** Hauswand: verwitterter Stein (Farbe variiert je Position) + zerbröckelte
 * Oberkante; hohe (heile) Wände bekommen ein warm glühendes Fenster. */
function RuinWall({ o }: { o: Obstacle }) {
  const hx = o.hx ?? 0.22;
  const hz = o.hz ?? 0.22;
  const h = o.h ?? 2;
  const palette = WALL_PALETTES[o.tone ?? 0] ?? WALL_PALETTES[0];
  const tone = palette[Math.abs(Math.round(o.x * 7 + o.z * 13)) % palette.length];
  const alongX = hx > hz;
  const isHedge = o.tone === 4;
  const tall = h > 2.3;
  const long = (o.len ?? 0) > 1.7;
  return (
    <group position={[o.x, 0, o.z]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[hx * 2, h, hz * 2]} />
        <meshStandardMaterial color={tone} emissive={isHedge ? "#161808" : "#140d08"} emissiveIntensity={0.12} roughness={isHedge ? 1 : 0.97} flatShading={isHedge} />
      </mesh>
      {/* Oberkante (Hecke: vertrocknet/struppig, sonst zerbröckelter Beton) */}
      <mesh position={[0, h, 0]} castShadow>
        <boxGeometry args={[hx * 2 * (isHedge ? 1.05 : 0.72), isHedge ? 0.22 : 0.14, hz * 2 * (isHedge ? 1.4 : 0.72)]} />
        <meshStandardMaterial color={isHedge ? "#4c4d2a" : "#3a352c"} roughness={1} flatShading />
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
  const color = ROOF_COLORS[o.tone ?? 0] ?? ROOF_COLORS[0];
  // Breite Gebäude (z. B. Supermarkt) = Flachdach; normale Häuser = Spitzdach.
  const flat = hx > 5 || hz > 5;
  const radius = Math.hypot(hx, hz) * 1.02;
  return (
    <group position={[o.x, base, o.z]}>
      {/* Traufe / Dachkante */}
      <mesh position={[0, 0.06, 0]} castShadow>
        <boxGeometry args={[hx * 2 + 0.3, 0.16, hz * 2 + 0.3]} />
        <meshStandardMaterial color="#2a1d16" roughness={1} />
      </mesh>
      {flat ? (
        <mesh position={[0, 0.24, 0]} castShadow>
          <boxGeometry args={[hx * 2, 0.3, hz * 2]} />
          <meshStandardMaterial color={color} roughness={0.95} flatShading />
        </mesh>
      ) : (
        <mesh position={[0, 0.62, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[radius, 1.15, 4]} />
          <meshStandardMaterial color={color} roughness={0.95} flatShading />
        </mesh>
      )}
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

/** Straße/Pfad — flache, dunkle Schotterfläche knapp über dem Boden. */
function Road({ o }: { o: Obstacle }) {
  const len = o.len ?? (o.hx ?? 1) * 2;
  const width = (o.hz ?? 1.5) * 2;
  return (
    <mesh position={[o.x, 0.04, o.z]} rotation={[0, o.rot ?? 0, 0]}>
      <boxGeometry args={[len, 0.06, width]} />
      {/* unbeleuchtet → fängt kein warmes Licht ein (keine orange Kippfläche) */}
      <meshBasicMaterial color="#241f1c" toneMapped={false} />
    </mesh>
  );
}

/** Lagerfeuer — glühende Glut + Flammen + Steinkranz + warmer Lichtschein. */
function Campfire({ o }: { o: Obstacle }) {
  const fire = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (fire.current) {
      const f = 0.85 + Math.sin(s.clock.elapsedTime * 9) * 0.12 + Math.sin(s.clock.elapsedTime * 17) * 0.05;
      fire.current.scale.set(1, f, 1);
    }
  });
  return (
    <group position={[o.x, 0, o.z]}>
      {/* Steinkranz */}
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55]} rotation={[0, a, 0]}>
            <dodecahedronGeometry args={[0.16, 0]} />
            <meshStandardMaterial color="#4d5258" flatShading />
          </mesh>
        );
      })}
      {/* Holzscheite */}
      <mesh position={[0, 0.12, 0]} rotation={[0, 0.6, 0.2]}>
        <cylinderGeometry args={[0.07, 0.07, 0.7, 5]} />
        <meshStandardMaterial color="#3a2a1c" />
      </mesh>
      {/* Flamme */}
      <mesh ref={fire} position={[0, 0.35, 0]}>
        <coneGeometry args={[0.26, 0.7, 8]} />
        <meshBasicMaterial color="#ff9d2e" toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0.7, 0]} color="#ff8a3d" intensity={9} distance={11} decay={2} />
      {/* Boden-Glut */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.8, 18]} />
        <meshBasicMaterial color="#ff7a2a" transparent opacity={0.12} toneMapped={false} />
      </mesh>
    </group>
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
      <InstancedCrates crates={crates} />
    </>
  );
}

// Giftige, fahle Pilze (Verseuchung) statt neon-bunter Magie-Pilze.
const MUSHROOM_COLORS = ["#9aa83a", "#b6a838", "#7a8a2e", "#a86a3a"];
// Treibende Asche/Glutfunken statt magischer Glühpunkte.
const FIREFLY_COLORS = ["#c2451f", "#8a6a3a", "#a8552a", "#6e6258"];

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

/** Verfallenes Wahrzeichen direkt im Blickfeld des Spawns (Spieler schaut anfangs
 * Richtung −z) — abgebrochener, rostiger Funkturm-Stumpf auf Betonsockel, schwache
 * rote Notbake, orbitierende Trümmer/Asche und ein Brand-/Hazard-Ring am Boden
 * statt des alten Magie-Obelisken. Das „Wahrzeichen" der toten Welt. */
function CentralMonument() {
  const ringRef = useRef<THREE.Group>(null);
  const shardsRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef.current) ringRef.current.rotation.z = t * 0.12;
    if (shardsRef.current) shardsRef.current.rotation.y = t * 0.35;
    // unregelmäßig flackernde Notbake
    if (beaconRef.current) beaconRef.current.intensity = 9 + Math.sin(t * 7) * 4 + Math.sin(t * 23) * 2;
  });
  return (
    <group position={[0, 0, -9]}>
      {/* abgeknickter Stahl-Funkturm */}
      <mesh position={[0.18, 2.6, 0]} rotation={[0, 0, 0.08]}>
        <cylinderGeometry args={[0.22, 0.6, 5.0, 6]} />
        <meshStandardMaterial color="#4a3a2a" roughness={0.95} metalness={0.45} flatShading />
      </mesh>
      {/* zersplitterte Turmspitze */}
      <mesh position={[0.42, 5.0, 0.05]} rotation={[0.2, 0, 0.5]}>
        <coneGeometry args={[0.18, 1.0, 5]} />
        <meshStandardMaterial color="#3e3022" roughness={1} metalness={0.4} flatShading />
      </mesh>
      {/* Beton-Sockel */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[1.1, 1.35, 0.8, 8]} />
        <meshStandardMaterial color="#56524a" roughness={1} />
      </mesh>
      {/* rote Notbake oben + flackerndes Licht */}
      <mesh position={[0.42, 5.5, 0.05]}>
        <sphereGeometry args={[0.16, 10, 10]} />
        <meshBasicMaterial color="#e0431c" toneMapped={false} />
      </mesh>
      <pointLight ref={beaconRef} position={[0.42, 5.5, 0.05]} color="#c2451f" intensity={9} distance={22} decay={2} />
      {/* orbitierende Trümmerbrocken/Asche */}
      <group ref={shardsRef} position={[0, 1.4, 0]}>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 1.7, Math.sin(i) * 0.3, Math.sin(a) * 1.7]} rotation={[0.5, a, 0.3]}>
              <dodecahedronGeometry args={[0.16, 0]} />
              <meshStandardMaterial color="#5a564c" roughness={1} flatShading />
            </mesh>
          );
        })}
      </group>
      {/* Brand-/Hazard-Ring am Boden */}
      <group ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <mesh>
          <ringGeometry args={[2.5, 2.8, 48]} />
          <meshBasicMaterial color="#a8401c" transparent opacity={0.4} toneMapped={false} side={2} />
        </mesh>
        <mesh>
          <ringGeometry args={[1.7, 1.8, 6]} />
          <meshBasicMaterial color="#caa23a" transparent opacity={0.35} toneMapped={false} side={2} />
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
  const roads = useMemo(() => obstacles.filter((o) => o.kind === "road"), [obstacles]);
  const campfires = useMemo(() => obstacles.filter((o) => o.kind === "campfire"), [obstacles]);
  const wrecks = useMemo(() => obstacles.filter((o) => o.kind === "wreck"), [obstacles]);
  const debris = useMemo(() => obstacles.filter((o) => o.kind === "debris"), [obstacles]);

  // Kind → Obstacle-Liste, damit registrierte GLTF-Modelle automatisch die passende
  // Teilmenge bekommen. Nur Kinds aus MODEL_SWAPPABLE_KINDS werden modellfähig.
  const kindItems: Partial<Record<ObstacleKind, Obstacle[]>> = {
    tree: trees, rock: rocks, ruin: ruins, wreck: wrecks, debris, crate: crates, lamp: lamps, campfire: campfires,
  };

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
      {/* Registrierte GLTF-Modelle ersetzen die prozedurale Optik ihres Kinds
          (Frustum-Culling + Suspense-Fallback in world-model-instances.tsx).
          Registry leer → nichts hiervon rendert, alles bleibt prozedural. */}
      {MODEL_SWAPPABLE_KINDS.map((kind) => {
        const def = modelForKind(kind);
        return def ? <WorldModelInstances key={`m-${kind}`} def={def} items={kindItems[kind] ?? []} /> : null;
      })}

      {roads.map((o, i) => (
        <Road key={`rd${i}`} o={o} />
      ))}
      {!isModelKind("campfire") &&
        campfires.map((o, i) => <Campfire key={`cf${i}`} o={o} />)}
      {!isModelKind("tree") && <InstancedTrees trees={trees} />}
      <InstancedGrass tufts={grassTufts} />
      {!isModelKind("rock") && <InstancedRocks rocks={rocks} />}
      {!isModelKind("debris") && <InstancedDebris debris={debris} />}
      {!isModelKind("wreck") &&
        wrecks.map((o, i) => <Wreck key={`wk${i}`} o={o} />)}
      {!isModelKind("ruin") &&
        ruins.map((r, i) => (
          <RuinPillar key={i} x={r.x} z={r.z} scale={r.scale} rot={r.rot ?? 0} h={r.h ?? 1.5} />
        ))}
      <CityStructures walls={walls} roofs={roofs} crates={isModelKind("crate") ? [] : crates} combatRef={combatRef} />
      {!isModelKind("lamp") &&
        lamps.map((o, i) => <LampPost key={`l${i}`} o={o} />)}
      <InstancedMushrooms mushrooms={mushrooms} />
      {borderCrystals.map((c, i) => (
        <DeadSpire key={i} x={c.x} z={c.z} scale={c.scale} />
      ))}
      {fireflyCount > 0 && <Fireflies count={fireflyCount} />}
      {env.monument && <CentralMonument />}
    </>
  );
}
