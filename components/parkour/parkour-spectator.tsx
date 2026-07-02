"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Sky, Stars } from "@react-three/drei";
import { ParkourGeometry, type CheckpointProgressRef, type CrumbleStateRef } from "@/components/parkour/parkour-geometry";
import { ParkourEnvironment } from "@/components/parkour/parkour-environment";
import { ParkourGhosts, type GhostRuntime, type GhostView } from "@/components/parkour/parkour-ghosts";
import { PITCH_MIN, PITCH_MAX, type CameraControls } from "@/components/world/use-camera-controls";
import type { ParkourMap } from "@/lib/parkour-config";

const MIN_CAMERA_WORLD_Y = 0.6;

/**
 * Cinematic spectator camera — no local player, no pointer-lock. Follows the
 * chosen player over-the-shoulder using THEIR broadcast yaw (so watching feels
 * like riding along), or, with no target, slowly auto-orbits the whole course.
 * Scroll wheel zooms (cc.distance works without a pointer lock, so the on-screen
 * spectator buttons stay clickable). Zero per-frame allocation.
 */
function SpectatorCamera({
  map, ghostsRef, targetId, cameraControls,
}: {
  map: ParkourMap;
  ghostsRef: React.RefObject<Map<string, GhostRuntime>>;
  targetId: string | null;
  cameraControls: CameraControls;
}) {
  const { camera } = useThree();
  const focus = useRef(new THREE.Vector3(map.start[0], map.start[1] + 1, map.start[2]));
  const desired = useRef(new THREE.Vector3());
  const camPos = useRef(new THREE.Vector3());

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    const cc = cameraControls.state.current;
    const dist = cc.distance;
    const runtimes = ghostsRef.current;

    // ── Resolve the focus point (and the yaw to sit behind, if following) ──
    let followYaw: number | null = null;
    const gr = targetId ? runtimes?.get(targetId) : null;
    if (gr && gr.hasPos) {
      desired.current.copy(gr.target);
      followYaw = gr.yaw;
    } else {
      let fx = 0, fy = 0, fz = 0, n = 0;
      if (runtimes) for (const g of runtimes.values()) if (g.hasPos) { fx += g.target.x; fy += g.target.y; fz += g.target.z; n++; }
      if (n > 0) desired.current.set(fx / n, fy / n, fz / n);
      else desired.current.set(map.start[0], map.start[1], map.start[2]);
    }
    focus.current.lerp(desired.current, 1 - Math.exp(-delta * 6));

    // ── Placement ──
    let yaw: number, pitch: number;
    if (followYaw !== null) {
      yaw = followYaw;         // sit directly behind the followed runner's heading
      pitch = 0.30;
    } else {
      yaw = state.clock.elapsedTime * 0.12;  // slow cinematic overview orbit
      pitch = 0.50;
    }
    pitch = THREE.MathUtils.clamp(pitch, PITCH_MIN, PITCH_MAX);
    const cy = Math.cos(pitch);
    const dirX = -Math.sin(yaw) * cy;
    const dirY = Math.sin(pitch);
    const dirZ = -Math.cos(yaw) * cy;
    camPos.current.set(
      focus.current.x + dirX * dist,
      focus.current.y + dirY * dist + 1.0,
      focus.current.z + dirZ * dist,
    );
    if (camPos.current.y < MIN_CAMERA_WORLD_Y) camPos.current.y = MIN_CAMERA_WORLD_Y;
    // Smoothly chase the desired camera pose (no snap when switching targets).
    camera.position.lerp(camPos.current, 1 - Math.exp(-delta * 8));
    camera.lookAt(focus.current.x, focus.current.y + 1, focus.current.z);
  });

  return null;
}

/** The full spectator scene: themed backdrop + course geometry + every runner as
 * a live ghost + the cinematic follow camera. Mount it keyed by `map.id`. */
export function ParkourSpectatorScene({
  selfId, map, ghostsRef, targetId, cameraControls, onViewsChange,
}: {
  selfId: string;
  map: ParkourMap;
  ghostsRef: React.RefObject<Map<string, GhostRuntime>>;
  targetId: string | null;
  cameraControls: CameraControls;
  onViewsChange?: (views: GhostView[]) => void;
}) {
  const t = map.theme;
  const progressRef = useRef<CheckpointProgressRef>({ current: -1 });
  const crumbleRef = useMemo<React.RefObject<CrumbleStateRef>>(
    () => ({ current: { states: new Float32Array(map.crumbleCount) } }),
    [map],
  );

  return (
    <>
      <color attach="background" args={[t.fog]} />
      <fog attach="fog" args={[t.fog, 55, 300]} />
      <Sky distance={450000} sunPosition={t.sunPosition} turbidity={t.stars > 0 ? 4 : 6} rayleigh={t.stars > 0 ? 0.4 : 2.2} mieCoefficient={0.02} mieDirectionalG={0.9} />
      {t.stars > 0 && <Stars radius={160} depth={60} count={Math.min(t.stars, 1600)} factor={3} fade speed={0.4} />}

      <ambientLight intensity={0.95} color={t.ambient} />
      <hemisphereLight args={[t.ambient, t.ground, 0.85]} />
      <directionalLight position={t.sunPosition} intensity={1.7} color="#ffffff" />
      <pointLight position={[map.start[0], map.start[1] + 6, map.start[2]]} intensity={8} color={t.accent} distance={30} decay={2} />

      <ParkourEnvironment map={map} />
      <ParkourGeometry map={map} progressRef={progressRef} crumbleRef={crumbleRef} />
      <ParkourGhosts selfId={selfId} ghostsRef={ghostsRef} onViewsChange={onViewsChange} />
      <SpectatorCamera map={map} ghostsRef={ghostsRef} targetId={targetId} cameraControls={cameraControls} />
    </>
  );
}
