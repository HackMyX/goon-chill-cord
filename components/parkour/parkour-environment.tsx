"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ParkourMap } from "@/lib/parkour-config";

/**
 * Cinematic per-map background scenery. Purely decorative (never collidable — the
 * playable blocks live in parkour-geometry), tuned to stay cheap:
 *   • all repeated decor shares ONE material per kind (no material explosion),
 *   • low-poly geometry, no real-time shadows,
 *   • exactly ONE allocation-free particle field per theme (drift loop reuses a
 *     preallocated Float32Array — nothing is created per frame).
 * Each theme turns the old black void into a place: a neon skyline, a dawn island
 * sea, a lava world, a cosmic spire.
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

// ── Shared allocation-free drifting particle field ───────────────────────────
function DriftParticles({
  count, radius, height, baseY, color, size, speed, dir, opacity = 0.85,
}: {
  count: number; radius: number; height: number; baseY: number;
  color: string; size: number; speed: number; dir: 1 | -1; opacity?: number;
}) {
  const ref = useRef<THREE.Points>(null);
  const { geom, vel } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = baseY + Math.random() * height;
      positions[i * 3 + 2] = Math.sin(a) * r;
      vel[i] = 0.35 + Math.random() * 0.9;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geom, vel };
  }, [count, radius, height, baseY]);

  useFrame((_, rawDelta) => {
    const p = ref.current;
    if (!p) return;
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
  const accent = map.theme.accent;
  const floorY = map.voidY - 3;
  const buildings = useMemo(() => {
    const out: { x: number; z: number; h: number; w: number }[] = [];
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + Math.random() * 0.15;
      const r = 90 + Math.random() * 90;
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: 30 + Math.random() * 90, w: 8 + Math.random() * 14 });
    }
    return out;
  }, []);
  const buildingMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0b0a1a", emissive: new THREE.Color(accent), emissiveIntensity: 0.12, roughness: 0.7 }), [accent]);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending }), [accent]);
  return (
    <group>
      <gridHelper args={[600, 60, accent, "#1a1030"]} position={[0, floorY, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY - 0.5, 0]}>
        <circleGeometry args={[300, 48]} />
        <meshBasicMaterial color="#08060f" />
      </mesh>
      {buildings.map((b, i) => (
        <mesh key={i} position={[b.x, floorY + b.h / 2, b.z]} material={buildingMat}>
          <boxGeometry args={[b.w, b.h, b.w]} />
        </mesh>
      ))}
      {/* Floating neon rings around the ascent */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`r${i}`} rotation={[Math.PI / 2, 0, 0]} position={[0, floorY + 20 + i * 26, 0]} material={ringMat}>
          <torusGeometry args={[26 + i * 6, 0.6, 8, 64]} />
        </mesh>
      ))}
      <DriftParticles count={220} radius={80} height={120} baseY={floorY} color={accent} size={0.6} speed={4} dir={1} />
      <DriftParticles count={120} radius={70} height={120} baseY={floorY} color="#e879f9" size={0.5} speed={3} dir={1} opacity={0.7} />
    </group>
  );
}

// ── Sky Gardens — dawn island sea in the clouds ──────────────────────────────
function SkyEnv({ map }: { map: ParkourMap }) {
  const floorY = map.voidY - 2;
  const clouds = useMemo(() => {
    const out: { x: number; y: number; z: number; s: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 130;
      out.push({ x: Math.cos(a) * r, y: floorY + Math.random() * 40, z: Math.sin(a) * r, s: 10 + Math.random() * 22 });
    }
    return out;
  }, [floorY]);
  const islands = useMemo(() => {
    const out: { x: number; y: number; z: number; s: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 70 + Math.random() * 90;
      out.push({ x: Math.cos(a) * r, y: floorY + 6 + Math.random() * 34, z: Math.sin(a) * r, s: 6 + Math.random() * 10 });
    }
    return out;
  }, [floorY]);
  const cloudMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#fdf2ff", emissive: new THREE.Color("#ffd9f0"), emissiveIntensity: 0.25, roughness: 1, transparent: true, opacity: 0.9 }), []);
  const grassMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#7dd66b", roughness: 0.9 }), []);
  const dirtMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#8a5a3c", roughness: 1 }), []);
  return (
    <group>
      {/* Soft cloud sea below */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY - 1, 0]}>
        <circleGeometry args={[320, 48]} />
        <meshStandardMaterial color="#f3e6ff" emissive={new THREE.Color("#ffe0f0")} emissiveIntensity={0.3} roughness={1} />
      </mesh>
      {clouds.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} scale={[c.s, c.s * 0.5, c.s]} material={cloudMat}>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
      ))}
      {/* Distant floating grass islands */}
      {islands.map((s, i) => (
        <group key={i} position={[s.x, s.y, s.z]}>
          <mesh position={[0, 0, 0]} material={grassMat}>
            <cylinderGeometry args={[s.s, s.s * 0.9, s.s * 0.4, 10]} />
          </mesh>
          <mesh position={[0, -s.s * 0.6, 0]} material={dirtMat}>
            <coneGeometry args={[s.s * 0.9, s.s * 1.2, 10]} />
          </mesh>
        </group>
      ))}
      <DriftParticles count={160} radius={90} height={70} baseY={floorY} color="#fff3b0" size={0.5} speed={2.4} dir={-1} opacity={0.75} />
    </group>
  );
}

// ── Magma Rush — volcanic hellscape ──────────────────────────────────────────
function MagmaEnv({ map }: { map: ParkourMap }) {
  const seaY = map.voidY - 1;
  const lavaRef = useRef<THREE.MeshStandardMaterial>(null);
  const rocks = useMemo(() => {
    const out: { x: number; z: number; h: number; r: number }[] = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + Math.random() * 0.2;
      const r = 60 + Math.random() * 110;
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: 24 + Math.random() * 70, r: 8 + Math.random() * 18 });
    }
    return out;
  }, []);
  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1a0d09", emissive: new THREE.Color("#ff3b00"), emissiveIntensity: 0.22, roughness: 1, flatShading: true }), []);
  const isleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#20100a", roughness: 1, flatShading: true }), []);

  useFrame((state) => {
    const m = lavaRef.current;
    if (!m) return;
    // Slow, seamless lava glow pulse (one uniform write per frame — cheap).
    m.emissiveIntensity = 0.85 + Math.sin(state.clock.elapsedTime * 0.8) * 0.25;
  });

  return (
    <group>
      {/* Glowing lava sea */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, seaY, 0]}>
        <circleGeometry args={[340, 64]} />
        <meshStandardMaterial ref={lavaRef} color="#3a0d02" emissive={new THREE.Color("#ff4500")} emissiveIntensity={0.9} roughness={0.5} />
      </mesh>
      {/* Dark rock islets poking through the lava */}
      {rocks.slice(0, 8).map((r, i) => (
        <mesh key={`i${i}`} position={[r.x * 0.5, seaY + 1.5, r.z * 0.5]} material={isleMat}>
          <dodecahedronGeometry args={[6 + (i % 3) * 3, 0]} />
        </mesh>
      ))}
      {/* Volcanic spires around the arena, lava-cracked */}
      {rocks.map((r, i) => (
        <mesh key={i} position={[r.x, seaY + r.h / 2, r.z]} material={rockMat}>
          <coneGeometry args={[r.r, r.h, 7]} />
        </mesh>
      ))}
      {/* Rising embers */}
      <DriftParticles count={260} radius={120} height={90} baseY={seaY} color="#ff7a1a" size={0.7} speed={7} dir={1} />
      <DriftParticles count={120} radius={90} height={80} baseY={seaY} color="#ffd24a" size={0.5} speed={9} dir={1} opacity={0.8} />
    </group>
  );
}

// ── Void Spire — cosmic emptiness ────────────────────────────────────────────
function VoidEnv({ map }: { map: ParkourMap }) {
  const accent = map.theme.accent;
  const debrisRef = useRef<THREE.Group>(null);
  const debris = useMemo(() => {
    const out: { x: number; y: number; z: number; s: number; rx: number; ry: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 45 + Math.random() * 110;
      out.push({ x: Math.cos(a) * r, y: map.voidY + Math.random() * 90, z: Math.sin(a) * r, s: 2 + Math.random() * 7, rx: Math.random() * Math.PI, ry: Math.random() * Math.PI });
    }
    return out;
  }, [map.voidY]);
  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#12101f", emissive: new THREE.Color(accent), emissiveIntensity: 0.15, roughness: 1, flatShading: true }), [accent]);
  const nebulaMat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }), [accent]);
  const nebulaMat2 = useMemo(() => new THREE.MeshBasicMaterial({ color: "#3b82f6", transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }), []);

  useFrame((_, rawDelta) => {
    if (debrisRef.current) debrisRef.current.rotation.y += Math.min(rawDelta, 0.05) * 0.02;
  });

  return (
    <group>
      {/* Distant nebula clouds */}
      <mesh position={[-120, map.voidY + 60, -140]} material={nebulaMat} rotation={[0.4, 0.6, 0]}>
        <planeGeometry args={[220, 180]} />
      </mesh>
      <mesh position={[130, map.voidY + 100, -120]} material={nebulaMat2} rotation={[-0.3, -0.5, 0.2]}>
        <planeGeometry args={[260, 200]} />
      </mesh>
      {/* A distant planet with a glowing rim */}
      <mesh position={[110, map.voidY + 40, -170]}>
        <sphereGeometry args={[34, 32, 32]} />
        <meshStandardMaterial color="#1b1030" emissive={new THREE.Color(accent)} emissiveIntensity={0.4} roughness={0.8} />
      </mesh>
      {/* Slowly orbiting rock debris */}
      <group ref={debrisRef}>
        {debris.map((d, i) => (
          <mesh key={i} position={[d.x, d.y, d.z]} rotation={[d.rx, d.ry, 0]} scale={d.s} material={rockMat}>
            <icosahedronGeometry args={[1, 0]} />
          </mesh>
        ))}
      </group>
      <DriftParticles count={200} radius={100} height={120} baseY={map.voidY} color={accent} size={0.5} speed={2.2} dir={1} opacity={0.7} />
    </group>
  );
}
