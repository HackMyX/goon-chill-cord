"use client";

import { Grid, Stars } from "@react-three/drei";
import { Player } from "@/components/world/player";
import type { EquippedItem } from "@/lib/rarity-colors";

interface SceneProps {
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
}

export function Scene({ equippedByCategory, gender }: SceneProps) {
  return (
    <>
      <color attach="background" args={["#050108"]} />
      <fog attach="fog" args={["#0b0314", 8, 38]} />

      <ambientLight intensity={0.55} color="#a78bfa" />
      <directionalLight position={[5, 8, 4]} intensity={1.1} color="#ffffff" />
      <pointLight position={[-6, 3, -4]} intensity={18} color="#8b5cf6" />
      <pointLight position={[6, 3, 6]} intensity={14} color="#3b82f6" />

      <Stars radius={60} depth={30} count={1200} factor={2} fade speed={0.6} />

      <Grid
        position={[0, 0, 0]}
        args={[60, 60]}
        cellColor="#3b2a5e"
        sectionColor="#8b5cf6"
        cellSize={1}
        sectionSize={5}
        fadeDistance={40}
        infiniteGrid
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[40, 48]} />
        <meshStandardMaterial color="#0b0314" />
      </mesh>

      <Player equippedByCategory={equippedByCategory} gender={gender} />
    </>
  );
}
