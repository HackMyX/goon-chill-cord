"use client";

import { Suspense, useRef } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { View, PerspectiveCamera, OrbitControls, ContactShadows } from "@react-three/drei";
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
  RingVariant,
  AmuletVariant,
  HairVariant,
  AuraVariant,
  TrailVariant,
} from "@/components/world/item-variants";
import type { EquippedItem } from "@/lib/rarity-colors";

// ── Public type used by shop-shell.tsx ────────────────────────────────────────

export interface ItemForPreview {
  id: string;
  name: string;
  rarity: string;
  type: string;
  damage?: number | null;
  armor?: number | null;
  perk_type?: string | null;
  perk_magnitude?: number | null;
  shield_hp?: number | null;
  shield_regen_cooldown_sec?: number | null;
}

// ── Camera presets per item type ─────────────────────────────────────────────

type CamCfg = {
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
};

const CAM_MAP: Record<string, CamCfg> = {
  hat:             { pos: [0.35, 0.4,  2.0],  target: [0,  0.1,  0],    fov: 38 },
  face:            { pos: [0,    0.1,  1.7],  target: [0,  0,    0],    fov: 36 },
  hair:            { pos: [0.3,  0.3,  1.9],  target: [0,  0,    0],    fov: 38 },
  weapon_cosmetic: { pos: [0.5,  0.5,  2.6],  target: [0,  0.1,  0],    fov: 40 },
  weapon:          { pos: [0.5,  0.5,  2.6],  target: [0,  0.1,  0],    fov: 40 },
  pet:             { pos: [0,    0.4,  3.2],  target: [0,  0.2,  0],    fov: 44 },
  aura:            { pos: [0,    1.0,  4.8],  target: [0,  0.5,  0],    fov: 52 },
  trail:           { pos: [0,    0.5,  4.0],  target: [0,  0,    0],    fov: 50 },
  shield_cosmetic: { pos: [0.3,  0.2,  2.6],  target: [0,  0,    0],    fov: 42 },
  ring:            { pos: [0,    0.1,  1.3],  target: [0,  0,    0],    fov: 34 },
  amulet:          { pos: [0,    0,    2.2],  target: [0, -0.25, 0],    fov: 40 },
  jacket:          { pos: [0,    0.3,  2.4],  target: [0,  0.1,  0],    fov: 42 },
  pants:           { pos: [0,    0,    2.6],  target: [0, -0.2,  0],    fov: 44 },
  shoes:           { pos: [0,    0,    2.0],  target: [0, -0.2,  0],    fov: 42 },
};
const CAM_DEFAULT: CamCfg = { pos: [0, 0.2, 2.5], target: [0, 0, 0], fov: 42 };

function getCam(type: string): CamCfg {
  return CAM_MAP[type] ?? CAM_DEFAULT;
}

// ── Gentle float animation ────────────────────────────────────────────────────

function FloatGroup({
  children,
  amp = 0.07,
  speed = 1.1,
}: {
  children: ReactNode;
  amp?: number;
  speed?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = Math.sin(clock.elapsedTime * speed) * amp;
  });
  return <group ref={ref}>{children}</group>;
}

// ── ItemForPreview → EquippedItem ────────────────────────────────────────────

function toEquipped(item: ItemForPreview): EquippedItem {
  return {
    id: item.id,
    name: item.name,
    rarity: item.rarity as EquippedItem["rarity"],
    damage: item.damage,
    armor: item.armor,
    perk_type: item.perk_type as EquippedItem["perk_type"],
    perk_magnitude: item.perk_magnitude,
    shield_hp: item.shield_hp,
    shield_regen_cooldown_sec: item.shield_regen_cooldown_sec,
  };
}

// ── Isolated item scene — must run inside a Canvas or View ───────────────────

export function ItemSceneContent({
  item,
  gender = "m",
}: {
  item: ItemForPreview;
  gender?: "m" | "w";
}) {
  const e = toEquipped(item);

  switch (item.type) {
    case "hat":
      return (
        <FloatGroup>
          <HatVariant item={e} />
        </FloatGroup>
      );

    case "face":
      return (
        <FloatGroup>
          <FaceVariant item={e} />
        </FloatGroup>
      );

    case "hair":
      return (
        <FloatGroup>
          <HairVariant item={e} gender={gender} />
        </FloatGroup>
      );

    case "weapon_cosmetic":
    case "weapon":
      return (
        <FloatGroup amp={0.06}>
          <group rotation={[0.25, 0.5, 0.15]}>
            <WeaponVariant item={e} />
          </group>
        </FloatGroup>
      );

    case "pet":
      return (
        <FloatGroup amp={0.05} speed={0.9}>
          <PetVariant item={e} />
        </FloatGroup>
      );

    case "jacket":
      return (
        <FloatGroup>
          <JacketVariant item={e} width={0.54} depth={0.30} gender={gender} />
        </FloatGroup>
      );

    case "pants":
      return (
        <FloatGroup>
          <group position={[-0.21, 0, 0]}>
            <PantsVariant item={e} />
          </group>
          <group position={[0.21, 0, 0]}>
            <PantsVariant item={e} />
          </group>
          <PantsHipSection item={e} width={0.54} depth={0.30} />
        </FloatGroup>
      );

    case "shoes":
      return (
        <FloatGroup>
          <group position={[-0.2, 0, 0]}>
            <ShoeVariant item={e} />
          </group>
          <group position={[0.2, 0, 0]}>
            <ShoeVariant item={e} />
          </group>
        </FloatGroup>
      );

    case "shield_cosmetic":
      return (
        <FloatGroup>
          <ShieldVariant item={e} />
        </FloatGroup>
      );

    case "ring":
      return (
        <FloatGroup amp={0.04}>
          <RingVariant item={e} />
        </FloatGroup>
      );

    case "amulet":
      return (
        <FloatGroup amp={0.05}>
          <AmuletVariant item={e} />
        </FloatGroup>
      );

    case "aura":
      return (
        <FloatGroup amp={0.04} speed={0.7}>
          <AuraVariant item={e} />
        </FloatGroup>
      );

    case "trail":
      return (
        <FloatGroup amp={0.04}>
          <TrailVariant item={e} />
        </FloatGroup>
      );

    default:
      return (
        <FloatGroup>
          <mesh>
            <boxGeometry args={[0.55, 0.55, 0.55]} />
            <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.55} />
          </mesh>
        </FloatGroup>
      );
  }
}

// ── Shared lighting ───────────────────────────────────────────────────────────

function ItemLights() {
  return (
    <>
      <ambientLight intensity={0.75} color="#c4b5fd" />
      <directionalLight position={[2, 5, 3]} intensity={1.4} color="#ffffff" />
      <pointLight position={[-2.5, 2, -1.5]} intensity={14} color="#7c3aed" />
      <pointLight position={[1.5, 3.5, 2]} intensity={5} color="#ede9fe" />
    </>
  );
}

// ── View-based preview (shop — shares the shop's global Canvas) ───────────────
//
// Drop-in replacement for the old ShopCharacterView: same props, same View
// system, but renders ONLY the isolated item instead of a full character body.

export function ItemIsolatedPreview({
  item,
  gender = "m",
  viewIndex,
  visible = true,
}: {
  item: ItemForPreview;
  gender?: "m" | "w";
  viewIndex: number;
  visible?: boolean;
}) {
  const cam = getCam(item.type);

  return (
    <View
      index={viewIndex + 1}
      visible={visible}
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
    >
      <PerspectiveCamera makeDefault position={cam.pos} fov={cam.fov} />
      <ItemLights />

      <Suspense fallback={null}>
        <ItemSceneContent item={item} gender={gender} />
        <ContactShadows
          position={[0, -0.6, 0]}
          opacity={0.3}
          scale={3}
          blur={2.2}
          far={2.0}
        />
      </Suspense>

      <OrbitControls
        target={cam.target}
        enablePan={false}
        minDistance={0.8}
        maxDistance={8.0}
        minPolarAngle={Math.PI / 10}
        maxPolarAngle={Math.PI * 0.85}
        autoRotate
        autoRotateSpeed={3.0}
      />
    </View>
  );
}

// Backward-compat alias so shop-shell.tsx needs zero changes
export { ItemIsolatedPreview as ShopCharacterView };

// ── Standalone Canvas preview (Battle Pass, item detail modals, etc.) ─────────
//
// Creates its own WebGL context — use sparingly (max one visible at a time).
// Use ItemIsolatedPreview instead when a shared Canvas is already present.

export function ItemStandaloneCanvas({
  item,
  gender = "m",
  height = 200,
  className = "",
}: {
  item: ItemForPreview;
  gender?: "m" | "w";
  height?: number;
  className?: string;
}) {
  const cam = getCam(item.type);

  return (
    <Canvas
      style={{ height, width: "100%", borderRadius: "12px" }}
      className={className}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: cam.pos, fov: cam.fov }}
    >
      <ItemLights />
      <Suspense fallback={null}>
        <ItemSceneContent item={item} gender={gender} />
        <ContactShadows
          position={[0, -0.6, 0]}
          opacity={0.25}
          scale={2.5}
          blur={2}
          far={1.8}
        />
      </Suspense>
      <OrbitControls
        target={cam.target}
        enablePan={false}
        minDistance={0.8}
        maxDistance={8.0}
        minPolarAngle={Math.PI / 10}
        maxPolarAngle={Math.PI * 0.85}
        autoRotate
        autoRotateSpeed={3.5}
      />
    </Canvas>
  );
}
