"use client";

import { Grid, Stars, ContactShadows } from "@react-three/drei";
import { Player } from "@/components/world/player";
import { Environment } from "@/components/world/environment";
import type { CameraControls } from "@/components/world/use-camera-controls";
import type { EquippedItem } from "@/lib/rarity-colors";

interface SceneProps {
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  username: string;
  cameraControls: CameraControls;
}

export function Scene({ equippedByCategory, gender, username, cameraControls }: SceneProps) {
  return (
    <>
      <color attach="background" args={["#050108"]} />
      <fog attach="fog" args={["#0b0314", 10, 42]} />

      <ambientLight intensity={0.55} color="#a78bfa" />
      <directionalLight position={[5, 8, 4]} intensity={1.1} color="#ffffff" castShadow />
      <pointLight position={[-6, 3, -4]} intensity={18} color="#8b5cf6" />
      <pointLight position={[6, 3, 6]} intensity={14} color="#3b82f6" />

      <Stars radius={60} depth={30} count={1200} factor={2} fade speed={0.6} />

      {/* base ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[45, 64]} />
        <meshStandardMaterial color="#0b0314" />
      </mesh>

      {/* soft purple "glow pool" under the spawn area, for depth */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]}>
        <circleGeometry args={[14, 64]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.1} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[6, 48]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.12} toneMapped={false} />
      </mesh>

      <Grid
        position={[0, 0, 0]}
        args={[60, 60]}
        cellColor="#4c3680"
        sectionColor="#a855f7"
        cellThickness={0.6}
        sectionThickness={1.4}
        cellSize={1}
        sectionSize={5}
        fadeDistance={42}
        fadeStrength={1.5}
        infiniteGrid
      />

      <Environment />

      <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={12} blur={2.2} far={4} />

      <Player
        equippedByCategory={equippedByCategory}
        gender={gender}
        name={username}
        cameraControls={cameraControls}
      />
    </>
  );
}
