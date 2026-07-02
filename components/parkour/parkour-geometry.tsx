"use client";

import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  moverCenterAt, spinnerAngleAt, sliderPosAt,
  type ParkourMap, type ParkourMover, type ParkourPlatform, type ParkourHazard,
} from "@/lib/parkour-config";

/** Which checkpoint the player has armed (drives the checkpoint glow). */
export interface CheckpointProgressRef {
  current: number;
}

/** Shared crumble state: one float per crumble platform. 0 = solid; once stepped
 * on it counts UP (seconds); collapsed once it passes CRUMBLE_DELAY. */
export interface CrumbleStateRef {
  states: Float32Array;
}

/** Must match parkour-player.tsx's CRUMBLE_DELAY. */
const CRUMBLE_DELAY = 0.5;

function platformColor(pl: ParkourPlatform, theme: ParkourMap["theme"]): string {
  return pl.color ?? theme.platform;
}

/** A static (non-crumble) platform — NO useFrame, so 100+ of them cost nothing. */
function PlatformMesh({ pl, theme }: { pl: ParkourPlatform; theme: ParkourMap["theme"] }) {
  const color = platformColor(pl, theme);
  return (
    <mesh position={pl.pos} receiveShadow>
      <boxGeometry args={pl.size} />
      <meshStandardMaterial
        color={color}
        emissive={pl.glow ?? "#000000"}
        emissiveIntensity={pl.glow ? 0.45 : 0}
        metalness={pl.ice ? 0.1 : 0.15}
        roughness={pl.ice ? 0.05 : 0.7}
        transparent={pl.ice}
        opacity={pl.ice ? 0.72 : 1}
      />
    </mesh>
  );
}

/** A crumbling platform: shakes + reddens once triggered, then drops away and
 * fades. Reads the shared crumble state each frame (no React re-render). */
function CrumblePlatform({ pl, crumbleRef }: { pl: ParkourPlatform; crumbleRef: React.RefObject<CrumbleStateRef> }) {
  const group = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const idx = pl.crumbleIndex ?? -1;
  const [bx, by, bz] = pl.pos;
  useFrame(() => {
    const g = group.current;
    const st = crumbleRef.current?.states;
    if (!g) return;
    const s = idx >= 0 && st ? st[idx] : 0;
    if (s <= 0) {
      g.position.set(bx, by, bz);
      g.visible = true;
      if (matRef.current) { matRef.current.emissiveIntensity = 0.4; matRef.current.opacity = 1; }
      return;
    }
    if (s >= CRUMBLE_DELAY) {
      const drop = s - CRUMBLE_DELAY;
      g.position.set(bx, by - drop * drop * 30, bz);
      g.visible = drop < 0.8;
      if (matRef.current) matRef.current.opacity = Math.max(0, 1 - drop * 2);
      return;
    }
    // Crumbling: shake harder as it approaches collapse + flash red.
    const k = s / CRUMBLE_DELAY;
    g.position.set(bx + (Math.random() - 0.5) * 0.09 * k, by + (Math.random() - 0.5) * 0.07 * k, bz + (Math.random() - 0.5) * 0.09 * k);
    if (matRef.current) matRef.current.emissiveIntensity = 0.5 + k * 1.2;
  });
  return (
    <group ref={group} position={pl.pos}>
      <mesh receiveShadow>
        <boxGeometry args={pl.size} />
        <meshStandardMaterial ref={matRef} color="#f59e0b" emissive="#f97316" emissiveIntensity={0.4} metalness={0.2} roughness={0.6} transparent />
      </mesh>
    </group>
  );
}

function MoverMesh({ mover, theme }: { mover: ParkourMover; theme: ParkourMap["theme"] }) {
  const ref = useRef<THREE.Mesh>(null);
  const color = mover.color ?? theme.accent;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const [x, y, z] = moverCenterAt(mover, clock.elapsedTime);
    ref.current.position.set(x, y, z);
  });
  return (
    <mesh ref={ref} position={mover.pos} receiveShadow>
      <boxGeometry args={mover.size} />
      <meshStandardMaterial color={color} emissive={mover.glow ?? color} emissiveIntensity={0.55} metalness={0.2} roughness={0.5} />
    </mesh>
  );
}

/** Rotating kill-bar. The visual angle matches the collision (rotation.y = -angle
 * so local +x maps to (cos a, 0, sin a), exactly what hazardHit uses). */
function SpinnerHazard({ h }: { h: ParkourHazard }) {
  const ref = useRef<THREE.Group>(null);
  const len = h.length ?? 2.4;
  const col = h.color ?? "#ef4444";
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.y = -spinnerAngleAt(h, clock.elapsedTime); });
  return (
    <group position={h.pos}>
      <group ref={ref}>
        <mesh position={[len / 2, 0, 0]}>
          <boxGeometry args={[len, 0.22, 0.22]} />
          <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.9} toneMapped={false} />
        </mesh>
        <mesh position={[len, 0, 0]}>
          <sphereGeometry args={[h.killR * 0.9, 12, 12]} />
          <meshStandardMaterial color="#fca5a5" emissive={col} emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      </group>
      <mesh><cylinderGeometry args={[0.2, 0.2, 0.5, 10]} /><meshStandardMaterial color="#7f1d1d" emissive="#7f1d1d" emissiveIntensity={0.4} /></mesh>
    </group>
  );
}

/** Moving saw disc that slides along a path. */
function SliderHazard({ h }: { h: ParkourHazard }) {
  const ref = useRef<THREE.Mesh>(null);
  const col = h.color ?? "#ef4444";
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const [x, y, z] = sliderPosAt(h, clock.elapsedTime);
    ref.current.position.set(x, y, z);
    ref.current.rotation.y += 0.4;
  });
  return (
    <mesh ref={ref} position={h.pos} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[h.killR, h.killR, 0.14, 18]} />
      <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.95} metalness={0.4} roughness={0.3} toneMapped={false} />
    </mesh>
  );
}

function CheckpointRing({
  index, pos, radius, progressRef, accent,
}: {
  index: number; pos: [number, number, number]; radius: number;
  progressRef: React.RefObject<CheckpointProgressRef>; accent: string;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const pillarRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const reached = (progressRef.current?.current ?? -1) >= index;
    const t = clock.elapsedTime;
    if (ringRef.current) {
      ringRef.current.rotation.z = t * (reached ? 1.6 : 0.5);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = reached ? 0.85 : 0.3 + Math.sin(t * 2) * 0.12;
    }
    if (pillarRef.current) pillarRef.current.emissiveIntensity = reached ? 1.1 : 0.35 + Math.sin(t * 2) * 0.15;
  });
  return (
    <group position={pos}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <torusGeometry args={[radius, 0.12, 10, 40]} />
        <meshBasicMaterial color={accent} transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 4, 8]} />
        <meshStandardMaterial ref={pillarRef} color={accent} emissive={accent} emissiveIntensity={0.4} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

function FinishPad({ pos, size, accent }: { pos: [number, number, number]; size: [number, number, number]; accent: string }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ringRef.current) ringRef.current.rotation.z = t * 2.2;
    if (beamRef.current) beamRef.current.opacity = 0.18 + Math.sin(t * 2.5) * 0.1;
  });
  const topY = pos[1] + size[1] / 2;
  return (
    <group>
      <mesh position={pos} receiveShadow castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#facc15" emissive="#f59e0b" emissiveIntensity={0.7} metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[pos[0], topY + 0.08, pos[2]]}>
        <torusGeometry args={[size[0] / 2 + 0.4, 0.16, 12, 48]} />
        <meshBasicMaterial color="#fde047" transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <mesh position={[pos[0], topY + 14, pos[2]]}>
        <cylinderGeometry args={[size[0] / 2, size[0] / 2, 28, 16, 1, true]} />
        <meshBasicMaterial ref={beamRef} color={accent} transparent opacity={0.2} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
      </mesh>
      <pointLight position={[pos[0], topY + 3, pos[2]]} color="#fde047" intensity={8} distance={16} decay={2} />
    </group>
  );
}

function StartMarker({ pos, accent }: { pos: [number, number, number]; accent: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[pos[0], pos[1] + 0.56, pos[2]]}>
      <ringGeometry args={[1.4, 1.9, 40]} />
      <meshBasicMaterial color={accent} transparent opacity={0.4} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Memoized: `map` + refs are stable for a whole run, so the 100+ meshes are
 * reconciled ONCE. Crumble/mover/hazard/checkpoint meshes self-animate via their
 * own useFrame reading shared refs — the parent never re-renders during a run. */
export const ParkourGeometry = memo(function ParkourGeometry({
  map,
  progressRef,
  crumbleRef,
}: {
  map: ParkourMap;
  progressRef: React.RefObject<CheckpointProgressRef>;
  crumbleRef: React.RefObject<CrumbleStateRef>;
}) {
  return (
    <group>
      <StartMarker pos={map.start} accent={map.theme.accent} />
      {map.platforms.map((pl, i) =>
        pl.crumble
          ? <CrumblePlatform key={`p${i}`} pl={pl} crumbleRef={crumbleRef} />
          : <PlatformMesh key={`p${i}`} pl={pl} theme={map.theme} />
      )}
      {map.movers.map((m, i) => <MoverMesh key={`m${i}`} mover={m} theme={map.theme} />)}
      {map.hazards.map((h, i) =>
        h.kind === "spinner"
          ? <SpinnerHazard key={`h${i}`} h={h} />
          : <SliderHazard key={`h${i}`} h={h} />
      )}
      {map.checkpoints.map((c) => (
        <CheckpointRing key={`c${c.index}`} index={c.index} pos={c.pos} radius={c.radius} progressRef={progressRef} accent={map.theme.accent} />
      ))}
      <FinishPad pos={map.finish} size={map.finishSize} accent={map.theme.accent} />
    </group>
  );
});
