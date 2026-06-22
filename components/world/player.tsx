"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { EquippedItem } from "@/lib/rarity-colors";
import {
  getEquippedDamage,
  capsuleHitTest,
  momentumMultiplier,
  getPerkMultiplier,
  applyIncomingDamage,
  ATTACK_RANGE,
  ATTACK_COOLDOWN,
  STAMINA_SPRINT_DRAIN_PER_SEC,
  STAMINA_JUMP_COST,
  STAMINA_REGEN_PER_SEC,
  STAMINA_MIN_TO_START_SPRINT,
  STAMINA_MIN_TO_JUMP,
  HP_REGEN_PER_SEC,
  HP_REGEN_DELAY_AFTER_HIT_SEC,
  RESPAWN_INVULNERABLE_SEC,
  PLAYER_MAX_HP,
} from "@/lib/combat";
import { CharacterModel, type CharacterLimbRefs } from "@/components/world/character-model";
import { useKeyboardControls } from "@/components/world/use-keyboard-controls";
import { useAttackInput } from "@/components/world/use-attack-input";
import { resolveCameraDistance, PITCH_MIN, PITCH_MAX, type CameraControls } from "@/components/world/use-camera-controls";
import type { CombatSharedState, MonsterRegistry, RemotePlayerRegistry } from "@/components/world/combat-types";
import { WORLD_RADIUS } from "@/lib/world-config";
import { debugLog, debugWarn } from "@/lib/debug";
import { broadcastTransform, subscribeToWorldPvpDamage } from "@/lib/world-realtime";
import { attemptPvpHit } from "@/lib/actions/pvp";
import type { PetTypeConfig } from "@/lib/pets";

/** Everything world-shell.tsx's HUD needs from a single throttled tick —
 * bundled into one object instead of a growing positional-argument list,
 * since the shield fields below were added on top of the original
 * hp/stamina pair. */
export interface PlayerStatsSnapshot {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  /** 0/0 if no equipped shield_cosmetic has a functioning `shield_hp` — the
   * HUD hides the shield bar entirely in that case rather than showing an
   * always-empty one. */
  shieldHp: number;
  shieldMaxHp: number;
  /** Seconds left before a broken shield pops back up to full — 0 whenever
   * it isn't currently on cooldown (either still up, or has none to begin
   * with). */
  shieldRegenCooldown: number;
  shieldRegenCooldownDuration: number;
}

interface PlayerProps {
  /** Own Supabase user id — stamped on every transform broadcast so other
   * tabs' remote-players.tsx knows whose avatar to move (and so it can
   * filter its own echo out, though `broadcast: { self: false }` in
   * lib/world-realtime.ts already prevents that at the transport level). */
  userId: string;
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  name: string;
  cameraControls: CameraControls;
  canvasRef: React.RefObject<HTMLElement | null>;
  combatRef: React.RefObject<CombatSharedState>;
  monsterRegistryRef: MonsterRegistry;
  remotePlayerRegistryRef: RemotePlayerRegistry;
  /** Admin-configured pet stats (lib/pets.ts) — handed down to
   * CharacterModel's PetCompanion so an equipped pet can fight using the
   * current live-tuned numbers, not hardcoded ones. */
  petTypes: PetTypeConfig[];
  /** Fired once per swing (not every frame) so world-shell.tsx can flash
   * the weapon HUD chip — purely a UI side-effect hook, never read back
   * into the physics/animation above. */
  onAttack?: (damage: number, hit: boolean) => void;
  /** Throttled to ~10/sec (not every frame) so the HP/Stamina/Shield HUD in
   * world-shell.tsx stays live without re-rendering React 60×/sec. */
  onStatsChange?: (stats: PlayerStatsSnapshot) => void;
  /** Fired exactly once at the moment hp hits 0 (not every frame while
   * dead) — world-shell.tsx's cue to forfeit the streak and show the
   * death-screen overlay. */
  onDeath?: () => void;
  /** Bumped (any change, value itself is meaningless) by world-shell.tsx's
   * Respawn button to actually perform the reset — see the death-screen
   * doc comment below for why this isn't automatic anymore. */
  respawnSignal: number;
}

const SPEED = 4.5;
const SPRINT_MULTIPLIER = 1.8;
const ACCEL_RATE = 8; // higher = snappier velocity response, still delta-scaled
const CAMERA_FOLLOW_RATE = 10;
const GRAVITY = -18;
const JUMP_VELOCITY = 6.2;
const BASE_FOV = 55;
const SPRINT_FOV = 62;
const FOV_RATE = 5;
const STATS_SYNC_INTERVAL = 0.1;

// Mouse-look controls: the camera's yaw (use-camera-controls.ts, driven
// directly by mouse movement while pointer-locked) *is* the crosshair's
// look direction and the basis for WASD movement — W always walks exactly
// where the crosshair points, A/D strafe perpendicular to it. The
// character's own rendered heading is a separate, slower-easing value that
// chases the camera yaw every frame (CHARACTER_TURN_RATE), so the body
// visibly swings around to face wherever you're looking/walking instead of
// snapping instantly — but movement itself is never delayed by that ease,
// only the cosmetic body rotation is.
const CHARACTER_TURN_RATE = 11;

const ATTACK_SWING_DURATION = 0.32;

/** How fast the right-click free-look offset eases back to 0 once the
 * button is released — fast enough to feel like a deliberate "snap back to
 * standard", not a lingering drift, but still a visible ease rather than an
 * instant teleport of the camera. */
const FREE_LOOK_RESET_RATE = 9;

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

/** Same reasoning as applySprintFov — keeps the camera-shake position
 * jitter's direct `camera.position.x/y +=` mutation out of the component
 * scope React Compiler tracks. */
function applyCameraShake(cam: THREE.Camera, shakeAmount: number) {
  cam.position.x += (Math.random() - 0.5) * shakeAmount;
  cam.position.y += (Math.random() - 0.5) * shakeAmount;
}

/** Same reasoning as applySprintFov — keeps a plain-object-material
 * mutation out of the component scope React Compiler tracks. */
function applyRingStyle(mat: THREE.MeshBasicMaterial, color: string, opacity: number, t: number) {
  mat.color.lerp(new THREE.Color(color), t);
  mat.opacity = THREE.MathUtils.lerp(mat.opacity, opacity, t);
}

/** Same reasoning as applySprintFov — `cc` is `cameraControls.state.current`,
 * a hook-argument-owned ref object, so easing its fields back toward 0
 * directly inside the component scope is what React Compiler's
 * immutability check flags; routing the actual field writes through a
 * plain module-scope function keeps that mutation out of the flagged
 * scope without changing what it does. */
function easeFreeLookToZero(cc: { freeLookYaw: number; freeLookPitch: number }, t: number) {
  cc.freeLookYaw = THREE.MathUtils.lerp(cc.freeLookYaw, 0, t);
  cc.freeLookPitch = THREE.MathUtils.lerp(cc.freeLookPitch, 0, t);
}

/** Shortest signed angular distance from `from` to `to`, both radians —
 * without this, easing `rotation.y` straight toward a target angle spins
 * the long way around any time the two cross the -π/π wrap (e.g. turning
 * from 179° to -179°, which is a 2° turn, not a 358° one). */
export function angleDelta(from: number, to: number): number {
  const diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) return diff - Math.PI * 2;
  if (diff < -Math.PI) return diff + Math.PI * 2;
  return diff;
}

/**
 * Mouse-look WASD movement + Space jump + Shift sprint, left-click melee,
 * HP/Stamina, and a procedural walk-cycle + airborne pose on top of the
 * shared CharacterModel. The walk-cycle mutates the leg/arm meshes'
 * `.rotation` directly via refs every frame — imperative, zero React
 * re-renders. All smoothing (velocity, body-turn, camera, FOV) is scaled
 * by `delta`, not a bare lerp factor, so motion feels identical
 * regardless of the actual frame rate.
 *
 * Control model: the camera's look yaw/pitch (use-camera-controls.ts) is
 * driven directly by mouse movement while pointer-locked — that yaw is
 * both the look direction *and* the basis W/A/S/D move along, so "walk
 * forward" always means "walk where you're looking". The character's
 * rendered heading separately eases toward that same yaw every frame, so
 * the body visibly turns to face it instead of teleporting to face it —
 * but the eased value never gates movement, only how the model looks
 * while it happens.
 *
 * Melee range is shown as a literal ring on the ground around the player
 * (no screen-space crosshair — see the Section in world-shell.tsx's git
 * history for why that read as "aiming at your own chest" in third
 * person) that brightens red whenever something is actually standing
 * inside it.
 */
export function Player({
  userId,
  equippedByCategory,
  gender,
  name,
  cameraControls,
  canvasRef,
  combatRef,
  monsterRegistryRef,
  remotePlayerRegistryRef,
  petTypes,
  onAttack,
  onStatsChange,
  onDeath,
  respawnSignal,
}: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const limbs = useRef<CharacterLimbRefs>(null);
  const rangeRing = useRef<THREE.Mesh>(null);
  const keys = useKeyboardControls();
  const attack = useAttackInput(canvasRef);
  const { camera, scene } = useThree();

  // Amulet/ring perks — equipped items never change mid-session (see
  // scene.tsx's matching comment for armor/shield), so these are plain
  // per-render values rather than refs/effects: every frame's closure
  // below just reads whatever was computed this render, which is always
  // the same number for the component's entire lifetime in practice.
  const speedMultiplier = getPerkMultiplier(equippedByCategory, "speed_boost");
  const jumpMultiplier = getPerkMultiplier(equippedByCategory, "jump_boost");
  const hpRegenMultiplier = getPerkMultiplier(equippedByCategory, "hp_regen_boost");

  // Pre-allocated scratch objects — reused every frame, never replaced.
  const velocity = useRef(new THREE.Vector3());
  const targetVelocity = useRef(new THREE.Vector3());
  const moveDir = useRef(new THREE.Vector3());
  const cameraTarget = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const cameraRayOrigin = useRef(new THREE.Vector3());
  const cameraRayDir = useRef(new THREE.Vector3());
  // Smoothed separately from the camera's own position lerp below — trees
  // are scattered across most of the map, so as the look direction sweeps
  // past one, resolveCameraDistance's *raw* result can legitimately flip
  // between "clear" and "blocked" from one frame to the next (the ray
  // grazes a trunk for a single frame, then doesn't). Feeding that raw
  // value straight into the camera target made the camera visibly snap
  // toward/away from the player every time, which read as "the camera
  // doesn't know where it is" — this low-pass-filters the *distance*
  // itself before it ever reaches the target, so a momentary graze no
  // longer causes a hard jump, only a brief, smooth dip. -1 is a one-time
  // "uninitialized" sentinel so the very first frame snaps straight to
  // the real value instead of easing in from a made-up starting distance.
  const cameraDistanceSmoothed = useRef(-1);
  const walkClock = useRef(0);
  const walkAmplitude = useRef(0);
  const fallWobble = useRef(0);

  // Jump physics, tracked separately from the walk-cycle's foot bob — both
  // end up added together into the group's final position.y each frame.
  const verticalVelocity = useRef(0);
  const baseY = useRef(0);
  const grounded = useRef(true);
  // Eased 0→1 while airborne so the fall pose blends in/out instead of
  // popping — see the limb block below.
  const jumpPose = useRef(0);

  // Attack swing: a one-shot 0→1→back progress driven by its own clock,
  // not the walk-cycle's — so a punch reads the same whether you're
  // standing still or mid-stride, and never desyncs the leg animation.
  const attackCooldown = useRef(0);
  const attackProgress = useRef(0);
  // Decays to 0 over ~1/6s after a landed hit (never on a miss) — see the
  // camera block at the end of this useFrame for how it jitters the
  // camera position. Purely a "you just connected" reflex cue, the same
  // idea as world-shell.tsx's red hurt-flash but for dealing damage
  // instead of taking it.
  const cameraShake = useRef(0);

  // Stamina hysteresis: once sprint drains stamina to 0, sprinting can't
  // restart until it's regenerated back past STAMINA_MIN_TO_START_SPRINT
  // — see lib/combat.ts for why (prevents on/off flicker at the
  // drain/regen breakeven point).
  const sprintAllowed = useRef(true);
  // HP regen bookkeeping: detects "did hp just drop" by comparing against
  // last frame's value (monsters mutate combatRef.current.hp directly,
  // Player never sees the hit happen otherwise) and resets the
  // out-of-combat timer whenever it does.
  // Starts at the constant, not `combatRef.current.maxHp` — reading a ref
  // during render is itself flagged by React Compiler's purity rule, and
  // combatRef's initial value (combat-types.ts) is this same constant
  // anyway.
  const prevHp = useRef(PLAYER_MAX_HP);
  const hpRegenTimer = useRef(0);
  const respawnInvulnTimer = useRef(0);
  const statsSyncTimer = useRef(0);
  // Set by the effect below whenever world-shell.tsx's Respawn button
  // bumps `respawnSignal` — consumed (and cleared) inside useFrame so the
  // actual reset happens in the same place every other position/HP
  // mutation does, rather than reaching into the physics state from a
  // plain React effect.
  const respawnRequested = useRef(false);
  const deathNotified = useRef(false);

  useEffect(() => {
    if (respawnSignal === 0) return; // initial mount value, not a real click
    respawnRequested.current = true;
  }, [respawnSignal]);

  // PvP damage is never applied locally — it only ever arrives as a
  // server-broadcast event (lib/actions/pvp.ts rolled it, lib/world-
  // realtime.ts delivered it) naming this player as the target, exactly
  // like a monster hit but coming from another tab instead of an NPC.
  useEffect(() => {
    return subscribeToWorldPvpDamage((payload) => {
      if (payload.targetUserId !== userId) return;
      applyIncomingDamage(combatRef.current, payload.amount);
    });
  }, [userId, combatRef]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;

    // --- Death/respawn: checked first so the rest of this frame already
    // sees the dead state instead of one stray frame at hp<=0 with input
    // still active. Unlike the old behavior, hp<=0 no longer
    // auto-respawns the very next frame — it freezes here (movement/jump/
    // attack all gate on `alive` below) until world-shell.tsx's death-
    // screen Respawn button bumps `respawnSignal`, consumed via
    // `respawnRequested` (set by the effect above) so the actual reset
    // stays inside this same imperative per-frame block instead of a
    // plain effect reaching into physics state.
    if (combatRef.current.hp <= 0 && !combatRef.current.dead) {
      combatRef.current.dead = true;
      if (!deathNotified.current) {
        deathNotified.current = true;
        onDeath?.();
      }
    }
    if (respawnRequested.current) {
      respawnRequested.current = false;
      deathNotified.current = false;
      g.position.set(0, 0, 0);
      baseY.current = 0;
      verticalVelocity.current = 0;
      grounded.current = true;
      combatRef.current.hp = combatRef.current.maxHp;
      prevHp.current = combatRef.current.maxHp;
      combatRef.current.invulnerable = true;
      respawnInvulnTimer.current = RESPAWN_INVULNERABLE_SEC;
      // Respawn is a fresh start — an equipped shield comes back up at
      // full, not however depleted it was when the player died.
      combatRef.current.shieldHpRemaining = combatRef.current.shieldMaxHp;
      combatRef.current.shieldRegenCooldown = 0;
      combatRef.current.dead = false;
    }
    if (respawnInvulnTimer.current > 0) {
      respawnInvulnTimer.current -= delta;
      if (respawnInvulnTimer.current <= 0) combatRef.current.invulnerable = false;
    }

    const locked = cameraControls.locked;
    const alive = !combatRef.current.dead;
    const cc = cameraControls.state.current;

    // Free-look easing lives here, *before* anything below reads
    // freeLookYaw/Pitch — moved up from the camera block at the bottom of
    // this frame specifically so `viewYaw` (right below) is available to
    // the melee hit-test further down too, not just the camera. Released,
    // it's eased back to exactly 0 every frame; see use-camera-controls.ts'
    // doc comment for the full reasoning.
    if (!cc.freeLookActive) {
      easeFreeLookToZero(cc, Math.min(1, delta * FREE_LOOK_RESET_RATE));
    }
    // The actual direction currently rendered/aimed at — `cc.yaw` plus
    // whatever right-click free-look offset is active. Movement/body-
    // heading below intentionally keep using plain `cc.yaw` (free-look must
    // never change which way WASD walks or which way the body turns), but
    // the melee hit-test further down uses `viewYaw`: a swing should land
    // on whatever you're actually looking at *right now*, including mid-
    // free-look — using the frozen `cc.yaw` there instead would silently
    // whiff anything that looks dead-center on screen while free-looking,
    // exactly the kind of "I'm clearly facing it but can't hit it" bug
    // report this is fixing.
    const viewYaw = cc.yaw + cc.freeLookYaw;
    const viewPitch = THREE.MathUtils.clamp(cc.pitch + cc.freeLookPitch, PITCH_MIN, PITCH_MAX);

    // --- Body heading: eases toward the camera's look yaw every frame —
    // the one and only place the character's rotation.y is ever set. When
    // the pointer isn't locked (menus, "click to play" overlay) input is
    // simply not read below, so the character just stands still facing
    // wherever it last faced.
    g.rotation.y += angleDelta(g.rotation.y, cc.yaw) * Math.min(1, delta * CHARACTER_TURN_RATE);

    const moveForward =
      locked && alive ? (keys.state.current.forward ? 1 : 0) - (keys.state.current.backward ? 1 : 0) : 0;
    const moveRight =
      locked && alive
        ? (keys.state.current.strafeRight ? 1 : 0) - (keys.state.current.strafeLeft ? 1 : 0)
        : 0;
    const moving = moveForward !== 0 || moveRight !== 0;

    // --- Stamina: drains only from sprinting (continuous) or jumping (a
    // flat cost below) — never from attacking. See lib/combat.ts for the
    // exact numbers and the hysteresis reasoning.
    const wantsSprint = locked && moving && keys.state.current.sprint;
    if (combatRef.current.stamina >= STAMINA_MIN_TO_START_SPRINT) sprintAllowed.current = true;
    const sprinting = wantsSprint && sprintAllowed.current && combatRef.current.stamina > 0;
    if (sprinting) {
      combatRef.current.stamina = Math.max(0, combatRef.current.stamina - STAMINA_SPRINT_DRAIN_PER_SEC * delta);
      if (combatRef.current.stamina <= 0) sprintAllowed.current = false;
    } else {
      combatRef.current.stamina = Math.min(
        combatRef.current.maxStamina,
        combatRef.current.stamina + STAMINA_REGEN_PER_SEC * delta
      );
    }

    if (moving) {
      // Forward/right basis vectors derived from the *camera* yaw, not the
      // (slower-easing) body heading — movement responds to the mouse
      // instantly, only the visual body rotation lags behind it.
      const fx = Math.sin(cc.yaw);
      const fz = Math.cos(cc.yaw);
      // "Right" must match the camera's actual screen-right axis, not just
      // "the forward vector rotated by +yaw" — for this behind-the-player
      // chase camera (positioned opposite the look direction, then
      // `camera.lookAt`-ed back at the player) those two are *not* the same
      // vector, they're exact opposites. Three.js's own lookAt convention
      // (x-axis = cross(up, eye-target)) resolves to (-cos(yaw), sin(yaw))
      // here, not (cos(yaw), -sin(yaw)) — using the latter is exactly what
      // made D strafe screen-left and A strafe screen-right.
      const rx = -Math.cos(cc.yaw);
      const rz = Math.sin(cc.yaw);
      moveDir.current
        .set(fx * moveForward + rx * moveRight, 0, fz * moveForward + rz * moveRight)
        .normalize();
      targetVelocity.current
        .copy(moveDir.current)
        .multiplyScalar(SPEED * speedMultiplier * (sprinting ? SPRINT_MULTIPLIER : 1));
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
    // so holding Space doesn't keep re-triggering it every frame. Always
    // consumed exactly once per press regardless of whether stamina/ground
    // conditions allow it, so an unaffordable jump press doesn't linger
    // and fire later once stamina regenerates.
    const jumpRequested = keys.consumeJump();
    if (
      locked &&
      alive &&
      jumpRequested &&
      grounded.current &&
      combatRef.current.stamina >= STAMINA_MIN_TO_JUMP
    ) {
      verticalVelocity.current = JUMP_VELOCITY * jumpMultiplier;
      grounded.current = false;
      combatRef.current.stamina = Math.max(0, combatRef.current.stamina - STAMINA_JUMP_COST);
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

    // --- HP regen: only once nothing has hit the player for a few
    // seconds (HP_REGEN_DELAY_AFTER_HIT_SEC) — detected by comparing
    // against last frame's hp, since monsters mutate combatRef.current.hp
    // directly rather than calling back through Player.
    if (combatRef.current.hp < prevHp.current) hpRegenTimer.current = 0;
    else hpRegenTimer.current += delta;
    prevHp.current = combatRef.current.hp;
    if (hpRegenTimer.current >= HP_REGEN_DELAY_AFTER_HIT_SEC) {
      combatRef.current.hp = Math.min(
        combatRef.current.maxHp,
        combatRef.current.hp + HP_REGEN_PER_SEC * hpRegenMultiplier * delta
      );
      prevHp.current = combatRef.current.hp;
    }

    // --- Shield regen: once broken, waits out its configured cooldown
    // (seeded from the equipped shield's shield_regen_cooldown_sec in
    // scene.tsx) and then pops back up to full — see lib/combat.ts'
    // applyIncomingDamage for how it depletes in the first place.
    if (combatRef.current.shieldRegenCooldown > 0) {
      combatRef.current.shieldRegenCooldown -= delta;
      if (combatRef.current.shieldRegenCooldown <= 0) {
        combatRef.current.shieldRegenCooldown = 0;
        combatRef.current.shieldHpRemaining = combatRef.current.shieldMaxHp;
      }
    }

    // --- Melee: scan the monster registry *and* the remote-player registry
    // (components/world/remote-players.tsx) for the single nearest *alive*
    // target standing inside the forward hit capsule (lib/combat.ts
    // `capsuleHitTest` — a fixed-radius cylinder extending ATTACK_RANGE in
    // front of the player, not an angle-cone, see that function's doc
    // comment for why). `anyInRange` (plain radial distance, ignoring
    // facing entirely) separately drives the ground ring's color every
    // frame, attack or not, so the radius is always honestly shown
    // regardless of which way the player is facing. Whichever kind (monster
    // or player) ends up nearest wins outright — a swing only ever lands on
    // one target, never both.
    let anyInRange = false;
    let nearestDist = Infinity;
    let nearestMonster: { takeDamage: (n: number) => number } | null = null;
    let nearestPlayerId: string | null = null;
    let nearestPlayerPos: THREE.Vector3 | null = null;
    for (const m of monsterRegistryRef.current) {
      if (!m.isAlive()) continue;
      const pos = m.getPosition();
      const dx = pos.x - g.position.x;
      const dz = pos.z - g.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > ATTACK_RANGE) continue;
      anyInRange = true;
      // `viewYaw` (the direction actually rendered/aimed at *this frame*,
      // free-look offset included — computed at the top of this useFrame),
      // not `g.rotation.y` (the body's cosmetic heading, which only *eases*
      // toward `cc.yaw` over CHARACTER_TURN_RATE and never includes
      // free-look at all). Using the body heading whiffed targets dead-
      // center in the crosshair right after a quick aim correction; using
      // plain `cc.yaw` (no free-look) whiffed anything you were currently
      // free-looking at instead of the frozen aim direction underneath it.
      // `m.hitRadius` (lib/monsters.ts `scale` baked in at spawn time, see
      // monster.tsx) instead of the flat default — a Dämonenfürst's visible
      // body is nearly twice the width of a Slime's, so treating both as
      // the same fixed-size point whiffed swings that clearly looked like
      // they connected with a big variant's visible silhouette.
      if (!capsuleHitTest(g.position.x, g.position.z, viewYaw, pos.x, pos.z, ATTACK_RANGE, m.hitRadius)) continue;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestMonster = m;
        nearestPlayerId = null;
        nearestPlayerPos = null;
      }
    }
    for (const p of remotePlayerRegistryRef.current) {
      const pos = p.getPosition();
      const dx = pos.x - g.position.x;
      const dz = pos.z - g.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > ATTACK_RANGE) continue;
      anyInRange = true;
      // Same `viewYaw` reasoning as the monster loop above.
      if (!capsuleHitTest(g.position.x, g.position.z, viewYaw, pos.x, pos.z, ATTACK_RANGE)) continue;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestMonster = null;
        nearestPlayerId = p.id;
        nearestPlayerPos = pos;
      }
    }

    cameraShake.current = Math.max(0, cameraShake.current - delta * 6);
    attackCooldown.current = Math.max(0, attackCooldown.current - delta);
    // Always consumed exactly once per click regardless of whether `alive`
    // allows it to actually swing — same reasoning as jump's
    // `keys.consumeJump()` above, so a click made the instant before dying
    // doesn't linger and fire the moment the player respawns.
    const attackPressed = attack.consumeAttack();
    if (locked && alive && attackPressed && attackCooldown.current <= 0) {
      attackCooldown.current = ATTACK_COOLDOWN;
      attackProgress.current = 0.0001; // nudge off exactly 0 so the block below picks it up this frame
      const baseDmg = getEquippedDamage(equippedByCategory.weapon_cosmetic);
      const airborne = !grounded.current;
      const dmg = Math.round(baseDmg * momentumMultiplier(sprinting, airborne));
      const hit = nearestMonster !== null || nearestPlayerId !== null;
      if (nearestMonster) {
        nearestMonster.takeDamage(dmg);
        cameraShake.current = 1;
      } else if (nearestPlayerId && nearestPlayerPos) {
        cameraShake.current = 1;
        // Fire-and-forget: the actual HP change only ever happens once the
        // server rolls its own damage number and broadcasts it back (see
        // the subscribeToWorldPvpDamage effect above) — this client never
        // touches another player's HP directly.
        attemptPvpHit({
          targetUserId: nearestPlayerId,
          attackerX: g.position.x,
          attackerZ: g.position.z,
          // viewYaw (actual rendered aim, free-look included) — same
          // reasoning as the local capsuleHitTest calls above, so the
          // server-side PvP hit check agrees with what the client just used
          // to pick this target.
          attackerHeading: viewYaw,
          targetX: nearestPlayerPos.x,
          targetZ: nearestPlayerPos.z,
          sprinting,
          airborne,
        }).catch((err) => debugWarn("World", "attemptPvpHit failed", err));
      }
      debugLog("World", "attack", {
        damage: dmg,
        hit,
        sprinting,
        airborne,
        target: nearestMonster ? "monster" : nearestPlayerId ? "player" : "none",
        weapon: equippedByCategory.weapon_cosmetic?.name ?? "Fäuste",
      });
      onAttack?.(dmg, hit);
    }
    let attackSwing = 0;
    if (attackProgress.current > 0) {
      attackProgress.current += delta / ATTACK_SWING_DURATION;
      if (attackProgress.current >= 1) {
        attackProgress.current = 0;
      } else {
        // 0→1→0 hump, fast out / slower return — a jab, not a metronome.
        attackSwing = Math.sin(attackProgress.current * Math.PI);
      }
    }

    if (rangeRing.current) {
      const mat = rangeRing.current.material as THREE.MeshBasicMaterial;
      applyRingStyle(
        mat,
        anyInRange ? "#f87171" : "#a855f7",
        anyInRange ? 0.55 : 0.16,
        Math.min(1, delta * 8)
      );
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
      const jp = jumpPose.current;
      // Falling reads more dramatically than rising — the apex/launch of a
      // jump keeps a fairly contained pose, the actual descent is where the
      // limbs really splay out, the way a real fall reads.
      const fallBlend = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(verticalVelocity.current, 2, -9, 0.45, 1),
        0.45,
        1
      );
      fallWobble.current += delta * 9;

      // Airborne pose: legs spread OUT TO THE SIDES (rotation.z swings the
      // hip-pivoted leg group sideways, not forward/back like the walk
      // cycle does on rotation.x) with a fast asymmetric wobble — a loose,
      // off-balance flail instead of a stiff forward tuck. Arms mirror the
      // same idea, spread outward and slightly raised, wobbling out of
      // phase with the legs so all four limbs never swing in lockstep
      // (which would read as a synchronized dance move, not a fall).
      const legSpread = 0.5 * jp * fallBlend;
      const armSpread = 0.55 * jp * fallBlend;
      const wobble = 0.12 * jp * fallBlend;
      const legTuckX = -0.18 * jp * fallBlend;
      const armRaiseX = -0.35 * jp * fallBlend;

      if (l.legL.current) {
        l.legL.current.rotation.x = THREE.MathUtils.lerp(swing, legTuckX, jp) + attackSwing * 0.06;
        l.legL.current.rotation.z = -legSpread - Math.sin(fallWobble.current) * wobble;
      }
      if (l.legR.current) {
        l.legR.current.rotation.x = THREE.MathUtils.lerp(-swing, legTuckX, jp) - attackSwing * 0.06;
        l.legR.current.rotation.z = legSpread + Math.sin(fallWobble.current + Math.PI) * wobble;
      }
      if (l.armL.current) {
        l.armL.current.rotation.x = THREE.MathUtils.lerp(-swing, armRaiseX, jp);
        l.armL.current.rotation.z = -armSpread - Math.sin(fallWobble.current * 1.3 + 1) * wobble;
      }
      if (l.armR.current) {
        // The right arm is also the attack arm — its walk/fall blend is
        // overridden by the swing whenever one is in progress (attackSwing
        // > 0), a quick forward-and-up jab that reads the same whether the
        // weapon slot holds a real weapon or nothing (bare fist).
        const baseX = THREE.MathUtils.lerp(swing, armRaiseX, jp);
        l.armR.current.rotation.x = THREE.MathUtils.lerp(baseX, -2.2, attackSwing);
        l.armR.current.rotation.z = armSpread + Math.sin(fallWobble.current * 1.3 + 1 + Math.PI) * wobble;
      }
    }

    const footBob =
      moving && grounded.current ? Math.abs(Math.sin(walkClock.current * 2)) * 0.04 : 0;
    g.position.y = baseY.current + footBob;

    combatRef.current.playerPos.copy(g.position);
    combatRef.current.playerHeading = g.rotation.y;

    statsSyncTimer.current += delta;
    if (statsSyncTimer.current >= STATS_SYNC_INTERVAL) {
      statsSyncTimer.current = 0;
      onStatsChange?.({
        hp: combatRef.current.hp,
        maxHp: combatRef.current.maxHp,
        stamina: combatRef.current.stamina,
        maxStamina: combatRef.current.maxStamina,
        shieldHp: combatRef.current.shieldHpRemaining,
        shieldMaxHp: combatRef.current.shieldMaxHp,
        shieldRegenCooldown: combatRef.current.shieldRegenCooldown,
        shieldRegenCooldownDuration: combatRef.current.shieldRegenCooldownDuration,
      });
      // Same 10Hz cadence as the HUD sync above — a position broadcast
      // doesn't need to be any more frequent than the HUD itself updates,
      // and reusing this timer means no second interval to keep in sync.
      broadcastTransform({
        id: userId,
        x: g.position.x,
        z: g.position.z,
        yaw: g.rotation.y,
        hp: combatRef.current.hp,
        moving,
        sprinting,
      });
    }

    // `viewYaw`/`viewPitch` (free-look offset included) were already
    // computed at the top of this frame, right after `cc` itself — reused
    // here as-is, not recomputed, so the camera and the melee hit-test
    // further up agree on exactly the same direction every frame.

    // Camera: sits behind+above the player along the look direction at all
    // times (cc.yaw/cc.pitch, plus whatever free-look offset is currently
    // active above).
    const lookX = Math.sin(viewYaw);
    const lookZ = Math.cos(viewYaw);
    // (dirX, dirY, dirZ) is already unit-length — lookX/lookZ are a
    // sin/cos pair (unit circle in XZ) and cos(pitch)/sin(pitch) is a
    // second unit pair, so the combined vector's length is exactly 1
    // without needing a separate .normalize() call.
    const dirX = -lookX * Math.cos(viewPitch);
    const dirY = Math.sin(viewPitch);
    const dirZ = -lookZ * Math.cos(viewPitch);
    cameraRayDir.current.set(dirX, dirY, dirZ);
    // Cast from chest height, not the feet — a ray starting at ground
    // level would immediately clip through the terrain mesh itself.
    cameraRayOrigin.current.set(g.position.x, g.position.y + 1.5, g.position.z);
    const rawClampedDistance = resolveCameraDistance(
      scene,
      cameraRayOrigin.current,
      cameraRayDir.current,
      cc.distance
    );
    if (cameraDistanceSmoothed.current < 0) {
      cameraDistanceSmoothed.current = rawClampedDistance;
    } else {
      // Pulling in (an obstruction just appeared) snaps fast — the camera
      // must never visibly clip through a tree even for a moment. Easing
      // back out once it's clear is deliberately slower, which is what
      // actually kills the flicker: a single-frame graze decays away
      // smoothly instead of yanking the camera back out and in again.
      const rate = rawClampedDistance < cameraDistanceSmoothed.current ? 20 : 6;
      cameraDistanceSmoothed.current = THREE.MathUtils.lerp(
        cameraDistanceSmoothed.current,
        rawClampedDistance,
        Math.min(1, delta * rate)
      );
    }
    const smoothedDistance = cameraDistanceSmoothed.current;
    cameraTarget.current.set(
      g.position.x + dirX * smoothedDistance,
      g.position.y + dirY * smoothedDistance,
      g.position.z + dirZ * smoothedDistance
    );
    camera.position.lerp(cameraTarget.current, Math.min(1, delta * CAMERA_FOLLOW_RATE));
    lookTarget.current.set(g.position.x, g.position.y + 1, g.position.z);
    camera.lookAt(lookTarget.current);

    // Small post-lookAt position jitter, scaled by the decaying shake
    // value above — applied after lookAt so it nudges the camera's
    // position without fighting the orientation that already targeted the
    // player; reads as a quick screen-shake "thump" on a landed hit.
    if (cameraShake.current > 0) {
      applyCameraShake(camera, cameraShake.current * 0.05);
    }
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      <CharacterModel
        ref={limbs}
        equippedByCategory={equippedByCategory}
        gender={gender}
        name={name}
        shieldStateRef={combatRef}
        monsterRegistryRef={monsterRegistryRef}
        petTypes={petTypes}
      />
      {/* Melee-range indicator — a flat ring on the ground centered on the
          player, see the doc comment above for why this replaced a
          screen-space crosshair. */}
      <mesh ref={rangeRing} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[ATTACK_RANGE - 0.07, ATTACK_RANGE, 48]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.16} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
