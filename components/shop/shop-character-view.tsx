"use client";

import { Suspense } from "react";
import { View, PerspectiveCamera, OrbitControls, ContactShadows } from "@react-three/drei";
import { CharacterModel } from "@/components/world/character-model";
import type { EquippedItem } from "@/lib/rarity-colors";

type CamCfg = {
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
};

// Best camera angle per item category so the relevant body part fills the frame.
const CAMS: Record<string, CamCfg> = {
  hat:             { pos: [0.25, 2.25, 1.9],    target: [0,     1.78, 0],    fov: 36 },
  hair:            { pos: [0.25, 2.25, 1.9],    target: [0,     1.78, 0],    fov: 36 },
  face:            { pos: [0.1,  2.05, 1.65],   target: [0,     1.78, 0],    fov: 34 },
  jacket:          { pos: [0.3,  1.55, 2.8],    target: [0,     1.25, 0],    fov: 40 },
  pants:           { pos: [0,    0.95, 2.6],    target: [0,     0.70, 0],    fov: 40 },
  shoes:           { pos: [0,    0.36, 2.0],    target: [0,     0.06, 0],    fov: 38 },
  weapon_cosmetic: { pos: [0.9,  1.42, 2.7],   target: [0.35,  1.30, 0],    fov: 40 },
  shield_cosmetic: { pos: [-0.9, 1.42, 2.7],   target: [-0.35, 1.30, 0],    fov: 40 },
  pet:             { pos: [0.4,  0.75, 2.8],    target: [0,     0.30, 0],    fov: 40 },
  ring:            { pos: [0,    1.35, 4.0],    target: [0,     0.88, 0],    fov: 42 },
  amulet:          { pos: [0,    1.50, 3.6],    target: [0,     1.15, 0],    fov: 40 },
  aura:            { pos: [0,    1.30, 4.5],    target: [0,     0.88, 0],    fov: 42 },
  trail:           { pos: [0,    1.00, 4.2],    target: [0,     0.55, 0],    fov: 42 },
};

const DEFAULT_CAM: CamCfg = { pos: [0, 1.35, 4.0], target: [0, 0.88, 0], fov: 42 };

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

/**
 * Renders one slot of drei's shared View system.
 *
 * All ShopCharacterViews in the shop share a single underlying WebGL Canvas
 * (mounted once in ShopShell via <View.Port>). This bypasses the ~16-context
 * browser limit that caused cards to go white when they each had their own
 * <Canvas>. Each View is just a div; drei scissor-tests its content into the
 * shared canvas at that div's viewport position.
 */
export function ShopCharacterView({
  item,
  gender,
  viewIndex,
  visible = true,
}: {
  item: ItemForPreview;
  gender: "m" | "w";
  /** Stable, unique 0-based index within the shop listing array. */
  viewIndex: number;
  visible?: boolean;
}) {
  const cam = CAMS[item.type] ?? DEFAULT_CAM;

  const equippedByCategory: Record<string, EquippedItem | undefined> = {
    [item.type]: {
      id: item.id,
      name: item.name,
      rarity: item.rarity as EquippedItem["rarity"],
      damage: item.damage,
      armor: item.armor,
      perk_type: item.perk_type as EquippedItem["perk_type"],
      perk_magnitude: item.perk_magnitude,
      shield_hp: item.shield_hp,
      shield_regen_cooldown_sec: item.shield_regen_cooldown_sec,
    },
  };

  return (
    <View
      index={viewIndex + 1}
      visible={visible}
      style={{ width: "100%", height: "100%" }}
    >
      <PerspectiveCamera makeDefault position={cam.pos} fov={cam.fov} />
      <color attach="background" args={["#08050f"]} />

      <ambientLight intensity={0.65} color="#a78bfa" />
      <directionalLight position={[3, 5, 3]} intensity={1.2} />
      <pointLight position={[-3, 2, -2]} intensity={10} color="#8b5cf6" />
      <pointLight position={[0, 3, 2]} intensity={4} color="#ffffff" />

      <Suspense fallback={null}>
        <group position={[0, -1.3, 0]}>
          <CharacterModel equippedByCategory={equippedByCategory} gender={gender} />
        </group>
        <ContactShadows
          position={[0, -1.3, 0]}
          opacity={0.5}
          scale={4}
          blur={2.5}
          far={3}
        />
      </Suspense>

      <OrbitControls
        target={cam.target}
        enablePan={false}
        minDistance={1.4}
        maxDistance={6}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.85}
        autoRotate
        autoRotateSpeed={2.2}
      />
    </View>
  );
}
