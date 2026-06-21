"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import { type EquippedItem } from "@/lib/rarity-colors";
import { debugWarn } from "@/lib/debug";
import {
  PetVariant,
  HatVariant,
  FaceVariant,
  WeaponVariant,
  JacketVariant,
  PantsVariant,
  ShoeVariant,
  ShieldVariant,
  HairVariant,
  AuraVariant,
  TrailVariant,
  ChestShape,
  RingVariant,
  AmuletVariant,
} from "@/components/world/item-variants";

export interface CharacterModelProps {
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  /** Floating nametag above the head — omitted in the Garderobe preview. */
  name?: string;
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
  function CharacterModel({ equippedByCategory, gender, name }, ref) {
    const hat = equippedByCategory.hat;
    const hair = equippedByCategory[gender === "m" ? "hair_m" : "hair_f"];
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
        "hair_m",
        "hair_f",
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
            {shoes && <ShoeVariant item={shoes} />}
          </group>
        </group>

        {/* right leg */}
        <group ref={legR} position={[build.legX, HIP_Y, 0]}>
          {pants ? <PantsVariant item={pants} /> : <SkinnyFallbackLeg />}
          <group position={[0, -1, 0]}>
            {shoes && <ShoeVariant item={shoes} />}
          </group>
        </group>

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

        {/* amulet — sits on top of the chest/jacket at collar height, just
            in front of the torso so it never gets swallowed inside it */}
        {amulet && (
          <group position={[0, 1.62, build.torsoDepth / 2 + 0.06]}>
            <AmuletVariant item={amulet} />
          </group>
        )}

        {/* left arm: shoulder-pivoted group, shield (if any) rides on it */}
        <group ref={armL} position={[-build.armX, SHOULDER_Y, 0]}>
          <mesh position={[0, -0.375, 0]}>
            <boxGeometry args={[0.22, 0.75, 0.22]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
          {shield && <ShieldVariant item={shield} />}
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

        {/* face / mask — variant shape picked deterministically from the item name */}
        {face && (
          <group position={[0, 2.05, 0.29]}>
            <FaceVariant item={face} />
          </group>
        )}

        {/* hair — variant style picked deterministically from the item name */}
        {hair && <HairVariant item={hair} />}

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
        {pet && <PetCompanion item={pet} />}
      </group>
    );
  }
);

/** Deterministic phase offset from the pet's name — without this, every
 * equipped pet across every player would orbit perfectly in sync (same
 * clock, same formula), which reads as obviously fake. A per-name phase
 * makes each pet's loop start at a different point in its cycle. */
function namePhase(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000 * Math.PI * 2;
}

/** Pets used to sit frozen at a single fixed offset — equip one and it
 * looked like a decoration bolted to your hip, not a companion. Now it
 * wanders in a lazy ellipse around its owner with a bit of bob and faces
 * its direction of travel, while still being purely cosmetic (no
 * collision, no pathing) since it's only ever rendered relative to the
 * character's own local origin. */
function PetCompanion({ item }: { item: EquippedItem }) {
  const groupRef = useRef<THREE.Group>(null);
  const phase = useMemo(() => namePhase(item.name), [item.name]);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.elapsedTime * 0.55 + phase;
    const x = Math.cos(t) * 1.05;
    const z = Math.sin(t) * 0.85 + 0.55;
    g.position.set(x, Math.max(0, Math.sin(t * 4)) * 0.08, z);
    g.rotation.y = -t + Math.PI / 2;
  });

  return (
    <group ref={groupRef}>
      <PetVariant item={item} />
    </group>
  );
}

/** Bare-legs fallback when no pants are equipped — keeps the silhouette
 * intact instead of leaving a gap. */
function SkinnyFallbackLeg() {
  return (
    <mesh position={[0, -0.5, 0]}>
      <boxGeometry args={[0.26, 1, 0.26]} />
      <meshStandardMaterial color={SKIN} />
    </mesh>
  );
}
