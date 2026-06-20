"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RARITY_HEX, rarityColorFor, type EquippedItem } from "@/lib/rarity-colors";
import { useKeyboardControls } from "@/components/world/use-keyboard-controls";

interface PlayerProps {
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
}

const SPEED = 4.5;
const SKIN = "#caa472";

/**
 * Low-poly box character — the 3D counterpart of components/avatar/
 * avatar-renderer.tsx. Same idea, same data (`equippedByCategory`), same
 * rarity color table (lib/rarity-colors.ts): every equipped slot just tints
 * a primitive mesh instead of an SVG polygon, so the character looks
 * consistent between the Garderobe preview and the 3D World.
 */
export function Player({ equippedByCategory, gender }: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const keys = useKeyboardControls();
  const { camera } = useThree();

  const velocity = useRef(new THREE.Vector3());
  const walkClock = useRef(0);

  const hat = equippedByCategory.hat;
  const hair = equippedByCategory[gender === "m" ? "hair_m" : "hair_f"];
  const jacket = equippedByCategory.jacket;
  const pants = equippedByCategory.pants;
  const shoes = equippedByCategory.shoes;
  const aura = equippedByCategory.aura;
  const weapon = equippedByCategory.weapon_cosmetic;
  const pet = equippedByCategory.pet;

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;

    const dir = new THREE.Vector3(
      (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0),
      0,
      (keys.current.backward ? 1 : 0) - (keys.current.forward ? 1 : 0)
    );
    const moving = dir.lengthSq() > 0;

    if (moving) {
      dir.normalize();
      velocity.current.lerp(dir.multiplyScalar(SPEED), 0.25);
      g.position.addScaledVector(velocity.current, delta);

      const targetAngle = Math.atan2(velocity.current.x, velocity.current.z);
      g.rotation.y = THREE.MathUtils.lerp(
        g.rotation.y,
        targetAngle,
        Math.min(1, delta * 10)
      );

      walkClock.current += delta * 8;
    } else {
      velocity.current.lerp(new THREE.Vector3(), 0.3);
      walkClock.current = THREE.MathUtils.lerp(walkClock.current % (Math.PI * 2), 0, 0.2);
    }

    const swing = Math.sin(walkClock.current) * (moving ? 0.5 : 0);
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing;
    if (armR.current) armR.current.rotation.x = swing;
    g.position.y = moving ? Math.abs(Math.sin(walkClock.current * 2)) * 0.04 : 0;

    // Third-person follow camera: fixed offset behind+above, smoothed.
    const camTarget = new THREE.Vector3(
      g.position.x,
      g.position.y + 2.6,
      g.position.z + 6
    );
    camera.position.lerp(camTarget, Math.min(1, delta * 4));
    camera.lookAt(g.position.x, g.position.y + 1, g.position.z);
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      {/* aura: soft glowing ring at the feet */}
      {aura && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[0.7, 1, 32]} />
          <meshBasicMaterial
            color={RARITY_HEX[aura.rarity]}
            transparent
            opacity={0.55}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* legs */}
      <mesh ref={legL} position={[-0.18, 0.5, 0]}>
        <boxGeometry args={[0.28, 1, 0.28]} />
        <meshStandardMaterial color={rarityColorFor(pants, "#1e3a8a")} />
      </mesh>
      <mesh ref={legR} position={[0.18, 0.5, 0]}>
        <boxGeometry args={[0.28, 1, 0.28]} />
        <meshStandardMaterial color={rarityColorFor(pants, "#1e3a8a")} />
      </mesh>

      {/* shoes */}
      <mesh position={[-0.18, 0.06, 0.08]}>
        <boxGeometry args={[0.3, 0.16, 0.4]} />
        <meshStandardMaterial color={rarityColorFor(shoes, "#1e293b")} />
      </mesh>
      <mesh position={[0.18, 0.06, 0.08]}>
        <boxGeometry args={[0.3, 0.16, 0.4]} />
        <meshStandardMaterial color={rarityColorFor(shoes, "#1e293b")} />
      </mesh>

      {/* torso */}
      <mesh position={[0, 1.35, 0]}>
        <boxGeometry args={[0.7, 0.8, 0.4]} />
        <meshStandardMaterial color={rarityColorFor(jacket, "#0e7490")} />
      </mesh>

      {/* arms */}
      <mesh ref={armL} position={[-0.48, 1.35, 0]}>
        <boxGeometry args={[0.22, 0.75, 0.22]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>
      <mesh ref={armR} position={[0.48, 1.35, 0]}>
        <boxGeometry args={[0.22, 0.75, 0.22]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>

      {/* head */}
      <mesh position={[0, 2.05, 0]}>
        <boxGeometry args={[0.55, 0.55, 0.55]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>

      {/* hair (under the hat) */}
      {hair && (
        <mesh position={[0, 2.28, -0.05]}>
          <boxGeometry args={[0.58, 0.18, 0.58]} />
          <meshStandardMaterial color={rarityColorFor(hair, "#404040")} />
        </mesh>
      )}

      {/* hat */}
      {hat && (
        <mesh position={[0, 2.42, 0]}>
          <boxGeometry args={[0.62, 0.22, 0.62]} />
          <meshStandardMaterial color={rarityColorFor(hat, "#6d28d9")} />
        </mesh>
      )}

      {/* weapon, held at the right hand */}
      {weapon && (
        <mesh position={[0.6, 1.1, 0.3]} rotation={[0, 0, Math.PI / 5]}>
          <boxGeometry args={[0.08, 0.9, 0.08]} />
          <meshStandardMaterial
            color={rarityColorFor(weapon, "#e5e7eb")}
            emissive={rarityColorFor(weapon, "#000000")}
            emissiveIntensity={0.3}
          />
        </mesh>
      )}

      {/* pet companion */}
      {pet && (
        <mesh position={[0.9, 0.4, 0.6]}>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color={rarityColorFor(pet, "#a855f7")} />
        </mesh>
      )}
    </group>
  );
}
