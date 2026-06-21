"use client";

import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RARITY_HEX, rarityColorFor, type EquippedItem } from "@/lib/rarity-colors";
import type { Rarity } from "@/lib/cases";

/** Deterministic string hash — same item name always picks the same
 * variant, but different item names spread across the available shapes.
 * This is what makes "equip a dog pet" actually look like a dog: every
 * pet item used to render as the exact same sphere, only tinted by
 * rarity. Now the item's *name* (not just its rarity) decides the shape. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function variantIndex(name: string, count: number): number {
  return hashString(name) % count;
}

// --- Rarity FX: universal per-rarity glow/pulse/RGB-cycle wrapper --------
//
// Wraps any solid-mesh variant (hat, jacket, pants, shoes, face, weapon,
// shield, hair, pet) and drives its materials every frame based on rarity,
// without each individual variant having to know or care:
//   normal   -> untouched, exactly the solid rarity color it already had
//   selten   -> a static color-matched glow (emissive = own color, low intensity)
//   mythisch -> a stronger glow that slowly pulses
//   ultra    -> full animated RGB hue-cycle (color *and* glow) + a fast pulse
//               + a small rotating sparkle-particle boost
//
// This is what makes "every Ultra item is animated/RGB" true across all
// ~900 generated items at once, instead of hand-authoring it per item.
function applyRarityMaterial(mat: THREE.Material, rarity: Rarity, t: number) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  if (rarity === "ultra") {
    const hue = (t * 0.18) % 1;
    mat.color.setHSL(hue, 0.85, 0.55);
    mat.emissive.setHSL(hue, 0.9, 0.5);
    mat.emissiveIntensity = 0.7 + Math.sin(t * 7) * 0.35;
  } else if (rarity === "mythisch") {
    mat.emissive.copy(mat.color);
    mat.emissiveIntensity = 0.35 + Math.sin(t * 2.4) * 0.2;
  } else if (rarity === "selten") {
    mat.emissive.copy(mat.color);
    mat.emissiveIntensity = 0.22;
  }
}

/** Shared by every aura/trail particle loop below — when `rarity` is
 * "ultra" each particle gets its own slowly-drifting hue instead of one
 * flat color, so Ultra auras/trails read as animated rainbow effects too,
 * not just oversized normal-tier ones. No-op (returns false) for every
 * other rarity, which already gets its correct static RARITY_HEX color
 * from the JSX `color={color}` prop at mount. */
function applyUltraParticleColor(
  mat: THREE.MeshBasicMaterial,
  rarity: Rarity,
  t: number,
  seed: number
): boolean {
  if (rarity !== "ultra") return false;
  const hue = (((t * 0.3 + seed * 0.09) % 1) + 1) % 1;
  mat.color.setHSL(hue, 1, 0.6);
  return true;
}

function UltraSparkles() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const count = 6;
  const seeds = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ angle: (i / count) * Math.PI * 2, phase: i * 0.9 })),
    [count]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const s = seeds[i];
      const hue = ((t * 0.3 + s.phase * 0.15) % 1 + 1) % 1;
      (m.material as THREE.MeshBasicMaterial).color.setHSL(hue, 1, 0.6);
      m.position.set(
        Math.cos(t * 1.4 + s.angle) * 0.32,
        Math.sin(t * 2.1 + s.phase) * 0.18,
        Math.sin(t * 1.4 + s.angle) * 0.32
      );
    }
  });

  return (
    <group>
      {seeds.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.03, 6, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function RarityFX({ rarity, children }: { rarity: Rarity; children: ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (rarity === "normal" || !groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) applyRarityMaterial(mat, rarity, t);
    });
  });

  return (
    <group ref={groupRef}>
      {children}
      {rarity === "ultra" && <UltraSparkles />}
    </group>
  );
}

// --- Pets: 4 distinct low-poly silhouettes ------------------------------

function DogPet({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[0.46, 0.22, 0.2]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.26, 0.22, 0]}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.32, 0.34, 0.07]} rotation={[0, 0, -0.3]}>
        <coneGeometry args={[0.05, 0.12, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.32, 0.34, -0.07]} rotation={[0, 0, -0.3]}>
        <coneGeometry args={[0.05, 0.12, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-0.26, 0.2, 0]} rotation={[0, 0, 0.9]}>
        <coneGeometry args={[0.05, 0.22, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function DragonPet({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.2, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0.2, 0.32, 0]} rotation={[0, 0, 0.4]}>
        <coneGeometry args={[0.05, 0.14, 6]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.12, 0.22, 0.22]} rotation={[1.1, 0, 0.3]}>
        <boxGeometry args={[0.02, 0.24, 0.16]} />
        <meshStandardMaterial color={color} transparent opacity={0.75} />
      </mesh>
      <mesh position={[0.12, 0.22, -0.22]} rotation={[-1.1, 0, 0.3]}>
        <boxGeometry args={[0.02, 0.24, 0.16]} />
        <meshStandardMaterial color={color} transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

function GhostPet({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.18, 14, 14]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.26, 0.02, 8, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} toneMapped={false} />
      </mesh>
    </group>
  );
}

function CatPet({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.38, 0.18, 0.16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.2, 0.18, 0]}>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.24, 0.27, 0.05]} rotation={[0, 0, -0.2]}>
        <coneGeometry args={[0.035, 0.08, 6]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.24, 0.27, -0.05]} rotation={[0, 0, -0.2]}>
        <coneGeometry args={[0.035, 0.08, 6]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-0.22, 0.22, 0]} rotation={[0, 0, -0.6]}>
        <boxGeometry args={[0.03, 0.26, 0.03]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

const PET_VARIANTS = [DogPet, DragonPet, GhostPet, CatPet];

export function PetVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#a855f7");
  const Variant = PET_VARIANTS[variantIndex(item.name, PET_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} />
    </RarityFX>
  );
}

// --- Hats: 4 distinct silhouettes ----------------------------------------

function CapHat({ color }: { color: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.62, 0.2, 0.62]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.05, 0.36]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[0.5, 0.04, 0.22]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function BeanieHat({ color }: { color: string }) {
  return (
    <mesh>
      <sphereGeometry args={[0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function TopHat({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.4, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.05, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function CrownHat({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.4, 0.45, 0.06, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <coneGeometry args={[0.32, 0.36, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

const HAT_VARIANTS = [CapHat, BeanieHat, TopHat, CrownHat];

export function HatVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#6d28d9");
  const Variant = HAT_VARIANTS[variantIndex(item.name, HAT_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} />
    </RarityFX>
  );
}

// --- Faces/masks: 4 distinct looks ---------------------------------------

function VisorFace({ color }: { color: string }) {
  return (
    <mesh>
      <boxGeometry args={[0.42, 0.22, 0.06]} />
      <meshStandardMaterial color="#15151c" emissive={color} emissiveIntensity={0.6} />
    </mesh>
  );
}

function BandanaFace({ color }: { color: string }) {
  return (
    <mesh rotation={[0.15, 0, 0]}>
      <boxGeometry args={[0.46, 0.26, 0.08]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function GogglesFace({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[-0.13, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.06, 14]} />
        <meshStandardMaterial color="#1a1a22" emissive={color} emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0.13, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.06, 14]} />
        <meshStandardMaterial color="#1a1a22" emissive={color} emissiveIntensity={0.7} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.5, 0.03, 0.03]} />
        <meshStandardMaterial color="#1a1a22" />
      </mesh>
    </group>
  );
}

function GasmaskFace({ color }: { color: string }) {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.24, 14, 10]} />
        <meshStandardMaterial color="#22252b" />
      </mesh>
      <mesh position={[0, -0.1, 0.16]}>
        <cylinderGeometry args={[0.06, 0.06, 0.14, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

const FACE_VARIANTS = [VisorFace, BandanaFace, GogglesFace, GasmaskFace];

export function FaceVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#a855f7");
  const Variant = FACE_VARIANTS[variantIndex(item.name, FACE_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} />
    </RarityFX>
  );
}

// --- Weapons: 4 distinct silhouettes -------------------------------------

// All four weapon variants share the same convention: the grip point is
// at the local origin (y=0) — that's where the parent group in character-
// model.tsx positions the hand — with a short pommel/handle dipping just
// below it and the business end (blade/head/orb) extending straight up
// from there. The previous version centered each mesh ON the grip point,
// so half the weapon poked out behind/below the hand at a diagonal tilt —
// exactly the "looks wrong, not held straight" complaint.

function SwordWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[0.05, 0.14, 0.05]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.08, 0.84, 0.06]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function AxeWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[0.07, 0.72, 0.07]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <mesh position={[0.1, 0.62, 0]}>
        <boxGeometry args={[0.22, 0.22, 0.06]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function HammerWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, 0.34, 0]}>
        <boxGeometry args={[0.06, 0.68, 0.06]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.24, 0.18, 0.18]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function StaffWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.92, 10]} />
        <meshStandardMaterial color="#52525b" />
      </mesh>
      <mesh position={[0, 0.94, 0]}>
        <sphereGeometry args={[0.1, 14, 14]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

const WEAPON_VARIANTS = [SwordWeapon, AxeWeapon, HammerWeapon, StaffWeapon];

export function WeaponVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#e5e7eb");
  const emissive = rarityColorFor(item, "#000000");
  const Variant = WEAPON_VARIANTS[variantIndex(item.name, WEAPON_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} emissive={emissive} />
    </RarityFX>
  );
}

// --- Jackets: 4 distinct torso silhouettes -------------------------------
// All variants are built around the same gender-driven {width, depth} base
// box (so the male/female silhouette difference from BUILD in character-
// model.tsx is always respected), just with different add-ons on top.

function PlainJacket({ color, width, depth }: { color: string; width: number; depth: number }) {
  return (
    <mesh>
      <boxGeometry args={[width, 0.8, depth]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function CollaredJacket({ color, width, depth }: { color: string; width: number; depth: number }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[width, 0.8, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.42, depth * 0.3]}>
        <boxGeometry args={[width * 0.6, 0.12, depth * 0.5]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

function PaddedJacket({ color, width, depth }: { color: string; width: number; depth: number }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[width, 0.8, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-width / 2, 0.3, 0]}>
        <boxGeometry args={[0.16, 0.22, depth * 1.1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[width / 2, 0.3, 0]}>
        <boxGeometry args={[0.16, 0.22, depth * 1.1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

function LongCoatJacket({ color, width, depth }: { color: string; width: number; depth: number }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[width, 0.8, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[width * 0.9, 0.65, depth * 0.8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

const JACKET_VARIANTS = [PlainJacket, CollaredJacket, PaddedJacket, LongCoatJacket];

/** Female chest silhouette — two slightly-flattened spheres bulging out of
 * the torso's front face (+z). Used both by the bare-torso fallback and by
 * JacketVariant below so the female build reads as female with or without
 * a jacket equipped, instead of being a unisex box either way. */
export function ChestShape({ depth, color }: { depth: number; color: string }) {
  return (
    <group position={[0, 0.16, depth / 2 - 0.02]}>
      <mesh position={[-0.12, 0, 0]} scale={[1, 0.9, 0.75]}>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.12, 0, 0]} scale={[1, 0.9, 0.75]}>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

export function JacketVariant({
  item,
  width,
  depth,
  gender,
}: {
  item: EquippedItem;
  width: number;
  depth: number;
  gender: "m" | "w";
}) {
  const color = rarityColorFor(item, "#0e7490");
  const Variant = JACKET_VARIANTS[variantIndex(item.name, JACKET_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} width={width} depth={depth} />
      {gender === "w" && <ChestShape depth={depth} color={color} />}
    </RarityFX>
  );
}

// --- Pants: 4 distinct leg silhouettes ------------------------------------
// Rendered once per leg (left/right), inside each hip-pivoted group in
// character-model.tsx, so both legs always pick the same variant together.

const SKIN = "#caa472";

function SkinnyPants({ color }: { color: string }) {
  return (
    <mesh position={[0, -0.5, 0]}>
      <boxGeometry args={[0.24, 1, 0.24]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function BaggyPants({ color }: { color: string }) {
  return (
    <mesh position={[0, -0.5, 0]}>
      <boxGeometry args={[0.34, 1, 0.32]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function ShortsPants({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, -0.62, 0]}>
        <boxGeometry args={[0.28, 0.55, 0.28]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.85, 0]}>
        <boxGeometry args={[0.22, 0.5, 0.22]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>
    </group>
  );
}

function StripedPants({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[0.28, 1, 0.28]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.15, -0.5, 0]}>
        <boxGeometry args={[0.03, 1, 0.29]} />
        <meshStandardMaterial color="#f5f5f5" emissive="#f5f5f5" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

const PANTS_VARIANTS = [SkinnyPants, BaggyPants, ShortsPants, StripedPants];

export function PantsVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#1e3a8a");
  const Variant = PANTS_VARIANTS[variantIndex(item.name, PANTS_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} />
    </RarityFX>
  );
}

// --- Shoes: 4 distinct footwear silhouettes -------------------------------

function SneakerShoe({ color }: { color: string }) {
  return (
    <mesh position={[0, 0.06, 0.08]}>
      <boxGeometry args={[0.3, 0.16, 0.4]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function BootShoe({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.06, 0.06]}>
        <boxGeometry args={[0.32, 0.16, 0.42]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.28, -0.02]}>
        <boxGeometry args={[0.3, 0.32, 0.3]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function CleatShoe({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.06, 0.08]}>
        <boxGeometry args={[0.28, 0.14, 0.4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[-0.1, 0.1].map((dz) => (
        <mesh key={dz} position={[0, -0.02, 0.08 + dz]}>
          <coneGeometry args={[0.025, 0.06, 6]} />
          <meshStandardMaterial color="#2a2a2e" />
        </mesh>
      ))}
    </group>
  );
}

function SandalShoe({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.03, 0.08]}>
        <boxGeometry args={[0.28, 0.05, 0.42]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.1, 0.22]}>
        <boxGeometry args={[0.26, 0.1, 0.04]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

const SHOE_VARIANTS = [SneakerShoe, BootShoe, CleatShoe, SandalShoe];

export function ShoeVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#1e293b");
  const Variant = SHOE_VARIANTS[variantIndex(item.name, SHOE_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} />
    </RarityFX>
  );
}

// --- Shields: 4 distinct silhouettes (left arm) ---------------------------

function KiteShield({ color, emissive }: { color: string; emissive: string }) {
  return (
    <mesh position={[-0.16, -0.55, 0.05]}>
      <boxGeometry args={[0.06, 0.55, 0.4]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.25} />
    </mesh>
  );
}

function RoundShield({ color, emissive }: { color: string; emissive: string }) {
  return (
    <mesh position={[-0.18, -0.5, 0.05]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.26, 0.26, 0.06, 16]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.25} />
    </mesh>
  );
}

function TowerShield({ color, emissive }: { color: string; emissive: string }) {
  return (
    <mesh position={[-0.18, -0.65, 0.05]}>
      <boxGeometry args={[0.08, 0.85, 0.45]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} />
    </mesh>
  );
}

function BucklerShield({ color, emissive }: { color: string; emissive: string }) {
  return (
    <mesh position={[-0.14, -0.45, 0.05]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.15, 0.15, 0.05, 14]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.3} />
    </mesh>
  );
}

const SHIELD_VARIANTS = [KiteShield, RoundShield, TowerShield, BucklerShield];

export function ShieldVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#52525b");
  const emissive = rarityColorFor(item, "#000000");
  const Variant = SHIELD_VARIANTS[variantIndex(item.name, SHIELD_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} emissive={emissive} />
    </RarityFX>
  );
}

// --- Hair: 4 distinct styles ----------------------------------------------

function ShortHair({ color }: { color: string }) {
  return (
    <mesh position={[0, 2.28, -0.05]}>
      <boxGeometry args={[0.58, 0.18, 0.58]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function LongHair({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 2.28, -0.05]}>
        <boxGeometry args={[0.58, 0.18, 0.58]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.95, -0.28]}>
        <boxGeometry args={[0.5, 0.55, 0.16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function MohawkHair({ color }: { color: string }) {
  return (
    <mesh position={[0, 2.42, 0]}>
      <boxGeometry args={[0.12, 0.3, 0.56]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
    </mesh>
  );
}

function PonytailHair({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 2.28, -0.05]}>
        <boxGeometry args={[0.58, 0.18, 0.58]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 2.05, -0.42]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.04, 0.5, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

const HAIR_VARIANTS = [ShortHair, LongHair, MohawkHair, PonytailHair];

export function HairVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#404040");
  const Variant = HAIR_VARIANTS[variantIndex(item.name, HAIR_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} />
    </RarityFX>
  );
}

// --- Auras: 4 dramatically different effects ------------------------------

function OrbitAura({ rarity }: { rarity: Rarity }) {
  const groupRef = useRef<THREE.Group>(null);
  const particleRefs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 8;

  useFrame((state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 1.1;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < particleRefs.current.length; i++) {
      const p = particleRefs.current[i];
      if (!p) continue;
      p.position.y = 0.25 + Math.sin(t * 2.4 + i * 1.3) * 0.22;
      applyUltraParticleColor(p.material as THREE.MeshBasicMaterial, rarity, t, i);
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = 0.55;
        return (
          <mesh
            key={i}
            ref={(el) => {
              particleRefs.current[i] = el;
            }}
            position={[Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius]}
          >
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function EmberAura({ rarity }: { rarity: Rarity }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 10;
  // Render-time data (read in JSX below), not a per-frame mutation target —
  // useMemo is the right tool here, not useRef (refs are for values that
  // live *outside* render, e.g. the per-frame mesh mutations in useFrame).
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2,
        radius: 0.2 + (i % 3) * 0.15,
        speed: 0.6 + (i % 4) * 0.15,
        phase: i * 0.7,
      })),
    [count]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const s = seeds[i];
      const cycle = ((t * s.speed + s.phase) % 2) / 2;
      m.position.y = cycle * 2.4;
      m.position.x = Math.cos(s.angle) * s.radius * (1 - cycle * 0.4);
      m.position.z = Math.sin(s.angle) * s.radius * (1 - cycle * 0.4);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.9 * (1 - cycle);
      applyUltraParticleColor(mat, rarity, t, i);
    }
  });

  return (
    <group>
      {seeds.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[Math.cos(s.angle) * s.radius, 0, Math.sin(s.angle) * s.radius]}
        >
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function BladeAura({ rarity }: { rarity: Rarity }) {
  const groupRef = useRef<THREE.Group>(null);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 6;

  useFrame((state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y -= delta * 2.2;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      applyUltraParticleColor(m.material as THREE.MeshBasicMaterial, rarity, t, i);
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.9, 0]}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = 0.65;
        return (
          <mesh
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
            rotation={[0, -angle, Math.PI / 2.3]}
          >
            <boxGeometry args={[0.32, 0.02, 0.09]} />
            <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function DoubleRingAura({ rarity }: { rarity: Rarity }) {
  const ringA = useRef<THREE.Group>(null);
  const ringB = useRef<THREE.Group>(null);
  const meshA = useRef<THREE.Mesh>(null);
  const meshB = useRef<THREE.Mesh>(null);
  const color = RARITY_HEX[rarity];

  useFrame((state, delta) => {
    if (ringA.current) ringA.current.rotation.y += delta * 1.6;
    if (ringB.current) ringB.current.rotation.y -= delta * 1.2;
    const t = state.clock.elapsedTime;
    if (meshA.current) applyUltraParticleColor(meshA.current.material as THREE.MeshBasicMaterial, rarity, t, 0);
    if (meshB.current) applyUltraParticleColor(meshB.current.material as THREE.MeshBasicMaterial, rarity, t, 5);
  });

  return (
    <>
      <group ref={ringA} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh ref={meshA}>
          <torusGeometry args={[0.5, 0.025, 8, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
        </mesh>
      </group>
      <group ref={ringB} position={[0, 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh ref={meshB}>
          <torusGeometry args={[0.38, 0.02, 8, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}

const AURA_VARIANTS = [OrbitAura, EmberAura, BladeAura, DoubleRingAura];

export function AuraVariant({ item }: { item: EquippedItem }) {
  const Variant = AURA_VARIANTS[variantIndex(item.name, AURA_VARIANTS.length)];
  return <Variant rarity={item.rarity} />;
}

// --- Trails: 4 distinct ground-effect styles ------------------------------

function GlowCirclesTrail({ rarity }: { rarity: Rarity }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const segments = [
    { z: -0.4, scale: 0.85, opacity: 0.55 },
    { z: -0.75, scale: 0.65, opacity: 0.38 },
    { z: -1.1, scale: 0.45, opacity: 0.22 },
  ];

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = segments[i].opacity * (0.7 + 0.3 * Math.sin(t * 4 + i));
      applyUltraParticleColor(mat, rarity, t, i);
    }
  });

  return (
    <group position={[0, 0.12, -0.25]}>
      {segments.map((seg, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[0, 0, seg.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.32 * seg.scale, 16]} />
          <meshBasicMaterial color={color} transparent opacity={seg.opacity} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function SparkTrail({ rarity }: { rarity: Rarity }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 8;
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: ((i % 3) - 1) * 0.18,
        z: -0.2 - i * 0.18,
        phase: i * 0.5,
      })),
    [count]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const s = seeds[i];
      m.position.y = 0.05 + Math.abs(Math.sin(t * 3 + s.phase)) * 0.12;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.7 * (0.5 + 0.5 * Math.sin(t * 3 + s.phase));
      applyUltraParticleColor(mat, rarity, t, i);
    }
  });

  return (
    <group>
      {seeds.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[s.x, 0.05, s.z]}
        >
          <sphereGeometry args={[0.035, 6, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function RibbonTrail({ rarity }: { rarity: Rarity }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 6;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      m.position.y = 0.15 + Math.sin(t * 3 + i * 0.8) * 0.06;
      applyUltraParticleColor(m.material as THREE.MeshBasicMaterial, rarity, t, i);
    }
  });

  return (
    <group position={[0, 0, -0.2]}>
      {Array.from({ length: count }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[Math.sin(i * 0.9) * 0.12, 0.15, -i * 0.16]}
          rotation={[0, i * 0.4, 0]}
        >
          <boxGeometry args={[0.18, 0.03, 0.1]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.6 - i * 0.08}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function SmokePuffTrail({ rarity }: { rarity: Rarity }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 5;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const cycle = (t * 0.6 + i * 0.4) % 2;
      const scale = 0.3 + cycle * 0.5;
      m.scale.setScalar(scale);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.5 - cycle * 0.25);
      applyUltraParticleColor(mat, rarity, t, i);
    }
  });

  return (
    <group position={[0, 0.18, -0.3]}>
      {Array.from({ length: count }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[0, 0, -i * 0.22]}
        >
          <sphereGeometry args={[0.18, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

const TRAIL_VARIANTS = [GlowCirclesTrail, SparkTrail, RibbonTrail, SmokePuffTrail];

export function TrailVariant({ item }: { item: EquippedItem }) {
  const Variant = TRAIL_VARIANTS[variantIndex(item.name, TRAIL_VARIANTS.length)];
  return <Variant rarity={item.rarity} />;
}
