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
  const isGolem = type.visualKind === "golem";
  const isSpider = type.visualKind === "spider";
  const isImp = type.visualKind === "imp";
  const isBat = type.visualKind === "bat";
  const isWisp = type.visualKind === "wisp";
  const isBrute = type.visualKind === "brute";
  const isReaper = type.visualKind === "reaper";
  const limbWidth = isSkeleton ? 0.16 : isOrc ? 0.3 : isDemon ? 0.27 : 0.22;
  const bodyOpacity = isGhost ? 0.5 : 1;
  const eyeColor =
    isSkeleton ? "#7dd3fc"
    : isGhost ? "#e0f2fe"
    : isDemon ? "#ff2424"
    : isOrc ? "#fbbf24"
    : isSlime ? "#dcfce7"
    : isGolem ? "#f59e0b"
    : isSpider ? "#ef4444"
    : isImp ? "#fde047"
    : isBat ? "#f87171"
    : isWisp ? "#e0f2fe"
    : isReaper ? "#a855f7"
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
      ) : isSpider ? (
        // Spinne: flacher Doppel-Körper (Hinterleib + Vorderleib) auf upperBody
        // (damit Lunge-Neigung/Atmen greifen) + 8 abgewinkelte Beine + Augen-
        // Cluster + Reißzähne. Keine legL/R/armL/R (Parent guard'd).
        <group ref={refs.upperBody} position={[0, 0.52, 0]}>
          <mesh position={[0, 0, -0.26]} castShadow>
            <sphereGeometry args={[0.36, 16, 12]} />
            <meshStandardMaterial ref={refs.torsoMaterial} color={type.colorHex} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.16]} castShadow>
            <sphereGeometry args={[0.24, 14, 10]} />
            <meshStandardMaterial color={type.colorHex} roughness={0.5} />
          </mesh>
          {/* Augen-Cluster (6 kleine glühende Augen) */}
          {[[-0.09, 0.07], [0.09, 0.07], [-0.05, 0.12], [0.05, 0.12], [-0.12, 0.0], [0.12, 0.0]].map(([ex, ey], i) => (
            <mesh key={i} position={[ex, ey, 0.36]}>
              <sphereGeometry args={[0.028, 8, 8]} />
              <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={2.2} toneMapped={false} />
            </mesh>
          ))}
          {/* Reißzähne */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.06, -0.12, 0.34]} rotation={[0.7, 0, 0]} castShadow>
              <coneGeometry args={[0.025, 0.12, 6]} />
              <meshStandardMaterial color="#e5e7eb" />
            </mesh>
          ))}
          {/* 8 Beine — 4 je Seite, gestaffelt, abgewinkelt nach außen/unten */}
          {[-1, 1].map((side) =>
            [0, 1, 2, 3].map((i) => (
              <group key={`${side}-${i}`} position={[side * 0.18, 0.02, 0.2 - i * 0.16]} rotation={[0, 0, side * (0.9 - i * 0.08)]}>
                <mesh position={[side * 0.28, -0.02, 0]} castShadow>
                  <cylinderGeometry args={[0.02, 0.015, 0.58, 6]} />
                  <meshStandardMaterial color={type.colorHex} roughness={0.7} />
                </mesh>
              </group>
            )),
          )}
        </group>
      ) : isBat ? (
        // Fledermaus: kleiner Körper + 2 große Flügel + Ohren + Augen. Schwebt
        // (Parent-Hover). Körper auf upperBody (Atmen „flattert" die Flügel).
        <group ref={refs.upperBody} position={[0, 0.9, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.22, 14, 12]} />
            <meshStandardMaterial ref={refs.torsoMaterial} color={type.colorHex} roughness={0.6} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.34, 0.02, -0.04]} rotation={[0, s * 0.3, s * 0.5]}>
              <boxGeometry args={[0.5, 0.34, 0.02]} />
              <meshStandardMaterial color={type.colorHex} side={THREE.DoubleSide} roughness={0.7} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.08, 0.2, 0.02]} rotation={[0, 0, s * 0.2]} castShadow>
              <coneGeometry args={[0.05, 0.16, 5]} />
              <meshStandardMaterial color={type.colorHex} />
            </mesh>
          ))}
          <Eyes color={eyeColor} y={0.02} z={0.2} spread={0.07} r={0.04} />
        </group>
      ) : isWisp ? (
        // Irrlicht: glühender Kern + Hülle + umkreisende Funken. Schwebt.
        <group ref={refs.upperBody} position={[0, 1.0, 0]}>
          <mesh>
            <sphereGeometry args={[0.26, 16, 14]} />
            <meshStandardMaterial ref={refs.torsoMaterial} color={type.colorHex} emissive={type.colorHex} emissiveIntensity={0.9} transparent opacity={0.5} roughness={0.1} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.13, 12, 12]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.34, Math.sin(a) * 0.18, Math.sin(a) * 0.34]}>
                <sphereGeometry args={[0.04, 8, 8]} />
                <meshBasicMaterial color={eyeColor} toneMapped={false} />
              </mesh>
            );
          })}
        </group>
      ) : isReaper ? (
        // Seelenschnitter (Boss): hohe Kapuzen-Robe (Kegel) + dunkle Kapuze +
        // glühende Augen + Sense auf armR (Lunge animiert sie). Schwebt.
        <>
          <group ref={refs.upperBody} position={[0, 1.0, 0]}>
            <mesh position={[0, 0.2, 0]}>
              <coneGeometry args={[0.5, 1.7, 12]} />
              <meshStandardMaterial ref={refs.torsoMaterial} color={type.colorHex} emissive={type.colorHex} emissiveIntensity={0.25} transparent opacity={0.92} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 1.0, 0.04]}>
              <sphereGeometry args={[0.26, 14, 12, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
              <meshStandardMaterial color="#0a0a12" side={THREE.DoubleSide} />
            </mesh>
            <Eyes color={eyeColor} y={0.92} z={0.17} spread={0.08} r={0.05} />
            <group ref={refs.armR} position={[0.42, 0.7, 0.05]}>
              {/* Sensenstiel + Klinge */}
              <mesh position={[0, -0.3, 0]} castShadow>
                <cylinderGeometry args={[0.035, 0.035, 1.5, 6]} />
                <meshStandardMaterial color="#2a2118" />
              </mesh>
              <mesh position={[-0.28, 0.42, 0]} rotation={[0, 0, 1.1]} castShadow>
                <coneGeometry args={[0.1, 0.6, 4]} />
                <meshStandardMaterial color="#c7d2fe" emissive="#a855f7" emissiveIntensity={0.6} metalness={0.5} />
              </mesh>
            </group>
            <group ref={refs.armL} position={[-0.34, 0.7, 0.05]}>
              <mesh position={[0, -0.3, 0]} castShadow>
                <boxGeometry args={[0.1, 0.5, 0.1]} />
                <meshStandardMaterial color={type.colorHex} />
              </mesh>
            </group>
          </group>
        </>
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

            {/* Steingolem: glühende Risse über Brust + Felsbrocken auf den
                Schultern → massiver, „aufgeladener" Brocken. */}
            {isGolem && (
              <>
                {[[-0.12, 0.5, 0.4], [0.1, 0.32, -0.5], [0, 0.62, 0.2]].map(([cx, cy, rz], i) => (
                  <mesh key={i} position={[cx, cy, 0.16]} rotation={[0, 0, rz]}>
                    <boxGeometry args={[0.04, 0.22, 0.02]} />
                    <meshBasicMaterial color={eyeColor} transparent opacity={0.9} toneMapped={false} />
                  </mesh>
                ))}
                <mesh position={[-0.28, 0.66, 0]} rotation={[0.3, 0.5, 0.2]} castShadow>
                  <dodecahedronGeometry args={[0.16, 0]} />
                  <meshStandardMaterial color={type.colorHex} flatShading roughness={0.9} />
                </mesh>
                <mesh position={[0.28, 0.66, 0]} rotation={[0.4, 1.1, 0.3]} castShadow>
                  <dodecahedronGeometry args={[0.16, 0]} />
                  <meshStandardMaterial color={type.colorHex} flatShading roughness={0.9} />
                </mesh>
              </>
            )}

            {/* Imp/Kobold: kleine Fledermaus-Flügel + Hörnchen + Pfeilschwanz. */}
            {isImp && (
              <>
                <mesh position={[-0.06, 1.12, 0.05]} rotation={[0.2, 0, -0.4]} castShadow>
                  <coneGeometry args={[0.03, 0.13, 5]} />
                  <meshStandardMaterial color="#1a1010" />
                </mesh>
                <mesh position={[0.06, 1.12, 0.05]} rotation={[0.2, 0, 0.4]} castShadow>
                  <coneGeometry args={[0.03, 0.13, 5]} />
                  <meshStandardMaterial color="#1a1010" />
                </mesh>
                {[-1, 1].map((s) => (
                  <mesh key={s} position={[s * 0.34, 0.46, -0.1]} rotation={[0, s * 0.5, s * 0.4]}>
                    <boxGeometry args={[0.42, 0.34, 0.02]} />
                    <meshStandardMaterial color={type.colorHex} emissive={type.colorHex} emissiveIntensity={0.3} transparent opacity={0.85} side={THREE.DoubleSide} />
                  </mesh>
                ))}
                <mesh position={[0, 0.06, -0.18]} rotation={[0.7, 0, 0]} castShadow>
                  <coneGeometry args={[0.04, 0.34, 6]} />
                  <meshStandardMaterial color={type.colorHex} />
                </mesh>
              </>
            )}

            {/* Troll/Brute: Rücken-Buckel → hünenhafte, gebeugte Silhouette. */}
            {isBrute && (
              <mesh position={[0, 0.66, -0.14]} castShadow>
                <sphereGeometry args={[0.28, 12, 10]} />
                <meshStandardMaterial color={type.colorHex} />
              </mesh>
            )}

            <group ref={refs.armL} position={[-0.32, 0.65, 0]}>
              <mesh position={[0, -0.32, 0]} castShadow>
                <boxGeometry args={[limbWidth, 0.62, limbWidth]} />
                <meshStandardMaterial color={type.colorHex} transparent={isGhost} opacity={bodyOpacity} />
              </mesh>
              {isBrute && (
                <mesh position={[0, -0.66, 0.04]} castShadow>
                  <boxGeometry args={[limbWidth + 0.12, 0.22, limbWidth + 0.12]} />
                  <meshStandardMaterial color={type.colorHex} />
                </mesh>
              )}
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
              {/* Becken/Hüfte — schließt die Lücke zwischen Beinen (~y0.86) und
                  Torso (~y1.15); vorher fehlte hier ein Stück. */}
              <mesh position={[0, 1.0, 0]} castShadow>
                <boxGeometry args={[0.46, 0.42, 0.3]} />
                <meshStandardMaterial color={type.colorHex} transparent={isGhost} opacity={bodyOpacity} />
              </mesh>
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

      <Billboard ref={refs.healthGroup} position={[0, isSlime || isSpider ? 1.15 : 2.35, 0]}>
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
