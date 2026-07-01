"use client";

import { Sky, Stars } from "@react-three/drei";
import * as THREE from "three";
import { ParkourGeometry, type CheckpointProgressRef } from "@/components/parkour/parkour-geometry";
import { ParkourPlayer } from "@/components/parkour/parkour-player";
import { ParkourGhosts } from "@/components/parkour/parkour-ghosts";
import type { ParkourMap } from "@/lib/parkour-config";
import type { CameraControls } from "@/components/world/use-camera-controls";
import type { EquippedItem } from "@/lib/rarity-colors";

export interface ParkourSceneProps {
  userId: string;
  username: string;
  map: ParkourMap;
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  cameraControls: CameraControls;
  running: boolean;
  mobileMode?: boolean;
  resetSignal: number;
  multiplayer?: boolean;
  progressRef: React.RefObject<CheckpointProgressRef>;
  onFinish?: () => void;
  onCheckpoint?: (index: number) => void;
  onFall?: () => void;
  onFirstMove?: () => void;
}

export function ParkourScene({
  userId,
  username,
  map,
  equippedByCategory,
  gender,
  cameraControls,
  running,
  mobileMode = false,
  resetSignal,
  multiplayer = false,
  progressRef,
  onFinish,
  onCheckpoint,
  onFall,
  onFirstMove,
}: ParkourSceneProps) {
  const t = map.theme;
  return (
    <>
      <color attach="background" args={[t.fog]} />
      <fog attach="fog" args={[t.fog, 40, 200]} />
      <Sky distance={450000} sunPosition={t.sunPosition} turbidity={8} rayleigh={t.stars > 0 ? 0.4 : 2.2} mieCoefficient={0.02} mieDirectionalG={0.9} />
      {t.stars > 0 && <Stars radius={160} depth={60} count={t.stars} factor={3} fade speed={0.4} />}

      <ambientLight intensity={0.85} color={t.ambient} />
      <hemisphereLight args={[t.ambient, t.ground, 0.7]} />
      <directionalLight position={t.sunPosition} intensity={1.5} color="#ffffff" castShadow shadow-mapSize={[1024, 1024]}>
        <orthographicCamera attach="shadow-camera" args={[-40, 40, 40, -40, 0.1, 200]} />
      </directionalLight>
      <pointLight position={[map.start[0], map.start[1] + 6, map.start[2]]} intensity={8} color={t.accent} distance={30} decay={2} />

      {/* Abyss floor far below — a dark disc so the void reads as a drop, not
          the white browser background, if the render ever stutters one frame. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, map.voidY - 4, 0]}>
        <circleGeometry args={[400, 48]} />
        <meshBasicMaterial color={t.ground} side={THREE.DoubleSide} />
      </mesh>

      <ParkourGeometry map={map} progressRef={progressRef} />

      <ParkourPlayer
        userId={userId}
        name={username}
        map={map}
        equippedByCategory={equippedByCategory}
        gender={gender}
        cameraControls={cameraControls}
        running={running}
        mobileMode={mobileMode}
        resetSignal={resetSignal}
        multiplayer={multiplayer}
        progressRef={progressRef}
        onFinish={onFinish}
        onCheckpoint={onCheckpoint}
        onFall={onFall}
        onFirstMove={onFirstMove}
      />

      {multiplayer && <ParkourGhosts selfId={userId} colorHex={t.accent} />}
    </>
  );
}
