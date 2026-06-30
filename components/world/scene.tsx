"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Sky, Stars, ContactShadows } from "@react-three/drei";
import { Player, type PlayerStatsSnapshot } from "@/components/world/player";
import { RemotePlayers } from "@/components/world/remote-players";
import { Environment } from "@/components/world/environment";
import { MonstersField } from "@/components/world/monsters-field";
import { createCombatSharedState, type MonsterHandle, type RemotePlayerHandle } from "@/components/world/combat-types";
import { WORLD_RADIUS } from "@/lib/world-config";
import { getTotalArmor } from "@/lib/combat";
import type { MonsterTypeConfig } from "@/lib/monsters";
import type { PetTypeConfig } from "@/lib/pets";
import type { KillStreakConfig } from "@/lib/kill-streak";
import type { CharacterConfig } from "@/lib/character-config";
import type { WorldSpawnConfig } from "@/lib/world-spawn-config";
import type { CameraControls } from "@/components/world/use-camera-controls";
import type { EquippedItem } from "@/lib/rarity-colors";

interface SceneProps {
  userId: string;
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  username: string;
  cameraControls: CameraControls;
  canvasRef: React.RefObject<HTMLElement | null>;
  monsterTypes: MonsterTypeConfig[];
  petTypes: PetTypeConfig[];
  killStreakConfig: KillStreakConfig;
  characterConfig: CharacterConfig;
  spawnConfig: WorldSpawnConfig;
  /** Current player's kill-streak count — scales locally-spawned
   * monsters' health/attackDamage slightly upward the longer it runs
   * (lib/kill-streak.ts' streakMobScale). Necessarily client-local: this
   * World has no server-authoritative monster simulation at all (monsters
   * live entirely in each client's own R3F scene), so there's no
   * mechanism for "this player's streak" to affect any *other* player's
   * spawns even if it wanted to — nor would it need to, since other
   * players never see this client's monster pool either. */
  streakKillCount: number;
  /** True once the player has actually entered the game (pointer-lock on
   * desktop, start-portal dismissed on mobile) — gates monster spawning so
   * nothing appears behind the "Click to play" overlay. Latched upstream. */
  active?: boolean;
  onAttack?: (damage: number, hit: boolean) => void;
  onPlayerHit?: (kind: "hp" | "shield", amount: number) => void;
  onStatsChange?: (stats: PlayerStatsSnapshot) => void;
  onMonsterKilled?: (typeId: string) => void;
  onDeath?: () => void;
  respawnSignal: number;
  mobileMode?: boolean;
  /** Passed through to Player.tsx for client-side PvP gate. */
  pvpEnabled?: boolean;
  isAdmin?: boolean;
  isModerator?: boolean;
  nameStyleKey?: string | null;
  verified?: boolean;
  prioBadges?: string[];
}

/** Dual border rings + inner halo — keeps the world edge from reading as a
 * dead flat line, ties visually to the glowing crystals in environment.tsx. */
function BorderRing() {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (outerRef.current) {
      (outerRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.38 + Math.sin(t * 0.8) * 0.2;
    }
    if (innerRef.current) {
      (innerRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.16 + Math.sin(t * 1.1 + 1.6) * 0.12;
    }
  });
  return (
    <>
      <mesh ref={outerRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[WORLD_RADIUS - 0.6, WORLD_RADIUS, 96]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.4} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={innerRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[WORLD_RADIUS - 4, WORLD_RADIUS - 1.5, 80]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.14} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

/** Animated spawn-area glow pools — pulsing so the center of the world
 * has visible ambient magic energy rather than just two static circles. */
function SpawnGlow() {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (outerRef.current)
      (outerRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.07 + Math.sin(t * 0.7) * 0.04;
    if (innerRef.current)
      (innerRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.12 + Math.sin(t * 1.1 + 0.9) * 0.07;
  });
  return (
    <>
      <mesh ref={outerRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]}>
        <circleGeometry args={[18, 72]} />
        <meshBasicMaterial color="#6d28d9" transparent opacity={0.08} toneMapped={false} />
      </mesh>
      <mesh ref={innerRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[7, 52]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.12} toneMapped={false} />
      </mesh>
    </>
  );
}

/** A slowly pulsing ambient light centered on the spawn — gives the center
 * of the world a living, breathing magical heart feel. */
function SpawnHeartLight() {
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (lightRef.current)
      lightRef.current.intensity = 6 + Math.sin(clock.elapsedTime * 0.6) * 3;
  });
  return <pointLight ref={lightRef} position={[0, 1.5, 0]} color="#7c3aed" intensity={6} distance={22} decay={2} />;
}

export function Scene({
  userId,
  equippedByCategory,
  gender,
  username,
  cameraControls,
  canvasRef,
  monsterTypes,
  petTypes,
  killStreakConfig,
  characterConfig,
  spawnConfig,
  streakKillCount,
  active = false,
  onAttack,
  onPlayerHit,
  onStatsChange,
  onMonsterKilled,
  onDeath,
  respawnSignal,
  mobileMode = false,
  pvpEnabled = true,
  isAdmin = false,
  isModerator = false,
  nameStyleKey = null,
  verified = false,
  prioBadges = [],
}: SceneProps) {
  // Equipped items never change mid-World-session (re-equipping requires
  // the Garderobe, a separate page) — armor/shield are seeded once here
  // from whatever's equipped, rather than tracked with an effect that
  // would never actually fire again after mount.
  const combatRef = useRef(
    createCombatSharedState({
      armor: getTotalArmor(equippedByCategory),
      shieldMaxHp: equippedByCategory.shield_cosmetic?.shield_hp ?? 0,
      shieldRegenCooldownDuration: equippedByCategory.shield_cosmetic?.shield_regen_cooldown_sec ?? 0,
      maxHp: characterConfig.playerMaxHp,
      maxStamina: characterConfig.playerMaxStamina,
    })
  );
  const monsterRegistryRef = useRef<MonsterHandle[]>([]);
  const remotePlayerRegistryRef = useRef<RemotePlayerHandle[]>([]);

  return (
    <>
      {/* Dusk sky — sun held low near the horizon (rather than drei's Sky
          default midday look) so it reads as a moody purple/orange evening
          instead of a bright cartoon-blue day, matching the rest of the
          site's neon-purple branding. The existing starfield then sits
          believably in the darker upper half of that gradient. */}
      <Sky
        distance={450000}
        sunPosition={[-40, 5, -65]}
        turbidity={16}
        rayleigh={1.6}
        mieCoefficient={0.015}
        mieDirectionalG={0.94}
      />
      {/* Tighter fog start for more depth and atmosphere — world feels
          moody and dense rather than a flat open clearing. */}
      <fog attach="fog" args={["#120a22", 14, WORLD_RADIUS + 10]} />

      <ambientLight intensity={0.5} color="#a78bfa" />
      <directionalLight position={[-20, 25, -30]} intensity={1.1} color="#ffd9b3" castShadow />
      {/* Main purple accent fill */}
      <pointLight position={[-6, 3, -4]} intensity={22} color="#8b5cf6" distance={40} decay={2} />
      {/* Cool blue rim from the opposite side for depth separation */}
      <pointLight position={[6, 3, 6]} intensity={16} color="#3b82f6" distance={35} decay={2} />
      {/* Danger-red rim light — adds warmth contrast and reads as "there are
          threats out here" without being obvious */}
      <pointLight position={[0, 5, -18]} intensity={10} color="#7f1d1d" distance={30} decay={2} />
      {/* Pulsing spawn heart */}
      <SpawnHeartLight />

      <Stars radius={120} depth={50} count={3200} factor={2.8} fade speed={0.4} />

      {/* grass ground, sized to the actual playable world radius — two
          overlapping tones instead of one flat fill so it doesn't read as
          a single dead-flat color from above */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <circleGeometry args={[WORLD_RADIUS, 96]} />
        <meshStandardMaterial color="#253d28" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <circleGeometry args={[WORLD_RADIUS * 0.62, 80]} />
        <meshStandardMaterial color="#2c5530" transparent opacity={0.6} />
      </mesh>

      <SpawnGlow />
      <BorderRing />

      <Environment />

      <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={12} blur={2.2} far={4} />

      <Player
        userId={userId}
        equippedByCategory={equippedByCategory}
        gender={gender}
        name={username}
        cameraControls={cameraControls}
        canvasRef={canvasRef}
        combatRef={combatRef}
        monsterRegistryRef={monsterRegistryRef}
        remotePlayerRegistryRef={remotePlayerRegistryRef}
        petTypes={petTypes}
        onAttack={onAttack}
        onStatsChange={onStatsChange}
        onDeath={onDeath}
        onPlayerHit={onPlayerHit}
        respawnSignal={respawnSignal}
        characterConfig={characterConfig}
        mobileMode={mobileMode}
        pvpEnabled={pvpEnabled}
        isAdmin={isAdmin}
        isModerator={isModerator}
        nameStyleKey={nameStyleKey}
        verified={verified}
        prioBadges={prioBadges}
      />

      <RemotePlayers selfUserId={userId} registryRef={remotePlayerRegistryRef} maxHp={characterConfig.playerMaxHp} />

      <MonstersField
        userId={userId}
        monsterTypes={monsterTypes}
        combatRef={combatRef}
        registryRef={monsterRegistryRef}
        killStreakConfig={killStreakConfig}
        streakKillCount={streakKillCount}
        characterConfig={characterConfig}
        spawnConfig={spawnConfig}
        active={active}
        onMonsterKilled={(typeId) => onMonsterKilled?.(typeId)}
      />
    </>
  );
}
