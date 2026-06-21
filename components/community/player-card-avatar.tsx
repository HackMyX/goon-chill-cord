"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { CharacterModel } from "@/components/world/character-model";
import type { EquippedItem } from "@/lib/rarity-colors";

interface PlayerCardAvatarProps {
  gender: "m" | "w";
  equippedByCategory: Record<string, EquippedItem | undefined>;
}

function SlowSpin({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.5;
  });
  return <group ref={ref}>{children}</group>;
}

/**
 * Cheap per-card 3D preview for the Community player list — no shadows, no
 * OrbitControls, a fixed camera, and only a basic two-light setup, since
 * a whole grid of these can be on screen at once (unlike the one-at-a-time
 * Garderobe preview / profile-modal canvases). The slow self-rotation
 * gives it some life without needing the viewer to interact with each
 * card individually.
 */
export function PlayerCardAvatar({ gender, equippedByCategory }: PlayerCardAvatarProps) {
  return (
    <Canvas dpr={1} camera={{ position: [0, 1.5, 3.3], fov: 40 }}>
      <Suspense fallback={null}>
        <color attach="background" args={["#08050f"]} />
        <ambientLight intensity={0.7} color="#a78bfa" />
        <directionalLight position={[2, 4, 3]} intensity={1} />
        <SlowSpin>
          <group position={[0, -1.3, 0]}>
            <CharacterModel equippedByCategory={equippedByCategory} gender={gender} />
          </group>
        </SlowSpin>
      </Suspense>
    </Canvas>
  );
}
