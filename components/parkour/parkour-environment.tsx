"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ParkourMap } from "@/lib/parkour-config";

/**
 * Cinematic per-map background scenery. Purely decorative (never collidable — the
 * playable blocks live in parkour-geometry).
 *
 * HARD RULE: nothing here may EVER cover or overlap a platform/checkpoint/finish.
 * The courses are long, elongated ribbons that sit far from the origin, so every
 * solid decor piece is placed via `scatter()`, which rejects any candidate that
 * falls inside the course's real bounding box (inflated by a safety margin). Decor
 * therefore hugs the course from outside and frames it — it can never sit on it.
 *
 * Performance: one shared material per decor kind, low-poly geometry, no shadows,
 * and exactly one allocation-free particle field per theme (drift loop reuses a
 * preallocated Float32Array — nothing is created per frame).
 */
export function ParkourEnvironment({ map }: { map: ParkourMap }) {
  switch (map.id) {
    case "neon_ascent": return <NeonEnv map={map} />;
    case "sky_gardens": return <SkyEnv map={map} />;
    case "magma_rush":  return <MagmaEnv map={map} />;
    case "void_spire":  return <VoidEnv map={map} />;
    default:            return <NeonEnv map={map} />;
  }
}

// ── Course bounds (XZ box + centre + radius + Y range) ───────────────────────
interface Bounds {
  minX: number; maxX: number; minZ: number; maxZ: number;
  minY: number; maxY: number; cx: number; cz: number; R: number;
}
function useBounds(map: ParkourMap): Bounds {
  return useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    const acc = (x: number, z: number, y: number, padXZ: number, padY: number) => {
      minX = Math.min(minX, x - padXZ); maxX = Math.max(maxX, x + padXZ);
      minZ = Math.min(minZ, z - padXZ); maxZ = Math.max(maxZ, z + padXZ);
      minY = Math.min(minY, y - padY);  maxY = Math.max(maxY, y + padY);
    };
    for (const p of map.platforms) acc(p.pos[0], p.pos[2], p.pos[1], Math.max(p.size[0], p.size[2]) / 2, p.size[1] / 2);
    for (const mv of map.movers) {
      const pad = Math.max(mv.size[0], mv.size[2]) / 2, hy = mv.size[1] / 2;
      acc(mv.pos[0], mv.pos[2], mv.pos[1], pad, hy);
      if (mv.to) acc(mv.to[0], mv.to[2], mv.to[1], pad, hy);
      if (mv.radius) { acc(mv.pos[0] + mv.radius, mv.pos[2] + mv.radius, mv.pos[1], pad, hy); acc(mv.pos[0] - mv.radius, mv.pos[2] - mv.radius, mv.pos[1], pad, hy); }
    }
    for (const c of map.checkpoints) acc(c.pos[0], c.pos[2], c.pos[1], c.radius, 1);
    acc(map.finish[0], map.finish[2], map.finish[1], Math.max(map.finishSize[0], map.finishSize[2]) / 2, map.finishSize[1] / 2);
    acc(map.start[0], map.start[2], map.start[1], 1.5, 2);
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const R = Math.hypot(maxX - cx, maxZ - cz);
    return { minX, maxX, minZ, maxZ, minY, maxY, cx, cz, R };
  }, [map]);
}

/** Scatter `count` XZ points AROUND the course: inside the outward `band` but
 * strictly OUTSIDE the bounding box inflated by `margin`. Guarantees decor never
 * overlaps the play area. Deterministic-ish via Math.random in useMemo (runs once). */
function scatter(b: Bounds, margin: number, band: number, count: number): { x: number; z: number }[] {
  const ix0 = b.minX - margin, ix1 = b.maxX + margin, iz0 = b.minZ - margin, iz1 = b.maxZ + margin;
  const ox0 = b.minX - band, ox1 = b.maxX + band, oz0 = b.minZ - band, oz1 = b.maxZ + band;
  const out: { x: number; z: number }[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 60) {
    const x = ox0 + Math.random() * (ox1 - ox0);
    const z = oz0 + Math.random() * (oz1 - oz0);
    if (x > ix0 && x < ix1 && z > iz0 && z < iz1) continue; // inside course → reject
    out.push({ x, z });
  }
  return out;
}

// ── Shared allocation-free drifting particle field (spans the course area) ───
function DriftParticles({
  b, count, baseY, height, color, size, speed, dir, opacity = 0.85, pad = 24,
}: {
  b: Bounds; count: number; baseY: number; height: number;
  color: string; size: number; speed: number; dir: 1 | -1; opacity?: number; pad?: number;
}) {
  const ref = useRef<THREE.Points>(null);
  const { geom, vel } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    const x0 = b.minX - pad, xr = (b.maxX + pad) - x0;
    const z0 = b.minZ - pad, zr = (b.maxZ + pad) - z0;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = x0 + Math.random() * xr;
      positions[i * 3 + 1] = baseY + Math.random() * height;
      positions[i * 3 + 2] = z0 + Math.random() * zr;
      vel[i] = 0.35 + Math.random() * 0.9;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geom, vel };
  }, [b, count, baseY, height, pad]);

  useFrame((_, rawDelta) => {
    if (!ref.current) return;
    const arr = geom.attributes.position.array as Float32Array;
    const d = Math.min(rawDelta, 0.05);
    for (let i = 0; i < count; i++) {
      let y = arr[i * 3 + 1] + dir * vel[i] * speed * d;
      if (dir > 0 && y > baseY + height) y = baseY;
      else if (dir < 0 && y < baseY) y = baseY + height;
      arr[i * 3 + 1] = y;
    }
    geom.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geom}>
      <pointsMaterial color={color} size={size} transparent opacity={opacity} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

// ── Neon Ascent — cyberpunk skyline at night ─────────────────────────────────
function NeonEnv({ map }: { map: ParkourMap }) {
  const b = useBounds(map);
  const accent = map.theme.accent;
  const floorY = map.voidY - 3;
  const buildings = useMemo(() => scatter(b, 18, 150, 46).map((p) => ({ ...p, h: 26 + Math.random() * 95, w: 8 + Math.random() * 15 })), [b]);
  const rings = useMemo(() => scatter(b, 22, 120, 6).map((p) => ({ ...p, y: b.minY + 8 + Math.random() * 50, r: 12 + Math.random() * 14, rx: Math.random(), ry: Math.random() })), [b]);
  const buildingMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0b0a1a", emissive: new THREE.Color(accent), emissiveIntensity: 0.13, roughness: 0.7 }), [accent]);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }), [accent]);
  const floorR = b.R + 200;
  return (
    <group>
      <gridHelper args={[floorR * 2, 80, accent, "#1a1030"]} position={[b.cx, floorY, b.cz]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[b.cx, floorY - 0.5, b.cz]}>
        <circleGeometry args={[floorR, 48]} />
        <meshBasicMaterial color="#08060f" />
      </mesh>
      {buildings.map((s, i) => (
        <mesh key={i} position={[s.x, floorY + s.h / 2, s.z]} material={buildingMat}>
          <boxGeometry args={[s.w, s.h, s.w]} />
        </mesh>
      ))}
      {rings.map((s, i) => (
        <mesh key={`r${i}`} position={[s.x, s.y, s.z]} rotation={[s.rx * Math.PI, s.ry * Math.PI, 0]} material={ringMat}>
          <torusGeometry args={[s.r, 0.5, 8, 48]} />
        </mesh>
      ))}
      <DriftParticles b={b} count={200} baseY={floorY} height={(b.maxY - floorY) + 90} color={accent} size={0.55} speed={4} dir={1} />
      <DriftParticles b={b} count={110} baseY={floorY} height={(b.maxY - floorY) + 90} color="#e879f9" size={0.45} speed={3} dir={1} opacity={0.6} />
    </group>
  );
}

// ── Sky Gardens — dawn island sea in the clouds ──────────────────────────────
function SkyEnv({ map }: { map: ParkourMap }) {
  const b = useBounds(map);
  const floorY = map.voidY - 2;
  const clouds = useMemo(() => scatter(b, 22, 150, 30).map((p) => ({ ...p, y: floorY + Math.random() * (b.maxY - floorY + 30), s: 9 + Math.random() * 16 })), [b, floorY]);
  const islands = useMemo(() => scatter(b, 26, 120, 12).map((p) => ({ ...p, y: b.minY + 4 + Math.random() * 40, s: 6 + Math.random() * 9 })), [b]);
  const cloudMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#fdf2ff", emissive: new THREE.Color("#ffd9f0"), emissiveIntensity: 0.25, roughness: 1, transparent: true, opacity: 0.92 }), []);
  const grassMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#7dd66b", roughness: 0.9 }), []);
  const dirtMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#8a5a3c", roughness: 1 }), []);
  const floorR = b.R + 200;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[b.cx, floorY - 1, b.cz]}>
        <circleGeometry args={[floorR, 48]} />
        <meshStandardMaterial color="#f3e6ff" emissive={new THREE.Color("#ffe0f0")} emissiveIntensity={0.3} roughness={1} />
      </mesh>
      {clouds.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} scale={[c.s, c.s * 0.5, c.s]} material={cloudMat}>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
      ))}
      {islands.map((s, i) => (
        <group key={i} position={[s.x, s.y, s.z]}>
          <mesh material={grassMat}>
            <cylinderGeometry args={[s.s, s.s * 0.9, s.s * 0.4, 10]} />
          </mesh>
          <mesh position={[0, -s.s * 0.6, 0]} material={dirtMat}>
            <coneGeometry args={[s.s * 0.9, s.s * 1.2, 10]} />
          </mesh>
        </group>
      ))}
      <DriftParticles b={b} count={150} baseY={floorY} height={(b.maxY - floorY) + 50} color="#fff3b0" size={0.5} speed={2.4} dir={-1} opacity={0.7} />
    </group>
  );
}

// ── Magma Rush — volcanic hellscape ──────────────────────────────────────────
function MagmaEnv({ map }: { map: ParkourMap }) {
  const b = useBounds(map);
  const seaY = map.voidY - 1;
  const lavaRef = useRef<THREE.MeshStandardMaterial>(null);
  const spires = useMemo(() => scatter(b, 16, 150, 26).map((p) => ({ ...p, h: 22 + Math.random() * 70, r: 8 + Math.random() * 17 })), [b]);
  const islets = useMemo(() => scatter(b, 8, 34, 10).map((p) => ({ ...p, s: 5 + Math.random() * 9 })), [b]);
  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1a0d09", emissive: new THREE.Color("#ff3b00"), emissiveIntensity: 0.22, roughness: 1, flatShading: true }), []);
  const isleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#20100a", roughness: 1, flatShading: true }), []);
  const floorR = b.R + 220;

  useFrame((state) => {
    const m = lavaRef.current;
    if (m) m.emissiveIntensity = 0.85 + Math.sin(state.clock.elapsedTime * 0.8) * 0.25;
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[b.cx, seaY, b.cz]}>
        <circleGeometry args={[floorR, 64]} />
        <meshStandardMaterial ref={lavaRef} color="#3a0d02" emissive={new THREE.Color("#ff4500")} emissiveIntensity={0.9} roughness={0.5} />
      </mesh>
      {islets.map((s, i) => (
        <mesh key={`i${i}`} position={[s.x, seaY + s.s * 0.3, s.z]} material={isleMat}>
          <dodecahedronGeometry args={[s.s, 0]} />
        </mesh>
      ))}
      {spires.map((s, i) => (
        <mesh key={i} position={[s.x, seaY + s.h / 2, s.z]} material={rockMat}>
          <coneGeometry args={[s.r, s.h, 7]} />
        </mesh>
      ))}
      <DriftParticles b={b} count={240} baseY={seaY} height={(b.maxY - seaY) + 70} color="#ff7a1a" size={0.65} speed={7} dir={1} />
      <DriftParticles b={b} count={110} baseY={seaY} height={(b.maxY - seaY) + 70} color="#ffd24a" size={0.45} speed={9} dir={1} opacity={0.8} />
    </group>
  );
}

// ── Void Spire — cosmic emptiness ────────────────────────────────────────────
function VoidEnv({ map }: { map: ParkourMap }) {
  const b = useBounds(map);
  const accent = map.theme.accent;
  const debris = useMemo(() => scatter(b, 18, 130, 30).map((p) => ({ ...p, y: b.minY + Math.random() * (b.maxY - b.minY + 60), s: 2 + Math.random() * 7, rx: Math.random() * Math.PI, ry: Math.random() * Math.PI })), [b]);
  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#12101f", emissive: new THREE.Color(accent), emissiveIntensity: 0.15, roughness: 1, flatShading: true }), [accent]);
  const nebulaMat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }), [accent]);
  const nebulaMat2 = useMemo(() => new THREE.MeshBasicMaterial({ color: "#3b82f6", transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }), []);
  const midY = (b.minY + b.maxY) / 2;
  const off = b.R + 170;

  return (
    <group>
      {/* Nebulae + planet, well OUTSIDE the course radius (never overhead of it) */}
      <mesh position={[b.cx - off, midY + 60, b.cz - off * 0.5]} material={nebulaMat} rotation={[0.4, 0.6, 0]}>
        <planeGeometry args={[300, 240]} />
      </mesh>
      <mesh position={[b.cx + off, midY + 90, b.cz - off * 0.4]} material={nebulaMat2} rotation={[-0.3, -0.5, 0.2]}>
        <planeGeometry args={[340, 260]} />
      </mesh>
      <mesh position={[b.cx + off * 0.8, midY + 40, b.cz + off * 0.9]}>
        <sphereGeometry args={[38, 32, 32]} />
        <meshStandardMaterial color="#1b1030" emissive={new THREE.Color(accent)} emissiveIntensity={0.4} roughness={0.8} />
      </mesh>
      {debris.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, d.z]} rotation={[d.rx, d.ry, 0]} scale={d.s} material={rockMat}>
          <icosahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
      <DriftParticles b={b} count={190} baseY={b.minY - 10} height={(b.maxY - b.minY) + 120} color={accent} size={0.5} speed={2.2} dir={1} opacity={0.65} />
    </group>
  );
}
