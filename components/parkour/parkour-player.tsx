"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CharacterModel, type CharacterLimbRefs } from "@/components/world/character-model";
import { useKeyboardControls } from "@/components/world/use-keyboard-controls";
import { PITCH_MIN, PITCH_MAX, type CameraControls } from "@/components/world/use-camera-controls";
import { mobileInput, consumeMobileJump, consumeMobileSlide } from "@/lib/mobile-input";
import { angleDelta } from "@/components/world/player";
import { hazardHit, spinnerAngleAt, sliderPosInto, type ParkourMap } from "@/lib/parkour-config";
import type { EquippedItem } from "@/lib/rarity-colors";
import type { CheckpointProgressRef, CrumbleStateRef } from "@/components/parkour/parkour-geometry";
import { broadcastParkourGhost, broadcastParkourProfile } from "@/lib/parkour-realtime";
import { useSoundManager } from "@/lib/sound-manager";

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
const COYOTE = 0.16;       // seconds after leaving ground you can still ground-jump
const JUMP_BUFFER = 0.16;  // seconds a jump press is remembered before landing
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
/** Grace window (s) after a respawn where hazards can't shove you — stops being
 * knocked straight off again when you respawn next to a spinner/saw. */
const HAZARD_INVULN = 0.85;
/** How hard a hazard shoves the player on contact (world units/sec). */
const HAZARD_KNOCKBACK = 19;
/** Upward pop on a hazard hit — you get LAUNCHED. */
const HAZARD_POP = 7.5;
/** Seconds of near-zero air control after a hit → hard to save yourself. */
const STUN = 0.5;
/** Impact particle burst. */
const HIT_N = 26;
const HIT_PARTICLE_LIFE = 0.7;

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

/** SOLID side collision: clamp the player out of any block it enters from the
 * SIDE on one axis. Gated so it NEVER fires while landing on / standing on a top
 * (feet at/above the top) or when the centre is over/under the block — only a
 * genuine side approach pushes. Clamps to the exact edge each frame → no jitter. */
function resolveSideAxis(
  g: THREE.Group, cols: Collider[], axis: "x" | "z", feetY: number,
  crumbleStates: Float32Array | null,
): void {
  const bodyTop = feetY + H;
  for (const c of cols) {
    if (c.crumbleIndex >= 0 && crumbleStates && crumbleStates[c.crumbleIndex] >= CRUMBLE_DELAY) continue;
    if (feetY >= c.topY - 0.06) continue;     // at/above the top → landing handles it, no side push
    if (bodyTop <= c.minY + 0.05) continue;   // body entirely below the block
    const px = g.position.x, pz = g.position.z;
    if (px + R <= c.minX || px - R >= c.maxX) continue; // no X footprint overlap
    if (pz + R <= c.minZ || pz - R >= c.maxZ) continue; // no Z footprint overlap
    if (axis === "x") {
      if (px >= c.minX && px <= c.maxX) continue; // centre over/under the block, not an X-side hit
      g.position.x = px > c.maxX ? c.maxX + R : c.minX - R;
    } else {
      if (pz >= c.minZ && pz <= c.maxZ) continue;
      g.position.z = pz > c.maxZ ? c.maxZ + R : c.minZ - R;
    }
  }
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
  /** Fired when a hazard shoves the player — for a screen flash + sound. */
  onHazardHit?: () => void;
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
  onHazardHit,
}: ParkourPlayerProps) {
  const group = useRef<THREE.Group>(null);
  const limbs = useRef<CharacterLimbRefs>(null);
  const keys = useKeyboardControls();
  const { camera } = useThree();
  const sound = useSoundManager();

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
  const hazardHitCooldown = useRef(0);
  const hurtTimer = useRef(0);
  const stunTimer = useRef(0);
  const cameraShake = useRef(0);
  // Impact particle burst (imperative — no per-frame allocation).
  const hitPos = useRef<Float32Array>((() => { const a = new Float32Array(HIT_N * 3); a.fill(-9999); return a; })());
  const hitVel = useRef(new Float32Array(HIT_N * 3));
  const hitAge = useRef<Float32Array>((() => { const a = new Float32Array(HIT_N); a.fill(-1); return a; })());
  const hitPointsRef = useRef<THREE.Points>(null);
  const hazScratch = useRef<[number, number, number]>([0, 0, 0]);

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
    const velX = new Float64Array(map.movers.length);
    const velZ = new Float64Array(map.movers.length);
    return { all: [...staticCols, ...moverCols], moverCols, centers, prev, velX, velZ };
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
    hazardHitCooldown.current = Math.max(0, hazardHitCooldown.current - delta);
    hurtTimer.current = Math.max(0, hurtTimer.current - delta);
    stunTimer.current = Math.max(0, stunTimer.current - delta);
    cameraShake.current = Math.max(0, cameraShake.current - delta * 4);

    // Advance the impact particle burst (imperative — no allocation).
    for (let k = 0; k < HIT_N; k++) {
      if (hitAge.current[k] < 0) continue;
      hitAge.current[k] += delta;
      const i3 = k * 3;
      if (hitAge.current[k] >= HIT_PARTICLE_LIFE) { hitAge.current[k] = -1; hitPos.current[i3 + 1] = -9999; continue; }
      hitVel.current[i3 + 1] += -18 * delta;
      hitPos.current[i3] += hitVel.current[i3] * delta;
      hitPos.current[i3 + 1] += hitVel.current[i3 + 1] * delta;
      hitPos.current[i3 + 2] += hitVel.current[i3 + 2] * delta;
    }
    if (hitPointsRef.current) {
      const attr = hitPointsRef.current.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (attr) { attr.array.set(hitPos.current); attr.needsUpdate = true; }
    }

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
    // Record each mover's velocity this frame (for jump momentum inheritance) +
    // roll prev → cur.
    for (let i = 0; i < movers.length; i++) {
      const cen = rig.centers[i], prev = rig.prev[i];
      rig.velX[i] = delta > 0 ? (cen[0] - prev[0]) / delta : 0;
      rig.velZ[i] = delta > 0 ? (cen[2] - prev[2]) / delta : 0;
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
    if (dashPressed && grounded.current && dashTimer.current <= 0 && dashCooldown.current <= 0 && moving && stunTimer.current <= 0) {
      dashTimer.current = DASH_DURATION;
      dashDirX.current = Math.sin(cc.yaw);
      dashDirZ.current = Math.cos(cc.yaw);
      sound.pkDash();
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
      // Stunned by a hazard hit → almost no control, so the knockback throws you
      // and it's genuinely hard to save yourself.
      if (stunTimer.current > 0) targetVel.current.multiplyScalar(0.1);
    }
    dashPose.current = THREE.MathUtils.lerp(dashPose.current, dashing ? 1 : 0, Math.min(1, delta * 12));
    const accel = stunTimer.current > 0 ? 2.5 : dashing ? 40 : !grounded.current ? ACCEL_AIR : onIce.current ? ACCEL_ICE : ACCEL_GROUND;
    vel.current.lerp(targetVel.current, 1 - Math.exp(-delta * accel));

    // ── Horizontal move + SOLID side collision. Platforms are full blocks: you
    // bounce off their sides (can't clip through the side/head). The gate
    // (feet clearly below the top AND centre outside the box) means landing on a
    // top or standing never triggers a side push → zero sticking / jitter. ──
    g.position.x += vel.current.x * delta;
    resolveSideAxis(g, cols, "x", feetY.current, crumbleStates);
    g.position.z += vel.current.z * delta;
    resolveSideAxis(g, cols, "z", feetY.current, crumbleStates);

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
        // Inherit the moving platform's velocity so jumping off a mover carries
        // its momentum (no "left behind"/snap-back).
        if (supportMoverIdx.current >= 0 && supportMoverIdx.current < movers.length) {
          vel.current.x += rig.velX[supportMoverIdx.current];
          vel.current.z += rig.velZ[supportMoverIdx.current];
        }
        sound.pkJump();
      } else if (airJumpsUsed.current < map.airJumps) {
        vv.current = map.jumpVelocity * 0.92;
        airJumpsUsed.current += 1;
        jumpBuffer.current = 0;
        sound.pkDouble();
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
        // Ledge-grab pull-in: ONLY when landing from the air AND the centre is
        // genuinely PAST the platform edge (hanging over). Tugs it a hair inside.
        // Landing safely inside the platform never moves you → no snap-back pop.
        if (!wasGrounded) {
          if (px > best.maxX) g.position.x = best.maxX - 0.05;
          else if (px < best.minX) g.position.x = best.minX + 0.05;
          if (pz > best.maxZ) g.position.z = best.maxZ - 0.05;
          else if (pz < best.minZ) g.position.z = best.minZ + 0.05;
        }
        if (best.bounce > 0) landedBounce = best.bounce;
        else if (best.ice) onIce.current = true;
        if (best.moverIdx >= 0) supportMoverIdx.current = best.moverIdx;
        if (best.kill) landedKill = true;
      }
    }

    // (B) HEAD-BONK — rising with your centre directly UNDER a platform → stop
    // upward motion. Together with the solid sides above, you can never pass
    // THROUGH a block from the side or below; every block is fully collidable.
    if (!grounded.current && vv.current > 0) {
      const prevHead = prevFeet + H;
      for (const c of cols) {
        if (c.crumbleIndex >= 0 && crumbleStates && crumbleStates[c.crumbleIndex] >= CRUMBLE_DELAY) continue;
        if (px <= c.minX || px >= c.maxX || pz <= c.minZ || pz >= c.maxZ) continue; // centre must be under it
        if (prevHead - 0.02 <= c.minY && feetY.current + H >= c.minY) {
          feetY.current = c.minY - H;
          vv.current = 0;
          break;
        }
      }
    }

    // Bounce pad launches AFTER landing decisions (overrides the grounded snap).
    if (landedBounce > 0) { vv.current = landedBounce; grounded.current = false; }

    if (grounded.current && !wasGrounded) { landSquash.current = 1; sound.pkLand(); }
    if (grounded.current) { coyote.current = COYOTE; airJumpsUsed.current = 0; }

    g.position.y = feetY.current;

    // ── Void / kill-tile → respawn at checkpoint ──
    if (landedKill || feetY.current < map.voidY) {
      respawnAtCheckpoint();
    }

    // ── Moving hazards PUSH you (they don't insta-kill). A spinning bar / saw
    // SHOVES you in its sweep direction (+ outward) — get knocked off a small
    // platform and you fall (that's the logical death, not a cheap hit). Spinner
    // pivots are un-standable: you slide off the centre, so you MUST be out on the
    // platform and time-jump over the bar. ──
    if (!finishedRef.current && map.hazards.length > 0) {
      const feet = feetY.current;
      const pxn = g.position.x, pzn = g.position.z;
      // Slide off spinner pivots while grounded (can't camp the centre).
      if (grounded.current) {
        for (const h of map.hazards) {
          if (h.kind !== "spinner") continue;
          const rx = pxn - h.pos[0], rz = pzn - h.pos[2];
          const d = Math.hypot(rx, rz);
          if (d > 0.001 && d < 0.7) {
            const push = (0.7 - d) * 7;
            vel.current.x += (rx / d) * push;
            vel.current.z += (rz / d) * push;
          }
        }
      }
      // Contact → knockback (once per pass; grace right after respawn).
      if (hazardInvuln.current <= 0 && hazardHitCooldown.current <= 0) {
        for (const h of map.hazards) {
          if (!hazardHit(h, elapsed, pxn, feet, pzn)) continue;
          let pdx: number, pdz: number;
          if (h.kind === "spinner") {
            const a = spinnerAngleAt(h, elapsed);
            const spin = h.period < 0 ? -1 : 1;         // tangential sweep dir
            pdx = -Math.sin(a) * spin; pdz = Math.cos(a) * spin;
            const rx = pxn - h.pos[0], rz = pzn - h.pos[2];
            const rl = Math.hypot(rx, rz) || 1;
            pdx += (rx / rl) * 0.7; pdz += (rz / rl) * 0.7; // + outward shove
          } else {
            sliderPosInto(h, elapsed, hazScratch.current);
            const rx = pxn - hazScratch.current[0], rz = pzn - hazScratch.current[2], rl = Math.hypot(rx, rz) || 1;
            pdx = rx / rl; pdz = rz / rl;
          }
          const pl = Math.hypot(pdx, pdz) || 1;
          vel.current.x = (pdx / pl) * HAZARD_KNOCKBACK;
          vel.current.z = (pdz / pl) * HAZARD_KNOCKBACK;
          vv.current = HAZARD_POP;          // LAUNCHED into the air every time
          grounded.current = false;
          hurtTimer.current = 0.7;
          stunTimer.current = STUN;         // near-zero control → hard to save yourself
          cameraShake.current = 2;
          hazardHitCooldown.current = 0.5;
          // Particle burst at the impact.
          for (let k = 0; k < HIT_N; k++) {
            hitAge.current[k] = 0;
            const i3 = k * 3;
            const ang = Math.random() * Math.PI * 2;
            const ele = Math.random() * Math.PI - Math.PI / 2;
            const sp = 5 + Math.random() * 8;
            hitVel.current[i3] = Math.cos(ang) * Math.cos(ele) * sp;
            hitVel.current[i3 + 1] = Math.abs(Math.sin(ele)) * sp + 4;
            hitVel.current[i3 + 2] = Math.sin(ang) * Math.cos(ele) * sp;
            hitPos.current[i3] = pxn;
            hitPos.current[i3 + 1] = feet + 0.9;
            hitPos.current[i3 + 2] = pzn;
          }
          onHazardHit?.();
          break;
        }
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
    // Wild stumble-back tilt while hurt (shoved by a hazard).
    g.rotation.x = -(hurtTimer.current > 0 ? Math.min(1, hurtTimer.current / 0.7) : 0) * 0.7;

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
    // Screen-shake "thump" when a hazard hits (applied after lookAt so it nudges
    // position without fighting the aim).
    if (cameraShake.current > 0) {
      const s = cameraShake.current * 0.18;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }

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
          hurt: hurtTimer.current > 0,
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
    <>
      <group ref={group} position={map.start}>
        <CharacterModel ref={limbs} equippedByCategory={equippedByCategory} gender={gender} />
      </group>
      {/* Impact spark burst (world-space) — updated imperatively each frame. */}
      <points ref={hitPointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[hitPos.current, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#fca5a5" size={0.3} transparent opacity={0.95} sizeAttenuation toneMapped={false} depthWrite={false} />
      </points>
    </>
  );
}
