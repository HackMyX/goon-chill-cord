"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Billboard, Text } from "@react-three/drei";
import type { MonsterTypeConfig } from "@/lib/monsters";
import type { CombatSharedState, MonsterHandle, MonsterRegistry } from "@/components/world/combat-types";
import { BloodBurst, BLOOD_BURST_LIFETIME_MS } from "@/components/world/hit-fx";
import { applyIncomingDamage, ATTACK_HIT_RADIUS } from "@/lib/combat";
import { WORLD_RADIUS } from "@/lib/world-config";

/** One thrown-projectile request — fired upward via `onThrow` (Monster
 * itself never renders its own throws, see that callback's doc comment in
 * useFrame below for why). `origin`/`target` are plain world-space tuples,
 * not THREE.Vector3, so this can cross the props boundary as plain data. */
export interface ThrowRequest {
  origin: [number, number, number];
  target: [number, number, number];
  damage: number;
  color: string;
}

interface MonsterProps {
  id: string;
  type: MonsterTypeConfig;
  initialPosition: [number, number, number];
  combatRef: React.RefObject<CombatSharedState>;
  registryRef: MonsterRegistry;
  onDied: (typeId: string) => void;
  onThrow: (request: ThrowRequest) => void;
}

let popupSeq = 0;
let bloodBurstSeq = 0;
const DEATH_SINK_DURATION = 1.1;
/** How far past full-health-bar-fade the death sink animation has to run
 * before MonstersField actually unmounts this component — long enough for
 * the sink+fade below to finish, not so long the corpse blocks a new
 * spawn for no reason. */
export const MONSTER_DEATH_CLEANUP_MS = 1300;

function FloatingDamageNumber({ amount }: { amount: number }) {
  const ref = useRef<THREE.Group>(null);
  const age = useRef(0);
  useFrame((_, delta) => {
    age.current += delta;
    const g = ref.current;
    if (!g) return;
    g.position.y = 0.4 + age.current * 0.9;
    const mat = (g.children[0] as unknown as { material?: THREE.Material & { opacity: number } })?.material;
    if (mat) mat.opacity = Math.max(0, 1 - age.current / 0.7);
  });
  return (
    <Billboard ref={ref} position={[0, 0.4, 0]}>
      <Text fontSize={0.32} color="#fca5a5" outlineWidth={0.02} outlineColor="#3f0a0a">
        -{amount}
      </Text>
    </Billboard>
  );
}

/** Idle (no target in aggro range) drift speed, as a fraction of the
 * variant's own chase `moveSpeed` — slow enough to read as "ambient
 * patrol", never mistaken for an active chase, but real movement, not a
 * statue. This is the fix for "I can just stand near spawn and nothing
 * ever happens" — every monster keeps slowly circulating even with no
 * target at all, so eventually one wanders within aggro range of any
 * given spot instead of waiting forever for the player to walk to it. */
const WANDER_SPEED_FRACTION = 0.32;
const WANDER_MIN_INTERVAL_SEC = 3;
const WANDER_MAX_INTERVAL_SEC = 7;

/** World units/sec — deliberately faster than every lib/monsters.ts
 * variant's own `moveSpeed` (max 6.4) so a thrown projectile can't just be
 * outwalked at the exact same pace it travels, but still slow enough to
 * visibly track and dodge by actually moving, not a hitscan snipe. */
export const PROJECTILE_SPEED = 11;
const PROJECTILE_HIT_RADIUS = 0.9;

/** Per-visualKind held weapon prop, attached to `armR` only when
 * `type.hasWeapon` — purely cosmetic, the actual damage number always
 * comes from `type.attackDamage`/`throwDamage` regardless of what's
 * rendered in-hand. Reuses the same "minimal extra geometry, not a whole
 * new asset" approach as the tusks/horns in the render branch below. */
function MonsterWeapon({ kind, color }: { kind: "skeleton" | "demon" | "club"; color: string }) {
  if (kind === "skeleton") {
    return (
      <group position={[0, -0.78, 0.1]}>
        <mesh castShadow>
          <boxGeometry args={[0.05, 0.5, 0.05]} />
          <meshStandardMaterial color="#e8e4d8" />
        </mesh>
        <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.05, 0.2, 0.05]} />
          <meshStandardMaterial color="#9c958a" />
        </mesh>
      </group>
    );
  }
  if (kind === "demon") {
    return (
      <group position={[0, -0.88, 0.1]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.65, 6]} />
          <meshStandardMaterial color="#2a1010" metalness={0.3} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.4, 0]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[0.09, 0.32, 4]} />
          <meshStandardMaterial color="#7a1020" emissive="#7a1020" emissiveIntensity={0.4} metalness={0.4} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[0, -0.78, 0.08]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.04, 0.1, 0.55, 8]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** One-shot thrown projectile (rock/bone/fireball/spectral bolt depending
 * on the thrower's visualKind) — straight-line travel from `origin` to
 * `target` (the player's position *at throw time*, never updated again, so
 * it's genuinely dodgeable by moving, not a homing/unfair hit) with a
 * simple parabolic height arc for readability, then a single damage check
 * against wherever the player *actually* is once it arrives. Rendered by
 * MonstersField (not by Monster itself — see Monster's `onThrow` doc
 * comment for why) into a short-lived state list there, same idiom as this
 * file's own popups/blood-bursts, just owned one level up so it lands in
 * real world space instead of inside any one monster's transformed group. */
export function ThrownProjectile({
  origin,
  target,
  damage,
  color,
  combatRef,
}: {
  origin: [number, number, number];
  target: [number, number, number];
  damage: number;
  color: string;
  combatRef: React.RefObject<CombatSharedState>;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const age = useRef(0);
  const applied = useRef(false);
  // Stable for this projectile's entire (short) lifetime — computed once,
  // never per-frame, so this isn't a hot-path allocation concern.
  const originVec = useMemo(() => new THREE.Vector3(...origin), [origin]);
  const targetVec = useMemo(() => new THREE.Vector3(...target), [target]);
  const travelTime = useMemo(
    () => Math.max(0.05, originVec.distanceTo(targetVec) / PROJECTILE_SPEED),
    [originVec, targetVec]
  );

  useFrame((_, delta) => {
    age.current += delta;
    const t = Math.min(1, age.current / travelTime);
    const m = ref.current;
    if (m) {
      m.position.lerpVectors(originVec, targetVec, t);
      m.position.y += Math.sin(t * Math.PI) * 0.6;
      m.rotation.x += delta * 12;
      m.rotation.z += delta * 9;
    }
    if (t >= 1 && !applied.current) {
      applied.current = true;
      // Where the player *actually* is right now, not where they were
      // when this was thrown — landing where someone used to be standing
      // shouldn't still hit them if they've since moved away.
      const playerPos = combatRef.current.playerPos;
      const dx = playerPos.x - targetVec.x;
      const dz = playerPos.z - targetVec.z;
      if (Math.hypot(dx, dz) <= PROJECTILE_HIT_RADIUS) {
        applyIncomingDamage(combatRef.current, damage);
      }
    }
  });

  return (
    <mesh ref={ref} position={origin}>
      <sphereGeometry args={[0.12, 8, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} toneMapped={false} />
    </mesh>
  );
}

/**
 * One spawned enemy — chases + melees the player when in range, shows a
 * floating health bar and damage-number popups, and plays a sink-and-fade
 * death animation before MonstersField unmounts it. AI/visuals are driven
 * entirely by `useFrame` refs (zero React re-renders per frame); the only
 * React state here is the rare, small "which damage numbers are currently
 * floating" list.
 *
 * Registers an imperative MonsterHandle into `registryRef` on mount so
 * Player.tsx's attack scan can find and damage it without any prop
 * drilling back the other way — see components/world/combat-types.ts.
 */
export function Monster({ id, type, initialPosition, combatRef, registryRef, onDied, onThrow }: MonsterProps) {
  const group = useRef<THREE.Group>(null);
  const upperBody = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const healthFill = useRef<THREE.Mesh>(null);
  const healthGroup = useRef<THREE.Group>(null);

  const health = useRef(type.health);
  const alive = useRef(true);
  // Randomized in the mount effect below, not here — `Math.random()` is an
  // impure call and React Compiler flags impure calls made during render;
  // these only ever need *some* unsynchronized starting phase so every
  // spawned monster doesn't attack/sway in lockstep, so "set once after
  // mount" is just as good as "set at construction".
  const attackCooldownLeft = useRef(0);
  const throwCooldownLeft = useRef(0);
  const lunge = useRef(0);
  const walkClock = useRef(0);
  const deathT = useRef(0);
  const hitGlow = useRef(0);
  const torsoMaterial = useRef<THREE.MeshStandardMaterial>(null);
  // Idle-wander state — see WANDER_SPEED_FRACTION's doc comment above.
  const wanderAngle = useRef(0);
  const wanderTimer = useRef(0);
  const [popups, setPopups] = useState<{ id: number; amount: number }[]>([]);
  const [bloodBursts, setBloodBursts] = useState<{ id: number }[]>([]);

  useEffect(() => {
    attackCooldownLeft.current = Math.random() * type.attackCooldown;
    throwCooldownLeft.current = type.throwCooldown ? Math.random() * type.throwCooldown : 0;
    walkClock.current = Math.random() * 10;
    wanderAngle.current = Math.random() * Math.PI * 2;
    wanderTimer.current = WANDER_MIN_INTERVAL_SEC + Math.random() * (WANDER_MAX_INTERVAL_SEC - WANDER_MIN_INTERVAL_SEC);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only randomized once on mount
  }, []);

  useEffect(() => {
    const handle: MonsterHandle = {
      id,
      typeId: type.id,
      getPosition: () => group.current?.position ?? new THREE.Vector3(...initialPosition),
      isAlive: () => alive.current,
      hitRadius: ATTACK_HIT_RADIUS * type.scale,
      takeDamage: (amount) => {
        if (!alive.current) return 0;
        health.current = Math.max(0, health.current - amount);
        hitGlow.current = 1;
        const popupId = ++popupSeq;
        setPopups((curr) => [...curr, { id: popupId, amount }]);
        setTimeout(() => setPopups((curr) => curr.filter((p) => p.id !== popupId)), 700);
        const burstId = ++bloodBurstSeq;
        setBloodBursts((curr) => [...curr, { id: burstId }]);
        setTimeout(
          () => setBloodBursts((curr) => curr.filter((b) => b.id !== burstId)),
          BLOOD_BURST_LIFETIME_MS
        );
        if (health.current <= 0) {
          alive.current = false;
          onDied(type.id);
        }
        return amount;
      },
    };
    // Both the push below and the filter in this cleanup read/write
    // `registryRef.current` *directly*, never through a local variable
    // captured once at mount — capturing it (the previous version of this
    // effect did: `const registry = registryRef.current; registry.push(...)`,
    // then the cleanup filtered that same captured `registry`) is a real
    // race: with up to MAX_ALIVE_MONSTERS monsters spawning/dying within
    // seconds of each other, by the time *this* monster's cleanup finally
    // ran, some other monster's mount/unmount had very likely already
    // reassigned `registryRef.current` to a *different* array object in
    // between. Filtering the stale captured snapshot and writing the
    // result back then silently overwrote `.current` with a version of
    // the registry that never saw whatever joined after this monster
    // mounted — permanently dropping a perfectly alive, in-range monster
    // out of the array Player.tsx's attack scan iterates, with no error,
    // no warning, nothing to see except "this one mob just never gets
    // hit" until the page reloads. This is the actual "random mobs
    // sometimes just aren't hittable" bug — every previous aim/cone/radius
    // fix was real and necessary, but none of them mattered for a monster
    // that silently isn't in the array being scanned at all. Always
    // touching `registryRef.current` live, on both ends, means every
    // push/filter operates on whatever the array actually is *right now*,
    // never a snapshot that can go stale.
    registryRef.current.push(handle);
    return () => {
      registryRef.current = registryRef.current.filter((h) => h !== handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handle captures stable refs only, never needs to re-register
  }, []);

  // Per-visualKind tweaks on top of the shared humanoid rig — every variant
  // except "slime" (a wholly different blob body, see the render branch
  // below) reuses the exact same torso/head/arm/leg groups the original
  // zombie/skeleton pair did, just with different proportions/colors/extra
  // meshes (tusks, horns, wings) layered on, so the movement/attack/health-
  // bar logic in useFrame below never has to know or care which kind it's
  // animating.
  const isSlime = type.visualKind === "slime";
  const isGhost = type.visualKind === "ghost";
  const isOrc = type.visualKind === "orc";
  const isDemon = type.visualKind === "demon";
  const limbWidth =
    type.visualKind === "skeleton" ? 0.16 : isOrc ? 0.3 : isDemon ? 0.27 : 0.22;
  const slouch = type.visualKind === "zombie" ? 0.22 : isOrc ? 0.12 : 0;
  const eyeColor =
    type.visualKind === "skeleton"
      ? "#7dd3fc"
      : isGhost
        ? "#e0f2fe"
        : isDemon
          ? "#ff2424"
          : isOrc
            ? "#fbbf24"
            : isSlime
              ? "#dcfce7"
              : "#fca5a5";
  // Ghosts are translucent apparitions, not solid bodies — every body mesh
  // in the shared humanoid branch below gets this opacity instead of 1.
  const bodyOpacity = isGhost ? 0.5 : 1;
  // Thrown-projectile color per visualKind — bone for skeletons, a dull
  // rock tone for orcs, a glowing fireball for the demon, a pale spectral
  // bolt for the ghost (matches its own eye/robe color).
  const throwColor = isGhost
    ? "#b9d6ff"
    : isDemon
      ? "#ff6b35"
      : isOrc
        ? "#8a8a6b"
        : type.visualKind === "skeleton"
          ? "#e8e4d8"
          : "#ffffff";

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;

    if (!alive.current) {
      deathT.current += delta;
      g.position.y = initialPosition[1] - Math.min(0.9, deathT.current * 0.9);
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, Math.PI / 2.2, Math.min(1, deathT.current * 2));
      g.scale.setScalar(Math.max(0.05, 1 - deathT.current / (DEATH_SINK_DURATION * 1.4)));
      if (healthGroup.current) healthGroup.current.visible = false;
      return;
    }

    // The *player's* death, not this monster's own — freeze AI completely
    // the instant the player dies (no chase, no attack, no idle wander)
    // rather than continuing to swing at a corpse until the death screen's
    // Respawn button resets everything. MonstersField additionally clears
    // every spawn outright while this is true (see its own doc comment)
    // — this check is the belt-and-suspenders half: that clear happens
    // through React state and only takes effect next render, so this
    // guards the handful of frames in between from landing one more
    // pointless hit.
    if (combatRef.current.dead) return;

    const playerPos = combatRef.current.playerPos;
    const dx = playerPos.x - g.position.x;
    const dz = playerPos.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    // `hasTarget` (the player anywhere within aggro range at all) is
    // broader than `moving` (still actively closing the distance) — a
    // monster that's already point-blank also has `hasTarget` true but
    // `moving` false (it stops closing in to melee instead), which is
    // exactly when wandering below must *not* kick in despite not moving.
    const hasTarget = dist < type.aggroRange;
    const moving = hasTarget && dist > type.attackRange * 0.7;

    if (moving) {
      const dirX = dx / dist;
      const dirZ = dz / dist;
      g.position.x += dirX * type.moveSpeed * delta;
      g.position.z += dirZ * type.moveSpeed * delta;
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, Math.atan2(dirX, dirZ), Math.min(1, delta * 6));
    } else if (!hasTarget) {
      // Idle wander — see WANDER_SPEED_FRACTION's doc comment for why this
      // exists at all: without it, a monster with nobody in its aggro
      // range just stood completely still forever, meaning a player who
      // simply never approached one could stand around indefinitely with
      // zero risk. Slowly drifts in `wanderAngle`, picking a fresh one
      // every few seconds, and turns back toward the world center if it
      // ever nears the edge instead of piling up against the border.
      wanderTimer.current -= delta;
      if (wanderTimer.current <= 0) {
        wanderTimer.current =
          WANDER_MIN_INTERVAL_SEC + Math.random() * (WANDER_MAX_INTERVAL_SEC - WANDER_MIN_INTERVAL_SEC);
        wanderAngle.current = Math.random() * Math.PI * 2;
      }
      const distFromCenter = Math.hypot(g.position.x, g.position.z);
      if (distFromCenter > WORLD_RADIUS - 4) {
        wanderAngle.current = Math.atan2(-g.position.x, -g.position.z);
      }
      const wx = Math.sin(wanderAngle.current);
      const wz = Math.cos(wanderAngle.current);
      const wanderSpeed = type.moveSpeed * WANDER_SPEED_FRACTION;
      g.position.x += wx * wanderSpeed * delta;
      g.position.z += wz * wanderSpeed * delta;
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, Math.atan2(wx, wz), Math.min(1, delta * 2));
    }

    attackCooldownLeft.current -= delta;
    if (dist < type.attackRange && attackCooldownLeft.current <= 0) {
      attackCooldownLeft.current = type.attackCooldown;
      lunge.current = 1;
      // applyIncomingDamage itself no-ops while invulnerable, and also
      // handles armor reduction + shield absorption — see lib/combat.ts.
      applyIncomingDamage(combatRef.current, type.attackDamage);
    }

    // Ranged throw — only for variants with `canThrow` (lib/monsters.ts),
    // and only while the player is *between* melee reach and throwRange:
    // too close and melee already handles it (attackCooldown above), too
    // far and this variant hasn't even noticed them (`hasTarget` false).
    // Without this, a player camping just outside `attackRange` forever
    // was completely safe from anything that can't also reach them in
    // melee — exactly the "stand around and nothing happens" complaint,
    // just at melee range instead of aggro range.
    //
    // The actual projectile is owned by MonstersField, not rendered here —
    // this group is positioned+scaled (`initialPosition`/`type.scale` on
    // the root `<group>` below), so a child mesh given a *world-space*
    // position (which `origin`/`target` are, read straight from
    // `g.position`/`playerPos`) would get doubly transformed by this
    // group's own offset and scale. `onThrow` just notifies upward; the
    // sibling-level field (no transform of its own) renders it in real
    // world space.
    if (hasTarget && type.canThrow && type.throwDamage && type.throwCooldown && type.throwRange) {
      throwCooldownLeft.current -= delta;
      if (dist > type.attackRange && dist < type.throwRange && throwCooldownLeft.current <= 0) {
        throwCooldownLeft.current = type.throwCooldown;
        onThrow({
          origin: [g.position.x, g.position.y + 1.1, g.position.z],
          target: [playerPos.x, playerPos.y + 1, playerPos.z],
          damage: type.throwDamage,
          color: throwColor,
        });
      }
    }

    lunge.current = Math.max(0, lunge.current - delta * 3.5);
    hitGlow.current = Math.max(0, hitGlow.current - delta * 4);
    // Hit-flash: a quick white-hot emissive pulse on the torso material,
    // decaying with hitGlow over ~0.25s — this ref/value pair already
    // existed (set to 1 on takeDamage, decayed every frame) but was never
    // actually applied to anything, so a landed hit had no visual
    // confirmation beyond the floating damage number and health bar.
    if (torsoMaterial.current) {
      torsoMaterial.current.emissive.setRGB(1, 0.25, 0.25);
      torsoMaterial.current.emissiveIntensity = hitGlow.current * 1.4;
    }

    walkClock.current += delta * (moving ? 6.5 : 1.2);
    const swing = moving ? Math.sin(walkClock.current) * 0.45 : Math.sin(walkClock.current) * 0.06;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.8 - lunge.current * 0.5;
    if (armR.current) armR.current.rotation.x = swing * 0.8 - lunge.current * 1.7;
    if (upperBody.current) upperBody.current.rotation.x = slouch + lunge.current * 0.25;

    // Cosmetic vertical bob — ghosts hover in place, slimes hop while
    // closing distance. Purely visual: every chase/range/hit calculation
    // above only ever reads `g.position.x/z`, never `.y`, so this can't
    // affect anything but how the monster looks.
    if (isGhost) {
      g.position.y = initialPosition[1] + 0.3 + Math.sin(walkClock.current * 0.9) * 0.15;
    } else if (isSlime) {
      g.position.y = initialPosition[1] + (moving ? Math.max(0, Math.sin(walkClock.current * 3)) * 0.22 : 0);
    }

    if (healthFill.current) {
      const frac = Math.max(0, health.current / type.health);
      healthFill.current.scale.x = Math.max(0.001, frac);
      healthFill.current.position.x = -(1 - frac) * 0.5;
      const mat = healthFill.current.material as THREE.MeshBasicMaterial;
      mat.color.set(frac > 0.5 ? "#4ade80" : frac > 0.2 ? "#facc15" : "#f87171");
    }
  });

  return (
    <group ref={group} position={initialPosition} scale={type.scale}>
      {isSlime ? (
        // Slime: a single squashable blob, no torso/limb rig at all —
        // legL/legR/armL/armR simply never get a ref attached, which the
        // useFrame animation above already guards against (`if (x.current)`),
        // so it's a no-op there rather than a special case. `upperBody`
        // doubles as the blob's own group so the existing lunge-tilt
        // ("leans toward the player when it attacks") and hit-flash
        // (`torsoMaterial`) logic keep working unmodified.
        <group ref={upperBody} position={[0, 0.42, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.42, 16, 12]} />
            <meshStandardMaterial
              ref={torsoMaterial}
              color={type.colorHex}
              transparent
              opacity={0.82}
              roughness={0.2}
              emissive={type.colorHex}
              emissiveIntensity={0.15}
            />
          </mesh>
          <mesh position={[-0.13, 0.08, 0.32]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
          <mesh position={[0.13, 0.08, 0.32]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        </group>
      ) : (
        <>
          <group ref={upperBody} position={[0, 1.1, 0]}>
            <mesh position={[0, 0.4, 0]} castShadow>
              <boxGeometry args={[0.5, 0.7, 0.3]} />
              <meshStandardMaterial ref={torsoMaterial} color={type.colorHex} transparent={isGhost} opacity={bodyOpacity} />
            </mesh>
            <mesh position={[0, 0.95, 0]} castShadow>
              <boxGeometry args={[0.34, 0.34, 0.34]} />
              <meshStandardMaterial color={type.colorHex} transparent={isGhost} opacity={bodyOpacity} />
            </mesh>
            <mesh position={[-0.07, 0.97, 0.18]}>
              <sphereGeometry args={[0.035, 8, 8]} />
              <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} toneMapped={false} />
            </mesh>
            <mesh position={[0.07, 0.97, 0.18]}>
              <sphereGeometry args={[0.035, 8, 8]} />
              <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} toneMapped={false} />
            </mesh>

            {/* Ork: a pair of tusks jutting up from the lower jaw — the one
                detail that reads as "orc" rather than just "bigger zombie"
                at a glance. */}
            {isOrc && (
              <>
                <mesh position={[-0.08, 0.86, 0.19]} rotation={[0.35, 0, 0]} castShadow>
                  <coneGeometry args={[0.03, 0.14, 6]} />
                  <meshStandardMaterial color="#f5f5f4" />
                </mesh>
                <mesh position={[0.08, 0.86, 0.19]} rotation={[0.35, 0, 0]} castShadow>
                  <coneGeometry args={[0.03, 0.14, 6]} />
                  <meshStandardMaterial color="#f5f5f4" />
                </mesh>
              </>
            )}

            {/* Dämonenfürst: curved horns + a pair of translucent
                membrane wings on the back — the boss-tier silhouette that
                should be unmistakable from every other variant even at a
                distance, before its health bar/name are even legible. */}
            {isDemon && (
              <>
                <mesh position={[-0.1, 1.14, 0.06]} rotation={[0.25, 0, -0.35]} castShadow>
                  <coneGeometry args={[0.045, 0.24, 6]} />
                  <meshStandardMaterial color="#15100f" />
                </mesh>
                <mesh position={[0.1, 1.14, 0.06]} rotation={[0.25, 0, 0.35]} castShadow>
                  <coneGeometry args={[0.045, 0.24, 6]} />
                  <meshStandardMaterial color="#15100f" />
                </mesh>
                <mesh position={[-0.4, 0.42, -0.12]} rotation={[0, 0.35, 0.55]}>
                  <boxGeometry args={[0.55, 0.5, 0.025]} />
                  <meshStandardMaterial
                    color="#3f0a0a"
                    emissive="#7a1020"
                    emissiveIntensity={0.45}
                    transparent
                    opacity={0.82}
                    side={THREE.DoubleSide}
                  />
                </mesh>
                <mesh position={[0.4, 0.42, -0.12]} rotation={[0, -0.35, -0.55]}>
                  <boxGeometry args={[0.55, 0.5, 0.025]} />
                  <meshStandardMaterial
                    color="#3f0a0a"
                    emissive="#7a1020"
                    emissiveIntensity={0.45}
                    transparent
                    opacity={0.82}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              </>
            )}

            <group ref={armL} position={[-0.32, 0.65, 0]}>
              <mesh position={[0, -0.32, 0]} castShadow>
                <boxGeometry args={[limbWidth, 0.62, limbWidth]} />
                <meshStandardMaterial color={type.colorHex} transparent={isGhost} opacity={bodyOpacity} />
              </mesh>
            </group>
            <group ref={armR} position={[0.32, 0.65, 0]}>
              <mesh position={[0, -0.32, 0]} castShadow>
                <boxGeometry args={[limbWidth, 0.62, limbWidth]} />
                <meshStandardMaterial color={type.colorHex} transparent={isGhost} opacity={bodyOpacity} />
              </mesh>
              {type.hasWeapon && (
                <MonsterWeapon
                  kind={isDemon ? "demon" : type.visualKind === "skeleton" ? "skeleton" : "club"}
                  color={isOrc ? "#3f4a26" : "#4a3a28"}
                />
              )}
            </group>
          </group>

          {isGhost ? (
            // Geist: a tapering, faintly-glowing robe instead of legs — it
            // hovers (the useFrame bob above), it never needs a walk-cycle
            // leg-swing to read as "moving", so there's nothing to pivot
            // legL/legR for in the first place.
            <mesh position={[0, 0.5, 0]}>
              <coneGeometry args={[0.4, 1.05, 14]} />
              <meshStandardMaterial
                color={type.colorHex}
                transparent
                opacity={0.38}
                emissive={type.colorHex}
                emissiveIntensity={0.25}
                side={THREE.DoubleSide}
              />
            </mesh>
          ) : (
            <>
              <group ref={legL} position={[-0.15, 0.85, 0]}>
                <mesh position={[0, -0.42, 0]} castShadow>
                  <boxGeometry args={[limbWidth + 0.02, 0.85, limbWidth + 0.02]} />
                  <meshStandardMaterial color={type.colorHex} />
                </mesh>
              </group>
              <group ref={legR} position={[0.15, 0.85, 0]}>
                <mesh position={[0, -0.42, 0]} castShadow>
                  <boxGeometry args={[limbWidth + 0.02, 0.85, limbWidth + 0.02]} />
                  <meshStandardMaterial color={type.colorHex} />
                </mesh>
              </group>
            </>
          )}
        </>
      )}

      <Billboard ref={healthGroup} position={[0, isSlime ? 1.15 : 2.35, 0]}>
        <mesh>
          <planeGeometry args={[1, 0.12]} />
          <meshBasicMaterial color="#1a1a1a" transparent opacity={0.85} />
        </mesh>
        <mesh ref={healthFill} position={[0, 0, 0.001]}>
          <planeGeometry args={[1, 0.1]} />
          <meshBasicMaterial color="#4ade80" toneMapped={false} />
        </mesh>
        <Text position={[0, 0.22, 0]} fontSize={0.16} color="#e5e7eb" outlineWidth={0.015} outlineColor="#000">
          {type.name}
        </Text>
      </Billboard>

      {popups.map((p) => (
        <FloatingDamageNumber key={p.id} amount={p.amount} />
      ))}

      {bloodBursts.map((b) => (
        <group key={b.id} position={[0, isSlime ? 0.45 : 1.1, 0]}>
          <BloodBurst />
        </group>
      ))}
    </group>
  );
}
