"use client";

import { useMemo } from "react";
import { Sky, Stars } from "@react-three/drei";
import { ParkourGeometry, type CheckpointProgressRef, type CrumbleStateRef } from "@/components/parkour/parkour-geometry";
import { ParkourEnvironment } from "@/components/parkour/parkour-environment";
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
  onHazardHit?: () => void;
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
  onHazardHit,
}: ParkourSceneProps) {
  const t = map.theme;
  // Shared crumble-platform state — one stable ref object per map, written by the
  // player each frame, read by the geometry. (Reset on run reset lives in player.)
  const crumbleRef = useMemo<React.RefObject<CrumbleStateRef>>(
    () => ({ current: { states: new Float32Array(map.crumbleCount) } }),
    [map]
  );
  return (
    <>
      <color attach="background" args={[t.fog]} />
      <fog attach="fog" args={[t.fog, 55, 300]} />
      <Sky distance={450000} sunPosition={t.sunPosition} turbidity={t.stars > 0 ? 4 : 6} rayleigh={t.stars > 0 ? 0.4 : 2.2} mieCoefficient={0.02} mieDirectionalG={0.9} />
      {t.stars > 0 && <Stars radius={160} depth={60} count={Math.min(t.stars, 1600)} factor={3} fade speed={0.4} />}

      {/* No real-time shadows in parkour: platforms float in the void (almost
          nothing receives them) and a moving caster (the player) forces a full
          shadow-map re-render EVERY frame — the biggest per-frame GPU cost. We
          brighten the fill lights a touch to compensate. Result: rock-steady FPS. */}
      <ambientLight intensity={0.95} color={t.ambient} />
      <hemisphereLight args={[t.ambient, t.ground, 0.85]} />
      <directionalLight position={t.sunPosition} intensity={1.7} color="#ffffff" />
      <pointLight position={[map.start[0], map.start[1] + 6, map.start[2]]} intensity={8} color={t.accent} distance={30} decay={2} />

      {/* Cinematic themed backdrop (neon skyline / dawn islands / lava world /
          cosmic spire) — replaces the old bare abyss disc. Purely decorative;
          the environment provides its own floor far below the course. */}
      <ParkourEnvironment map={map} />

      <ParkourGeometry map={map} progressRef={progressRef} crumbleRef={crumbleRef} />

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
        crumbleRef={crumbleRef}
        onFinish={onFinish}
        onCheckpoint={onCheckpoint}
        onFall={onFall}
        onFirstMove={onFirstMove}
        onHazardHit={onHazardHit}
      />

      {multiplayer && <ParkourGhosts selfId={userId} />}
    </>
  );
}
