"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rarityColorFor, type EquippedItem } from "@/lib/rarity-colors";
import { SlashEffect, SLASH_EFFECT_LIFETIME_MS } from "@/components/world/hit-fx";
import { getEquippedDamage, capsuleHitTest, momentumMultiplier, getPerkMultiplier, applyIncomingDamage } from "@/lib/combat";
import type { CharacterConfig } from "@/lib/character-config";
import { CharacterModel, type CharacterLimbRefs } from "@/components/world/character-model";
import { useKeyboardControls } from "@/components/world/use-keyboard-controls";
import { useAttackInput } from "@/components/world/use-attack-input";
import { PITCH_MIN, PITCH_MAX, type CameraControls } from "@/components/world/use-camera-controls";
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
  /** Admin-configured player/combat base stats (lib/character-config.ts)
   * — every constant this file used to import straight from lib/combat.ts
   * (move speed, stamina, fist damage, attack range/cooldown, etc.) now
   * comes from here instead, so the admin Games tab can actually retune
   * any of it live. */
  characterConfig: CharacterConfig;
}

// Velocity smoothing rate — governs how quickly horizontal speed tracks the
// target on both start (key pressed) and stop (key released). At 60 fps
// with the exponential formula below, 14 ≈ 91 % of target velocity in
// ~150 ms: responsive without feeling teleport-snappy. The old value of 8
// needed ~267 ms to reach the same percentage, which read as "floaty" or
// "sliding" on stop.
const ACCEL_RATE = 14;
/** Absolute world-space floor on the camera's Y position — scene.tsx's
 * ground plane sits at y≈-0.04 and is single-sided (invisible from
 * underneath), so this needs real clearance above that, not just "above
 * zero". See the camera block's doc comment below for the exact bug this
 * prevents. */
const MIN_CAMERA_WORLD_Y = 0.35;
const GRAVITY = -18;
const JUMP_VELOCITY = 6.2;
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
// Body heading ease-rate — higher = body snaps to camera yaw faster.
// 15 gives ~221 ms to reach 91 % of target (was 11 → ~286 ms): the body
// still visibly "swings" to follow the mouse rather than teleporting, but
// no longer lags so far behind that it reads as the character walking
// sideways or facing the wrong direction.
const CHARACTER_TURN_RATE = 15;

// Deliberately shorter than lib/combat.ts's ATTACK_COOLDOWN (0.45s): the
// swing animation itself finishes a beat before the next attack is
// actually allowed, so the player gets clear "that swing is done" visual
// feedback instead of the arm still being mid-motion when they're already
// allowed to click again.
const ATTACK_SWING_DURATION = 0.32;

/** How fast the right-click free-look offset eases back to 0 once the
 * button is released — fast enough to feel like a deliberate "snap back to
 * standard", not a lingering drift, but still a visible ease rather than an
 * instant teleport of the camera. */
const FREE_LOOK_RESET_RATE = 9;

/** Lives outside the component on purpose — the React Compiler's
 * immutability check flags direct `camera.position.x/y +=` mutation
 * *inside* a component that called `useThree()`, even though mutating a
 * three.js object imperatively inside `useFrame` (same as `camera.
 * position.lerp(…)` a few lines below) is the standard, intended r3f
 * pattern. Routing the actual field assignment through a plain function
 * declared at module scope keeps that mutation out of the flagged scope
 * without changing what it does. */
function applyCameraShake(cam: THREE.Camera, shakeAmount: number) {
  cam.position.x += (Math.random() - 0.5) * shakeAmount;
  cam.position.y += (Math.random() - 0.5) * shakeAmount;
}

// Reused every call below, never reallocated — `applyRingStyle` runs every
// single frame (the range ring's color tween), and `new THREE.Color(...)`
// allocating a fresh object 60×/sec was a small but genuinely continuous
// stream of garbage, exactly the kind of "tiny, recurring stutter" a minor
// GC pass causes. Module-scope, not a ref, since this is a plain function
// (not a hook) and only ever one Player exists per client at a time.
const ringTargetColorScratch = new THREE.Color();

/** Same reasoning as applyCameraShake — keeps a plain-object-material
 * mutation out of the component scope React Compiler tracks. */
function applyRingStyle(mat: THREE.MeshBasicMaterial, color: string, opacity: number, t: number) {
  mat.color.lerp(ringTargetColorScratch.set(color), t);
  mat.opacity = THREE.MathUtils.lerp(mat.opacity, opacity, t);
}

/** Same reasoning as applyCameraShake — `cc` is `cameraControls.state.current`,
 * a hook-argument-owned ref object, so easing its fields back toward 0
 * directly inside the component scope is what React Compiler's
 * immutability check flags; routing the actual field writes through a
 * plain module-scope function keeps that mutation out of the flagged
 * scope without changing what it does. */
function easeFreeLookToZero(cc: { freeLookYaw: number; freeLookPitch: number }, t: number) {
  cc.freeLookYaw = THREE.MathUtils.lerp(cc.freeLookYaw, 0, t);
  cc.freeLookPitch = THREE.MathUtils.lerp(cc.freeLookPitch, 0, t);
}

let slashEffectSeq = 0;

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
  characterConfig,
}: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const limbs = useRef<CharacterLimbRefs>(null);
  const rangeRing = useRef<THREE.Mesh>(null);
  // Wraps CharacterModel only (not `group`, the camera-tracked/position-
  // authoritative root) — carries the death-fall/despawn pose so it can
  // rotate and shrink to nothing without touching `g.position`/`g.rotation`
  // (which broadcastTransform, the camera, and combatRef.playerPos all
  // still read every frame regardless of `alive`).
  const deathPose = useRef<THREE.Group>(null);
  // Seconds since death — 0 whenever alive. Drives the fall-then-shrink
  // animation below; reset back to 0 the instant `alive` flips true again
  // (the respawn handler doesn't need to touch this itself).
  const deathFallT = useRef(0);
  const keys = useKeyboardControls();
  const attack = useAttackInput(canvasRef);
  const { camera } = useThree();
  // One-shot slash VFX per swing — the only React state in this otherwise
  // fully-imperative-refs component, same "spawn into a short-lived list,
  // setTimeout removes it" idiom monster.tsx already uses for its own
  // popups/blood-bursts. A handful of these mounted at once (rapid
  // clicking) is the absolute ceiling, never a re-render-per-frame concern.
  const [slashEffects, setSlashEffects] = useState<
    { id: number; color: string; position: [number, number, number]; rotationY: number }[]
  >([]);

  // Amulet/ring perks — equipped items never change mid-session (see
  // scene.tsx's matching comment for armor/shield), so these are plain
  // per-render values rather than refs/effects: every frame's closure
  // below just reads whatever was computed this render, which is always
  // the same number for the component's entire lifetime in practice.
  const speedMultiplier = getPerkMultiplier(equippedByCategory, "speed_boost", characterConfig.perkMultiplierCap);
  const jumpMultiplier = getPerkMultiplier(equippedByCategory, "jump_boost", characterConfig.perkMultiplierCap);
  const hpRegenMultiplier = getPerkMultiplier(equippedByCategory, "hp_regen_boost", characterConfig.perkMultiplierCap);

  // Pre-allocated scratch objects — reused every frame, never replaced.
  const velocity = useRef(new THREE.Vector3());
  const targetVelocity = useRef(new THREE.Vector3());
  const moveDir = useRef(new THREE.Vector3());
  const cameraTarget = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
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
  // Anti-spam timer, not a resource cost — see lib/combat.ts'
  // JUMP_COOLDOWN_SEC doc comment for why jumping no longer drains stamina.
  const jumpCooldown = useRef(0);

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
  // Starts at the configured max, not `combatRef.current.maxHp` — reading
  // a ref during render is itself flagged by React Compiler's purity
  // rule, and combatRef's initial value (combat-types.ts) is this same
  // number anyway.
  const prevHp = useRef(characterConfig.playerMaxHp);
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

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
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
      respawnInvulnTimer.current = characterConfig.respawnInvulnerableSec;
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

    // Death-fall/despawn — the character itself collapses and disappears
    // on death (not the monsters around it, and not the rest of the
    // world: components/world/monsters-field.tsx keeps spawning/wandering
    // exactly as normal). Purely cosmetic, on `deathPose` only — `g.
    // position`/`g.rotation` keep reflecting the real last-alive
    // transform underneath this the whole time, since combatRef.
    // playerPos/playerHeading and broadcastTransform's payload both still
    // read those every frame regardless of `alive`.
    if (!alive) {
      deathFallT.current += delta;
      if (deathPose.current) {
        // Face-plants forward over ~0.45s, then shrinks away to nothing
        // over the following ~0.9s — "you died" reads immediately from
        // the fall, "and now you're gone" follows a beat later instead of
        // popping out abruptly the instant hp hit 0.
        deathPose.current.rotation.x = THREE.MathUtils.lerp(0, Math.PI / 2.1, Math.min(1, deathFallT.current * 2.4));
        const shrinkT = Math.max(0, deathFallT.current - 0.55) / 0.9;
        deathPose.current.scale.setScalar(Math.max(0.001, 1 - Math.min(1, shrinkT)));
      }
    } else if (deathFallT.current > 0) {
      // Respawned — snap the cosmetic pose back instantly; `g.position`
      // itself is already reset elsewhere (the respawnRequested branch
      // above), this just undoes the fall/shrink visual to match.
      deathFallT.current = 0;
      if (deathPose.current) {
        deathPose.current.rotation.x = 0;
        deathPose.current.scale.setScalar(1);
      }
    }

    // Free-look easing lives here, *before* anything below reads
    // freeLookYaw/Pitch — released, it's eased back to exactly 0 every
    // frame; see use-camera-controls.ts' doc comment for the full
    // reasoning.
    if (!cc.freeLookActive) {
      easeFreeLookToZero(cc, Math.min(1, delta * FREE_LOOK_RESET_RATE));
    }
    // `viewYaw`/`viewPitch` — `cc.yaw`/`cc.pitch` plus whatever right-click
    // free-look offset is active — are used *only* for the camera's own
    // rendering further down this frame (where it's positioned, which way
    // it looks). Everything else — movement, body heading, the melee
    // hit-test, the slash VFX, PvP — deliberately keeps using plain
    // `cc.yaw` instead: free-look must never change which way WASD walks,
    // which way the body turns, or which way the weapon actually swings
    // (the arm-swing animation is a child of the body, which only ever
    // follows `cc.yaw` — it has no idea free-look exists). An earlier
    // version routed the hit-test through `viewYaw` on the theory that a
    // swing should land on whatever the camera currently looks at — that
    // relocated *both* the hit-test and the visible slash to wherever the
    // camera glanced instead of where the weapon actually is, which is
    // exactly the "can't hit what's right in front of my character" bug
    // report. The weapon doesn't move when you free-look; neither should
    // its hitbox.
    const viewYaw = cc.yaw + cc.freeLookYaw;
    const viewPitch = THREE.MathUtils.clamp(cc.pitch + cc.freeLookPitch, PITCH_MIN, PITCH_MAX);

    // --- Body heading: eases toward the camera's look yaw every frame —
    // the one and only place the character's rotation.y is ever set. When
    // the pointer isn't locked (menus, "click to play" overlay) input is
    // simply not read below, so the character just stands still facing
    // wherever it last faced.
    g.rotation.y += angleDelta(g.rotation.y, cc.yaw) * (1 - Math.exp(-delta * CHARACTER_TURN_RATE));
    g.rotation.y = g.rotation.y % (Math.PI * 2);
    if (g.rotation.y < -Math.PI) g.rotation.y += Math.PI * 2;
    else if (g.rotation.y > Math.PI) g.rotation.y -= Math.PI * 2;

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
    if (combatRef.current.stamina >= characterConfig.staminaMinToStartSprint) sprintAllowed.current = true;
    const sprinting = wantsSprint && sprintAllowed.current && combatRef.current.stamina > 0;
    if (sprinting) {
      combatRef.current.stamina = Math.max(
        0,
        combatRef.current.stamina - characterConfig.staminaSprintDrainPerSec * delta
      );
      if (combatRef.current.stamina <= 0) sprintAllowed.current = false;
    } else {
      combatRef.current.stamina = Math.min(
        combatRef.current.maxStamina,
        combatRef.current.stamina + characterConfig.staminaRegenPerSec * delta
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
        .multiplyScalar(
          characterConfig.moveSpeed * speedMultiplier * (sprinting ? characterConfig.sprintMultiplier : 1)
        );
    } else {
      targetVelocity.current.set(0, 0, 0);
    }

    // Exponential smoothing (1 − e^(−rate·dt)) is frame-rate-independent:
    // the same time constant regardless of whether the game runs at 30 or
    // 144 fps. Math.min(1, delta*rate) is a linear approximation that
    // undershoots slightly at low fps and diverges at very high deltas.
    velocity.current.lerp(targetVelocity.current, 1 - Math.exp(-delta * ACCEL_RATE));
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
    // consumed exactly once per press regardless of whether the cooldown/
    // ground conditions allow it, so a press made a moment too early
    // doesn't linger and fire later once the cooldown clears. No stamina
    // cost at all (see lib/combat.ts' doc comment on its removal) — only
    // `jumpCooldown`, a flat timer, stops Space being mashed into a jump
    // faster than the last one even visibly left the ground.
    jumpCooldown.current = Math.max(0, jumpCooldown.current - delta);
    const jumpRequested = keys.consumeJump();
    if (locked && alive && jumpRequested && grounded.current && jumpCooldown.current <= 0) {
      verticalVelocity.current = JUMP_VELOCITY * jumpMultiplier;
      grounded.current = false;
      // No cooldown set here — it is applied at touch-down (below) so that
      // the full jumpCooldownSec wait is always AFTER landing, not from the
      // moment of the jump itself. Starting it at jump-time meant a long
      // perk-boosted jump could exhaust the 1 s timer mid-air and let the
      // player jump again the instant they touched down (i.e. no cooldown at
      // all from the player's perspective). Post-landing application
      // guarantees the felt pause is always exactly jumpCooldownSec,
      // regardless of how high or long the jump was.
    }
    verticalVelocity.current += GRAVITY * delta;
    baseY.current += verticalVelocity.current * delta;
    if (baseY.current <= 0) {
      baseY.current = 0;
      verticalVelocity.current = 0;
      if (!grounded.current) {
        // Just touched down — start the post-landing cooldown now.
        jumpCooldown.current = characterConfig.jumpCooldownSec;
      }
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
    if (hpRegenTimer.current >= characterConfig.hpRegenDelayAfterHitSec) {
      combatRef.current.hp = Math.min(
        combatRef.current.maxHp,
        combatRef.current.hp + characterConfig.hpRegenPerSec * hpRegenMultiplier * delta
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
      if (dist > characterConfig.attackRange) continue;
      anyInRange = true;
      // `cc.yaw` (the committed aim/movement/body-facing direction), not
      // `viewYaw` (the camera's *current rendered look*, free-look offset
      // included) and not `g.rotation.y` (the body's cosmetic heading,
      // which only *eases* toward `cc.yaw` over CHARACTER_TURN_RATE). The
      // arm/weapon swing itself (further down this frame) is animated as
      // a child of the body, which only ever follows `cc.yaw` — it never
      // turns to face wherever free-look happens to be glancing. Hit-
      // testing against `viewYaw` instead (an earlier version of this)
      // meant a free-looking player whose body/weapon was clearly facing
      // a monster could still whiff it, because the *camera* — not the
      // weapon — was pointed elsewhere; exactly the "can't hit what's
      // right in front of my character" bug report. `cc.yaw` matches
      // what the swing animation and the weapon itself are actually doing,
      // free-look or not. `m.hitRadius` (lib/monsters.ts `scale` baked in
      // at spawn time, see monster.tsx) instead of the flat default — a
      // Dämonenfürst's visible body is nearly twice the width of a
      // Slime's, so treating both as the same fixed-size point whiffed
      // swings that clearly looked like they connected with a big
      // variant's visible silhouette.
      if (
        !capsuleHitTest(
          g.position.x,
          g.position.z,
          cc.yaw,
          pos.x,
          pos.z,
          characterConfig.attackRange,
          m.hitRadius,
          characterConfig.attackConeHalfAngle
        )
      )
        continue;
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
      if (dist > characterConfig.attackRange) continue;
      anyInRange = true;
      // Same `cc.yaw` reasoning as the monster loop above.
      if (
        !capsuleHitTest(
          g.position.x,
          g.position.z,
          cc.yaw,
          pos.x,
          pos.z,
          characterConfig.attackRange,
          characterConfig.attackHitRadius,
          characterConfig.attackConeHalfAngle
        )
      )
        continue;
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
      attackCooldown.current = characterConfig.attackCooldown;
      attackProgress.current = 0.0001; // nudge off exactly 0 so the block below picks it up this frame
      // Slash VFX (hit-fx.tsx) — fired on every swing, hit or miss, exactly
      // like the arm animation itself; only the floating damage number
      // popups (monster.tsx) are conditional on actually landing.
      //
      // Position/rotation computed here in *world space* from `cc.yaw`
      // (the body/weapon's actual facing — same direction the hit-test
      // above uses, and the same one `group`'s own rotation eases toward),
      // not rendered as a child of `group` directly only because that
      // would double up the existing easing instead of snapping to the
      // exact direction the swing just used. An earlier version used
      // `viewYaw` (the camera's current look, free-look offset included)
      // instead — which seemed necessary at the time to make the slash
      // visible on screen during free-look, but the *actual* fix for that
      // turned out to be unrelated (use-attack-input.ts's mousedown-vs-
      // pointerdown bug). Using `viewYaw` here just relocated the slash
      // (and the hit-test) to wherever the camera glanced instead of
      // where the weapon really swings, which is exactly the "can't hit
      // what's right in front of my character" report. `cc.yaw` matches
      // the weapon. Local offset (lx, ly, lz) rotated into world space by
      // `cc.yaw` using this app's standard forward/right convention
      // (forward=(sinθ,cosθ), right=(-cosθ,sinθ) — see player.tsx's rx/rz
      // derivation earlier in this file for the full reasoning).
      const slashId = ++slashEffectSeq;
      const slashColor = rarityColorFor(equippedByCategory.weapon_cosmetic, "#e5e7eb");
      const slashLocal = { x: 0.32, y: 1.3, z: 0.55 };
      const slashSin = Math.sin(cc.yaw);
      const slashCos = Math.cos(cc.yaw);
      const slashPosition: [number, number, number] = [
        g.position.x + (-slashLocal.x * slashCos + slashLocal.z * slashSin),
        g.position.y + slashLocal.y,
        g.position.z + (slashLocal.x * slashSin + slashLocal.z * slashCos),
      ];
      setSlashEffects((curr) => [
        ...curr,
        { id: slashId, color: slashColor, position: slashPosition, rotationY: cc.yaw },
      ]);
      setTimeout(
        () => setSlashEffects((curr) => curr.filter((s) => s.id !== slashId)),
        SLASH_EFFECT_LIFETIME_MS
      );
      const baseDmg = getEquippedDamage(equippedByCategory.weapon_cosmetic, characterConfig.fistDamage);
      const airborne = !grounded.current;
      const dmg = Math.round(
        baseDmg *
          momentumMultiplier(
            sprinting,
            airborne,
            characterConfig.sprintDamageMultiplier,
            characterConfig.airborneDamageMultiplier
          )
      );
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
          // cc.yaw (the weapon's actual facing) — same reasoning as the
          // local capsuleHitTest calls above, so the server-side PvP hit
          // check agrees with what the client just used to pick this
          // target.
          attackerHeading: cc.yaw,
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

    // Sprinting pumps the legs faster (not just moving faster) — used to
    // also kick the FOV out a few degrees as a "you are now sprinting"
    // cue, removed entirely: any FOV change *is* a zoom, and a player who
    // taps sprint on/off in bursts (completely normal play) would see that
    // zoom pulse in and out right along with it. FOV now never changes
    // from whatever world-shell.tsx's `<Canvas camera={{ fov: ... }}>`
    // sets it to once, at mount. (The other, bigger contributor to the
    // same complaint — camera position *lag*, worse at sprint speed than
    // walking speed since it scales with velocity — is fixed at the
    // camera block below: `camera.position.copy`, no lerp at all anymore.)
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
        // Off-hand counter-motion during a swing — pulls back and across
        // the body for visual counter-balance, the same "the whole upper
        // body reacts to a swing, not just the one arm that's swinging"
        // read a real strike has. Additive on top of the walk/fall pose
        // (both are exactly 0 while grounded and not attacking, so this
        // never does anything outside an actual swing).
        l.armL.current.rotation.x = THREE.MathUtils.lerp(-swing, armRaiseX, jp) + attackSwing * 0.5;
        l.armL.current.rotation.z =
          -armSpread - Math.sin(fallWobble.current * 1.3 + 1) * wobble - attackSwing * 0.25;
      }
      if (l.armR.current) {
        // The right arm is also the attack arm — its walk/fall blend is
        // overridden by the swing whenever one is in progress (attackSwing
        // > 0). A forward-and-slightly-up jab with a modest diagonal
        // cross-body component (rotation.z) — reads the same whether the
        // weapon slot holds a real weapon or nothing (bare fist). hit-
        // fx.tsx's SlashEffect sweeps the same beat just in front of the
        // hand for the visible trail.
        //
        // rotation.x deliberately stops at -1.9 (not the -2.5 a previous
        // version used): the shoulder-pivoted arm's swept direction at
        // angle θ works out to roughly (0, -cos θ, sin... see the actual
        // trig) — past about -2.1 the fist's *vertical* component starts
        // exceeding its forward component, swinging the hand up toward
        // (and visually through) head height instead of out in front of
        // the body. -1.9 keeps the swing a clean forward jab that never
        // rises above the shoulder. No rotation.y at all anymore either —
        // a twist on top of an already-raised arm was what actually swept
        // the fist sideways across the face, the real cause of the
        // "swings through the head every time" report.
        const baseX = THREE.MathUtils.lerp(swing, armRaiseX, jp);
        l.armR.current.rotation.x = THREE.MathUtils.lerp(baseX, -1.9, attackSwing);
        l.armR.current.rotation.z =
          armSpread + Math.sin(fallWobble.current * 1.3 + 1 + Math.PI) * wobble - attackSwing * 0.45;
      }
    }

    // No foot-bob at all — a previous version added a small ±0.04 vertical
    // oscillation to the character (originally to `g.position.y`, the
    // exact value the camera tracks every frame, then later moved to an
    // isolated cosmetic-only wrapper once that turned out to bob the
    // *camera* itself in sync with every step). Even fully isolated from
    // the camera, it still read as a persistent "the character keeps
    // jittering up and down while walking" complaint. Zero vertical
    // motion tied to the walk cycle is the only way to guarantee that
    // complaint can never recur: `g.position.y` is exactly `baseY` — real
    // jump/gravity physics only, nothing else ever touches it.
    g.position.y = baseY.current;

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
    // Camera distance is just `cc.distance` directly — the player's own
    // scroll-wheel choice, nothing else. A previous version of this block
    // ran a per-frame raycast against the world (looking for trees/
    // crystals to pull the camera in front of, environment.tsx's
    // `userData.collidable`) and smoothly eased the distance toward
    // whatever that raycast returned. The intent was reasonable — never
    // let the camera clip through a trunk — but environment.tsx scatters
    // 70 trees across nearly the *entire* playable radius (11 to
    // WORLD_RADIUS-6), so on most of the map, in normal play, the ray
    // grazes a tree silhouette constantly as the player turns or moves,
    // genuinely changing the raw obstruction distance frame to frame —
    // not noise to be smoothed away, a real (if usually tiny) value that
    // kept changing. Any amount of *easing* toward a continuously
    // shifting target reads as exactly the "camera keeps zooming in and
    // out while walking" complaint, no matter how the easing itself was
    // tuned (multiple rounds of adjusting the rates/deadzone here never
    // fixed it, because the input itself never stopped moving). Removing
    // the dynamic distance outright is what actually guarantees zero
    // per-frame distance jitter, at the cost of the camera occasionally
    // clipping slightly into a tree trunk when walking very close to
    // one — a far smaller, rarer, and less jarring artifact than
    // continuous zoom breathing across most of the map.
    const smoothedDistance = cc.distance;
    cameraTarget.current.set(
      g.position.x + dirX * smoothedDistance,
      g.position.y + dirY * smoothedDistance,
      g.position.z + dirZ * smoothedDistance
    );
    // Hard floor on the camera's actual world Y position — PITCH_MIN alone
    // (a fixed *angle*) doesn't prevent this: at a low pitch and scrolled
    // far out (DISTANCE_MAX, 14 units), `dirY * smoothedDistance` alone can
    // push the camera several units *below* the ground plane (scene.tsx's
    // ground is a single flat, single-sided circle at y≈0 — viewed from
    // underneath it's simply not rendered at all). That's the exact "pull
    // the mouse down far enough and the ground vanishes, everything floats"
    // bug: the camera ends up underground looking up at the backside of a
    // mesh that was never meant to be seen from below. Clamping the final
    // *position* (not the angle) is what actually guarantees this can never
    // happen, regardless of pitch, distance, or any future free-look
    // offset stacking on top of either one.
    cameraTarget.current.y = Math.max(cameraTarget.current.y, MIN_CAMERA_WORLD_Y);
    // Copied directly, not lerped — any lag here is proportional to the
    // player's own velocity (a first-order lag system's steady-state error
    // is velocity/rate), which is exactly why this read as "fine while
    // walking, wobbles/zooms as soon as I sprint": sprinting is 1.8×
    // faster, so whatever lag distance was barely perceptible at walking
    // speed became clearly visible at sprint speed, even after the rate
    // was already tightened once. `g.position` itself is already smooth
    // (ACCEL_RATE eases velocity, then position integrates that every
    // frame), so `cameraTarget` — a rigid offset of it — is exactly as
    // smooth without needing its own independent lag on top. Zero position
    // lag at any speed, full stop.
    camera.position.copy(cameraTarget.current);
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
    <>
      <group ref={group} position={[0, 0, 0]}>
        {/* Death-fall/despawn pose lives on this wrapper only — rotates
            forward (pivoting at the feet, since CharacterModel's own local
            origin already sits at ground level) and shrinks away, see the
            useFrame block above. Never touches `group` itself, so the
            camera/broadcastTransform/combatRef.playerPos keep reading the
            real last-alive position+heading underneath this the whole
            time. */}
        <group ref={deathPose}>
          <CharacterModel
            ref={limbs}
            equippedByCategory={equippedByCategory}
            gender={gender}
            name={name}
            shieldStateRef={combatRef}
            monsterRegistryRef={monsterRegistryRef}
            petTypes={petTypes}
          />
        </group>
        {/* Melee-range indicator — a flat ring on the ground centered on the
            player, see the doc comment above for why this replaced a
            screen-space crosshair. */}
        <mesh ref={rangeRing} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[characterConfig.attackRange - 0.07, characterConfig.attackRange, 48]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.16} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* Slash VFX — deliberately a *sibling* of the group above, not a
          child of it: `position`/`rotationY` on each entry are already
          plain world-space values computed from `viewYaw` at the moment
          of the swing (see that computation's doc comment), so rendering
          this inside the body-rotating group would double-transform it.
          This is what actually keeps it in front of the camera's current
          view during free-look instead of in front of wherever the body
          still faces. */}
      {slashEffects.map((s) => (
        <group key={s.id} position={s.position} rotation={[0, s.rotationY, 0]}>
          <SlashEffect color={s.color} />
        </group>
      ))}
    </>
  );
}
