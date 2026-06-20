"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { EquippedItem } from "@/lib/rarity-colors";
import { CharacterModel, type CharacterLimbRefs } from "@/components/world/character-model";
import { useKeyboardControls } from "@/components/world/use-keyboard-controls";
import type { CameraControls } from "@/components/world/use-camera-controls";

interface PlayerProps {
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  name: string;
  cameraControls: CameraControls;
}

const SPEED = 4.5;
const ACCEL_RATE = 8; // higher = snappier velocity response, still delta-scaled
const ROTATE_RATE = 10;
const CAMERA_FOLLOW_RATE = 6;
const GRAVITY = -18;
const JUMP_VELOCITY = 6.2;

/**
 * Adds WASD movement + Space jump, a free-look third-person camera
 * (right-mouse-drag to orbit, scroll wheel to zoom — see use-camera-
 * controls.ts), and a procedural walk-cycle on top of the shared
 * CharacterModel. The walk-cycle mutates the leg/arm meshes' `.rotation.x`
 * directly via refs every frame — imperative, zero React re-renders. All
 * smoothing (velocity, rotation, camera) is scaled by `delta`, not a bare
 * lerp factor, so motion feels identical regardless of the actual frame
 * rate.
 */
export function Player({ equippedByCategory, gender, name, cameraControls }: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const limbs = useRef<CharacterLimbRefs>(null);
  const keys = useKeyboardControls();
  const { camera } = useThree();

  // Pre-allocated scratch objects — reused every frame, never replaced.
  const velocity = useRef(new THREE.Vector3());
  const inputDir = useRef(new THREE.Vector3());
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

    inputDir.current.set(
      (keys.state.current.right ? 1 : 0) - (keys.state.current.left ? 1 : 0),
      0,
      (keys.state.current.backward ? 1 : 0) - (keys.state.current.forward ? 1 : 0)
    );
    const moving = inputDir.current.lengthSq() > 0;

    const targetVelocity = moving
      ? inputDir.current.normalize().multiplyScalar(SPEED)
      : inputDir.current.set(0, 0, 0);

    velocity.current.lerp(targetVelocity, Math.min(1, delta * ACCEL_RATE));
    g.position.addScaledVector(velocity.current, delta);

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

    walkClock.current += delta * 8;
    walkAmplitude.current = THREE.MathUtils.lerp(
      walkAmplitude.current,
      moving && grounded.current ? 1 : 0,
      Math.min(1, delta * 6)
    );
    const swing = Math.sin(walkClock.current) * walkAmplitude.current * 0.5;

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
    // distance driven by use-camera-controls.ts (right-drag + wheel),
    // independent of the player's own facing direction. Eases back to the
    // default look direction whenever RMB isn't held.
    cameraControls.easeReturn(delta);
    const cc = cameraControls.state.current;
    const offsetX = Math.sin(cc.yaw) * Math.cos(cc.pitch) * cc.distance;
    const offsetZ = Math.cos(cc.yaw) * Math.cos(cc.pitch) * cc.distance;
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
