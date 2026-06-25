"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html, Billboard, Text } from "@react-three/drei";
import { CharacterModel, type CharacterLimbRefs } from "@/components/world/character-model";
import { angleDelta } from "@/components/world/player";
import { BloodBurst, BLOOD_BURST_LIFETIME_MS } from "@/components/world/hit-fx";
import { getPublicLoadout, type RemoteLoadout } from "@/lib/actions/world";
import { StyledUsername } from "@/components/ui/styled-username";
import { getBadgeStyle } from "@/lib/badges";
import {
  subscribeToWorldRoster,
  subscribeToWorldTransforms,
  subscribeToWorldPvpDamage,
} from "@/lib/world-realtime";
import { debugWarn } from "@/lib/debug";
import type { RemotePlayerRegistry } from "@/components/world/combat-types";

const POSITION_LERP_RATE = 14;
const HEADING_TURN_RATE = 12;
// Dead-reckoning: max look-ahead window (seconds). Keeps prediction
// from overshooting when a sync is late or the peer stops abruptly.
const DR_MAX_LOOKAHEAD = 0.12;

let pvpBloodBurstSeq = 0;
const REMOTE_ATTACK_SWING_DURATION = 0.38;

/** Mirrors monster.tsx's FloatingDamageNumber — floats upward and fades out
 * above the hit avatar so every observer in the room sees how much damage
 * the hit dealt, not just the attacker. */
function FloatingDamageNumber({ amount }: { amount: number }) {
  const ref = useRef<THREE.Group>(null);
  const age = useRef(0);
  useFrame((_, delta) => {
    age.current += delta;
    const g = ref.current;
    if (!g) return;
    g.position.y = 0.4 + age.current * 1.0;
    const mat = (g.children[0] as unknown as { material?: THREE.Material & { opacity: number } })?.material;
    if (mat) mat.opacity = Math.max(0, 1 - age.current / 0.7);
  });
  return (
    <Billboard ref={ref} position={[0, 0.4, 0]}>
      <Text fontSize={0.42} color="#fca5a5" outlineWidth={0.025} outlineColor="#3f0a0a">
        -{amount}
      </Text>
    </Billboard>
  );
}

interface RemotePlayersProps {
  /** Own user id — never rendered as a remote avatar, even if it briefly
   * shows up in the room roster (it shouldn't, since broadcast/presence are
   * keyed by id and `broadcast: { self: false }` already excludes the echo,
   * but the roster is presence-based and worth guarding independently). */
  selfUserId: string;
  /** Shared with Player.tsx's own melee scan (components/world/scene.tsx
   * owns the ref) — each mounted avatar below registers itself here so a
   * local swing can also consider other players as targets, not just
   * monsters. See combat-types.ts' RemotePlayerHandle for why there's no
   * `takeDamage` on it. */
  registryRef: RemotePlayerRegistry;
  /** Max HP from admin character config — used to scale the remote player's
   * HP bar. Defaults to 100 if not passed. */
  maxHp?: number;
}

/**
 * Renders every *other* player currently in the World as a fully-equipped
 * `CharacterModel` — no input, no physics, just lerping toward the latest
 * 10Hz transform broadcast (lib/world-realtime.ts) from that peer's own
 * Player.tsx, plus a blood-burst reaction whenever a server-broadcast
 * "pvp_damage" event names this avatar as the target (the actual HP change
 * happens on that peer's own tab, not here — this is purely the visual
 * "I just watched someone else land a hit" cue for every other observer).
 */
export function RemotePlayers({ selfUserId, registryRef, maxHp = 100 }: RemotePlayersProps) {
  const [peerIds, setPeerIds] = useState<string[]>([]);

  useEffect(() => {
    return subscribeToWorldRoster((onlineUserIds) => {
      const ids = [...onlineUserIds].filter((id) => id !== selfUserId);
      setPeerIds(ids);
    });
  }, [selfUserId]);

  return (
    <>
      {peerIds.map((id) => (
        <RemotePlayerAvatar key={id} userId={id} registryRef={registryRef} maxHp={maxHp} />
      ))}
    </>
  );
}

/** One peer's loadout never changes mid-session in practice (re-equipping
 * requires leaving the World), so it's fetched once on mount and cached
 * for the avatar's lifetime — never re-fetched per transform tick. */
function useRemoteLoadout(userId: string): RemoteLoadout | null {
  const [loadout, setLoadout] = useState<RemoteLoadout | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicLoadout(userId).then((res) => {
      if (cancelled) return;
      if (!res.success || !res.loadout) {
        debugWarn("World", "getPublicLoadout failed for peer", { userId, error: res.error });
        return;
      }
      setLoadout(res.loadout);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return loadout;
}

function RemotePlayerAvatar({
  userId,
  registryRef,
  maxHp,
}: {
  userId: string;
  registryRef: RemotePlayerRegistry;
  maxHp: number;
}) {
  const loadout = useRemoteLoadout(userId);
  const group = useRef<THREE.Group>(null);
  const limbs = useRef<CharacterLimbRefs>(null);
  const target = useRef({ x: 0, z: 0, yaw: 0 });
  const velocity = useRef({ vx: 0, vz: 0 });
  const lastSyncTime = useRef(0);
  const prevSyncPos = useRef({ x: 0, z: 0 });
  const hasReceivedFirst = useRef(false);
  const walkClock = useRef(0);
  const walkAmplitude = useRef(0);
  const movingRef = useRef(false);
  const sprintingRef = useRef(false);
  const [bloodBursts, setBloodBursts] = useState<{ id: number; amount: number }[]>([]);
  // Drives the right-arm swing animation when a pvp_damage event says this
  // avatar landed a hit — 0 = idle, 0→1 = mid-swing, resets to 0 when done.
  const attackProgressRef = useRef(0);
  // Mirrors the remote player's animState broadcast — updated at 10Hz.
  const animStateRef = useRef<'idle' | 'run' | 'slide' | 'attack' | 'jump' | 'hurt'>('idle');
  // Smoothly interpolated Y offset for the jump visual (peer Y is never
  // broadcast — only X/Z are — so we fake height from animState alone).
  const remoteYRef = useRef(0);
  // HP bar: updated from transform broadcasts (10Hz). Using state so the
  // Html overlay re-renders when HP changes, but only at 10Hz max.
  const [displayHp, setDisplayHp] = useState(maxHp);
  const [displayShieldHp, setDisplayShieldHp] = useState(0);
  const [displayShieldMaxHp, setDisplayShieldMaxHp] = useState(0);
  const [isDead, setIsDead] = useState(false);

  // Registers this avatar into the shared registry Player.tsx's melee scan
  // reads — and into the bargain, gives the scan a live `getPosition()`
  // that always reflects this exact lerped/rendered position, the same
  // "where the attacker visually sees them standing" value the PvP server
  // action validates against.
  useEffect(() => {
    const handle = {
      id: userId,
      getPosition: () => group.current?.position ?? new THREE.Vector3(),
      triggerBloodBurst: (amount = 0) => {
        const id = ++pvpBloodBurstSeq;
        setBloodBursts((curr) => [...curr, { id, amount }]);
        setTimeout(() => setBloodBursts((curr) => curr.filter((b) => b.id !== id)), BLOOD_BURST_LIFETIME_MS);
      },
    };
    // Read/write `registryRef.current` directly on both ends, never via a
    // local variable captured once at mount — see components/world/
    // monster.tsx's matching comment (same registry pattern) for the
    // stale-array race this avoids: capturing the array once and filtering
    // that captured reference in the cleanup can silently overwrite
    // `.current` with a snapshot that predates another player's
    // mount/unmount, dropping a currently-present remote player out of
    // the registry entirely.
    registryRef.current.push(handle);
    return () => {
      registryRef.current = registryRef.current.filter((h) => h !== handle);
    };
  }, [userId, registryRef]);

  useEffect(() => {
    return subscribeToWorldPvpDamage((payload) => {
      if (payload.targetUserId === userId) {
        // This avatar took a hit — show blood burst + floating damage number
        // so every observer in the room sees the damage dealt.
        const id = ++pvpBloodBurstSeq;
        setBloodBursts((curr) => [...curr, { id, amount: payload.amount }]);
        setTimeout(() => setBloodBursts((curr) => curr.filter((b) => b.id !== id)), BLOOD_BURST_LIFETIME_MS);
      }
      if (payload.attackerId === userId) {
        // This avatar just landed a PvP hit — play the arm swing so observers
        // see the attack, not just the blood burst on the target.
        attackProgressRef.current = 0.001;
      }
    });
  }, [userId]);

  useEffect(() => {
    return subscribeToWorldTransforms((payload) => {
      if (payload.id !== userId) return;

      const now = performance.now();
      if (!hasReceivedFirst.current) {
        hasReceivedFirst.current = true;
        target.current = { x: payload.x, z: payload.z, yaw: payload.yaw };
        prevSyncPos.current = { x: payload.x, z: payload.z };
        lastSyncTime.current = now;
        velocity.current = { vx: 0, vz: 0 };
        const g = group.current;
        if (g) {
          g.position.set(payload.x, 0, payload.z);
          g.rotation.y = payload.yaw;
        }
      } else {
        const dtSec = Math.max(0.05, (now - lastSyncTime.current) / 1000);
        if (payload.moving) {
          // Derive velocity (units/sec) from position delta between syncs.
          velocity.current.vx = (payload.x - prevSyncPos.current.x) / dtSec;
          velocity.current.vz = (payload.z - prevSyncPos.current.z) / dtSec;
        } else {
          // Peer stopped — zero out so we don't overshoot into a wall.
          velocity.current = { vx: 0, vz: 0 };
        }
        prevSyncPos.current = { x: payload.x, z: payload.z };
        lastSyncTime.current = now;
        target.current = { x: payload.x, z: payload.z, yaw: payload.yaw };
      }

      movingRef.current = payload.moving;
      sprintingRef.current = payload.sprinting;
      animStateRef.current = payload.animState ?? 'idle';
      setDisplayHp(Math.max(0, Math.round(payload.hp)));
      setDisplayShieldHp(Math.max(0, Math.round(payload.shieldHp ?? 0)));
      setDisplayShieldMaxHp(Math.max(0, Math.round(payload.shieldMaxHp ?? 0)));
      setIsDead(payload.hp <= 0);
    });
  }, [userId]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g || !hasReceivedFirst.current) return;

    // Dead-reckoning: extrapolate ahead by how long it's been since the last
    // sync (capped at DR_MAX_LOOKAHEAD so a late packet can't fling the avatar
    // far off course). When the peer is standing still velocity is zero so the
    // predicted position equals the authoritative one — no drift.
    const timeSinceSync = Math.min((performance.now() - lastSyncTime.current) / 1000, DR_MAX_LOOKAHEAD);
    const predX = target.current.x + velocity.current.vx * timeSinceSync;
    const predZ = target.current.z + velocity.current.vz * timeSinceSync;

    g.position.x = THREE.MathUtils.lerp(g.position.x, predX, Math.min(1, delta * POSITION_LERP_RATE));
    g.position.z = THREE.MathUtils.lerp(g.position.z, predZ, Math.min(1, delta * POSITION_LERP_RATE));
    g.rotation.y += angleDelta(g.rotation.y, target.current.yaw) * Math.min(1, delta * HEADING_TURN_RATE);

    // Cosmetic walk-cycle driven by the peer's own reported moving/sprinting
    // flags (not by locally inferring it from position deltas, which at a
    // 10Hz feed would lag a full sample behind and visibly stutter) — same
    // sine-swing shape Player.tsx uses for the local body, just without any
    // of the jump/attack pose blending this avatar never needs since it has
    // no local combat yet (Phase 1 is visuals-only).
    walkClock.current += delta * (sprintingRef.current ? 12.5 : 8);
    walkAmplitude.current = THREE.MathUtils.lerp(
      walkAmplitude.current,
      movingRef.current ? 1 : 0,
      Math.min(1, delta * 6)
    );
    const swing = Math.sin(walkClock.current) * walkAmplitude.current * (sprintingRef.current ? 0.68 : 0.5);
    const l = limbs.current;
    if (l) {
      if (l.legL.current) l.legL.current.rotation.x = swing;
      if (l.legR.current) l.legR.current.rotation.x = -swing;
      if (l.armL.current) l.armL.current.rotation.x = -swing;
      if (l.armR.current) l.armR.current.rotation.x = swing;

      // Attack swing: override the right arm when this avatar just landed a
      // PvP hit, so observers see the punch — 0→1 progress, then resets.
      // Also triggered by animState='attack' so monster attacks are visible too.
      if (animStateRef.current === 'attack' && attackProgressRef.current <= 0) {
        attackProgressRef.current = 0.001;
      }
      if (attackProgressRef.current > 0) {
        attackProgressRef.current = Math.min(1, attackProgressRef.current + delta / REMOTE_ATTACK_SWING_DURATION);
        const a = attackProgressRef.current < 1 ? Math.sin(attackProgressRef.current * Math.PI) : 0;
        if (l.armR.current) l.armR.current.rotation.x = -1.4 * a;
        if (attackProgressRef.current >= 1) attackProgressRef.current = 0;
      }
    }

    // ── Pose overrides from animState ─────────────────────────────────────
    // Jump: smoothly offset Y so the avatar visibly lifts off the ground
    // (Y isn't broadcast — we derive it from animState alone).
    const targetY = animStateRef.current === 'jump' ? 0.55 : 0;
    remoteYRef.current = THREE.MathUtils.lerp(remoteYRef.current, targetY, Math.min(1, delta * 7));
    g.position.y = remoteYRef.current;

    // Slide: squash scale-Y + forward tilt. Run: slight forward lean.
    const isSliding = animStateRef.current === 'slide';
    g.scale.y = THREE.MathUtils.lerp(g.scale.y, isSliding ? 0.65 : 1, Math.min(1, delta * 8));
    g.rotation.x = THREE.MathUtils.lerp(
      g.rotation.x,
      isSliding ? 0.30 : animStateRef.current === 'run' ? -0.07 : 0,
      Math.min(1, delta * 8)
    );
  });

  const equippedByCategory = useMemo(() => loadout?.equippedByCategory ?? {}, [loadout]);

  if (!loadout) return null;

  const hpPct = Math.max(0, Math.min(100, (displayHp / maxHp) * 100));
  const hpColor = hpPct > 60 ? "#4ade80" : hpPct > 30 ? "#facc15" : hpPct > 10 ? "#f97316" : "#ef4444";
  const hpGlow = hpPct > 60 ? "rgba(74,222,128,0.5)" : hpPct > 30 ? "rgba(250,204,21,0.5)" : hpPct > 10 ? "rgba(249,115,22,0.5)" : "rgba(239,68,68,0.5)";
  const hasShield = displayShieldMaxHp > 0;
  const shieldPct = hasShield ? Math.max(0, Math.min(100, (displayShieldHp / displayShieldMaxHp) * 100)) : 0;
  const shieldBroken = hasShield && displayShieldHp <= 0;

  const isAdmin = loadout.role === "admin";
  const isMod = loadout.role === "moderator";

  return (
    <group ref={group} position={[0, 0, 0]}>
      <CharacterModel
        ref={limbs}
        equippedByCategory={equippedByCategory}
        gender={loadout.gender}
        name=""
      />
      {bloodBursts.map((b) => (
        <group key={b.id} position={[0, 1.1, 0]}>
          <BloodBurst />
          <FloatingDamageNumber amount={b.amount} />
        </group>
      ))}
      {/* HUD nametag + HP bars — transparent game-style overlay */}
      <Html
        position={[0, 2.85, 0]}
        center
        occlude={false}
        distanceFactor={7}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <style>{`
          @keyframes nametag-float {
            0%, 100% { transform: translateY(0px); }
            50%       { transform: translateY(-2px); }
          }
        `}</style>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "5px",
          opacity: isDead ? 0.3 : 1,
          transition: "opacity 0.4s ease",
          pointerEvents: "none",
          userSelect: "none",
        }}>

          {/* ── Floating nametag (transparent HUD) ── */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "3px",
            animation: "nametag-float 3s ease-in-out infinite",
          }}>
            {/* Name row: role icon + styled name + online dot */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {isAdmin && (
                <span style={{ fontSize: "10px", filter: "drop-shadow(0 0 4px rgba(239,68,68,0.9))" }}>⚡</span>
              )}
              {!isAdmin && isMod && (
                <span style={{ fontSize: "10px", filter: "drop-shadow(0 0 4px rgba(34,211,238,0.9))" }}>🛡</span>
              )}
              {!isAdmin && !isMod && loadout.verified && (
                <span style={{ fontSize: "10px", filter: "drop-shadow(0 0 4px rgba(168,85,247,0.9))" }}>✦</span>
              )}
              <div style={{
                fontSize: "12px",
                fontFamily: "system-ui, sans-serif",
                fontWeight: 800,
                whiteSpace: "nowrap",
                textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5)",
              }}>
                <StyledUsername
                  name={loadout.username}
                  styleKey={loadout.nameStyleKey}
                  size="sm"
                  staticMode={true}
                />
              </div>
              <span style={{
                width: "5px", height: "5px", borderRadius: "50%",
                background: "#4ade80",
                boxShadow: "0 0 4px rgba(74,222,128,0.9)",
                flexShrink: 0, display: "inline-block",
              }} />
            </div>

            {/* Role-colored divider line */}
            <div style={{
              width: "80px", height: "1px",
              background: isAdmin
                ? "#ef4444"
                : isMod
                ? "#22d3ee"
                : loadout.verified
                ? "#a855f7"
                : "rgba(255,255,255,0.25)",
              boxShadow: isAdmin
                ? "0 0 6px rgba(239,68,68,0.8)"
                : isMod
                ? "0 0 6px rgba(34,211,238,0.8)"
                : loadout.verified
                ? "0 0 6px rgba(168,85,247,0.7)"
                : "none",
            }} />

            {/* Badge dots — up to 3 from loadout.badges */}
            {loadout.badges.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                {loadout.badges.slice(0, 3).map((key) => {
                  const s = getBadgeStyle(key);
                  const icon =
                    key === "admin" ? "⚡" :
                    key === "mod" ? "🛡" :
                    key === "verified" ? "✦" :
                    key === "premium" ? "★" :
                    key === "elite" ? "◆" :
                    key === "og" ? "🔥" :
                    key === "streaker" ? "🔥" :
                    key === "vip" ? "💎" :
                    key === "helper" ? "🤝" :
                    key === "ns_ultra" ? "👑" :
                    key === "grinder" ? "⚔" :
                    key === "season_vet" ? "🏆" :
                    "•";
                  return (
                    <span key={key} style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: "16px", height: "16px", borderRadius: "50%",
                      background: s.bg,
                      border: `1px solid ${s.border}`,
                      boxShadow: `0 0 5px ${s.glow}`,
                      color: s.text,
                      fontSize: "9px",
                    }}>{icon}</span>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── HP + Shield bars (below the float, not animated) ── */}
          <div style={{
            display: "flex", flexDirection: "column", gap: "2px",
            width: "88px",
          }}>
            {/* Shield bar */}
            {hasShield && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: "7px", fontWeight: 700, fontFamily: "monospace",
                  color: shieldBroken ? "rgba(100,116,139,0.7)" : "rgba(96,165,250,0.9)",
                }}>
                  <span>🛡</span>
                  <span>{shieldBroken ? "LÄDT…" : `${displayShieldHp}/${displayShieldMaxHp}`}</span>
                </div>
                <div style={{
                  width: "100%", height: "5px", borderRadius: "3px",
                  background: "rgba(0,0,0,0.55)",
                  overflow: "hidden",
                  boxShadow: shieldBroken ? "none" : "0 0 0 1px rgba(96,165,250,0.25)",
                }}>
                  <div style={{
                    width: shieldBroken ? "0%" : `${shieldPct}%`,
                    height: "100%",
                    background: `linear-gradient(90deg, rgba(96,165,250,0.9), rgba(147,197,253,1))`,
                    borderRadius: "3px",
                    transition: "width 0.12s ease",
                    boxShadow: shieldBroken ? "none" : "0 0 6px rgba(96,165,250,0.6)",
                  }} />
                </div>
              </div>
            )}
            {/* HP bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                fontSize: "7px", fontWeight: 700, fontFamily: "monospace",
                color: isDead ? "rgba(239,68,68,0.7)" : hpColor,
              }}>
                <span>❤</span>
                <span>{isDead ? "☠ TOT" : `${displayHp}/${maxHp}`}</span>
              </div>
              <div style={{
                width: "100%", height: "6px", borderRadius: "3px",
                background: "rgba(0,0,0,0.55)",
                overflow: "hidden",
                boxShadow: `0 0 0 1px rgba(255,255,255,0.07)`,
              }}>
                <div style={{
                  width: isDead ? "0%" : `${hpPct}%`,
                  height: "100%",
                  background: isDead
                    ? "#ef4444"
                    : `linear-gradient(90deg, ${hpColor}cc, ${hpColor})`,
                  borderRadius: "3px",
                  transition: "width 0.12s ease, background 0.3s ease",
                  boxShadow: isDead ? "none" : `0 0 8px ${hpGlow}`,
                }} />
              </div>
            </div>
          </div>

        </div>
      </Html>
    </group>
  );
}
