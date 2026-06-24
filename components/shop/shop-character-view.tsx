"use client";

import { Suspense } from "react";
import { View, PerspectiveCamera, OrbitControls, ContactShadows } from "@react-three/drei";
import { CharacterModel } from "@/components/world/character-model";
import type { EquippedItem } from "@/lib/rarity-colors";

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

// Single full-body camera — character is offset to world y = -1.3 (feet) … +0.5 (head).
// Positioned slightly above center, looking at character mid-body. The canvas has alpha:true
// so the card's own dark gradient shows through wherever no mesh renders.
const CAM_POS: [number, number, number] = [0, 0.15, 3.4];
const CAM_TARGET: [number, number, number] = [0, -0.28, 0];
const CAM_FOV = 52;

export function ShopCharacterView({
  item,
  gender,
  viewIndex,
  visible = true,
}: {
  item: ItemForPreview;
  gender: "m" | "w";
  viewIndex: number;
  visible?: boolean;
}) {
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
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
    >
      <PerspectiveCamera makeDefault position={CAM_POS} fov={CAM_FOV} />

      {/* No <color background> — canvas alpha:true means non-mesh pixels are fully
          transparent, so the card's own gradient background shows through cleanly.
          This also ensures stat-badge tooltips and the "Vollansicht" hint remain
          visible wherever the character mesh doesn't cover them. */}

      <ambientLight intensity={0.7} color="#c4b5fd" />
      <directionalLight position={[2, 4, 3]} intensity={1.3} color="#ffffff" />
      <pointLight position={[-2.5, 2, -1.5]} intensity={12} color="#7c3aed" />
      <pointLight position={[1.5, 3.5, 2]} intensity={5} color="#ede9fe" />

      <Suspense fallback={null}>
        <group position={[0, -1.3, 0]}>
          <CharacterModel equippedByCategory={equippedByCategory} gender={gender} />
        </group>
        <ContactShadows
          position={[0, -1.3, 0]}
          opacity={0.45}
          scale={3.5}
          blur={2.2}
          far={2.5}
        />
      </Suspense>

      <OrbitControls
        target={CAM_TARGET}
        enablePan={false}
        minDistance={2.0}
        maxDistance={6.0}
        minPolarAngle={Math.PI / 8}
        maxPolarAngle={Math.PI / 2}
        autoRotate
        autoRotateSpeed={2.5}
      />
    </View>
  );
}
