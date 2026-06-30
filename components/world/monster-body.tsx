"use client";

import * as THREE from "three";
import { Billboard } from "@react-three/drei";
import { TextSprite } from "@/components/world/text-sprite";
import type { MonsterTypeConfig } from "@/lib/monsters";

// ─────────────────────────────────────────────────────────────────────────────
// GETEILTES Monster-Modell — eine einzige Quelle für lokale (monster.tsx) und
// Remote-Monster (remote-monster.tsx), damit jedes Monster für ALLE Spieler
// identisch aussieht und Modell-Upgrades nur an EINER Stelle passieren. Die
// Animation bleibt in den jeweiligen Parents (sie animieren die übergebenen
// Refs); hier liegt nur die Geometrie/Optik.
// ─────────────────────────────────────────────────────────────────────────────

/** Waffe in der rechten Hand (Skelett-Knochen / Dämonen-Glefe / Keule). */
export function MonsterWeapon({ kind, color }: { kind: "skeleton" | "demon" | "club"; color: string }) {
  if (kind === "skeleton") {
    return (
      <group position={[0, -0.78, 0.1]}>
        <mesh castShadow>
          <boxGeometry args={[0.05, 0.5, 0.05]} />
          <meshStandardMaterial color="#e8e4d8" />
        </mesh>
        <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.05, 0.2, 0.05]} />
          <meshStandardMaterial color="#9c958a" />
        </mesh>
      </group>
    );
  }
  if (kind === "demon") {
    return (
      <group position={[0, -0.88, 0.1]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.65, 6]} />
          <meshStandardMaterial color="#2a1010" metalness={0.3} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.4, 0]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[0.09, 0.32, 4]} />
          <meshStandardMaterial color="#7a1020" emissive="#7a1020" emissiveIntensity={0.6} metalness={0.4} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[0, -0.78, 0.08]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.04, 0.1, 0.55, 8]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* dicker Keulenkopf mit Stacheln */}
      <mesh position={[0, 0.32, 0]} castShadow>
        <icosahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial color={color} roughness={0.7} flatShading />
      </mesh>
    </group>
  );
}

export interface MonsterBodyRefs {
  upperBody: React.RefObject<THREE.Group | null>;
  legL: React.RefObject<THREE.Group | null>;
  legR: React.RefObject<THREE.Group | null>;
  armL: React.RefObject<THREE.Group | null>;
  armR: React.RefObject<THREE.Group | null>;
  torsoMaterial: React.RefObject<THREE.MeshStandardMaterial | null>;
  healthFill: React.RefObject<THREE.Mesh | null>;
  healthGroup: React.RefObject<THREE.Group | null>;
  auraRef: React.RefObject<THREE.Mesh | null>;
  spawnRingRef: React.RefObject<THREE.Mesh | null>;
}

/** Glühendes Augenpaar — größer & heller als zuvor (mehr Bedrohung). */
function Eyes({ color, y, z, spread, r }: { color: string; y: number; z: number; spread: number; r: number }) {
  return (
    <>
      {[-spread, spread].map((x) => (
        <mesh key={x} position={[x, y, z]}>
          <sphereGeometry args={[r, 10, 10]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.0} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

export function MonsterBody({
  type,
  nameColor,
  refs,
}: {
  type: MonsterTypeConfig;
  /** Farbe des Namensschilds (lokal hell, remote lila). */
  nameColor: string;
  refs: MonsterBodyRefs;
}) {
  const isSlime = type.visualKind === "slime";
  const isGhost = type.visualKind === "ghost";
  const isOrc = type.visualKind === "orc";
  const isDemon = type.visualKind === "demon";
  const isSkeleton = type.visualKind === "skeleton";
  const limbWidth = isSkeleton ? 0.16 : isOrc ? 0.3 : isDemon ? 0.27 : 0.22;
  const bodyOpacity = isGhost ? 0.5 : 1;
  const eyeColor =
    isSkeleton ? "#7dd3fc"
    : isGhost ? "#e0f2fe"
    : isDemon ? "#ff2424"
    : isOrc ? "#fbbf24"
    : isSlime ? "#dcfce7"
    : "#fca5a5";

  const tier = type.health >= 200 ? 2 : type.health >= 100 ? 1 : 0;
  const auraColor = tier === 2 ? "#ef4444" : tier === 1 ? "#f59e0b" : eyeColor;
  const auraOuter = 0.55 + tier * 0.2;
  const auraOpacity = 0.16 + tier * 0.1;
  // Schulter-Spikes für gefährlichere Gegner (Ork/Dämon oder ab mittlerem Tier).
  const spikes = !isSlime && !isGhost && (isOrc || isDemon || tier >= 1);
  const spikeColor = isDemon ? "#15100f" : isOrc ? "#2b3315" : "#3a3a3a";

  return (
    <>
      {/* Gefahr-Aura am Boden (nicht für schwebende Geister) */}
      {!isGhost && (
        <mesh ref={refs.auraRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[auraOuter - 0.13, auraOuter, 36]} />
          <meshBasicMaterial color={auraColor} transparent opacity={auraOpacity} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Spawn-Schockwelle */}
      <mesh ref={refs.spawnRingRef} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[0.42, 0.58, 32]} />
        <meshBasicMaterial color={auraColor} transparent opacity={0} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>

      {isSlime ? (
        <group ref={refs.upperBody} position={[0, 0.42, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.42, 18, 14]} />
            <meshStandardMaterial
              ref={refs.torsoMaterial}
              color={type.colorHex}
              transparent
              opacity={0.82}
              roughness={0.15}
              emissive={type.colorHex}
              emissiveIntensity={0.2}
            />
          </mesh>
          {/* glühender Kern im Inneren */}
          <mesh position={[0, -0.02, 0]}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshBasicMaterial color={eyeColor} transparent opacity={0.6} toneMapped={false} />
          </mesh>
          <Eyes color={eyeColor} y={0.08} z={0.34} spread={0.13} r={0.06} />
        </group>
      ) : (
        <>
          <group ref={refs.upperBody} position={[0, 1.1, 0]}>
            <mesh position={[0, 0.4, 0]} castShadow>
              <boxGeometry args={[0.5, 0.7, 0.3]} />
              <meshStandardMaterial ref={refs.torsoMaterial} color={type.colorHex} transparent={isGhost} opacity={bodyOpacity} />
            </mesh>
            {/* glühender Brust-Kern → Mobs wirken „beseelt"/bedrohlich */}
            {!isGhost && (
              <mesh position={[0, 0.42, 0.16]}>
                <sphereGeometry args={[0.075, 10, 10]} />
                <meshBasicMaterial color={eyeColor} transparent opacity={0.85} toneMapped={false} />
              </mesh>
            )}
            <mesh position={[0, 0.95, 0]} castShadow>
              <boxGeometry args={[0.34, 0.34, 0.34]} />
              <meshStandardMaterial color={type.colorHex} transparent={isGhost} opacity={bodyOpacity} />
            </mesh>
            <Eyes color={eyeColor} y={0.97} z={0.18} spread={0.07} r={0.048} />

            {/* Schulter-Spikes (gefährliche Silhouette) */}
            {spikes && (
              <>
                <mesh position={[-0.26, 0.62, 0]} rotation={[0, 0, 0.5]} castShadow>
                  <coneGeometry args={[0.07, 0.26, 6]} />
                  <meshStandardMaterial color={spikeColor} flatShading />
                </mesh>
                <mesh position={[0.26, 0.62, 0]} rotation={[0, 0, -0.5]} castShadow>
                  <coneGeometry args={[0.07, 0.26, 6]} />
                  <meshStandardMaterial color={spikeColor} flatShading />
                </mesh>
              </>
            )}

            {/* Ork: Hauer */}
            {isOrc && (
              <>
                <mesh position={[-0.08, 0.86, 0.19]} rotation={[0.35, 0, 0]} castShadow>
                  <coneGeometry args={[0.03, 0.14, 6]} />
                  <meshStandardMaterial color="#f5f5f4" />
                </mesh>
                <mesh position={[0.08, 0.86, 0.19]} rotation={[0.35, 0, 0]} castShadow>
                  <coneGeometry args={[0.03, 0.14, 6]} />
                  <meshStandardMaterial color="#f5f5f4" />
                </mesh>
              </>
            )}

            {/* Dämonenfürst: Hörner + Membran-Flügel */}
            {isDemon && (
              <>
                <mesh position={[-0.1, 1.14, 0.06]} rotation={[0.25, 0, -0.35]} castShadow>
                  <coneGeometry args={[0.045, 0.24, 6]} />
                  <meshStandardMaterial color="#15100f" />
                </mesh>
                <mesh position={[0.1, 1.14, 0.06]} rotation={[0.25, 0, 0.35]} castShadow>
                  <coneGeometry args={[0.045, 0.24, 6]} />
                  <meshStandardMaterial color="#15100f" />
                </mesh>
                <mesh position={[-0.4, 0.42, -0.12]} rotation={[0, 0.35, 0.55]}>
                  <boxGeometry args={[0.55, 0.5, 0.025]} />
                  <meshStandardMaterial color="#3f0a0a" emissive="#7a1020" emissiveIntensity={0.5} transparent opacity={0.82} side={THREE.DoubleSide} />
                </mesh>
                <mesh position={[0.4, 0.42, -0.12]} rotation={[0, -0.35, -0.55]}>
                  <boxGeometry args={[0.55, 0.5, 0.025]} />
                  <meshStandardMaterial color="#3f0a0a" emissive="#7a1020" emissiveIntensity={0.5} transparent opacity={0.82} side={THREE.DoubleSide} />
                </mesh>
              </>
            )}

            <group ref={refs.armL} position={[-0.32, 0.65, 0]}>
              <mesh position={[0, -0.32, 0]} castShadow>
                <boxGeometry args={[limbWidth, 0.62, limbWidth]} />
                <meshStandardMaterial color={type.colorHex} transparent={isGhost} opacity={bodyOpacity} />
              </mesh>
            </group>
            <group ref={refs.armR} position={[0.32, 0.65, 0]}>
              <mesh position={[0, -0.32, 0]} castShadow>
                <boxGeometry args={[limbWidth, 0.62, limbWidth]} />
                <meshStandardMaterial color={type.colorHex} transparent={isGhost} opacity={bodyOpacity} />
              </mesh>
              {type.hasWeapon && (
                <MonsterWeapon kind={isDemon ? "demon" : isSkeleton ? "skeleton" : "club"} color={isOrc ? "#3f4a26" : "#4a3a28"} />
              )}
            </group>
          </group>

          {isGhost ? (
            <mesh position={[0, 0.5, 0]}>
              <coneGeometry args={[0.4, 1.05, 14]} />
              <meshStandardMaterial color={type.colorHex} transparent opacity={0.38} emissive={type.colorHex} emissiveIntensity={0.25} side={THREE.DoubleSide} />
            </mesh>
          ) : (
            <>
              <group ref={refs.legL} position={[-0.15, 0.85, 0]}>
                <mesh position={[0, -0.42, 0]} castShadow>
                  <boxGeometry args={[limbWidth + 0.02, 0.85, limbWidth + 0.02]} />
                  <meshStandardMaterial color={type.colorHex} />
                </mesh>
              </group>
              <group ref={refs.legR} position={[0.15, 0.85, 0]}>
                <mesh position={[0, -0.42, 0]} castShadow>
                  <boxGeometry args={[limbWidth + 0.02, 0.85, limbWidth + 0.02]} />
                  <meshStandardMaterial color={type.colorHex} />
                </mesh>
              </group>
            </>
          )}
        </>
      )}

      <Billboard ref={refs.healthGroup} position={[0, isSlime ? 1.15 : 2.35, 0]}>
        <mesh>
          <planeGeometry args={[1, 0.12]} />
          <meshBasicMaterial color="#1a1a1a" transparent opacity={0.85} />
        </mesh>
        <mesh ref={refs.healthFill} position={[0, 0, 0.001]}>
          <planeGeometry args={[1, 0.1]} />
          <meshBasicMaterial color="#4ade80" toneMapped={false} />
        </mesh>
        <TextSprite text={type.name} position={[0, 0.22, 0]} height={0.18} color={nameColor} outline="#000000" />
      </Billboard>
    </>
  );
}
