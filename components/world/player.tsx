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
const CAMERA_FOLLOW_RATE = 6;
const GRAVITY = -18;
const JUMP_VELOCITY = 6.2;
const BASE_FOV = 55;
const SPRINT_FOV = 62;
const FOV_RATE = 5;

// Tank-turn controls: A/D smoothly rotate the character's own heading
// (TURN_RATE = top angular speed, TURN_ACCEL = how quickly it ramps up to
// and back down from that speed) instead of strafing sideways. Holding D
// gradually swings you to face right and keeps walking that way; let go
// and the turning stops exactly where it is — no snapping, no instant
// 90°/180° flips. W/S then simply move forward/backward along whichever
// way the character is currently facing.
const TURN_RATE = 2.4;
const TURN_ACCEL = 9;

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
 * Adds tank-turn WASD movement + Space jump + Shift sprint, a free-look
 * third-person camera (right-mouse-drag to orbit, scroll wheel to zoom —
 * see use-camera-controls.ts), and a procedural walk-cycle + jump pose on
 * top of the shared CharacterModel. The walk-cycle mutates the leg/arm
 * meshes' `.rotation.x` directly via refs every frame — imperative, zero
 * React re-renders. All smoothing (velocity, turning, camera, FOV) is
 * scaled by `delta`, not a bare lerp factor, so motion feels identical
 * regardless of the actual frame rate.
 *
 * Control model: A/D turn the character's own heading at a smooth,
 * speed-capped rate (TURN_RATE/TURN_ACCEL above) — not a strafe, and not
 * an instant snap to a target angle. W/S move forward/backward along
 * whatever that heading currently is. The camera simply follows the
 * character's heading at all times (plus a temporary right-drag free-look
 * offset that eases back to dead-ahead on release), so it never has to
 * guess at a "direction of travel" independently — heading and camera are
 * locked together by construction, which is what keeps this from ever
 * swinging to the front of the character or spinning on a direction
 * change.
 */
export function Player({ equippedByCategory, gender, name, cameraControls }: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const limbs = useRef<CharacterLimbRefs>(null);
  const keys = useKeyboardControls();
  const { camera } = useThree();

  // Pre-allocated scratch objects — reused every frame, never replaced.
  const velocity = useRef(new THREE.Vector3());
  const targetVelocity = useRef(new THREE.Vector3());
  const cameraTarget = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const walkClock = useRef(0);
  const walkAmplitude = useRef(0);
  const turnVelocity = useRef(0);

  // Jump physics, tracked separately from the walk-cycle's foot bob — both
  // end up added together into the group's final position.y each frame.
  const verticalVelocity = useRef(0);
  const baseY = useRef(0);
  const grounded = useRef(true);
  // Eased 0→1 while airborne so the jump pose blends in/out instead of
  // popping — see the limb block below.
  const jumpPose = useRef(0);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;

    // --- Turning: smooth angular acceleration toward ±TURN_RATE, not an
    // instant snap — holding D ramps up to top turn speed and *keeps*
    // turning at that speed for as long as it's held, easing back to 0
    // the instant it's released (still mid-turn if you let go early).
    // Sign note: with this app's forward convention
    // (sin(yaw), 0, cos(yaw)) and the camera-right fix in use-camera-
    // controls.ts, increasing yaw sweeps the character toward its own
    // *left* — so "turn right" (D) has to *decrease* yaw. Verified
    // against the already-fixed strafe-direction math; don't flip this
    // without re-deriving it.
    const turnInput = (keys.state.current.left ? 1 : 0) - (keys.state.current.right ? 1 : 0);
    const targetTurnVel = turnInput * TURN_RATE;
    turnVelocity.current = THREE.MathUtils.lerp(
      turnVelocity.current,
      targetTurnVel,
      Math.min(1, delta * TURN_ACCEL)
    );
    g.rotation.y += turnVelocity.current * delta;

    const heading = g.rotation.y;
    const moveZ = (keys.state.current.forward ? 1 : 0) - (keys.state.current.backward ? 1 : 0);
    const moving = moveZ !== 0;
    const sprinting = moving && keys.state.current.sprint;

    if (moving) {
      targetVelocity.current
        .set(Math.sin(heading), 0, Math.cos(heading))
        .multiplyScalar(moveZ * SPEED * (sprinting ? SPRINT_MULTIPLIER : 1));
    } else {
      targetVelocity.current.set(0, 0, 0);
    }

    velocity.current.lerp(targetVelocity.current, Math.min(1, delta * ACCEL_RATE));
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
    jumpPose.current = THREE.MathUtils.lerp(
      jumpPose.current,
      grounded.current ? 0 : 1,
      Math.min(1, delta * 10)
    );

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
      // Jump pose: legs tuck up/back symmetrically and arms swing up —
      // blended in over jumpPose instead of just freezing the walk-cycle
      // mid-stride, so leaving the ground actually reads as a jump.
      const jp = jumpPose.current;
      const legTuck = -0.55 * jp;
      const armRaise = -0.4 * jp;
      if (l.legL.current) l.legL.current.rotation.x = THREE.MathUtils.lerp(swing, legTuck, jp);
      if (l.legR.current) l.legR.current.rotation.x = THREE.MathUtils.lerp(-swing, legTuck, jp);
      if (l.armL.current) l.armL.current.rotation.x = THREE.MathUtils.lerp(-swing, armRaise, jp);
      if (l.armR.current) l.armR.current.rotation.x = THREE.MathUtils.lerp(swing, armRaise, jp);
    }

    const footBob =
      moving && grounded.current ? Math.abs(Math.sin(walkClock.current * 2)) * 0.04 : 0;
    g.position.y = baseY.current + footBob;

    // Camera: eases its free-look delta back to dead-ahead on release,
    // then sits behind (heading + that delta), always looking at the
    // player. Heading itself only ever changes from the turn logic above,
    // never from the camera — so there's exactly one source of truth for
    // "which way is forward" and the two can't fight each other.
    cameraControls.easeReturn(delta);
    const cc = cameraControls.state.current;
    const viewYaw = heading + cc.yaw;
    const lookX = Math.sin(viewYaw);
    const lookZ = Math.cos(viewYaw);
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
