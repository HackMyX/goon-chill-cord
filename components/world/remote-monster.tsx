"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Billboard } from "@react-three/drei";
import { TextSprite } from "@/components/world/text-sprite";
import type { MonsterTypeConfig } from "@/lib/monsters";
import type { MonsterHandle, MonsterRegistry } from "@/components/world/combat-types";
import type { CharacterConfig } from "@/lib/character-config";
import { broadcastMonsterHit } from "@/lib/world-realtime";
import { FloatingDamageNumber, DEATH_SINK_DURATION, MonsterWeapon } from "@/components/world/monster";
import { BloodBurst, BLOOD_BURST_LIFETIME_MS } from "@/components/world/hit-fx";

interface RemoteMonsterProps {
  ownerId: string;
  localUserId: string;
  id: string;
  type: MonsterTypeConfig;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  /** Owner's authoritative alive flag from the latest monster_sync. False
   * for a just-killed mob the owner is still broadcasting (for
   * ~MONSTER_DEATH_CLEANUP_MS) so this ghost can play a matching death
   * animation instead of popping out, and so it stops being hittable. */
  alive: boolean;
  /** Shared map (owned by MonstersField) of monsterId → last attack-pulse
   * timestamp. This monster polls its own id each frame; a newer timestamp
   * than last consumed fires a one-shot lunge so observers see the swing. */
  attackPulseRef: React.RefObject<Map<string, number>>;
  registryRef: MonsterRegistry;
  characterConfig: CharacterConfig;
}

// Module-scoped so every RemoteMonster's popups/bursts get unique keys
// without colliding across instances — same idiom as monster.tsx.
let remotePopupSeq = 0;
let remoteBurstSeq = 0;

/** Max dead-reckoning extrapolation window — ~1.5× the 8 Hz monster_sync
 * interval (125 ms). Bridges a couple of late/dropped REST packets so the
 * mob keeps gliding, without flinging it so far ahead that a resumed packet
 * snaps it back (rubber-banding). */
const DR_MAX_LOOKAHEAD = 0.18;

/**
 * Ghost visual of another player's monster — rendered by MonstersField on
 * every client that isn't the owner. No AI loop (it never chases or attacks
 * the local player), but it IS registered in the local MonsterRegistry so
 * the local player can melee it. `takeDamage` broadcasts `monster_hit` to
 * the owner, who applies the *authoritative* damage in their own simulation;
 * the synced HP bar then catches up on the next `monster_sync` snapshot
 * (~125ms later).
 *
 * To make a landed hit feel immediate rather than waiting that full round
 * trip, `takeDamage` ALSO fires optimistic local feedback on the attacker's
 * own screen — a floating damage number, a blood burst, a hit-flash, and a
 * predicted HP-bar drop — identical to what the owner's own Monster.tsx
 * shows. The next authoritative sync reconciles the predicted HP back to the
 * real value (so concurrent attackers / owner-side clamping self-correct).
 *
 * Slightly transparent so players can instantly distinguish remote monsters
 * from their own. Walk animation is driven by comparing consecutive sync
 * positions — no flags needed; a subtle idle sway keeps a standing mob from
 * reading as a frozen statue.
 */
export function RemoteMonster({
  ownerId,
  localUserId,
  id,
  type,
  x,
  y,
  z,
  hp,
  maxHp,
  alive,
  attackPulseRef,
  registryRef,
  characterConfig,
}: RemoteMonsterProps) {
  const group = useRef<THREE.Group>(null);
  const healthFill = useRef<THREE.Mesh>(null);
  const healthGroup = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const torsoMaterial = useRef<THREE.MeshStandardMaterial>(null);

  // Dead-reckoning interpolation (mirrors remote-players.tsx, which is already
  // smooth). Instead of lerping toward the last raw snapshot — which visibly
  // stalls then snaps because monster_sync arrives over REST at 8 Hz with
  // jittery timing — we derive a velocity from consecutive snapshots and
  // extrapolate the position forward (capped) so the mob keeps gliding during
  // the gap between packets. The result is continuous motion, not a step.
  const targetPos = useRef(new THREE.Vector3(x, y, z));
  const prevSyncPos = useRef({ x, z });
  const lastSyncTime = useRef(0);
  const velocity = useRef({ vx: 0, vz: 0 });
  const hasReceivedFirst = useRef(false);
  const movingRef = useRef(false);
  const walkClock = useRef(0);
  const auraRef = useRef<THREE.Mesh>(null);
  const walkAmplitude = useRef(0);

  // Keep hp/maxHp in refs so the registry handle closure always reads current values.
  const hpRef = useRef(hp);
  const maxHpRef = useRef(maxHp);

  // Death animation state — mirrors the owner's Monster.tsx sink-and-fade.
  const aliveRef = useRef(alive);
  const deathT = useRef(0);
  const deathBaseY = useRef<number | null>(null);

  // Local hit-flash decay (white-hot torso emissive pulse on each landed hit).
  const hitGlow = useRef(0);

  // One-shot attack lunge, fired when MonstersField records a newer attack
  // pulse for this monster id than we last consumed.
  const lunge = useRef(0);
  const lastAttackPulse = useRef(0);

  // Optimistic local feedback — the only React state here, identical in shape
  // to monster.tsx's; one re-render per landed hit is acceptable (rare event).
  const [popups, setPopups] = useState<{ id: number; amount: number }[]>([]);
  const [bloodBursts, setBloodBursts] = useState<{ id: number }[]>([]);

  useEffect(() => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!hasReceivedFirst.current) {
      // First snapshot: snap straight to it, no extrapolation yet.
      hasReceivedFirst.current = true;
      prevSyncPos.current = { x, z };
      lastSyncTime.current = now;
      velocity.current = { vx: 0, vz: 0 };
      movingRef.current = false;
      targetPos.current.set(x, y, z);
      if (group.current) group.current.position.set(x, y, z);
      return;
    }
    const dtSec = Math.max(0.05, (now - lastSyncTime.current) / 1000);
    const dist = Math.hypot(x - prevSyncPos.current.x, z - prevSyncPos.current.z);
    movingRef.current = dist > 0.05;
    if (movingRef.current) {
      // Velocity (units/sec) from the delta between this and the last snapshot.
      velocity.current.vx = (x - prevSyncPos.current.x) / dtSec;
      velocity.current.vz = (z - prevSyncPos.current.z) / dtSec;
    } else {
      // Stopped — zero velocity so we don't keep drifting past the target.
      velocity.current = { vx: 0, vz: 0 };
    }
    prevSyncPos.current = { x, z };
    lastSyncTime.current = now;
    targetPos.current.set(x, y, z);
  }, [x, y, z]);

  useEffect(() => {
    // Authoritative reconciliation: the synced HP overwrites any optimistic
    // prediction takeDamage applied locally.
    hpRef.current = hp;
    maxHpRef.current = maxHp;
  }, [hp, maxHp]);

  useEffect(() => {
    // Übergang lebendig → tot: kräftige Explosion (wie lokal in monster.tsx),
    // damit ein Kill für ALLE Spieler gleich befriedigend aussieht.
    if (aliveRef.current && !alive) {
      for (let k = 0; k < 3; k++) {
        const dId = ++remoteBurstSeq;
        setBloodBursts((curr) => [...curr, { id: dId }]);
        setTimeout(() => setBloodBursts((curr) => curr.filter((b) => b.id !== dId)), BLOOD_BURST_LIFETIME_MS);
      }
    }
    aliveRef.current = alive;
  }, [alive]);

  useFrame((_, delta) => {
    if (!group.current) return;

    // Death: sink, topple, and shrink in place — mirrors Monster.tsx so a
    // remote-killed mob fades out the same way it does on the owner's screen
    // instead of vanishing instantly. MonstersField unmounts this component
    // once the owner drops the corpse from its broadcast pool.
    if (!aliveRef.current) {
      if (deathBaseY.current === null) deathBaseY.current = group.current.position.y;
      deathT.current += delta;
      group.current.position.y = deathBaseY.current - Math.min(0.9, deathT.current * 0.9);
      group.current.rotation.z = THREE.MathUtils.lerp(
        group.current.rotation.z,
        Math.PI / 2.2,
        Math.min(1, deathT.current * 2)
      );
      group.current.scale.setScalar(Math.max(0.05, 1 - deathT.current / (DEATH_SINK_DURATION * 1.4)));
      if (healthGroup.current) healthGroup.current.visible = false;
      return;
    }

    // Dead-reckoned position: extrapolate forward from the last snapshot using
    // the derived velocity (capped at ~1.5× the 8 Hz interval so a late packet
    // can't fling the mob into a rubber-band), then lerp toward that predicted
    // point. Keeps remote mobs gliding continuously between REST snapshots
    // instead of stalling-then-snapping. Y is lerped without extrapolation
    // (it carries the owner's hover/hop bob, which shouldn't overshoot).
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const lookahead = Math.min(DR_MAX_LOOKAHEAD, (now - lastSyncTime.current) / 1000);
    const predX = targetPos.current.x + velocity.current.vx * lookahead;
    const predZ = targetPos.current.z + velocity.current.vz * lookahead;
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, predX, Math.min(1, delta * 16));
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, predZ, Math.min(1, delta * 16));
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, targetPos.current.y, Math.min(1, delta * 10));

    // In Laufrichtung drehen — exakt wie das lokale Monster (atan2(vx,vz),
    // lerp delta*6). Ohne das würden Remote-Mobs seitwärts/rückwärts gleiten,
    // statt dahin zu schauen, wo sie hinlaufen (Sync-Lücke geschlossen).
    if (movingRef.current && (Math.abs(velocity.current.vx) > 0.01 || Math.abs(velocity.current.vz) > 0.01)) {
      const targetYaw = Math.atan2(velocity.current.vx, velocity.current.vz);
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, targetYaw, Math.min(1, delta * 6));
    }

    // Walk + idle animation. walkClock keeps advancing even while idle (slow)
    // so the limbs sway subtly instead of snapping to a dead-still rest pose —
    // the "statue" fix. Amplitude blends from a small idle sway (0.06) up to a
    // full walk swing (0.42) as inferred movement ramps in.
    walkAmplitude.current = THREE.MathUtils.lerp(
      walkAmplitude.current,
      movingRef.current ? 1 : 0,
      Math.min(1, delta * 8)
    );
    // Match the owner-local Monster.tsx walk exactly (6.5 step rate, 0.45 walk
    // amplitude, 0.06 idle sway) so a remote mob's gait is visually identical.
    walkClock.current += delta * (movingRef.current ? 6.5 : 1.2);
    const swing = Math.sin(walkClock.current) * (0.06 + walkAmplitude.current * (0.45 - 0.06));

    // Consume a fresh attack pulse → fire a one-shot lunge, then decay it
    // (same rate/arm bias as the owner's local Monster.tsx lunge).
    const pulse = attackPulseRef.current?.get(id) ?? 0;
    if (pulse > lastAttackPulse.current) {
      lastAttackPulse.current = pulse;
      lunge.current = 1;
    }
    lunge.current = Math.max(0, lunge.current - delta * 3.5);

    // Gefahr-Aura pulsiert — identisch zum lokalen Monster (für alle gleich).
    if (auraRef.current) {
      const t2 = type.health >= 200 ? 2 : type.health >= 100 ? 1 : 0;
      const base = 0.16 + t2 * 0.1;
      (auraRef.current.material as THREE.MeshBasicMaterial).opacity = base * (0.65 + 0.5 * Math.sin(walkClock.current * 2.6));
    }

    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.8 - lunge.current * 0.5;
    if (armR.current) armR.current.rotation.x = swing * 0.8 - lunge.current * 1.7;

    // Hit-flash: quick white-hot emissive pulse decaying with hitGlow (~0.25s).
    hitGlow.current = Math.max(0, hitGlow.current - delta * 4);
    if (torsoMaterial.current) {
      torsoMaterial.current.emissive.setRGB(1, 0.25, 0.25);
      torsoMaterial.current.emissiveIntensity = hitGlow.current * 1.4;
    }

    if (healthFill.current) {
      const frac = maxHpRef.current > 0 ? Math.max(0, hpRef.current / maxHpRef.current) : 0;
      healthFill.current.scale.x = Math.max(0.001, frac);
      healthFill.current.position.x = -(1 - frac) * 0.5;
      const mat = healthFill.current.material as THREE.MeshBasicMaterial;
      mat.color.set(frac > 0.5 ? "#4ade80" : frac > 0.2 ? "#facc15" : "#f87171");
    }
  });

  useEffect(() => {
    const handle: MonsterHandle = {
      id,
      typeId: type.id,
      ownerId,
      getPosition: () => group.current?.position ?? new THREE.Vector3(x, y, z),
      isAlive: () => aliveRef.current,
      getHp: () => hpRef.current,
      hitRadius: characterConfig.attackHitRadius * type.scale,
      takeDamage: (amount) => {
        if (!aliveRef.current) return 0;
        // Tell the owner (authoritative) to apply the real damage.
        broadcastMonsterHit({ attackerId: localUserId, ownerId, monsterId: id, amount });
        // Optimistic local feedback so the hit lands NOW on the attacker's
        // screen rather than after a full sync round trip — predicted HP is
        // overwritten by the next authoritative monster_sync.
        hpRef.current = Math.max(0, hpRef.current - amount);
        hitGlow.current = 1;
        const popupId = ++remotePopupSeq;
        setPopups((curr) => [...curr, { id: popupId, amount }]);
        setTimeout(() => setPopups((curr) => curr.filter((p) => p.id !== popupId)), 700);
        const burstId = ++remoteBurstSeq;
        setBloodBursts((curr) => [...curr, { id: burstId }]);
        setTimeout(
          () => setBloodBursts((curr) => curr.filter((b) => b.id !== burstId)),
          BLOOD_BURST_LIFETIME_MS
        );
        return amount;
      },
    };
    registryRef.current.push(handle);
    return () => {
      registryRef.current = registryRef.current.filter((h) => h !== handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable identifiers only
  }, []);

  const isSlime = type.visualKind === "slime";
  const isGhost = type.visualKind === "ghost";
  const isOrc = type.visualKind === "orc";
  const isDemon = type.visualKind === "demon";
  const REMOTE_OPACITY = 0.65;
  // Glowing eyes per visualKind — mirrors monster.tsx so a remote mob reads as
  // an alive creature, not a faceless dummy. Same colors as the local rig.
  const eyeColor =
    type.visualKind === "skeleton"
      ? "#7dd3fc"
      : isGhost
        ? "#e0f2fe"
        : isDemon
          ? "#ff2424"
          : isOrc
            ? "#fbbf24"
            : isSlime
              ? "#dcfce7"
              : "#fca5a5";

  // Tier-Gefahr-Aura — identisch zu monster.tsx, damit ein starkes Monster für
  // ALLE Spieler gleich lesbar ist (Gelb = mittel, Rot = stark).
  const auraTier = type.health >= 200 ? 2 : type.health >= 100 ? 1 : 0;
  const auraColor = auraTier === 2 ? "#ef4444" : auraTier === 1 ? "#f59e0b" : eyeColor;
  const auraOuter = 0.55 + auraTier * 0.2;
  const auraOpacity = 0.16 + auraTier * 0.1;

  return (
    <group ref={group} position={[x, y, z]} scale={type.scale}>
      {!isGhost && (
        <mesh ref={auraRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[auraOuter - 0.13, auraOuter, 36]} />
          <meshBasicMaterial color={auraColor} transparent opacity={auraOpacity} toneMapped={false} side={2} />
        </mesh>
      )}
      {isSlime ? (
        <group position={[0, 0.42, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.42, 14, 10]} />
            <meshStandardMaterial
              ref={torsoMaterial}
              color={type.colorHex}
              transparent
              opacity={REMOTE_OPACITY}
              roughness={0.2}
              emissive={type.colorHex}
              emissiveIntensity={0.1}
            />
          </mesh>
          <mesh position={[-0.13, 0.08, 0.32]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
          <mesh position={[0.13, 0.08, 0.32]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        </group>
      ) : (
        <>
          {/* Torso */}
          <mesh position={[0, 1.5, 0]} castShadow>
            <boxGeometry args={[0.5, 0.7, 0.3]} />
            <meshStandardMaterial
              ref={torsoMaterial}
              color={type.colorHex}
              transparent
              opacity={isGhost ? REMOTE_OPACITY * 0.6 : REMOTE_OPACITY}
            />
          </mesh>
          {/* Head */}
          <mesh position={[0, 2.05, 0]} castShadow>
            <boxGeometry args={[0.34, 0.34, 0.34]} />
            <meshStandardMaterial
              color={type.colorHex}
              transparent
              opacity={isGhost ? REMOTE_OPACITY * 0.6 : REMOTE_OPACITY}
            />
          </mesh>
          {/* Glowing eyes */}
          <mesh position={[-0.07, 2.07, 0.18]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
          <mesh position={[0.07, 2.07, 0.18]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color={eyeColor} emissive={eyeColor} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
          {/* Arms — animated groups */}
          <group ref={armL} position={[-0.32, 1.72, 0]}>
            <mesh position={[0, -0.3, 0]} castShadow>
              <boxGeometry args={[0.2, 0.6, 0.2]} />
              <meshStandardMaterial color={type.colorHex} transparent opacity={REMOTE_OPACITY} />
            </mesh>
          </group>
          <group ref={armR} position={[0.32, 1.72, 0]}>
            <mesh position={[0, -0.3, 0]} castShadow>
              <boxGeometry args={[0.2, 0.6, 0.2]} />
              <meshStandardMaterial color={type.colorHex} transparent opacity={REMOTE_OPACITY} />
            </mesh>
            {type.hasWeapon && (
              <MonsterWeapon
                kind={isDemon ? "demon" : type.visualKind === "skeleton" ? "skeleton" : "club"}
                color={isOrc ? "#3f4a26" : "#4a3a28"}
              />
            )}
          </group>
          {/* Legs — animated groups (not for ghost). Pivot at 0.85 (feet on
              ground), matching monster.tsx — at 1.1 they visibly floated. */}
          {!isGhost && (
            <>
              <group ref={legL} position={[-0.15, 0.85, 0]}>
                <mesh position={[0, -0.42, 0]} castShadow>
                  <boxGeometry args={[0.22, 0.85, 0.22]} />
                  <meshStandardMaterial color={type.colorHex} transparent opacity={REMOTE_OPACITY} />
                </mesh>
              </group>
              <group ref={legR} position={[0.15, 0.85, 0]}>
                <mesh position={[0, -0.42, 0]} castShadow>
                  <boxGeometry args={[0.22, 0.85, 0.22]} />
                  <meshStandardMaterial color={type.colorHex} transparent opacity={REMOTE_OPACITY} />
                </mesh>
              </group>
            </>
          )}
          {isGhost && (
            <mesh position={[0, 0.5, 0]}>
              <coneGeometry args={[0.4, 1.05, 14]} />
              <meshStandardMaterial
                color={type.colorHex}
                transparent
                opacity={0.25}
                emissive={type.colorHex}
                emissiveIntensity={0.2}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </>
      )}

      {/* Health bar + name — purple name tint marks it as a remote monster */}
      <Billboard ref={healthGroup} position={[0, isSlime ? 1.15 : 2.35, 0]}>
        <mesh>
          <planeGeometry args={[1, 0.12]} />
          <meshBasicMaterial color="#1a1a1a" transparent opacity={0.85} />
        </mesh>
        <mesh ref={healthFill} position={[0, 0, 0.001]}>
          <planeGeometry args={[1, 0.1]} />
          <meshBasicMaterial color="#4ade80" toneMapped={false} />
        </mesh>
        <TextSprite text={type.name} position={[0, 0.22, 0]} height={0.18} color="#c084fc" outline="#000000" />
      </Billboard>

      {popups.map((p) => (
        <FloatingDamageNumber key={p.id} amount={p.amount} />
      ))}

      {bloodBursts.map((b) => (
        <group key={b.id} position={[0, isSlime ? 0.45 : 1.1, 0]}>
          <BloodBurst />
        </group>
      ))}
    </group>
  );
}
