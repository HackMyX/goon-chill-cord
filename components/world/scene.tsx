"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Sky, Stars, ContactShadows } from "@react-three/drei";
import { Player } from "@/components/world/player";
import { Environment } from "@/components/world/environment";
import { WORLD_RADIUS } from "@/lib/world-config";
import type { CameraControls } from "@/components/world/use-camera-controls";
import type { EquippedItem } from "@/lib/rarity-colors";

interface SceneProps {
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  username: string;
  cameraControls: CameraControls;
}

/** A slow pulse on the world-border ring — purely decorative, but it's what
 * keeps the edge of the world from reading as a flat, dead line and ties it
 * visually to the glowing border crystals in environment.tsx. */
function BorderRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const mat = ref.current?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.opacity = 0.35 + Math.sin(state.clock.elapsedTime * 0.8) * 0.12;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <ringGeometry args={[WORLD_RADIUS - 0.6, WORLD_RADIUS, 96]} />
      <meshBasicMaterial color="#a855f7" transparent opacity={0.4} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function Scene({ equippedByCategory, gender, username, cameraControls }: SceneProps) {
  return (
    <>
      {/* Dusk sky — sun held low near the horizon (rather than drei's Sky
          default midday look) so it reads as a moody purple/orange evening
          instead of a bright cartoon-blue day, matching the rest of the
          site's neon-purple branding. The existing starfield then sits
          believably in the darker upper half of that gradient. */}
      <Sky
        distance={450000}
        sunPosition={[-40, 6, -60]}
        turbidity={14}
        rayleigh={1.4}
        mieCoefficient={0.012}
        mieDirectionalG={0.92}
      />
      <fog attach="fog" args={["#170f2b", 18, WORLD_RADIUS + 18]} />

      <ambientLight intensity={0.6} color="#a78bfa" />
      <directionalLight position={[-20, 25, -30]} intensity={1.2} color="#ffd9b3" castShadow />
      <pointLight position={[-6, 3, -4]} intensity={18} color="#8b5cf6" />
      <pointLight position={[6, 3, 6]} intensity={14} color="#3b82f6" />

      <Stars radius={120} depth={50} count={2200} factor={2.4} fade speed={0.5} />

      {/* grass ground, sized to the actual playable world radius — two
          overlapping tones instead of one flat fill so it doesn't read as
          a single dead-flat color from above */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <circleGeometry args={[WORLD_RADIUS, 96]} />
        <meshStandardMaterial color="#2c5530" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <circleGeometry args={[WORLD_RADIUS * 0.62, 80]} />
        <meshStandardMaterial color="#316438" transparent opacity={0.55} />
      </mesh>

      {/* soft purple "glow pool" under the spawn area, for depth/magic feel */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]}>
        <circleGeometry args={[14, 64]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.08} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[6, 48]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.1} toneMapped={false} />
      </mesh>

      <BorderRing />

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
