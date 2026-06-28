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
import { WorldPrioBadgeRow } from "@/components/ui/prio-badge-row";
import {
  subscribeToWorldRoster,
  subscribeToWorldTransforms,
  subscribeToWorldPvpDamage,
} from "@/lib/world-realtime";
import { debugWarn } from "@/lib/debug";
import type { RemotePlayerRegistry } from "@/components/world/combat-types";
import { useFineConfig } from "@/lib/fine-config-context";

// Tuned for 20 Hz WebSocket broadcasts (~50 ms interval, ~5–20 ms latency).
// Higher lerp rate snaps faster to dead-reckoned position without overshoot.
const POSITION_LERP_RATE = 20;
const HEADING_TURN_RATE = 16;
// Look-ahead window: at 20 Hz a sync arrives every 50 ms; 150 ms lets us
// bridge 3 dropped packets before the avatar visibly lags.
const DR_MAX_LOOKAHEAD = 0.15;

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
 * 20Hz transform broadcast (lib/world-realtime.ts) from that peer's own
 * Player.tsx, plus a blood-burst reaction whenever a server-broadcast
 * "pvp_damage" event names this avatar as the target (the actual HP change
 * happens on that peer's own tab, not here — this is purely the visual
 * "I just watched someone else land a hit" cue for every other observer).
 */
export function RemotePlayers({ selfUserId, registryRef, maxHp = 100 }: RemotePlayersProps) {
  const [peerIds, setPeerIds] = useState<string[]>([]);
  // Current presence roster (minus self) and the last time each peer's
  // transform was heard — an avatar is rendered only while it's in the roster
  // AND has broadcast within STALE_MS. This is the belt to presence's
  // suspenders: a hard-dropped peer (tab crash, network loss, mobile sleep)
  // lingers in Supabase presence for 30s+, leaving a frozen "standing" avatar;
  // staleness removes it in ≤STALE_MS instead. A connected peer broadcasts
  // its transform every 20 Hz tick unconditionally (even idle), so the living
  // are never falsely despawned.
  const rosterRef = useRef<Set<string>>(new Set());
  const lastSeenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const STALE_MS = 2500;
    const recompute = () => {
      const now = Date.now();
      const live = [...rosterRef.current].filter(
        (id) => now - (lastSeenRef.current.get(id) ?? 0) < STALE_MS
      );
      setPeerIds((prev) =>
        prev.length === live.length && prev.every((id) => live.includes(id)) ? prev : live
      );
    };

    const unsubRoster = subscribeToWorldRoster((onlineUserIds) => {
      const now = Date.now();
      rosterRef.current = new Set([...onlineUserIds].filter((id) => id !== selfUserId));
      // Seed lastSeen for freshly-joined peers so they aren't instantly judged
      // stale before their first transform arrives; prune ids that left.
      for (const id of rosterRef.current) {
        if (!lastSeenRef.current.has(id)) lastSeenRef.current.set(id, now);
      }
      for (const id of [...lastSeenRef.current.keys()]) {
        if (!rosterRef.current.has(id)) lastSeenRef.current.delete(id);
      }
      recompute();
    });

    const unsubTransform = subscribeToWorldTransforms((p) => {
      if (p.id === selfUserId) return;
      lastSeenRef.current.set(p.id, Date.now());
    });

    const intervalId = setInterval(recompute, 1000);
    return () => {
      unsubRoster();
      unsubTransform();
      clearInterval(intervalId);
    };
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
  // Mirrors the remote player's animState broadcast — updated at 20Hz.
  const animStateRef = useRef<'idle' | 'run' | 'slide' | 'attack' | 'jump' | 'hurt' | 'death'>('idle');
  // Smoothly interpolated Y offset for the jump visual (peer Y is never
  // broadcast — only X/Z are — so we fake height from animState alone).
  const remoteYRef = useRef(0);
  // HP bar: updated from transform broadcasts (20Hz). Using state so the
  // Html overlay re-renders when HP changes, but only at 20Hz max.
  const [displayHp, setDisplayHp] = useState(maxHp);
  const [displayShieldHp, setDisplayShieldHp] = useState(0);
  const [displayShieldMaxHp, setDisplayShieldMaxHp] = useState(0);
  const [isDead, setIsDead] = useState(false);
  // Brief white flash on the HP bar when this avatar takes a hit — set true
  // in the pvpDamage listener, auto-cleared 200 ms later.
  const [hurtFlash, setHurtFlash] = useState(false);
  const hurtFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror shieldHp as a ref so the pvpDamage listener can read the
  // current value without being listed as a dependency (the listener is
  // registered once on mount via subscribeToWorldPvpDamage and must not
  // be torn down / re-subscribed on every HP tick).
  const shieldHpRef = useRef(0);
  const [shieldFlash, setShieldFlash] = useState(false);
  const shieldFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fineConfig = useFineConfig();
  const fineConfigRef = useRef(fineConfig);
  useEffect(() => { fineConfigRef.current = fineConfig; }, [fineConfig]);

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
        // Flash HP bar white briefly for hit feedback.
        if (hurtFlashTimer.current) clearTimeout(hurtFlashTimer.current);
        setHurtFlash(true);
        hurtFlashTimer.current = setTimeout(() => setHurtFlash(false), 200);
        // Flash shield bar if shield was up when the hit landed.
        if (shieldHpRef.current > 0) {
          if (shieldFlashTimer.current) clearTimeout(shieldFlashTimer.current);
          setShieldFlash(true);
          shieldFlashTimer.current = setTimeout(() => setShieldFlash(false), 260);
        }
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
      const newShieldHp = Math.max(0, Math.round(payload.shieldHp ?? 0));
      shieldHpRef.current = newShieldHp;
      setDisplayShieldHp(newShieldHp);
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
    const { mpPositionLerpRate, mpHeadingTurnRate, mpDeadReckoningLookahead, mpAttackSwingDuration: _swingDur } = fineConfigRef.current;
    const timeSinceSync = Math.min((performance.now() - lastSyncTime.current) / 1000, mpDeadReckoningLookahead);
    const predX = target.current.x + velocity.current.vx * timeSinceSync;
    const predZ = target.current.z + velocity.current.vz * timeSinceSync;

    g.position.x = THREE.MathUtils.lerp(g.position.x, predX, Math.min(1, delta * mpPositionLerpRate));
    g.position.z = THREE.MathUtils.lerp(g.position.z, predZ, Math.min(1, delta * mpPositionLerpRate));
    g.rotation.y += angleDelta(g.rotation.y, target.current.yaw) * Math.min(1, delta * mpHeadingTurnRate);

    // Cosmetic walk-cycle driven by the peer's own reported moving/sprinting
    // flags (not by locally inferring it from position deltas, which at a
    // 20Hz feed would lag a full sample behind and visibly stutter) — same
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
        attackProgressRef.current = Math.min(1, attackProgressRef.current + delta / fineConfigRef.current.mpAttackSwingDuration);
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

    // Death takes priority over every other pose: face-plant forward, mirroring
    // the local player's own death-fall (player.tsx faceplants to ~PI/2.1), so a
    // killed peer visibly collapses instead of standing upright until they
    // respawn. We don't replicate the local shrink-despawn (partial parity) —
    // the avatar simply unmounts when the player leaves/respawns.
    const isDead = animStateRef.current === 'death';
    // Slide: squash scale-Y + forward tilt. Run: slight forward lean.
    const isSliding = !isDead && animStateRef.current === 'slide';
    g.scale.y = THREE.MathUtils.lerp(g.scale.y, isSliding ? 0.65 : 1, Math.min(1, delta * 8));
    g.rotation.x = THREE.MathUtils.lerp(
      g.rotation.x,
      isDead ? Math.PI / 2.1 : isSliding ? 0.30 : animStateRef.current === 'run' ? -0.07 : 0,
      Math.min(1, delta * (isDead ? 5 : 8))
    );
  });

  const equippedByCategory = useMemo(() => loadout?.equippedByCategory ?? {}, [loadout]);

  if (!loadout) return null;

  const hpPct = Math.max(0, Math.min(100, (displayHp / maxHp) * 100));
  const hpColor = hpPct > 60 ? "#4ade80" : hpPct > 30 ? "#facc15" : hpPct > 10 ? "#f97316" : "#ef4444";
  const hasShield = displayShieldMaxHp > 0;
  const shieldPct = hasShield ? Math.max(0, Math.min(100, (displayShieldHp / displayShieldMaxHp) * 100)) : 0;
  const shieldBroken = hasShield && displayShieldHp <= 0;

  const isAdmin = loadout.role === "admin";
  const isMod = loadout.role === "moderator";
  // Role accent colour — drives nametag pill border + glow
  const roleColor = isAdmin ? "#f87171" : isMod ? "#22d3ee" : loadout.verified ? "#c084fc" : null;
  // Pill border/shadow based on role (or subtle white for everyone else)
  const pillBorder = roleColor ? `1px solid ${roleColor}44` : "1px solid rgba(255,255,255,0.08)";
  const pillShadow = roleColor
    ? `0 0 10px ${roleColor}33, 0 2px 8px rgba(0,0,0,0.55)`
    : "0 2px 8px rgba(0,0,0,0.5)";

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

      {/* ── MMO-style nametag ── */}
      <Html
        position={[0, fineConfig.nametagHeightOffset, 0]}
        center
        occlude={false}
        distanceFactor={fineConfig.nametagDistanceFactor}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2px",
          opacity: isDead ? 0.18 : 1,
          filter: isDead ? "grayscale(0.7)" : "none",
          transition: "opacity 0.55s ease, filter 0.55s ease",
          pointerEvents: "none",
          userSelect: "none",
        }}>

          {/* Prio badges — above name, MMO convention */}
          {loadout.prioBadges && loadout.prioBadges.length > 0 && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1px" }}>
              <WorldPrioBadgeRow badgeKeys={loadout.prioBadges} max={2} />
            </div>
          )}

          {/* Name pill — anklickbar: öffnet das Profil-Popup (mit Freund-hinzufügen-Button) */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent("gnc:open-profile-popup", { detail: { userId } }));
            }}
            title="Profil ansehen / Freund hinzufügen"
            style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 8px 2px 6px",
            background: "rgba(0,0,0,0.62)",
            backdropFilter: "blur(6px)",
            borderRadius: "10px",
            border: pillBorder,
            boxShadow: pillShadow,
            whiteSpace: "nowrap",
            pointerEvents: "auto",
            cursor: "pointer",
          }}>
            {roleColor && (
              <span style={{
                display: "inline-block",
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: roleColor,
                boxShadow: `0 0 5px ${roleColor}bb`,
                flexShrink: 0,
              }} />
            )}
            <div style={{ fontSize: "11px", fontWeight: 800, lineHeight: 1 }}>
              <StyledUsername
                name={loadout.username}
                styleKey={loadout.nameStyleKey}
                size="xs"
                staticMode={true}
              />
            </div>
            <span style={{
              display: "inline-block",
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              background: "#4ade80",
              boxShadow: "0 0 5px rgba(74,222,128,0.9)",
              flexShrink: 0,
            }} />
          </div>

          {/* HP bar — MMO-style with track border */}
          <div style={{
            width: "84px",
            padding: "2px",
            borderRadius: "5px",
            background: "rgba(0,0,0,0.58)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxSizing: "border-box",
          }}>
            <div style={{
              height: "5px",
              borderRadius: "3px",
              background: "rgba(0,0,0,0.5)",
              overflow: "hidden",
            }}>
              <div style={{
                width: isDead ? "0%" : `${hpPct}%`,
                height: "100%",
                background: hurtFlash
                  ? "rgba(255,255,255,0.97)"
                  : `linear-gradient(90deg, ${hpColor}aa, ${hpColor})`,
                borderRadius: "3px",
                transition: hurtFlash ? "none" : "width 0.18s ease, background 0.4s ease",
                boxShadow: hurtFlash ? "0 0 8px #fffc" : `0 0 5px ${hpColor}88`,
              }} />
            </div>
          </div>

          {/* Shield bar — distinct visual language from HP bar */}
          {hasShield && (
            <div style={{
              width: "84px",
              padding: "2px",
              borderRadius: "5px",
              background: "rgba(0,5,20,0.6)",
              border: shieldFlash
                ? "1px solid rgba(147,197,253,0.75)"
                : "1px solid rgba(96,165,250,0.22)",
              boxSizing: "border-box",
              boxShadow: shieldFlash ? "0 0 10px rgba(96,165,250,0.65)" : "none",
              transition: "border-color 0.12s ease, box-shadow 0.12s ease",
            }}>
              <div style={{
                height: "4px",
                borderRadius: "3px",
                background: "rgba(0,20,60,0.55)",
                overflow: "hidden",
              }}>
                <div style={{
                  width: shieldBroken ? "0%" : `${shieldPct}%`,
                  height: "100%",
                  background: shieldFlash
                    ? "rgba(255,255,255,0.97)"
                    : "linear-gradient(90deg, rgba(96,165,250,0.72), rgba(186,230,253,0.92))",
                  borderRadius: "3px",
                  transition: shieldFlash ? "none" : "width 0.18s ease",
                  boxShadow: shieldFlash ? "0 0 8px #fffc" : "0 0 6px rgba(96,165,250,0.7)",
                }} />
              </div>
            </div>
          )}

        </div>
      </Html>
    </group>
  );
}
