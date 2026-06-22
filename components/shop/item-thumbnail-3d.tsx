"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { CharacterModel } from "@/components/world/character-model";
import type { EquippedItem } from "@/lib/rarity-colors";
import type { Rarity } from "@/lib/cases";

interface ItemThumbnail3DProps {
  item: { id: string; name: string; rarity: Rarity; type: string; damage?: number | null };
  gender: "m" | "w";
  onClick?: () => void;
}

const ROTATE_SPEED = 0.45; // rad/sec — slow, deliberate turntable, not a spin

/** Starting yaw per slot, radians — CharacterModel's front (the face, at
 * local +Z) already faces the default camera dead-on, which is exactly
 * right for anything worn on the head/torso/legs/feet. A weapon/shield/
 * ring sits specifically on the character's *right* arm (lib/world-
 * config.ts's BUILD.armX), which is the viewer's left when facing them
 * head-on — starting turned ~30° toward that side means the very first
 * frame already shows the item instead of starting back-on to it. The
 * continuous slow spin below still cycles through every angle either
 * way; this only decides where that cycle *starts*. */
function startingYaw(itemType: string): number {
  if (itemType === "weapon_cosmetic" || itemType === "shield_cosmetic" || itemType === "ring") {
    return -0.55;
  }
  return 0;
}

function TurntableCharacter({
  equippedByCategory,
  gender,
  itemType,
}: {
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  itemType: string;
}) {
  const group = useRef<THREE.Group>(null);
  const yaw = useRef(startingYaw(itemType));

  useFrame((_, delta) => {
    yaw.current += delta * ROTATE_SPEED;
    if (group.current) group.current.rotation.y = yaw.current;
  });

  return (
    <group ref={group} position={[0, -1.3, 0]}>
      <CharacterModel equippedByCategory={equippedByCategory} gender={gender} />
    </group>
  );
}

/**
 * Always-on, no-click-required 3D preview embedded directly in every shop
 * card — the same "this one item on an otherwise naked, gender-matched
 * character" render as the Garderobe's solo preview modal (components/
 * wardrobe/item-preview-modal.tsx), just small and automatic instead of
 * hidden behind an Eye button. Continuously rendered (not `frameloop=
 * "demand"`, which renders exactly once and then sits frozen — looked
 * stuck, not "alive") with a slow auto-turntable so the equipped item is
 * always shown from every angle within a few seconds, not just whichever
 * single angle happened to render once. Clicking it still opens the
 * bigger interactive (zoomable, user-rotatable) modal.
 */
export function ItemThumbnail3D({ item, gender, onClick }: ItemThumbnail3DProps) {
  const equippedByCategory: Record<string, EquippedItem | undefined> = {
    [item.type]: { id: item.id, name: item.name, rarity: item.rarity, damage: item.damage },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title="Klicken für große Vorschau"
      className="group block h-36 w-full overflow-hidden rounded-xl border border-white/10 bg-[#08050f] transition-colors hover:border-purple-400/40"
    >
      {/* Explicit shadow map type — see components/world/world-shell.tsx's
          matching comment for why (the bare `shadows` shorthand's default
          type is deprecated and spams a console warning per shadow pass). */}
      <Canvas dpr={[1, 1.5]} shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 1.5, 3.4], fov: 40 }}>
        <Suspense fallback={null}>
          <color attach="background" args={["#08050f"]} />
          <ambientLight intensity={0.65} color="#a78bfa" />
          <directionalLight position={[3, 5, 3]} intensity={1.1} castShadow />
          <pointLight position={[-3, 2, -2]} intensity={9} color="#8b5cf6" />

          <TurntableCharacter equippedByCategory={equippedByCategory} gender={gender} itemType={item.type} />

          <ContactShadows position={[0, -1.3, 0]} opacity={0.5} scale={4} blur={2} far={3} />
        </Suspense>
      </Canvas>
    </button>
  );
}
