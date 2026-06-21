"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { EquippedItem } from "@/lib/rarity-colors";
import { CharacterModel, type CharacterLimbRefs } from "@/components/world/character-model";
import { useKeyboardControls } from "@/components/world/use-keyboard-controls";
import type { CameraControls } from "@/components/world/use-camera-controls";
import { WORLD_RADIUS } from "@/lib/world-config";

interface PlayerProps {
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  name: string;
  cameraControls: CameraControls;
}

const SPEED = 4.5;
const SPRINT_MULTIPLIER = 1.8;
const ACCEL_RATE = 8; // higher = snappier velocity response, still delta-scaled
const ROTATE_RATE = 10;
const CAMERA_FOLLOW_RATE = 6;
// Deliberately slow — this is the rate the camera's own yaw eases toward
// "behind the direction you're currently running" when you're not
// dragging. Anything fast here is exactly what made the camera feel like
// it was "spinning wildly" any time the player changed direction; at this
// rate a full reversal takes roughly half a second to catch up, which
// reads as a deliberate cinematic follow instead of a snap.
const CAMERA_AUTO_FOLLOW_RATE = 1.4;
// Below this speed the player is essentially stationary (still
// decelerating, or just tapped a key) — auto-follow staying off here means
// standing still never makes the camera drift on its own.
const AUTO_FOLLOW_MIN_SPEED_SQ = 0.5;
const GRAVITY = -18;
const JUMP_VELOCITY = 6.2;
const BASE_FOV = 55;
const SPRINT_FOV = 62;
const FOV_RATE = 5;

/** Shortest-path angle lerp — plain `THREE.MathUtils.lerp(a, b, t)` on raw
 * yaw radians breaks at the -π/π wraparound (e.g. easing from 3.0 to -3.0
 * would spin almost all the way around instead of taking the obvious
 * short way), which is its own source of "camera spins wildly" bugs
 * independent of the rate it happens at. */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/** Lives outside the component on purpose — the React Compiler's
 * immutability check flags direct `camera.fov = x` reassignment *inside* a
 * component that called `useThree()`, even though mutating a three.js
 * object imperatively inside `useFrame` (same as `camera.position.lerp(…)`
 * a few lines below) is the standard, intended r3f pattern. Routing the
 * actual field assignment through a plain function declared at module
 * scope keeps that mutation out of the flagged scope without changing
 * what it does. */
function applySprintFov(cam: THREE.PerspectiveCamera, targetFov: number, t: number) {
  cam.fov = THREE.MathUtils.lerp(cam.fov, targetFov, t);
  cam.updateProjectionMatrix();
}

/** Same module-scope-mutation-function trick as applySprintFov above —
 * `cc` here is reached through the `cameraControls` prop, and the React
 * Compiler flags direct field assignment on anything reachable from a
 * prop/hook value inside the component body, even though mutating a
 * plain ref's `.current` contents in `useFrame` is the standard r3f
 * pattern for camera state shared between hooks. */
function applyAutoFollowYaw(cc: { yaw: number }, targetYaw: number, t: number) {
  cc.yaw = lerpAngle(cc.yaw, targetYaw, t);
}

/**
 * Adds WASD movement + Space jump + Shift sprint, a free-look third-person
 * camera (right-mouse-drag to orbit, scroll wheel to zoom — see use-camera-
 * controls.ts), and a procedural walk-cycle on top of the shared
 * CharacterModel. The walk-cycle mutates the leg/arm meshes' `.rotation.x`
 * directly via refs every frame — imperative, zero React re-renders. All
 * smoothing (velocity, rotation, camera, FOV) is scaled by `delta`, not a
 * bare lerp factor, so motion feels identical regardless of the actual
 * frame rate.
 *
 * Camera model (this is the part that kept "bugging out" before a full
 * rewrite): the camera's yaw is now one persistent, absolute value —
 * exactly like a standard third-person action game (Fortnite/GTA-style),
 * not a delta re-derived every frame from the character's own rotation.
 * Two, and only two, things ever change it:
 *   1. Right-mouse-drag — directly, instantly, always wins.
 *   2. A slow (~0.7s) auto-follow toward the current running direction,
 *      and *only* while actually moving above a real speed and not being
 *      dragged.
 * WASD is built from that same yaw, so "forward" always means "into the
 * screen" — and because the camera itself only ever changes slowly and
 * deliberately, there is no path left for it to suddenly swing to the
 * front of the character or spin on a quick direction change.
 */
export function Player({ equippedByCategory, gender, name, cameraControls }: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const limbs = useRef<CharacterLimbRefs>(null);
  const keys = useKeyboardControls();
  const { camera } = useThree();

  // Pre-allocated scratch objects — reused every frame, never replaced.
  const velocity = useRef(new THREE.Vector3());
  const inputDir = useRef(new THREE.Vector3());
  const forwardVec = useRef(new THREE.Vector3());
  const rightVec = useRef(new THREE.Vector3());
  const cameraTarget = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const walkClock = useRef(0);
  const walkAmplitude = useRef(0);

  // Jump physics, tracked separately from the walk-cycle's foot bob — both
  // end up added together into the group's final position.y each frame.
  const verticalVelocity = useRef(0);
  const baseY = useRef(0);
  const grounded = useRef(true);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;

    const cc = cameraControls.state.current;
    // Movement basis for *this* frame, from last frame's settled camera
    // yaw — reading it before this frame's auto-follow update below means
    // there's no same-frame feedback between "which way can I walk" and
    // "where is the camera easing to", just a single, imperceptible frame
    // of lag.
    forwardVec.current.set(Math.sin(cc.yaw), 0, Math.cos(cc.yaw));
    rightVec.current.set(Math.sin(cc.yaw + Math.PI / 2), 0, Math.cos(cc.yaw + Math.PI / 2));

    const moveX = (keys.state.current.right ? 1 : 0) - (keys.state.current.left ? 1 : 0);
    const moveZ = (keys.state.current.forward ? 1 : 0) - (keys.state.current.backward ? 1 : 0);
    inputDir.current
      .set(0, 0, 0)
      .addScaledVector(forwardVec.current, moveZ)
      .addScaledVector(rightVec.current, moveX);
    const moving = inputDir.current.lengthSq() > 0.0001;
    const sprinting = moving && keys.state.current.sprint;

    const targetVelocity = moving
      ? inputDir.current.normalize().multiplyScalar(SPEED * (sprinting ? SPRINT_MULTIPLIER : 1))
      : inputDir.current.set(0, 0, 0);

    velocity.current.lerp(targetVelocity, Math.min(1, delta * ACCEL_RATE));
    g.position.addScaledVector(velocity.current, delta);

    // World border: a hard circular clamp, paired with the visible ring +
    // crystal pillars in scene.tsx/environment.tsx — push past the edge and
    // you're shoved back along the same radius instead of an invisible
    // wall that just silently halts you with no visual explanation.
    const distFromCenter = Math.hypot(g.position.x, g.position.z);
    if (distFromCenter > WORLD_RADIUS) {
      const scale = WORLD_RADIUS / distFromCenter;
      g.position.x *= scale;
      g.position.z *= scale;
    }

    // The character's *own* body rotation — purely cosmetic (which way the
    // model visually faces), completely separate from the camera now. It
    // still turns to face wherever it's actually moving, same as before.
    if (velocity.current.lengthSq() > 0.01) {
      const targetAngle = Math.atan2(velocity.current.x, velocity.current.z);
      g.rotation.y = lerpAngle(g.rotation.y, targetAngle, Math.min(1, delta * ROTATE_RATE));
    }

    // Jump: one-shot impulse, the hook itself clears the flag when consumed
    // so holding Space doesn't keep re-triggering it every frame.
    if (keys.consumeJump() && grounded.current) {
      verticalVelocity.current = JUMP_VELOCITY;
      grounded.current = false;
    }
    verticalVelocity.current += GRAVITY * delta;
    baseY.current += verticalVelocity.current * delta;
    if (baseY.current <= 0) {
      baseY.current = 0;
      verticalVelocity.current = 0;
      grounded.current = true;
    }

    // Sprinting pumps the legs faster (not just moving faster) and gives a
    // subtle FOV kick — both standard "you are now sprinting" reads in
    // third-person action games, purely cosmetic but what makes sprint
    // *feel* like sprinting rather than just a bigger number on velocity.
    const cam = camera as THREE.PerspectiveCamera;
    const targetFov = sprinting ? SPRINT_FOV : BASE_FOV;
    if (Math.abs(cam.fov - targetFov) > 0.01) {
      applySprintFov(cam, targetFov, Math.min(1, delta * FOV_RATE));
    }

    walkClock.current += delta * (sprinting ? 12.5 : 8);
    walkAmplitude.current = THREE.MathUtils.lerp(
      walkAmplitude.current,
      moving && grounded.current ? 1 : 0,
      Math.min(1, delta * 6)
    );
    const swing = Math.sin(walkClock.current) * walkAmplitude.current * (sprinting ? 0.68 : 0.5);

    const l = limbs.current;
    if (l) {
      if (l.legL.current) l.legL.current.rotation.x = swing;
      if (l.legR.current) l.legR.current.rotation.x = -swing;
      if (l.armL.current) l.armL.current.rotation.x = -swing;
      if (l.armR.current) l.armR.current.rotation.x = swing;
    }

    const footBob =
      moving && grounded.current ? Math.abs(Math.sin(walkClock.current * 2)) * 0.04 : 0;
    g.position.y = baseY.current + footBob;

    // Camera auto-follow: only while genuinely moving (above a real speed,
    // not just twitching) and not mid-drag, slowly rotate the camera's own
    // persistent yaw toward "behind the direction of travel". Slow and
    // angle-wraparound-safe (lerpAngle) on purpose — see CAMERA_AUTO_
    // FOLLOW_RATE above for why.
    if (!cc.dragging && moving && velocity.current.lengthSq() > AUTO_FOLLOW_MIN_SPEED_SQ) {
      const travelYaw = Math.atan2(velocity.current.x, velocity.current.z);
      applyAutoFollowYaw(cc, travelYaw, Math.min(1, delta * CAMERA_AUTO_FOLLOW_RATE));
    }

    // Camera placement: sits *behind* the view direction (the opposite of
    // where it looks), looking at the player. Recomputed from the
    // just-updated cc.yaw above, not the stale forwardVec from the top of
    // this frame, so the placement always reflects this frame's actual
    // camera yaw.
    const lookX = Math.sin(cc.yaw);
    const lookZ = Math.cos(cc.yaw);
    const offsetX = -lookX * Math.cos(cc.pitch) * cc.distance;
    const offsetZ = -lookZ * Math.cos(cc.pitch) * cc.distance;
    const offsetY = Math.sin(cc.pitch) * cc.distance;
    cameraTarget.current.set(g.position.x + offsetX, g.position.y + offsetY, g.position.z + offsetZ);
    camera.position.lerp(cameraTarget.current, Math.min(1, delta * CAMERA_FOLLOW_RATE));
    lookTarget.current.set(g.position.x, g.position.y + 1, g.position.z);
    camera.lookAt(lookTarget.current);
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      <CharacterModel
        ref={limbs}
        equippedByCategory={equippedByCategory}
        gender={gender}
        name={name}
      />
    </group>
  );
}
