"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import { type EquippedItem } from "@/lib/rarity-colors";
import { debugWarn } from "@/lib/debug";
import { getPetSpeciesId, DEFAULT_PET_TYPES, resolvePetStatsForRarity, type PetTypeConfig } from "@/lib/pets";
import type { MonsterRegistry } from "@/components/world/combat-types";
import {
  PetVariant,
  HatVariant,
  FaceVariant,
  WeaponVariant,
  JacketVariant,
  PantsVariant,
  PantsHipSection,
  ShoeVariant,
  ShieldVariant,
  ShieldAura,
  HairVariant,
  AuraVariant,
  TrailVariant,
  ChestShape,
  RingVariant,
  AmuletVariant,
  BareFoot,
  DefaultFace,
  isFlyingPet,
} from "@/components/world/item-variants";

export interface CharacterModelProps {
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  /** Floating nametag above the head — omitted in the Garderobe preview. */
  name?: string;
  /** Player.tsx's own `combatRef`, passed through so the shield aura
   * (below) can fade with actual remaining shield HP instead of always
   * looking full-strength — omitted for remote avatars/previews, which
   * have no live shield state to follow (ShieldAura falls back to a
   * constant full-strength look in that case). */
  shieldStateRef?: React.RefObject<{ shieldHpRemaining: number; shieldMaxHp: number }>;
  /** Lets an equipped pet actually fight — omitted for remote
   * avatars/Garderobe previews, which fall back to purely cosmetic
   * wandering (PetCompanion below treats a missing registry as "no
   * monsters to ever find", not an error). */
  monsterRegistryRef?: MonsterRegistry;
  /** Admin-configured per-species stats (lib/pets.ts) — defaults to the
   * code fallbacks when omitted (Garderobe preview, remote avatars), same
   * "code defaults, DB overrides" shape as lib/monsters.ts elsewhere. */
  petTypes?: PetTypeConfig[];
}

export interface CharacterLimbRefs {
  legL: React.RefObject<THREE.Group | null>;
  legR: React.RefObject<THREE.Group | null>;
  armL: React.RefObject<THREE.Group | null>;
  armR: React.RefObject<THREE.Group | null>;
}

const SKIN = "#caa472";

// Joint pivots, in character-local space. Each limb is a <group> positioned
// at its joint (hip / shoulder) with the limb mesh — and anything rigidly
// attached to it, like a shoe or a held weapon — as a *child* offset below
// it. Rotating the group therefore swings the whole assembly together, the
// way a real leg pivots from the hip rather than from its own center.
const HIP_Y = 1.0;
const SHOULDER_Y = 1.725;

// Gender silhouette: broader/boxier for "m", narrower-shouldered and
// slimmer-waisted for "w". Only width-ish proportions differ — head/torso
// *height* stays identical so the hat/hair/head joints above don't need to
// shift too.
const BUILD = {
  m: { armX: 0.48, legX: 0.18, torsoWidth: 0.7, torsoDepth: 0.4 },
  w: { armX: 0.4, legX: 0.14, torsoWidth: 0.56, torsoDepth: 0.34 },
} as const;

/**
 * Single source of truth for "what does the equipped character look like in
 * 3D" — shared by the World (components/world/player.tsx, adds movement)
 * and the Garderobe's character preview (components/wardrobe/character-
 * preview-3d.tsx, adds slow auto-rotate). Equipping an item in the Garderobe
 * changes exactly the same meshes/colors you then see walking around in
 * the World, because both consume this component with the same data.
 *
 * Every equippable slot renders through components/world/item-variants.tsx,
 * which picks one of several genuinely different shapes per slot based on
 * a hash of the item's *name* — so two different jackets (or pets, hats,
 * auras...) actually look different from each other, not just differently
 * tinted copies of the same box.
 *
 * The leg/arm joint groups forward refs (`CharacterLimbRefs`) so a parent
 * like `Player` can drive the walk-cycle by mutating `.rotation.x` directly
 * in `useFrame` — imperative, zero React re-renders per frame.
 */
export const CharacterModel = forwardRef<CharacterLimbRefs, CharacterModelProps>(
  function CharacterModel(
    { equippedByCategory, gender, name, shieldStateRef, monsterRegistryRef, petTypes },
    ref
  ) {
    const hat = equippedByCategory.hat;
    const hair = equippedByCategory.hair;
    const jacket = equippedByCategory.jacket;
    const pants = equippedByCategory.pants;
    const shoes = equippedByCategory.shoes;
    const aura = equippedByCategory.aura;
    const face = equippedByCategory.face;
    const weapon = equippedByCategory.weapon_cosmetic;
    const shield = equippedByCategory.shield_cosmetic;
    const trail = equippedByCategory.trail;
    const pet = equippedByCategory.pet;
    const ring = equippedByCategory.ring;
    const ring2 = equippedByCategory.ring2;
    const amulet = equippedByCategory.amulet;
    const build = BUILD[gender];

    const legL = useRef<THREE.Group>(null);
    const legR = useRef<THREE.Group>(null);
    const armL = useRef<THREE.Group>(null);
    const armR = useRef<THREE.Group>(null);

    // React's forwardRef only supports one target; expose a small
    // ref-of-refs object instead so a parent can reach each limb joint.
    useImperativeHandle(ref, () => ({ legL, legR, armL, armR }), []);

    // Every dbType this component actually knows how to render — anything
    // equipped outside this set (e.g. a legacy "ring"/"amulet"/"helmet"
    // type from lib/cases.ts ALL_ITEM_TYPES that has no 3D variant yet)
    // silently vanishes instead of erroring, which is correct behavior but
    // invisible when debugging "why isn't my item showing up".
    useEffect(() => {
      const handled = new Set([
        "hat",
        "hair",
        "jacket",
        "pants",
        "shoes",
        "aura",
        "face",
        "weapon_cosmetic",
        "shield_cosmetic",
        "trail",
        "pet",
        "ring",
        "ring2",
        "amulet",
      ]);
      for (const type of Object.keys(equippedByCategory)) {
        if (equippedByCategory[type] && !handled.has(type)) {
          debugWarn(
            "CharacterModel",
            `equipped item type "${type}" has no 3D render path — it will not appear on the character`,
            equippedByCategory[type]
          );
        }
      }
    }, [equippedByCategory]);

    return (
      <group>
        {name && (
          <Billboard position={[0, 2.95, 0]}>
            <Text fontSize={0.26} color="#e9d5ff" outlineWidth={0.02} outlineColor="#1e1033">
              {name}
            </Text>
          </Billboard>
        )}

        {/* shield aura: whole-body bubble + smoke, only for a *functioning*
            shield (shield_hp > 0) — a purely decorative shield_cosmetic
            item still shows the arm-mounted ShieldVariant prop below, just
            without this. */}
        {shield && (shield.shield_hp ?? 0) > 0 && <ShieldAura item={shield} stateRef={shieldStateRef} />}

        {/* aura: one of several dramatically different effects (orbiting
            spheres / rising embers / spinning blades / counter-rotating
            rings), not a single flat ring */}
        {aura && <AuraVariant item={aura} />}

        {/* trail: one of several distinct ground-effect styles */}
        {trail && <TrailVariant item={trail} />}

        {/* left leg: hip-pivoted group, leg + shoe swing together */}
        <group ref={legL} position={[-build.legX, HIP_Y, 0]}>
          {pants ? <PantsVariant item={pants} /> : <SkinnyFallbackLeg />}
          <group position={[0, -1, 0]}>
            {shoes ? <ShoeVariant item={shoes} /> : <BareFoot skin={SKIN} />}
          </group>
        </group>

        {/* right leg */}
        <group ref={legR} position={[build.legX, HIP_Y, 0]}>
          {pants ? <PantsVariant item={pants} /> : <SkinnyFallbackLeg />}
          <group position={[0, -1, 0]}>
            {shoes ? <ShoeVariant item={shoes} /> : <BareFoot skin={SKIN} />}
          </group>
        </group>

        {/* pants hip section — rendered once at HIP_Y, centered between
            both legs, fills the crotch gap and connects the two per-leg
            PantsVariant pieces into one coherent garment. Also adds a
            visible waistband seam where pants meet the torso above. */}
        {pants && (
          <group position={[0, HIP_Y, 0]}>
            <PantsHipSection item={pants} width={build.torsoWidth} depth={build.torsoDepth} />
          </group>
        )}

        {/* torso */}
        {jacket ? (
          <group position={[0, 1.35, 0]}>
            <JacketVariant
              item={jacket}
              width={build.torsoWidth}
              depth={build.torsoDepth}
              gender={gender}
            />
          </group>
        ) : (
          <group position={[0, 1.35, 0]}>
            <mesh>
              <boxGeometry args={[build.torsoWidth, 0.8, build.torsoDepth]} />
              <meshStandardMaterial color="#0e7490" />
            </mesh>
            {gender === "w" && <ChestShape depth={build.torsoDepth} color={SKIN} />}
          </group>
        )}

        {/* amulet — chain sits at collar height (Y=1.78, above torso top
            at 1.75) centered on body axis so it forms a full loop around
            the neck; the pendant Z-offset lives inside each AmuletVariant
            so it hangs off the FRONT of the chain, not inside the torso */}
        {amulet && (
          <group position={[0, 1.78, 0]}>
            <AmuletVariant item={amulet} />
          </group>
        )}

        {/* left arm: shoulder-pivoted group, shield (if any) rides on it;
            ring2 sits at the wrist so it's visible with or without a shield */}
        <group ref={armL} position={[-build.armX, SHOULDER_Y, 0]}>
          <mesh position={[0, -0.375, 0]}>
            <boxGeometry args={[0.22, 0.75, 0.22]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
          {shield && <ShieldVariant item={shield} />}
          {ring2 && (
            <group position={[0, -0.62, 0]}>
              <RingVariant item={ring2} />
            </group>
          )}
        </group>

        {/* right arm: shoulder-pivoted group, weapon (if any) swings with it */}
        <group ref={armR} position={[build.armX, SHOULDER_Y, 0]}>
          <mesh position={[0, -0.375, 0]}>
            <boxGeometry args={[0.22, 0.75, 0.22]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
          {weapon && (
            // The forearm box below is [0.22, 0.75, 0.22], spanning
            // y:[-0.75,0] z:[-0.11,0.11] in this group's local space — the
            // old z=0.08 offset sat *inside* that box, so the blade (which
            // extends straight up from its own local origin) visually grew
            // up through the forearm itself instead of looking like
            // something held in the fist. Pushed to z=0.2 (clear of the
            // 0.11 half-depth) and y=-0.78 (right at the fist, just past
            // the hand tip) so it's gripped in the hand, not fused into the
            // arm.
            //
            // `rotation={[Math.PI/2,0,0]}` is the other half of the fix:
            // every WEAPON_VARIANTS/EXACT_WEAPON_SHAPE shape extends "up"
            // from its grip along *its own* local Y — without this rotation
            // that local-up stayed aligned with world-up, so at rest (arm
            // hanging straight down, armR.rotation.x = 0) the weapon
            // pointed straight up parallel to the now-vertical forearm,
            // i.e. "looked exactly like the arm" instead of like something
            // held in front of the body. Rotating +90° about X remaps
            // local-up to world-forward (+Z, same convention as the chest/
            // trail placement elsewhere in this file), so standing still
            // the weapon juts straight out in front of the character —
            // and still swings naturally with the arm during the walk
            // cycle, since this group is nested inside armR.
            <group position={[0.04, -0.78, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
              <WeaponVariant item={weapon} />
            </group>
          )}
          {/* ring — worn on the wrist, just above the weapon grip so it's
              visible whether or not a weapon is equipped */}
          {ring && (
            <group position={[0, -0.62, 0]}>
              <RingVariant item={ring} />
            </group>
          )}
        </group>

        {/* head */}
        <mesh position={[0, 2.05, 0]}>
          <boxGeometry args={[0.55, 0.55, 0.55]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>

        {/* face / mask — variant shape picked deterministically from the
            item name; falls back to a plain default face (eyes/nose/mouth)
            so the head is never a featureless blank cube */}
        <group position={[0, 2.05, 0.29]}>
          {face ? <FaceVariant item={face} /> : <DefaultFace skin={SKIN} />}
        </group>

        {/* hair — gender-adaptive shape (item-variants.tsx HairVariant). Wird
            unter einem Helm AUSGEBLENDET, damit Haare nie durch den Helm clippen
            (Helm bedeckt den Kopf). */}
        {hair && !hat && <HairVariant item={hair} gender={gender} />}

        {/* hat — variant shape picked deterministically from the item name */}
        {hat && (
          <group position={[0, 2.42, 0]}>
            <HatVariant item={hat} />
          </group>
        )}

        {/* pet companion — independent, doesn't ride the body. Equip a
            "dog"-named pet and a different-named pet and they'll actually
            look like different animals, not just a differently-tinted
            sphere, and now it actually wanders/orbits around its owner
            instead of sitting frozen in one spot. */}
        {pet && (
          <PetCompanion item={pet} monsterRegistryRef={monsterRegistryRef} petTypes={petTypes} />
        )}
      </group>
    );
  }
);

const PET_GROUND_RADIUS = [0.55, 2.1] as const;
const PET_FLY_RADIUS = [0.7, 2.6] as const;
const PET_FLY_HEIGHT = [0.75, 2.1] as const;
const PET_GROUND_SPEED = 1.1;
const PET_FLY_SPEED = 1.6;
/** How long a pet commits to one destination before picking a new one —
 * randomized per-decision (not a fixed interval) so a whole pack of pets
 * never re-decides on the same beat. */
const DECISION_INTERVAL = [1.6, 4] as const;
const GROUND_PAUSE_CHANCE = 0.35;
const JUMP_CHANCE = 0.4;

function randRange(rng: () => number, [min, max]: readonly [number, number]) {
  return min + rng() * (max - min);
}

/** Tiny seeded PRNG (mulberry32, same algorithm as environment.tsx's
 * scenery scatter) so each pet's wander pattern is deterministic-but-
 * varied per equip rather than reseeding `Math.random()` mid-render
 * (impure, flagged by React Compiler — see lib/monsters.ts/monster.tsx
 * for the same constraint) or drifting differently on every remount. */
function makeRng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How close (world units) a pet needs to be to its target monster before
 * it stops closing the distance and starts actually attacking. */
const PET_ATTACK_RANGE = 1.0;

/** Fixed Y lift so ground-pet paws rest ON the ground instead of sinking
 * ~0.055–0.065 units into it (paw geometry centers are below local y=0). */
const GROUND_PET_LIFT = 0.06;

/**
 * Pets used to sit frozen at a single fixed offset — equip one and it
 * looked like a decoration bolted to your hip, not a companion. Now it
 * actually wanders: picks a random spot near its owner, walks/flies
 * there at its own pace, pauses, sometimes hops (ground pets) or banks
 * into a swoop (flying pets — components/world/item-variants.tsx's
 * `isFlyingPet`, currently Phönix/Drache), then picks a new spot — *unless*
 * a monster wanders within its species' `aggroRadius` (lib/pets.ts,
 * admin-configurable), in which case it breaks off wandering entirely to
 * chase that monster down and attack it on its own `attackSpeed` cooldown,
 * same idea as components/world/monster.tsx's own aggro/attack loop just
 * running on the pet's side. Always purely cosmetic-positioned otherwise
 * (no collision, no pathing) since it's only ever rendered relative to the
 * character's own local origin — which is also exactly why the wander
 * logic needs no owner-position input at all, the parent transform already
 * moves with the player every frame. Combat targeting is the one place
 * this *does* need a real position: monster registry entries report
 * world-space coordinates, so every frame in combat first reads this pet's
 * own current world position (`getWorldPosition`) and converts the
 * target's world position into this group's *parent's* local space
 * (`parent.worldToLocal`) before steering toward it — accounting for
 * whatever the owner's position/rotation happen to be that frame, exactly
 * the same way `pos.current`/`g.position` already work for wandering.
 */
function PetCompanion({
  item,
  monsterRegistryRef,
  petTypes,
}: {
  item: EquippedItem;
  monsterRegistryRef?: MonsterRegistry;
  petTypes?: PetTypeConfig[];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const flying = useMemo(() => isFlyingPet(item.name), [item.name]);
  const rng = useMemo(() => makeRng(hashSeed(item.name)), [item.name]);
  const speciesId = useMemo(() => getPetSpeciesId(item.name), [item.name]);
  const petConfig = useMemo(() => {
    const fallback = DEFAULT_PET_TYPES.find((p) => p.id === speciesId) ?? DEFAULT_PET_TYPES[DEFAULT_PET_TYPES.length - 1];
    const base = (petTypes ?? DEFAULT_PET_TYPES).find((p) => p.id === speciesId) ?? fallback;
    // Apply per-rarity stat overrides based on the equipped item's rarity.
    const rarityStats = resolvePetStatsForRarity(base, item.rarity ?? "normal");
    return {
      ...base,
      damage: rarityStats.damage,
      aggroRadius: rarityStats.aggroRadius,
      attackSpeed: rarityStats.attackSpeed,
      moveSpeed: rarityStats.moveSpeed,
    };
  }, [petTypes, speciesId, item.rarity]);

  const pos = useRef(new THREE.Vector3(0.8, flying ? 1.2 : 0, 0.6));
  const target = useRef(new THREE.Vector3());
  const decisionTimer = useRef(0);
  const paused = useRef(false);
  const jumpPhase = useRef(0); // 0 = not jumping, otherwise 0→1 arc progress
  const facing = useRef(0);
  const flapClock = useRef(0);
  /** Advances while the pet is actively moving — drives leg-walk animation
   * in DogPet/CatPet (item-variants.tsx). Stays fixed when paused so legs
   * hold their last pose rather than snapping to 0 mid-walk. */
  const walkClockRef = useRef(0);
  const combatTarget = useRef<{ isAlive: () => boolean; getPosition: () => THREE.Vector3; takeDamage: (n: number) => number } | null>(
    null
  );
  const attackCooldown = useRef(0);
  const attackLungeRef = useRef(0);
  const worldPos = useRef(new THREE.Vector3());
  const petIsMovingRef = useRef(false);

  function pickNewTarget() {
    const angle = rng() * Math.PI * 2;
    const radius = flying ? randRange(rng, PET_FLY_RADIUS) : randRange(rng, PET_GROUND_RADIUS);
    target.current.set(
      Math.cos(angle) * radius,
      flying ? randRange(rng, PET_FLY_HEIGHT) : 0,
      Math.sin(angle) * radius
    );
    decisionTimer.current = randRange(rng, DECISION_INTERVAL);
    paused.current = !flying && rng() < GROUND_PAUSE_CHANCE;
    if (!flying && !paused.current && rng() < JUMP_CHANCE) jumpPhase.current = 0.0001;
  }

  useEffect(() => {
    pickNewTarget();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot init per mount/name-change, pickNewTarget closes over stable refs
  }, [flying]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;

    // --- Combat: re-validate (or find) a target every frame before
    // deciding whether to wander or chase this frame.
    let inCombat = false;
    if (monsterRegistryRef && petConfig.enabled) {
      if (combatTarget.current && !combatTarget.current.isAlive()) combatTarget.current = null;
      g.getWorldPosition(worldPos.current);
      if (!combatTarget.current) {
        let nearestDist = petConfig.aggroRadius;
        for (const m of monsterRegistryRef.current) {
          if (!m.isAlive()) continue;
          const dist = worldPos.current.distanceTo(m.getPosition());
          if (dist <= nearestDist) {
            nearestDist = dist;
            combatTarget.current = m;
          }
        }
      }
      inCombat = combatTarget.current !== null;
    } else {
      combatTarget.current = null;
    }

    let petIsMoving = false;
    if (inCombat && combatTarget.current) {
      const monsterWorldPos = combatTarget.current.getPosition();
      const localTarget = g.parent ? g.parent.worldToLocal(monsterWorldPos.clone()) : monsterWorldPos;
      const toTarget = localTarget.clone().sub(pos.current);
      const dist = toTarget.length();
      if (dist > PET_ATTACK_RANGE) {
        toTarget.normalize().multiplyScalar(Math.min(dist - PET_ATTACK_RANGE, petConfig.moveSpeed * delta));
        pos.current.add(toTarget);
        if (Math.abs(toTarget.x) > 0.001 || Math.abs(toTarget.z) > 0.001) {
          facing.current = Math.atan2(toTarget.x, toTarget.z);
        }
        petIsMoving = true;
      } else {
        attackCooldown.current -= delta;
        if (attackCooldown.current <= 0) {
          attackCooldown.current = petConfig.attackSpeed;
          combatTarget.current.takeDamage(petConfig.damage);
          attackLungeRef.current = 1;
        }
      }
      paused.current = false;
    } else {
      decisionTimer.current -= delta;
      if (decisionTimer.current <= 0) pickNewTarget();

      const speed = flying ? PET_FLY_SPEED : PET_GROUND_SPEED;
      if (!paused.current) {
        const toTarget = target.current.clone().sub(pos.current);
        const dist = toTarget.length();
        if (dist > 0.05) {
          toTarget.normalize().multiplyScalar(Math.min(dist, speed * delta));
          pos.current.add(toTarget);
          if (Math.abs(toTarget.x) > 0.001 || Math.abs(toTarget.z) > 0.001) {
            facing.current = Math.atan2(toTarget.x, toTarget.z);
          }
          petIsMoving = true;
        } else {
          paused.current = true;
        }
      }
    }

    // Advance walk clock only while actually moving — DogPet/CatPet read
    // this to drive their leg swing animation (item-variants.tsx).
    if (!flying && petIsMoving) {
      walkClockRef.current += delta * 7;
    }

    // Track movement state so flying pet variants (Dragon/Phoenix) can
    // ramp their flap speed up when actually travelling to a target.
    petIsMovingRef.current = petIsMoving;

    // Decay attack lunge — fires to 1 on every hit, fades to 0 in ~0.2 s.
    attackLungeRef.current = Math.max(0, attackLungeRef.current - delta * 5.5);

    // Ground hop: a quick symmetric arc, purely cosmetic (doesn't affect
    // `pos.current.y`, which ground pets always keep at 0 — the bob below
    // layers on top of that).
    let hopY = 0;
    if (jumpPhase.current > 0) {
      jumpPhase.current += delta / 0.45;
      if (jumpPhase.current >= 1) jumpPhase.current = 0;
      else hopY = Math.sin(jumpPhase.current * Math.PI) * 0.22;
    }

    flapClock.current += delta * (flying ? 9 : 5);
    const bob = flying
      ? Math.sin(flapClock.current) * 0.06
      : paused.current
        ? Math.sin(flapClock.current * 0.5) * 0.015
        : Math.abs(Math.sin(flapClock.current)) * 0.05;

    // Lunge the pet forward along its facing direction on each attack hit.
    const lunge = attackLungeRef.current;
    const lungeX = lunge > 0 ? Math.sin(facing.current) * lunge * 0.38 : 0;
    const lungeZ = lunge > 0 ? Math.cos(facing.current) * lunge * 0.38 : 0;
    g.position.set(pos.current.x + lungeX, pos.current.y + hopY + bob + (flying ? 0 : GROUND_PET_LIFT), pos.current.z + lungeZ);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, facing.current, Math.min(1, delta * 6));

    if (bodyRef.current) {
      if (flying) {
        // Banking into turns + nose-down cruise tilt.
        const turn = THREE.MathUtils.lerp(g.rotation.y, facing.current, 1) - g.rotation.y;
        bodyRef.current.rotation.z = THREE.MathUtils.lerp(bodyRef.current.rotation.z, -turn * 5, 0.12);
        // Snap into a steep dive on attack, return to cruise pitch afterward.
        bodyRef.current.rotation.x = THREE.MathUtils.lerp(
          bodyRef.current.rotation.x,
          inCombat ? -0.25 - lunge * 1.1 : -0.18,
          0.06 + lunge * 0.28,
        );
      } else {
        // Lunge nose-down sharply on attack, lean forward while moving otherwise.
        const targetTiltX = lunge > 0.08 ? -lunge * 1.6 : hopY > 0.01 ? -hopY * 0.6 : petIsMoving ? -0.1 : 0;
        bodyRef.current.rotation.x = THREE.MathUtils.lerp(bodyRef.current.rotation.x, targetTiltX, lunge > 0.08 ? 0.32 : 0.1);
      }
    }
  });

  return (
    <group ref={groupRef}>
      <group ref={bodyRef}>
        <PetVariant item={item} walkClockRef={walkClockRef} attackPhaseRef={attackLungeRef} isMovingRef={petIsMovingRef} />
      </group>
    </group>
  );
}

function hashSeed(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

/** Bare-legs fallback when no pants are equipped — keeps the silhouette
 * intact instead of leaving a gap. Same height/center fix as PantsVariants:
 * stops at character-local y=0.14 so bare feet remain visible below. */
function SkinnyFallbackLeg() {
  return (
    <mesh position={[0, -0.43, 0]}>
      <boxGeometry args={[0.26, 0.86, 0.26]} />
      <meshStandardMaterial color={SKIN} />
    </mesh>
  );
}
