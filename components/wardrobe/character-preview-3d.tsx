"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { CharacterModel } from "@/components/world/character-model";
import type { EquippedItem } from "@/lib/rarity-colors";

interface CharacterPreview3DProps {
  gender: "m" | "w";
  equippedByCategory: Record<string, EquippedItem | undefined>;
}

/**
 * Garderobe's character panel — renders the exact same CharacterModel used
 * by the 3D World (components/world/character-model.tsx), just static and
 * orbit-controlled instead of WASD-driven. Equipping an item here changes
 * precisely what you then see walking around in /world, because both
 * consume identical equip data through the same component.
 */
export function CharacterPreview3D({ gender, equippedByCategory }: CharacterPreview3DProps) {
  return (
    <div className="mx-auto mt-6 h-72 w-full overflow-hidden rounded-xl border border-white/10 bg-[#08050f]">
      <Canvas shadows camera={{ position: [0, 1.6, 3.6], fov: 42 }}>
        <Suspense fallback={null}>
          <color attach="background" args={["#08050f"]} />
          <ambientLight intensity={0.6} color="#a78bfa" />
          <directionalLight position={[3, 5, 3]} intensity={1.1} castShadow />
          <pointLight position={[-3, 2, -2]} intensity={10} color="#8b5cf6" />

          <group position={[0, -1.3, 0]}>
            <CharacterModel equippedByCategory={equippedByCategory} gender={gender} />
          </group>

          <ContactShadows position={[0, -1.3, 0]} opacity={0.5} scale={4} blur={2} far={3} />

          <OrbitControls
            target={[0, 0.1, 0]}
            enablePan={false}
            minDistance={2.2}
            maxDistance={5}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 1.9}
            autoRotate
            autoRotateSpeed={1.2}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
