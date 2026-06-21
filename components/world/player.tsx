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
const GRAVITY = -18;
const JUMP_VELOCITY = 6.2;
const BASE_FOV = 55;
const SPRINT_FOV = 62;
const FOV_RATE = 5;

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
 * Movement is **camera-relative**, not fixed-world-axis: WASD is built from
 * the camera's current viewing direction (`viewYaw` below), so "forward"
 * always means "into the screen" no matter which way the player or camera
 * currently face. The old version mapped W/S/A/D straight onto world Z/X,
 * which only matched the camera's view by coincidence — turn the camera or
 * the character even slightly and pressing the same key would send you off
 * in a direction that no longer matched what was on screen, which is
 * exactly the "spins/bugs out" disorientation this replaces.
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

    // Eased here, at the top, so both the movement basis below *and* the
    // camera placement block at the end of this frame read the same
    // already-settled cc.yaw — calling it twice (or in two places) would
    // double-apply the ease-back rate.
    cameraControls.easeReturn(delta);
    const cc = cameraControls.state.current;
    // The camera's current viewing yaw — same formula player.tsx's own
    // camera block below derives "behind the player" from, just without
    // the +PI (this is the direction the camera *looks*, not where it
    // *sits*). Reads last frame's settled g.rotation.y, so there's no
    // same-frame feedback between "where am I facing" and "which way is
    // forward right now" — it's always one frame behind, which is
    // imperceptible and exactly what keeps this from oscillating.
    const viewYaw = g.rotation.y + cc.yaw;
    forwardVec.current.set(Math.sin(viewYaw), 0, Math.cos(viewYaw));
    rightVec.current.set(Math.sin(viewYaw + Math.PI / 2), 0, Math.cos(viewYaw + Math.PI / 2));

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

    if (velocity.current.lengthSq() > 0.01) {
      const targetAngle = Math.atan2(velocity.current.x, velocity.current.z);
      g.rotation.y = THREE.MathUtils.lerp(
        g.rotation.y,
        targetAngle,
        Math.min(1, delta * ROTATE_RATE)
      );
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

    // Free-look third-person camera: orbits the player at a yaw/pitch/
    // distance driven by use-camera-controls.ts (right-drag + wheel).
    //
    // `cc.yaw` used to be measured from a *fixed world axis* — it never
    // factored in `g.rotation.y` (the character's current facing/movement
    // heading) at all, so "directly behind the player" was only ever true
    // by coincidence, at whatever moment the camera happened to last be
    // dragged back to yaw=0. Turn and run any other direction and the
    // camera stayed parked at that old world-space spot, which is exactly
    // how it ends up beside or in front of the character with no warning.
    // Folding `g.rotation.y` into the yaw used for the offset makes
    // "behind" track the player's heading continuously — `cc.yaw` is now
    // purely the manual free-look *delta* away from that, same as before.
    // +PI because the character's forward axis (sin/cos of rotation.y,
    // same convention as the chest/face placement in character-model.tsx)
    // points the *opposite* way from "behind" — the camera sits on the far
    // side of the player from where they're facing.
    const behindYaw = g.rotation.y + Math.PI + cc.yaw;
    const offsetX = Math.sin(behindYaw) * Math.cos(cc.pitch) * cc.distance;
    const offsetZ = Math.cos(behindYaw) * Math.cos(cc.pitch) * cc.distance;
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
