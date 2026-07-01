"use client";

import { useMemo, useRef } from "react";
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
import { TIME_OF_DAY_PRESETS, type WorldEnvironmentConfig } from "@/lib/world-environment-config";
import { buildObstacles, buildSpawnZones, type Obstacle } from "@/lib/world-obstacles";
import { buildNavGrid, type NavGrid } from "@/lib/world-nav";
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
  environmentConfig: WorldEnvironmentConfig;
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
        <meshBasicMaterial color="#b89a3a" transparent opacity={0.4} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={innerRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[WORLD_RADIUS - 4, WORLD_RADIUS - 1.5, 80]} />
        <meshBasicMaterial color="#8a6a22" transparent opacity={0.14} toneMapped={false} side={THREE.DoubleSide} />
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
        <meshBasicMaterial color="#4a5a28" transparent opacity={0.08} toneMapped={false} />
      </mesh>
      <mesh ref={innerRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[7, 52]} />
        <meshBasicMaterial color="#7a8a3a" transparent opacity={0.12} toneMapped={false} />
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
  return <pointLight ref={lightRef} position={[0, 1.5, 0]} color="#8a7a3a" intensity={6} distance={22} decay={2} />;
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
  environmentConfig,
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
  // Kollidierbare Hindernisse — EINE Quelle für Render (Environment) + Physik
  // (Player/Monster). Recompute bei Dichte-Änderung; Ref für die useFrame-Reads.
  // NUR von den struktur-relevanten Dichten + Monument abhängig (nicht von der
  // ganzen Config-Referenz) — sonst würde die Map bei jeder Licht-/Nebel-/Config-
  // Aktualisierung neu generiert (Flackern „lädt auf einmal anders"). buildObstacles
  // ist deterministisch (seeded), also liefert gleicher Input dieselbe Map für alle.
  const obstacles = useMemo(
    () => buildObstacles(environmentConfig),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      environmentConfig.treeDensity,
      environmentConfig.rockDensity,
      environmentConfig.ruinDensity,
      environmentConfig.buildingDensity,
      environmentConfig.monument,
    ]
  );
  const obstaclesRef = useRef<Obstacle[]>(obstacles);
  obstaclesRef.current = obstacles;
  // Navigations-Gitter (A*) für schlaue Monster — einmal aus den Hindernissen.
  const navGrid = useMemo(() => buildNavGrid(obstacles), [obstacles]);
  const navGridRef = useRef<NavGrid>(navGrid);
  navGridRef.current = navGrid;
  // Ortsgewichtete Spawn-Zonen (in/um Ruinen etc.) — gleiche Quelle wie die
  // Geometrie (WORLD_ZONES), hängt nur an der Bebauungs-Dichte.
  const spawnZones = useMemo(
    () => buildSpawnZones(environmentConfig),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [environmentConfig.buildingDensity]
  );

  // Admin-konfigurierbare Welt-Optik: Tageszeit-Preset + Feintuning-Multiplikatoren.
  const tp = TIME_OF_DAY_PRESETS[environmentConfig.timeOfDay];
  const fogMul = Math.max(0.4, environmentConfig.fogDensity);
  // Sichtweite an die große Map angepasst: vorher (WORLD_RADIUS+10) ≈ 88 →
  // die ferne Map-Hälfte verschwand komplett in der Nebelwand ("hinten lädt
  // nicht"). Jetzt deutlich weiter, damit man die entfernten Orte sieht.
  const fogNear = 22 / fogMul;
  const fogFar = (WORLD_RADIUS * 1.85 + 12) / fogMul;
  const starCount = Math.round(3200 * Math.max(0, environmentConfig.starIntensity));

  return (
    <>
      {/* Opaker GL-Hintergrund: macht die Canvas blickdicht (Nebelfarbe der
          Tageszeit). Falls der Render-Loop je 1 Frame stockt, sieht man dann
          höchstens diesen dunklen Ton — NIE den weißen Browser-Hintergrund. */}
      <color attach="background" args={[tp.fog]} />
      {/* Dusk sky — sun held low near the horizon (rather than drei's Sky
          default midday look) so it reads as a moody purple/orange evening
          instead of a bright cartoon-blue day, matching the rest of the
          site's neon-purple branding. The existing starfield then sits
          believably in the darker upper half of that gradient. */}
      {/* Tageszeit-gesteuerter Himmel (admin: timeOfDay-Preset) */}
      <Sky
        distance={450000}
        sunPosition={tp.sun}
        turbidity={tp.turbidity}
        rayleigh={tp.rayleigh}
        mieCoefficient={0.015}
        mieDirectionalG={0.94}
      />
      {/* Nebel — Farbe vom Preset, Dichte admin-konfigurierbar */}
      <fog attach="fog" args={[tp.fog, fogNear, fogFar]} />

      <ambientLight intensity={0.78 * environmentConfig.ambientIntensity} color={tp.ambient} />
      {/* Günstiges Himmel/Boden-Fill — hebt dunkle Flächen gleichmäßig an, ohne
          teure zusätzliche Punktlichter. Wichtig für Mobile-Lesbarkeit (dort sind
          Schatten/Bloom schwächer, sonst "man sieht fast nichts"). */}
      <hemisphereLight args={[tp.ambient, tp.ground, 0.6 * environmentConfig.ambientIntensity]} />
      <directionalLight position={tp.sun} intensity={tp.dirIntensity} color={tp.dir} castShadow />
      {/* Akzent-Punktlichter (admin: accentIntensity) — giftgrüner Fill, kalter Stahl-Rim, Gefahr-Rot */}
      <pointLight position={[-6, 3, -4]} intensity={22 * environmentConfig.accentIntensity} color="#9aa84a" distance={40} decay={2} />
      <pointLight position={[6, 3, 6]} intensity={16 * environmentConfig.accentIntensity} color="#6b7a82" distance={35} decay={2} />
      <pointLight position={[0, 5, -18]} intensity={10 * environmentConfig.accentIntensity} color="#7f1d1d" distance={30} decay={2} />
      {/* Pulsing spawn heart */}
      <SpawnHeartLight />

      {starCount > 0 && <Stars radius={120} depth={50} count={starCount} factor={2.8} fade speed={0.4} />}

      {/* grass ground, sized to the actual playable world radius — two
          overlapping tones (Preset-Tönung) so it doesn't read as flat from above */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <circleGeometry args={[WORLD_RADIUS, 96]} />
        <meshStandardMaterial color={tp.ground} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <circleGeometry args={[WORLD_RADIUS * 0.62, 80]} />
        <meshStandardMaterial color={tp.groundInner} transparent opacity={0.6} />
      </mesh>

      <SpawnGlow />
      <BorderRing />

      <Environment env={environmentConfig} obstacles={obstacles} combatRef={combatRef} />

      {/* ContactShadows re-renders the scene into a shadow texture every frame —
          a full extra pass. Cheap enough on desktop, but on mobile it's a real
          cost on top of the directional shadow, so we drop it there (the
          directional light still grounds everything with a cast shadow). */}
      {!mobileMode && <ContactShadows position={[0, 0, 0]} opacity={0.6} scale={12} blur={2.2} far={4} />}

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
        active={active}
        obstaclesRef={obstaclesRef}
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
        obstaclesRef={obstaclesRef}
        navGridRef={navGridRef}
        spawnZones={spawnZones}
        onMonsterKilled={(typeId) => onMonsterKilled?.(typeId)}
      />
    </>
  );
}
