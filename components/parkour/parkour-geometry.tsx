"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  moverCenterAt,
  type ParkourMap,
  type ParkourMover,
  type ParkourPlatform,
} from "@/lib/parkour-config";

/** Which checkpoint the player has armed (drives the checkpoint glow). Shared
 * ref written by the player each frame — read here to light up reached rings. */
export interface CheckpointProgressRef {
  current: number; // index of the highest reached checkpoint, -1 = none
}

function platformColor(pl: ParkourPlatform, theme: ParkourMap["theme"]): string {
  return pl.color ?? theme.platform;
}

/** One static platform box. Emissive glow tints edges; hazard/ice/bounce get
 * their own material treatment so they read at a glance. */
function PlatformMesh({ pl, theme }: { pl: ParkourPlatform; theme: ParkourMap["theme"] }) {
  const color = platformColor(pl, theme);
  const glow = pl.glow ?? (pl.kill ? "#ef4444" : undefined);
  const killRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (pl.kill && killRef.current) {
      killRef.current.emissiveIntensity = 0.6 + Math.sin(clock.elapsedTime * 4) * 0.35;
    }
  });
  return (
    <mesh position={pl.pos} castShadow receiveShadow>
      <boxGeometry args={pl.size} />
      <meshStandardMaterial
        ref={killRef}
        color={color}
        emissive={glow ?? "#000000"}
        emissiveIntensity={glow ? 0.5 : 0}
        metalness={pl.ice ? 0.1 : 0.15}
        roughness={pl.ice ? 0.05 : 0.7}
        transparent={pl.ice}
        opacity={pl.ice ? 0.72 : 1}
      />
    </mesh>
  );
}

/** A moving platform. Reads the SAME deterministic moverCenterAt() the physics
 * uses (both keyed on clock.elapsedTime) so the box you see is exactly the box
 * you can stand on — no drift. */
function MoverMesh({ mover, theme }: { mover: ParkourMover; theme: ParkourMap["theme"] }) {
  const ref = useRef<THREE.Mesh>(null);
  const color = mover.color ?? theme.accent;
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const [x, y, z] = moverCenterAt(mover, clock.elapsedTime);
    ref.current.position.set(x, y, z);
  });
  return (
    <mesh ref={ref} position={mover.pos} castShadow receiveShadow>
      <boxGeometry args={mover.size} />
      <meshStandardMaterial
        color={color}
        emissive={mover.glow ?? color}
        emissiveIntensity={0.55}
        metalness={0.2}
        roughness={0.5}
      />
    </mesh>
  );
}

/** Pulsing checkpoint ring — brightens once the player has armed it. */
function CheckpointRing({
  index,
  pos,
  radius,
  progressRef,
  accent,
}: {
  index: number;
  pos: [number, number, number];
  radius: number;
  progressRef: React.RefObject<CheckpointProgressRef>;
  accent: string;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const pillarRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const reached = (progressRef.current?.current ?? -1) >= index;
    const t = clock.elapsedTime;
    if (ringRef.current) {
      ringRef.current.rotation.z = t * (reached ? 1.6 : 0.5);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = reached ? 0.85 : 0.3 + Math.sin(t * 2) * 0.12;
    }
    if (pillarRef.current) {
      pillarRef.current.emissiveIntensity = reached ? 1.1 : 0.35 + Math.sin(t * 2) * 0.15;
    }
  });
  const col = accent;
  return (
    <group position={pos}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <torusGeometry args={[radius, 0.12, 10, 40]} />
        <meshBasicMaterial color={col} transparent opacity={0.5} toneMapped={false} />
      </mesh>
      {/* Beacon so a checkpoint is visible from a distance. */}
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 4, 8]} />
        <meshStandardMaterial ref={pillarRef} color={col} emissive={col} emissiveIntensity={0.4} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

/** The finish pad — a glowing platform + spinning victory ring + light beam. */
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
      {/* Sky beam */}
      <mesh position={[pos[0], topY + 14, pos[2]]}>
        <cylinderGeometry args={[size[0] / 2, size[0] / 2, 28, 16, 1, true]} />
        <meshBasicMaterial ref={beamRef} color={accent} transparent opacity={0.2} side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
      </mesh>
      <pointLight position={[pos[0], topY + 3, pos[2]]} color="#fde047" intensity={8} distance={16} decay={2} />
    </group>
  );
}

/** Start pad marker — a soft ring so the player sees where they began. */
function StartMarker({ pos, accent }: { pos: [number, number, number]; accent: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[pos[0], pos[1] + 0.56, pos[2]]}>
      <ringGeometry args={[1.4, 1.9, 40]} />
      <meshBasicMaterial color={accent} transparent opacity={0.4} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function ParkourGeometry({
  map,
  progressRef,
}: {
  map: ParkourMap;
  progressRef: React.RefObject<CheckpointProgressRef>;
}) {
  return (
    <group>
      <StartMarker pos={map.start} accent={map.theme.accent} />
      {map.platforms.map((pl, i) => (
        <PlatformMesh key={`p${i}`} pl={pl} theme={map.theme} />
      ))}
      {map.movers.map((m, i) => (
        <MoverMesh key={`m${i}`} mover={m} theme={map.theme} />
      ))}
      {map.checkpoints.map((c) => (
        <CheckpointRing
          key={`c${c.index}`}
          index={c.index}
          pos={c.pos}
          radius={c.radius}
          progressRef={progressRef}
          accent={map.theme.accent}
        />
      ))}
      <FinishPad pos={map.finish} size={map.finishSize} accent={map.theme.accent} />
    </group>
  );
}
