"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CharacterModel, type CharacterLimbRefs } from "@/components/world/character-model";
import { useKeyboardControls } from "@/components/world/use-keyboard-controls";
import { PITCH_MIN, PITCH_MAX, type CameraControls } from "@/components/world/use-camera-controls";
import { mobileInput, consumeMobileJump, consumeMobileSlide } from "@/lib/mobile-input";
import { angleDelta } from "@/components/world/player";
import { moverCenterAt, type ParkourMap } from "@/lib/parkour-config";
import type { EquippedItem } from "@/lib/rarity-colors";
import type { CheckpointProgressRef } from "@/components/parkour/parkour-geometry";
import { broadcastParkourGhost } from "@/lib/parkour-realtime";

// ── Collider (an AABB the player can land on / be blocked by) ──
interface Collider {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
  topY: number;
  kill: boolean;
  ice: boolean;
  bounce: number;
  moverIdx: number; // -1 for static
}

const R = 0.42;            // player collision half-width (XZ)
const H = 1.7;             // player collision height
const STEP_TOL = 0.06;     // vertical epsilon so standing-on-top isn't a side hit
const COYOTE = 0.12;       // seconds after leaving ground you can still jump
const JUMP_BUFFER = 0.14;  // seconds a jump press is remembered before landing
const ACCEL_GROUND = 16;
const ACCEL_AIR = 7;
const ACCEL_ICE = 3.5;
const MIN_CAMERA_WORLD_Y = 0.6;
const GHOST_INTERVAL = 0.05; // 20 Hz
// Dash (C / slide) — mirrors the farm world's slide feel.
const DASH_DURATION = 0.55;
const DASH_COOLDOWN = 1.1;
const DASH_SPEED_FACTOR = 2.2;
// Ledge-grab forgiveness: how far past a platform edge the footprint may be and
// still catch the top on a descending landing (a barely-made jump snaps on).
const LAND_MARGIN = 0.16;

export interface ParkourPlayerProps {
  userId: string;
  name: string;
  map: ParkourMap;
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  cameraControls: CameraControls;
  /** true once the run has started — gates movement input. */
  running: boolean;
  mobileMode?: boolean;
  /** Bumped to reset the player back to the start (retry). */
  resetSignal: number;
  /** Broadcast ghost transforms (multiplayer lobby run). */
  multiplayer?: boolean;
  progressRef: React.RefObject<CheckpointProgressRef>;
  onFinish?: () => void;
  onCheckpoint?: (index: number) => void;
  onFall?: () => void;
  onFirstMove?: () => void;
}

export function ParkourPlayer({
  userId,
  name,
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
}: ParkourPlayerProps) {
  const group = useRef<THREE.Group>(null);
  const limbs = useRef<CharacterLimbRefs>(null);
  const keys = useKeyboardControls();
  const { camera } = useThree();

  // Physics state (refs — mutated in useFrame, no re-renders)
  const vel = useRef(new THREE.Vector3());       // horizontal velocity
  const targetVel = useRef(new THREE.Vector3());
  const moveDir = useRef(new THREE.Vector3());
  const vv = useRef(0);                            // vertical velocity
  const feetY = useRef(map.start[1]);
  const grounded = useRef(true);
  const onIce = useRef(false);
  const coyote = useRef(0);
  const jumpBuffer = useRef(0);
  const airJumpsUsed = useRef(0);
  const supportMoverIdx = useRef(-1);
  const prevMoverCenters = useRef<[number, number, number][]>(map.movers.map((m) => [...m.pos]));
  const respawnPoint = useRef<[number, number, number]>([...map.start]);
  const finishedRef = useRef(false);
  const startedMoving = useRef(false);
  const ghostTimer = useRef(0);
  const walkClock = useRef(0);
  const walkAmp = useRef(0);
  const jumpPose = useRef(0);
  const cameraTarget = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const landSquash = useRef(0);
  const dashCooldown = useRef(0);
  const dashTimer = useRef(0);
  const dashDirX = useRef(0);
  const dashDirZ = useRef(0);
  const dashPose = useRef(0);

  // Reset to start (retry / new run)
  const lastReset = useRef(resetSignal);
  function hardReset() {
    const g = group.current;
    respawnPoint.current = [...map.start];
    feetY.current = map.start[1];
    vv.current = 0;
    vel.current.set(0, 0, 0);
    grounded.current = true;
    airJumpsUsed.current = 0;
    finishedRef.current = false;
    startedMoving.current = false;
    supportMoverIdx.current = -1;
    if (progressRef.current) progressRef.current.current = -1;
    if (g) {
      g.position.set(map.start[0], map.start[1], map.start[2]);
      g.rotation.set(0, 0, 0);
    }
  }
  useEffect(() => {
    hardReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id]);
  useEffect(() => {
    if (resetSignal !== lastReset.current) {
      lastReset.current = resetSignal;
      hardReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // Build the collider list for the current frame (static platforms + movers +
  // finish pad). Reused between horizontal + vertical resolution.
  function buildColliders(elapsed: number, out: Collider[]): void {
    out.length = 0;
    for (const pl of map.platforms) {
      const [cx, cy, cz] = pl.pos;
      const [sx, sy, sz] = pl.size;
      out.push({
        minX: cx - sx / 2, maxX: cx + sx / 2,
        minY: cy - sy / 2, maxY: cy + sy / 2,
        minZ: cz - sz / 2, maxZ: cz + sz / 2,
        topY: cy + sy / 2,
        kill: !!pl.kill, ice: !!pl.ice, bounce: pl.bounce ?? 0, moverIdx: -1,
      });
    }
    map.movers.forEach((m, i) => {
      const [cx, cy, cz] = moverCenterAt(m, elapsed);
      const [sx, sy, sz] = m.size;
      out.push({
        minX: cx - sx / 2, maxX: cx + sx / 2,
        minY: cy - sy / 2, maxY: cy + sy / 2,
        minZ: cz - sz / 2, maxZ: cz + sz / 2,
        topY: cy + sy / 2,
        kill: false, ice: false, bounce: 0, moverIdx: i,
      });
    });
    // Finish pad as a landable platform
    {
      const [cx, cy, cz] = map.finish;
      const [sx, sy, sz] = map.finishSize;
      out.push({
        minX: cx - sx / 2, maxX: cx + sx / 2,
        minY: cy - sy / 2, maxY: cy + sy / 2,
        minZ: cz - sz / 2, maxZ: cz + sz / 2,
        topY: cy + sy / 2,
        kill: false, ice: false, bounce: 0, moverIdx: -2,
      });
    }
  }

  const colliders = useRef<Collider[]>([]);

  function respawnAtCheckpoint() {
    const g = group.current;
    if (!g) return;
    const [rx, ry, rz] = respawnPoint.current;
    g.position.set(rx, ry, rz);
    feetY.current = ry;
    vv.current = 0;
    vel.current.set(0, 0, 0);
    grounded.current = true;
    airJumpsUsed.current = 0;
    supportMoverIdx.current = -1;
    onFall?.();
  }

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    const g = group.current;
    if (!g) return;
    const cc = cameraControls.state.current;
    const elapsed = state.clock.elapsedTime;
    const locked = cameraControls.locked || mobileMode;
    const canMove = running && locked && !finishedRef.current;

    // ── Ride moving platforms: apply the delta of whatever mover we stood on ──
    const curMovers: [number, number, number][] = map.movers.map((m) => moverCenterAt(m, elapsed));
    if (supportMoverIdx.current >= 0 && supportMoverIdx.current < curMovers.length) {
      const i = supportMoverIdx.current;
      const prev = prevMoverCenters.current[i];
      const cur = curMovers[i];
      if (prev) {
        g.position.x += cur[0] - prev[0];
        g.position.z += cur[2] - prev[2];
        feetY.current += cur[1] - prev[1];
      }
    }
    prevMoverCenters.current = curMovers;

    buildColliders(elapsed, colliders.current);
    const cols = colliders.current;

    // ── Input → target horizontal velocity (camera-relative, same basis as the
    // farm world's Player so movement feels identical) ──
    let mf = 0, mr = 0;
    if (canMove) {
      if (mobileMode) {
        mf = (mobileInput.forward ? 1 : 0) - (mobileInput.backward ? 1 : 0);
        mr = (mobileInput.strafeRight ? 1 : 0) - (mobileInput.strafeLeft ? 1 : 0);
      } else {
        mf = (keys.state.current.forward ? 1 : 0) - (keys.state.current.backward ? 1 : 0);
        mr = (keys.state.current.strafeRight ? 1 : 0) - (keys.state.current.strafeLeft ? 1 : 0);
      }
    }
    const moving = mf !== 0 || mr !== 0;
    if (moving && !startedMoving.current) {
      startedMoving.current = true;
      onFirstMove?.();
    }
    const sprint = canMove && moving && (mobileMode ? mobileInput.sprint : keys.state.current.sprint);
    const baseSpeed = map.moveSpeed * (sprint ? map.sprintMultiplier : 1) * cc.moveSpeedMult;

    // ── Dash (C / slide) — same tech as the farm world's slide: a ground-started
    // forward burst that ends on timeout OR the instant you leave the ground.
    // The boosted velocity persists into a jump (slide-jump), so it doubles as a
    // long-jump for big gaps. Optional — only fires if you press C while moving. ──
    dashCooldown.current = Math.max(0, dashCooldown.current - delta);
    const dashPressed = canMove && (keys.consumeSlide() || consumeMobileSlide());
    if (dashPressed && grounded.current && dashTimer.current <= 0 && dashCooldown.current <= 0 && moving) {
      dashTimer.current = DASH_DURATION;
      dashDirX.current = Math.sin(cc.yaw);
      dashDirZ.current = Math.cos(cc.yaw);
    }
    let dashing = false;
    if (dashTimer.current > 0) {
      dashTimer.current -= delta;
      if (dashTimer.current <= 0 || !grounded.current) {
        if (grounded.current) dashCooldown.current = DASH_COOLDOWN;
        dashTimer.current = 0;
      } else {
        dashing = true;
        const prog = 1 - dashTimer.current / DASH_DURATION;
        const boost = (1 - prog * 0.7) * DASH_SPEED_FACTOR;
        moveDir.current.set(dashDirX.current, 0, dashDirZ.current);
        targetVel.current.set(dashDirX.current * baseSpeed * boost, 0, dashDirZ.current * baseSpeed * boost);
      }
    }
    if (!dashing) {
      if (moving) {
        const fx = Math.sin(cc.yaw), fz = Math.cos(cc.yaw);
        const rx = -Math.cos(cc.yaw), rz = Math.sin(cc.yaw);
        moveDir.current.set(fx * mf + rx * mr, 0, fz * mf + rz * mr).normalize();
        targetVel.current.copy(moveDir.current).multiplyScalar(baseSpeed);
      } else {
        targetVel.current.set(0, 0, 0);
      }
    }
    dashPose.current = THREE.MathUtils.lerp(dashPose.current, dashing ? 1 : 0, Math.min(1, delta * 12));
    const accel = dashing ? 40 : !grounded.current ? ACCEL_AIR : onIce.current ? ACCEL_ICE : ACCEL_GROUND;
    vel.current.lerp(targetVel.current, 1 - Math.exp(-delta * accel));

    // ── Horizontal move (side-resolution deliberately runs AFTER the vertical
    // step below, so landing on a ledge always wins over being shoved off its
    // side edge — this is the fix for "made the jump but bugged off the corner"). ──
    g.position.x += vel.current.x * delta;
    g.position.z += vel.current.z * delta;

    // ── Jump input (buffered) ──
    coyote.current = Math.max(0, coyote.current - delta);
    jumpBuffer.current = Math.max(0, jumpBuffer.current - delta);
    const jumpPressed = canMove && (keys.consumeJump() || consumeMobileJump());
    if (jumpPressed) jumpBuffer.current = JUMP_BUFFER;
    if (jumpBuffer.current > 0) {
      if (grounded.current || coyote.current > 0) {
        vv.current = map.jumpVelocity;
        grounded.current = false;
        coyote.current = 0;
        jumpBuffer.current = 0;
        airJumpsUsed.current = 0;
      } else if (airJumpsUsed.current < map.airJumps) {
        vv.current = map.jumpVelocity * 0.92;
        airJumpsUsed.current += 1;
        jumpBuffer.current = 0;
      }
    }

    // ── Vertical integrate ──
    const prevFeet = feetY.current;
    vv.current += map.gravity * delta;
    feetY.current += vv.current * delta;

    const wasGrounded = grounded.current;
    grounded.current = false;
    onIce.current = false;
    supportMoverIdx.current = -1;
    let landedKill = false;
    let landedBounce = 0;

    const px = g.position.x, pz = g.position.z;

    // (A) LANDING — while descending, snap onto the HIGHEST top face the player
    // is crossing this frame. Ledge-forgiving: the footprint may reach up to
    // LAND_MARGIN past the platform edge and still catch (a barely-made jump is
    // pulled up onto the ledge instead of clipping the corner and dropping).
    // The face-crossing test (prevFeet above top, new feet at/below top) is
    // thickness-independent → a fast fall can never tunnel through a thin mover.
    if (vv.current <= 0) {
      let bestTop = -Infinity;
      let best: Collider | null = null;
      // Ledge-grab: only the frame you actually land from the air gets the
      // generous reach (a barely-made jump snaps onto the lip). While already
      // grounded, reach is just the body radius, so you can freely walk off an
      // edge instead of being magnetised back onto it ("sticky edge" bug).
      const reach = wasGrounded ? R : R + LAND_MARGIN;
      for (const c of cols) {
        const nx = Math.max(c.minX, Math.min(px, c.maxX));
        const nz = Math.max(c.minZ, Math.min(pz, c.maxZ));
        const ddx = px - nx, ddz = pz - nz;
        if (ddx * ddx + ddz * ddz > reach * reach) continue;
        if (prevFeet + 0.02 >= c.topY && feetY.current <= c.topY + 0.02 && c.topY > bestTop) {
          bestTop = c.topY;
          best = c;
        }
      }
      if (best) {
        feetY.current = best.topY;
        vv.current = 0;
        grounded.current = true;
        // Pull-in ONLY on a fresh landing (not while walking) so a jump that
        // caught the lip is tugged fully onto the platform.
        if (!wasGrounded) {
          const inset = R * 0.55;
          if (px < best.minX + inset) g.position.x = best.minX + inset;
          else if (px > best.maxX - inset) g.position.x = best.maxX - inset;
          if (pz < best.minZ + inset) g.position.z = best.minZ + inset;
          else if (pz > best.maxZ - inset) g.position.z = best.maxZ - inset;
        }
        if (best.bounce > 0) landedBounce = best.bounce;
        else if (best.ice) onIce.current = true;
        if (best.moverIdx >= 0) supportMoverIdx.current = best.moverIdx;
        if (best.kill) landedKill = true;
      }
    }

    // (B) HEAD BONK — rising into a ceiling. Only when the centre is clearly
    // INSIDE the box (footprint shrunk by R*0.5), so jumping up alongside a ledge
    // grazes past its side without being knocked back down.
    if (!grounded.current && vv.current > 0) {
      const prevHead = prevFeet + H;
      for (const c of cols) {
        if (px <= c.minX + R * 0.5 || px >= c.maxX - R * 0.5) continue;
        if (pz <= c.minZ + R * 0.5 || pz >= c.maxZ - R * 0.5) continue;
        if (prevHead - 0.02 <= c.minY && feetY.current + H >= c.minY) {
          feetY.current = c.minY - H;
          vv.current = 0;
          break;
        }
      }
    }

    // Bounce pad launches AFTER landing decisions (overrides the grounded snap).
    if (landedBounce > 0) { vv.current = landedBounce; grounded.current = false; }

    if (grounded.current && !wasGrounded) landSquash.current = 1;
    if (grounded.current) { coyote.current = COYOTE; airJumpsUsed.current = 0; }

    g.position.y = feetY.current;

    // (C) HORIZONTAL side-resolution — runs LAST so the platform you're standing
    // on (feet == top, excluded by the STEP_TOL Y-gate) can never push you off,
    // while genuine walls beside you still block.
    resolveAxis(g, cols, "x", feetY.current);
    resolveAxis(g, cols, "z", feetY.current);

    // ── Hazard tile / void → respawn at checkpoint ──
    if (landedKill || feetY.current < map.voidY) {
      respawnAtCheckpoint();
    }

    // ── Checkpoints (arm the next one you touch) ──
    if (!finishedRef.current) {
      // A checkpoint counts ONLY when you actually STAND on its pad: grounded,
      // inside its radius AND at its height. Brushing the ring or jumping up at
      // it from below does nothing (that would be pointless/cheesy).
      if (grounded.current) {
        for (const cp of map.checkpoints) {
          if ((progressRef.current?.current ?? -1) >= cp.index) continue;
          const dx = g.position.x - cp.pos[0];
          const dz = g.position.z - cp.pos[2];
          if (dx * dx + dz * dz <= cp.radius * cp.radius && Math.abs(feetY.current - cp.pos[1]) < 0.5) {
            if (progressRef.current) progressRef.current.current = cp.index;
            respawnPoint.current = [cp.pos[0], cp.pos[1] + 0.05, cp.pos[2]];
            onCheckpoint?.(cp.index);
          }
        }
      }
      // ── Finish ──
      const [fxc, fyc, fzc] = map.finish;
      const [fsx, , fsz] = map.finishSize;
      const fTop = fyc + map.finishSize[1] / 2;
      if (
        g.position.x > fxc - fsx / 2 - R && g.position.x < fxc + fsx / 2 + R &&
        g.position.z > fzc - fsz / 2 - R && g.position.z < fzc + fsz / 2 + R &&
        feetY.current <= fTop + 1.6 && feetY.current >= fTop - 1.2
      ) {
        finishedRef.current = true;
        onFinish?.();
      }
    }

    // ── Body heading eases toward movement (or dash) direction ──
    if (moving || dashing) {
      const heading = Math.atan2(moveDir.current.x, moveDir.current.z);
      g.rotation.y += angleDelta(g.rotation.y, heading) * (1 - Math.exp(-delta * (dashing ? 22 : 15)));
    }

    // ── Squash on landing + crouch during a dash ──
    landSquash.current = Math.max(0, landSquash.current - delta * 9);
    g.scale.y = (1 - landSquash.current * 0.18) * (1 - dashPose.current * 0.2);

    // ── Limb animation (walk cycle + airborne splay) ──
    jumpPose.current = THREE.MathUtils.lerp(jumpPose.current, grounded.current ? 0 : 1, Math.min(1, delta * 10));
    walkClock.current += delta * (sprint ? 13 : 9);
    walkAmp.current = THREE.MathUtils.lerp(walkAmp.current, moving && grounded.current ? 1 : 0, Math.min(1, delta * 8));
    const swing = Math.sin(walkClock.current) * walkAmp.current * 0.6;
    const l = limbs.current;
    if (l) {
      const jp = jumpPose.current;
      if (l.legL.current) l.legL.current.rotation.x = THREE.MathUtils.lerp(swing, -0.3, jp);
      if (l.legR.current) l.legR.current.rotation.x = THREE.MathUtils.lerp(-swing, 0.3, jp);
      if (l.armL.current) { l.armL.current.rotation.x = THREE.MathUtils.lerp(-swing, -0.5, jp); l.armL.current.rotation.z = -0.15 - jp * 0.5; }
      if (l.armR.current) { l.armR.current.rotation.x = THREE.MathUtils.lerp(swing, -0.5, jp); l.armR.current.rotation.z = 0.15 + jp * 0.5; }
    }

    // ── Camera (over-the-shoulder chase — same math as the farm world) ──
    const viewYaw = cc.yaw + cc.freeLookYaw;
    const viewPitch = THREE.MathUtils.clamp(cc.pitch + cc.freeLookPitch, PITCH_MIN, PITCH_MAX);
    const lookX = Math.sin(viewYaw), lookZ = Math.cos(viewYaw);
    const dirX = -lookX * Math.cos(viewPitch);
    const dirY = Math.sin(viewPitch);
    const dirZ = -lookZ * Math.cos(viewPitch);
    const dist = cc.distance;
    cameraTarget.current.set(
      g.position.x + dirX * dist,
      g.position.y + dirY * dist + 0.8,
      g.position.z + dirZ * dist,
    );
    cameraTarget.current.y = Math.max(cameraTarget.current.y, MIN_CAMERA_WORLD_Y);
    camera.position.copy(cameraTarget.current);
    lookTarget.current.set(g.position.x, g.position.y + 1, g.position.z);
    camera.lookAt(lookTarget.current);

    // ── Ghost broadcast (multiplayer) ──
    if (multiplayer) {
      ghostTimer.current += delta;
      if (ghostTimer.current >= GHOST_INTERVAL) {
        ghostTimer.current = 0;
        broadcastParkourGhost({
          id: userId,
          name,
          gender,
          x: g.position.x,
          y: g.position.y,
          z: g.position.z,
          yaw: g.rotation.y,
          moving,
          finished: finishedRef.current,
        });
      }
    }
  });

  return (
    <group ref={group} position={map.start}>
      <CharacterModel ref={limbs} equippedByCategory={equippedByCategory} gender={gender} />
    </group>
  );
}

/** Push the player box out of any collider it now overlaps on a single axis.
 * Called right after moving on that axis (X or Z). The Y-overlap gate uses
 * STEP_TOL so a platform you're standing ON (feet == top) never counts as a
 * side hit. */
function resolveAxis(g: THREE.Group, cols: Collider[], axis: "x" | "z", feet: number): void {
  const minY = feet, maxY = feet + H;
  for (const c of cols) {
    if (minY >= c.maxY - STEP_TOL || maxY <= c.minY + STEP_TOL) continue; // no vertical overlap
    // Re-read live position each iteration — an earlier push this loop may have
    // already moved the player (wedged between two colliders).
    const px = g.position.x, pz = g.position.z;
    if (px + R <= c.minX || px - R >= c.maxX) continue;
    if (pz + R <= c.minZ || pz - R >= c.maxZ) continue;
    if (axis === "x") {
      const penRight = c.maxX - (g.position.x - R); // push +x
      const penLeft = (g.position.x + R) - c.minX;  // push -x
      if (penRight < penLeft) g.position.x += penRight;
      else g.position.x -= penLeft;
    } else {
      const penFwd = c.maxZ - (g.position.z - R);
      const penBack = (g.position.z + R) - c.minZ;
      if (penFwd < penBack) g.position.z += penFwd;
      else g.position.z -= penBack;
    }
  }
}
