"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CharacterModel, type CharacterLimbRefs } from "@/components/world/character-model";
import { useKeyboardControls } from "@/components/world/use-keyboard-controls";
import { PITCH_MIN, PITCH_MAX, type CameraControls } from "@/components/world/use-camera-controls";
import { mobileInput, consumeMobileJump, consumeMobileSlide } from "@/lib/mobile-input";
import { angleDelta } from "@/components/world/player";
import { hazardHit, type ParkourMap } from "@/lib/parkour-config";
import type { EquippedItem } from "@/lib/rarity-colors";
import type { CheckpointProgressRef, CrumbleStateRef } from "@/components/parkour/parkour-geometry";
import { broadcastParkourGhost, broadcastParkourProfile } from "@/lib/parkour-realtime";

// ── Collider (an AABB the player can land on / be blocked by) ──
interface Collider {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
  topY: number;
  kill: boolean;
  ice: boolean;
  bounce: number;
  moverIdx: number;   // -1 for static
  crumbleIndex: number; // -1 unless a crumbling platform
}

const R = 0.42;            // player collision half-width (XZ)
const H = 1.7;             // player collision height
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
/** Seconds a crumble platform lasts once stepped on before it collapses. */
const CRUMBLE_DELAY = 0.5;
/** Grace window (s) after a respawn where hazards can't kill you — stops instant
 * death-loops when you respawn next to a spinner/saw. */
const HAZARD_INVULN = 0.85;

/** Build an axis-aligned collider from a box (center + full size). Called ONCE
 * per platform at map-load (static) and reused; mover colliders are mutated in
 * place each frame instead of rebuilt — zero per-frame allocation. */
function boxCollider(
  pos: [number, number, number], size: [number, number, number],
  moverIdx: number, kill: boolean, ice: boolean, bounce: number, crumbleIndex: number,
): Collider {
  const [cx, cy, cz] = pos;
  const [sx, sy, sz] = size;
  return {
    minX: cx - sx / 2, maxX: cx + sx / 2,
    minY: cy - sy / 2, maxY: cy + sy / 2,
    minZ: cz - sz / 2, maxZ: cz + sz / 2,
    topY: cy + sy / 2, kill, ice, bounce, moverIdx, crumbleIndex,
  };
}

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
  /** Shared crumble-platform state (0=solid, grows once triggered). */
  crumbleRef: React.RefObject<CrumbleStateRef>;
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
  crumbleRef,
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
  const respawnPoint = useRef<[number, number, number]>([...map.start]);
  const finishedRef = useRef(false);
  const startedMoving = useRef(false);
  const ghostTimer = useRef(0);
  const profileTimer = useRef(0);
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
  const hazardInvuln = useRef(HAZARD_INVULN);

  function resetCrumble() {
    const st = crumbleRef.current?.states;
    if (st) st.fill(0);
  }

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
    hazardInvuln.current = HAZARD_INVULN;
    resetCrumble();
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

  // Pre-built collider rig — static platforms + finish are built ONCE at map
  // load; only the mover colliders are mutated in place each frame. Zero
  // per-frame heap allocation → no GC stutter even on the 100+-platform maps.
  const rig = useMemo(() => {
    const staticCols: Collider[] = map.platforms.map((pl) =>
      boxCollider(pl.pos, pl.size, -1, !!pl.kill, !!pl.ice, pl.bounce ?? 0, pl.crumbleIndex ?? -1));
    staticCols.push(boxCollider(map.finish, map.finishSize, -2, false, false, 0, -1));
    const moverCols: Collider[] = map.movers.map((m, i) => boxCollider(m.pos, m.size, i, false, false, 0, -1));
    const centers = map.movers.map((m) => [m.pos[0], m.pos[1], m.pos[2]] as [number, number, number]);
    const prev = map.movers.map((m) => [m.pos[0], m.pos[1], m.pos[2]] as [number, number, number]);
    return { all: [...staticCols, ...moverCols], moverCols, centers, prev };
  }, [map]);

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
    hazardInvuln.current = HAZARD_INVULN;
    // Fresh attempt of the section: broken platforms come back.
    resetCrumble();
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

    // Crumble platforms count down once triggered; post-respawn hazard grace ticks down.
    const crumbleStates = crumbleRef.current?.states ?? null;
    if (crumbleStates) { for (let ci = 0; ci < crumbleStates.length; ci++) if (crumbleStates[ci] > 0) crumbleStates[ci] += delta; }
    hazardInvuln.current = Math.max(0, hazardInvuln.current - delta);

    // ── Update mover colliders in place (mover math inlined — no allocation) ──
    const movers = map.movers;
    for (let i = 0; i < movers.length; i++) {
      const m = movers[i];
      const phase = m.phase ?? 0;
      let mxc: number, myc: number, mzc: number;
      if (m.mode === "orbit") {
        const r = m.radius ?? 4;
        const ang = ((elapsed / m.period + phase) % 1) * Math.PI * 2;
        mxc = m.pos[0] + Math.cos(ang) * r; myc = m.pos[1]; mzc = m.pos[2] + Math.sin(ang) * r;
      } else {
        const to = m.to ?? m.pos;
        const u = (((elapsed / m.period + phase) % 1) + 1) % 1;
        const tri = u < 0.5 ? u * 2 : 2 - u * 2;
        mxc = m.pos[0] + (to[0] - m.pos[0]) * tri;
        myc = m.pos[1] + (to[1] - m.pos[1]) * tri;
        mzc = m.pos[2] + (to[2] - m.pos[2]) * tri;
      }
      const cen = rig.centers[i]; cen[0] = mxc; cen[1] = myc; cen[2] = mzc;
      const col = rig.moverCols[i];
      const hx = m.size[0] / 2, hy = m.size[1] / 2, hz = m.size[2] / 2;
      col.minX = mxc - hx; col.maxX = mxc + hx;
      col.minY = myc - hy; col.maxY = myc + hy;
      col.minZ = mzc - hz; col.maxZ = mzc + hz;
      col.topY = myc + hy;
    }
    // Ride the mover we were standing on (its delta this frame carries us).
    if (supportMoverIdx.current >= 0 && supportMoverIdx.current < movers.length) {
      const i = supportMoverIdx.current;
      const cur = rig.centers[i], prev = rig.prev[i];
      g.position.x += cur[0] - prev[0];
      g.position.z += cur[2] - prev[2];
      feetY.current += cur[1] - prev[1];
    }
    for (let i = 0; i < movers.length; i++) {
      const cen = rig.centers[i], prev = rig.prev[i];
      prev[0] = cen[0]; prev[1] = cen[1]; prev[2] = cen[2];
    }
    const cols = rig.all;

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
        // A collapsed crumble platform is no longer solid — fall through it.
        if (c.crumbleIndex >= 0 && crumbleStates && crumbleStates[c.crumbleIndex] >= CRUMBLE_DELAY) continue;
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
        // Step onto a crumble platform → start its collapse timer.
        if (best.crumbleIndex >= 0 && crumbleStates && crumbleStates[best.crumbleIndex] === 0) {
          crumbleStates[best.crumbleIndex] = 0.0001;
        }
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

    // ONE-WAY PLATFORMS: no head-bonk, no side collision. The player always
    // passes the sides/bottom freely and can ONLY land on a top face. This is the
    // clean parkour model — you can never be shoved off, stuck against an edge, or
    // blocked from jumping up onto the next platform (the "kleben/festbuggen" bug).

    // Bounce pad launches AFTER landing decisions (overrides the grounded snap).
    if (landedBounce > 0) { vv.current = landedBounce; grounded.current = false; }

    if (grounded.current && !wasGrounded) landSquash.current = 1;
    if (grounded.current) { coyote.current = COYOTE; airJumpsUsed.current = 0; }

    g.position.y = feetY.current;

    // ── Void / kill-tile → respawn at checkpoint ──
    if (landedKill || feetY.current < map.voidY) {
      respawnAtCheckpoint();
    }

    // ── Moving hazard contact (spinner bar / saw) = death → respawn, except in
    // the short grace window right after a respawn (no instant death-loops). ──
    if (!finishedRef.current && hazardInvuln.current <= 0 && map.hazards.length > 0) {
      const midY = feetY.current + 0.9;
      const hx2 = g.position.x, hz2 = g.position.z;
      for (const h of map.hazards) {
        if (hazardHit(h, elapsed, hx2, midY, hz2)) { respawnAtCheckpoint(); break; }
      }
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

    // ── Squash on landing + crouch during a dash (subtle + fast recovery so
    // chaining land→jump stays snappy, never reads as "sticking") ──
    landSquash.current = Math.max(0, landSquash.current - delta * 14);
    g.scale.y = (1 - landSquash.current * 0.11) * (1 - dashPose.current * 0.2);

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

    // ── Multiplayer sync: high-frequency transform+anim (20 Hz) + low-frequency
    // profile (name/gender/equipped) so ghosts render the REAL character with
    // full gear and animations, perfectly in step. ──
    if (multiplayer) {
      ghostTimer.current += delta;
      if (ghostTimer.current >= GHOST_INTERVAL) {
        ghostTimer.current = 0;
        broadcastParkourGhost({
          id: userId,
          x: g.position.x,
          y: g.position.y,
          z: g.position.z,
          yaw: g.rotation.y,
          moving,
          grounded: grounded.current,
          sprinting: !!sprint,
          dashing,
          finished: finishedRef.current,
        });
      }
      profileTimer.current -= delta;
      if (profileTimer.current <= 0) {
        profileTimer.current = 3; // re-announce every 3s so late-joiners get gear
        broadcastParkourProfile({ id: userId, name, gender, equipped: equippedByCategory });
      }
    }
  });

  return (
    <group ref={group} position={map.start}>
      <CharacterModel ref={limbs} equippedByCategory={equippedByCategory} gender={gender} />
    </group>
  );
}
