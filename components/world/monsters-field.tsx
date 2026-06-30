"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Monster,
  MONSTER_DEATH_CLEANUP_MS,
  ThrownProjectile,
  PROJECTILE_SPEED,
  type ThrowRequest,
} from "@/components/world/monster";
import { RemoteMonster } from "@/components/world/remote-monster";
import type { CombatSharedState, MonsterRegistry } from "@/components/world/combat-types";
import {
  pickWeightedMonsterType,
  type MonsterTypeConfig,
} from "@/lib/monsters";
import type { WorldSpawnConfig } from "@/lib/world-spawn-config";
import { streakMobScale, type KillStreakConfig } from "@/lib/kill-streak";
import type { CharacterConfig } from "@/lib/character-config";
import { WORLD_RADIUS } from "@/lib/world-config";
import { resolveObstacleCollision, isSpawnClear, type Obstacle } from "@/lib/world-obstacles";
import type { NavGrid } from "@/lib/world-nav";
import {
  subscribeToWorldRoster,
  subscribeToMonsterSync,
  subscribeToMonsterHit,
  subscribeToMonsterKill,
  subscribeToMonsterAggroAlert,
  subscribeToWorldTransforms,
  subscribeToMonsterAttack,
  broadcastMonsterSync,
  broadcastMonsterKill,
  broadcastMonsterCrossAttack,
  broadcastMonsterAttack,
  type MonsterSyncPayload,
} from "@/lib/world-realtime";
import type { AggroTarget } from "@/components/world/monster";

interface MonsterSpawn {
  id: string;
  type: MonsterTypeConfig;
  position: [number, number, number];
  /** Gesetzt für Mini-Monster: die Spawn-ID des beschwörenden Elternmonsters.
   * Minions zählen nicht gegen die normale Obergrenze (sie sind pro Eltern
   * gedeckelt). */
  minionOf?: string;
}

interface LiveProjectile extends ThrowRequest {
  id: number;
}

let projectileSeq = 0;

interface MonstersFieldProps {
  userId: string;
  monsterTypes: MonsterTypeConfig[];
  combatRef: React.RefObject<CombatSharedState>;
  registryRef: MonsterRegistry;
  killStreakConfig: KillStreakConfig;
  /** Read fresh at spawn time (not subscribed to) — a monster's stats are
   * fixed for its lifetime once spawned, only *new* spawns reflect however
   * long the streak has run by the time they appear. */
  streakKillCount: number;
  onMonsterKilled: (typeId: string) => void;
  characterConfig: CharacterConfig;
  spawnConfig: WorldSpawnConfig;
  /** Gates spawning on the player having actually entered the game — no mobs
   * appear (and none are broadcast) until the "Click to play" overlay is
   * dismissed. Latched upstream, so it never flips back to false mid-session. */
  active: boolean;
  /** Kollidierbare Hindernisse — Monster laufen nicht durch & springen über
   * niedrige Steine (lib/world-obstacles.ts). */
  obstaclesRef?: React.RefObject<Obstacle[]>;
  /** Navigations-Gitter (A*) für schlaue Wegfindung um Wände/in Labyrinth. */
  navGridRef?: React.RefObject<NavGrid>;
}

let spawnSeq = 0;

/** A remote attacker only keeps kill-streak credit for one of our monsters
 * if their last registered hit landed within this window before the monster
 * actually died — otherwise the killing blow is attributed to the local
 * owner (whose direct hits go straight through Monster.tsx and never touch
 * the remote-hitter map). Tuned to comfortably cover realtime round-trip +
 * the 8 Hz sync cadence while still excluding a stale tag from a much
 * earlier exchange. */
const REMOTE_KILL_CREDIT_WINDOW_MS = 600;

function randomSpawnPosition(spawnSafeRadius: number, obstacles?: Obstacle[] | null): [number, number, number] {
  let x = 0;
  let z = 0;
  // Mehrere Versuche, einen FREIEN Punkt zu finden (nicht in Häusern/Wänden) —
  // sonst hängen frisch gespawnte Mobs in Gebäuden fest.
  for (let attempt = 0; attempt < 24; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = spawnSafeRadius + Math.random() * (WORLD_RADIUS - spawnSafeRadius - 6);
    x = Math.cos(angle) * radius;
    z = Math.sin(angle) * radius;
    for (let k = 0; k < 2; k++) {
      const r = resolveObstacleCollision(obstacles, x, z, 0, 0.6);
      x = r.x;
      z = r.z;
    }
    if (isSpawnClear(obstacles, x, z, 1.8)) return [x, 0, z];
  }
  return [x, 0, z];
}

/**
 * Owns the spawn timer and the (small, infrequent — only changes on
 * spawn/despawn) list of currently-present monsters. Each `<Monster>`
 * manages its own AI/health/animation imperatively; this component's job
 * is purely "decide when a new one should appear, and stop rendering one
 * once its death animation has finished".
 *
 * Also handles cross-player monster sync: broadcasts own monster positions
 * and health at ~4Hz, receives remote snapshots and renders ghost versions,
 * processes incoming hit events for own monsters, and routes kill-streak
 * rewards to the correct player (attacker, not owner) on cross-player kills.
 */
export function MonstersField({
  userId,
  monsterTypes,
  combatRef,
  registryRef,
  killStreakConfig,
  streakKillCount,
  onMonsterKilled,
  characterConfig,
  spawnConfig,
  active,
  obstaclesRef,
  navGridRef,
}: MonstersFieldProps) {
  const [spawns, setSpawns] = useState<MonsterSpawn[]>([]);
  // Owned here, not by each Monster — see monster.tsx's onThrow doc
  // comment: this field has no position/scale transform of its own
  // (unlike each <Monster>, which is positioned+scaled per spawn), so it's
  // the right place to render projectiles in real world-space coordinates.
  const [projectiles, setProjectiles] = useState<LiveProjectile[]>([]);
  // Remote monsters keyed by ownerId — each owner's entry is replaced on
  // every monster_sync broadcast from that player.
  const [remoteMonsters, setRemoteMonsters] = useState<Map<string, MonsterSyncPayload["monsters"]>>(new Map());

  const spawnTimer = useRef(spawnConfig.spawnIntervalMinSec);
  // Boss-Track: eigener Timer (startet mit dem vollen Intervall, damit nicht
  // sofort beim Betreten ein Boss kommt). Max. 1 Boss gleichzeitig.
  const bossTimer = useRef(spawnConfig.bossSpawnIntervalMinSec);
  // Pro beschwörendem Monster ein Minion-Timer (Spawn-ID → Restzeit).
  const minionTimers = useRef<Map<string, number>>(new Map());
  // Mindest-Aggro: IDs der Monster, die den Spieler IMMER jagen (die N nächsten).
  const forcedAggroRef = useRef<Set<string>>(new Set());
  const forcedAggroTimer = useRef(0);
  // Live room population (lib/world-realtime.ts), always >= 1 (yourself) —
  // read in a ref, not React state, since useFrame below reads it every
  // tick and a roster sync re-rendering this whole field would be wasted
  // work.
  const playerCount = useRef(1);
  // Ref mirror of spawns so the sync interval can read the live list.
  const spawnsRef = useRef<MonsterSpawn[]>([]);
  // Tracks which remote attacker last hit a given own monster id, plus WHEN
  // (ms timestamp) — used to route kill-streak credit to the correct player
  // on a cross-player kill. The timestamp guards against a "kill steal": a
  // remote tag set long before the local owner lands the actual killing blow
  // would otherwise hand the streak credit to the wrong player. Only a
  // *recent* remote hit (within REMOTE_KILL_CREDIT_WINDOW_MS) counts as the
  // plausible final blow.
  const lastRemoteHitterRef = useRef<Map<string, { id: string; t: number }>>(new Map());
  // Live mirror of the room roster (by userId) — read synchronously in the
  // monster_sync handler so a late REST snapshot from a player who already
  // left can't resurrect their ghost monsters (the roster-leave cleanup
  // below only prunes the map it can see at leave time, not snapshots that
  // arrive a tick later).
  const onlineIdsRef = useRef<Set<string>>(new Set([userId]));
  // Tracks whether the player was dead last frame so we can fire the
  // despawn exactly once on the transition, not every frame while dead.
  const wasDeadRef = useRef(false);
  // Graceful death-fade: beim Tod des Besitzers werden die Monster für
  // MONSTER_DEATH_CLEANUP_MS als alive:false weitergesendet, damit andere
  // Spieler sie sanft ausfaden sehen (Death-Animation) statt sie abrupt zu
  // verlieren — auch wenn sie gerade mit ihnen kämpfen.
  const dyingSnapshotRef = useRef<
    { id: string; typeId: string; x: number; y: number; z: number; hp: number; maxHp: number; alive: boolean }[] | null
  >(null);
  const dyingUntilRef = useRef(0);

  // Cross-player aggro: when a remote attacker hits one of our monsters,
  // all our monsters temporarily chase the attacker's last known position.
  // Updated by subscribeToMonsterAggroAlert (set the window) and by
  // subscribeToWorldTransforms (track attacker movement while window is open).
  const aggroTargetRef = useRef<AggroTarget | null>(null);

  // Latest attack-pulse timestamp per remote monster id — written by the
  // monster_attack subscription, read each frame by RemoteMonster to fire a
  // one-shot lunge. A ref (not state) so an incoming attack never re-renders
  // the whole field; RemoteMonster polls its own id.
  const remoteAttackPulseRef = useRef<Map<string, number>>(new Map());
  // Own monsters that started a swing this flush window — buffered here (a
  // cheap Set.add in useFrame) and flushed as ONE batched broadcast on a
  // timer below, so the fetch POST never runs inside the render loop. This
  // is the fix for the frame-hitch a per-swing httpSend introduced.
  const pendingAttacksRef = useRef<Set<string>>(new Set());
  // Last time we heard a monster_sync from each remote owner — drives a
  // staleness despawn so a player who hard-drops (tab crash, network loss,
  // mobile background/sleep) doesn't leave their ghost monsters frozen for
  // the 30s+ Supabase takes to expire them from presence. A cleanly-dying or
  // idle but connected owner keeps broadcasting (even an empty list at 8 Hz),
  // so only a true disconnect goes stale.
  const lastMonsterSyncRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    spawnsRef.current = spawns;
  }, [spawns]);

  // Roster: track player count + remove remote monsters for players who left.
  useEffect(() => {
    return subscribeToWorldRoster((onlineUserIds) => {
      playerCount.current = Math.max(1, onlineUserIds.size);
      // Keep our own id in the live set too (presence usually includes it,
      // but never drop the local owner) so the sync-handler guard is robust.
      onlineIdsRef.current = new Set(onlineUserIds).add(userId);
      setRemoteMonsters((prev) => {
        let changed = false;
        const updated = new Map(prev);
        for (const ownerId of updated.keys()) {
          if (!onlineUserIds.has(ownerId)) {
            updated.delete(ownerId);
            changed = true;
          }
        }
        return changed ? updated : prev;
      });
    });
  }, [userId]);

  // Broadcast own monster pool at ~8Hz so other players can render smooth movement.
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Während des Death-Fade-Fensters die sterbenden Monster (alive:false)
      // weitersenden, damit Peers die Death-Animation spielen statt Instant-Pop.
      if (dyingUntilRef.current > Date.now() && dyingSnapshotRef.current) {
        broadcastMonsterSync({ ownerId: userId, monsters: dyingSnapshotRef.current });
        return;
      }
      const ownIds = new Set(spawnsRef.current.map((s) => s.id));
      const snapshot = spawnsRef.current
        .map((s) => {
          // Only look up handles that belong to this player's own spawns.
          const h = registryRef.current.find((h) => h.id === s.id && ownIds.has(h.id));
          if (!h) return null;
          const pos = h.getPosition();
          return {
            id: s.id,
            typeId: s.type.id,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            hp: h.getHp(),
            maxHp: s.type.health,
            alive: h.isAlive(),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      broadcastMonsterSync({ ownerId: userId, monsters: snapshot });
    }, 125);
    return () => clearInterval(intervalId);
  }, [userId, registryRef]);

  // Receive remote players' monster snapshots.
  useEffect(() => {
    return subscribeToMonsterSync((payload) => {
      // self: false on the channel means we never receive our own broadcast,
      // but guard anyway.
      if (payload.ownerId === userId) return;
      // Drop snapshots from a player who already left the roster — a late
      // REST packet must not resurrect ghosts the leave-cleanup just pruned.
      if (!onlineIdsRef.current.has(payload.ownerId)) return;
      lastMonsterSyncRef.current.set(payload.ownerId, Date.now());
      setRemoteMonsters((prev) => {
        const updated = new Map(prev);
        // Keep dead monsters too (alive:false) so RemoteMonster can play the
        // sink-and-fade death animation instead of popping out — the owner
        // keeps broadcasting a just-killed mob for ~MONSTER_DEATH_CLEANUP_MS
        // before dropping it from its own pool, which unmounts it here.
        updated.set(payload.ownerId, payload.monsters);
        return updated;
      });
    });
  }, [userId]);

  // Staleness despawn: drop a remote owner's ghost monsters if we haven't
  // heard a monster_sync from them in STALE_MS (hard-drop, not a clean
  // leave). 2500ms = 20 missed 8 Hz ticks — far beyond normal jitter.
  useEffect(() => {
    const STALE_MS = 2500;
    const intervalId = setInterval(() => {
      const now = Date.now();
      const last = lastMonsterSyncRef.current;
      setRemoteMonsters((prev) => {
        let changed = false;
        const updated = new Map(prev);
        for (const ownerId of updated.keys()) {
          if (now - (last.get(ownerId) ?? 0) > STALE_MS) {
            updated.delete(ownerId);
            last.delete(ownerId);
            changed = true;
          }
        }
        return changed ? updated : prev;
      });
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Apply incoming hits from other players on our own monsters.
  useEffect(() => {
    return subscribeToMonsterHit((payload) => {
      if (payload.ownerId !== userId) return;
      const handle = registryRef.current.find((h) => h.id === payload.monsterId);
      if (!handle || !handle.isAlive()) return;
      // Track last remote hitter for kill attribution before applying damage.
      lastRemoteHitterRef.current.set(payload.monsterId, { id: payload.attackerId, t: Date.now() });
      handle.takeDamage(payload.amount);
    });
  }, [userId, registryRef]);

  // Award kill-streak reward to local player if they are the credited killer.
  useEffect(() => {
    return subscribeToMonsterKill((payload) => {
      if (payload.killerId !== userId) return;
      onMonsterKilled(payload.typeId);
    });
  }, [userId, onMonsterKilled]);

  // Flush buffered own-monster attacks as one batched broadcast, off the
  // render loop. Skip entirely when alone in the room (nobody to animate for).
  useEffect(() => {
    const intervalId = setInterval(() => {
      const pending = pendingAttacksRef.current;
      if (pending.size === 0) return;
      if (playerCount.current > 1) {
        broadcastMonsterAttack({ ownerId: userId, monsterIds: Array.from(pending) });
      }
      pending.clear();
    }, 100);
    return () => clearInterval(intervalId);
  }, [userId]);

  // Receive remote monster-attack pulses → record a timestamp the matching
  // RemoteMonster reads each frame to play its lunge.
  useEffect(() => {
    return subscribeToMonsterAttack((payload) => {
      if (payload.ownerId === userId) return;
      if (!onlineIdsRef.current.has(payload.ownerId)) return;
      const now = Date.now();
      // Prune stale pulses (a lunge is consumed within ~0.3s) so the map
      // can't grow unbounded with ids of long-despawned monsters.
      const map = remoteAttackPulseRef.current;
      if (map.size > 64) {
        for (const [mid, t] of map) {
          if (now - t > 5000) map.delete(mid);
        }
      }
      for (const mid of payload.monsterIds) map.set(mid, now);
    });
  }, [userId]);

  // Cross-player aggro: when someone hits one of our monsters, make all our
  // monsters chase the attacker for crossPlayerAggroDurationSec seconds.
  useEffect(() => {
    if (spawnConfig.crossPlayerAggroDurationSec <= 0) return;
    return subscribeToMonsterAggroAlert((payload) => {
      if (payload.ownerId !== userId) return;
      const expiresAt = Date.now() + spawnConfig.crossPlayerAggroDurationSec * 1000;
      aggroTargetRef.current = {
        userId: payload.attackerId,
        x: payload.attackerX,
        z: payload.attackerZ,
        expiresAt,
      };
    });
  }, [userId, spawnConfig.crossPlayerAggroDurationSec]);

  // Track the aggro target's position as they move so monsters keep chasing.
  useEffect(() => {
    return subscribeToWorldTransforms((payload) => {
      const t = aggroTargetRef.current;
      if (t && t.userId === payload.id && t.expiresAt > Date.now()) {
        aggroTargetRef.current = { ...t, x: payload.x, z: payload.z };
      }
    });
  }, []);

  useFrame((_, delta) => {
    // No spawning / AI ticking until the player has entered the game — keeps
    // the world empty behind the "Click to play" overlay. Latched, so this is
    // only ever true before the very first entry.
    if (!active) return;

    const isDead = combatRef.current.dead;

    // When the local player dies, instantly despawn all their mobs and
    // broadcast an empty list so every peer's remote-monster renderer
    // clears them immediately — no need to wait for the next 8Hz sync tick.
    if (isDead && !wasDeadRef.current) {
      wasDeadRef.current = true;
      // Graceful death-fade: eine alive:false-Momentaufnahme aller Monster bauen,
      // die der Sync-Interval für MONSTER_DEATH_CLEANUP_MS weitersendet → Peers
      // sehen die Death-Animation (sink & fade) statt eines abrupten Verschwindens.
      dyingSnapshotRef.current = spawnsRef.current.map((s) => {
        const h = registryRef.current.find((x) => x.id === s.id);
        const pos = h ? h.getPosition() : null;
        return {
          id: s.id, typeId: s.type.id,
          x: pos?.x ?? 0, y: pos?.y ?? 0, z: pos?.z ?? 0,
          hp: 0, maxHp: s.type.health, alive: false,
        };
      });
      dyingUntilRef.current = Date.now() + MONSTER_DEATH_CLEANUP_MS;
      broadcastMonsterSync({ ownerId: userId, monsters: dyingSnapshotRef.current });
      // Lokal sofort entfernen (der Spieler sieht ohnehin den Death-Screen).
      spawnsRef.current = [];
      setSpawns([]);
      setProjectiles([]);
      // Cleanup state tied to the now-despawned mobs: stale kill-attribution
      // tags would otherwise accumulate across a long session, and a lingering
      // cross-player aggro target would keep firing cross-attack broadcasts at
      // a player our (now gone) monsters were chasing.
      lastRemoteHitterRef.current.clear();
      aggroTargetRef.current = null;
    }
    // When the player respawns, add a short delay before the first mob appears.
    if (!isDead && wasDeadRef.current) {
      wasDeadRef.current = false;
      bossTimer.current = spawnConfig.bossSpawnIntervalMinSec; // Boss-Timer nach Respawn neu
      dyingSnapshotRef.current = null;
      dyingUntilRef.current = 0;
      spawnTimer.current = 3.0;
    }

    // No spawning while dead.
    if (isDead) return;

    // --- Mindest-Aggro: die N nächsten eigenen Monster jagen IMMER den Spieler
    // (unabhängig von der Aggro-Reichweite) → kein passives Rumstehen. Alle 0.5s
    // neu bestimmt (gedrosselt; vermeidet Flackern + spart Rechenzeit). Während
    // Spawn-Schutz aus (invulnerable → kein Aggro). minAggressors=0 = aus.
    forcedAggroTimer.current -= delta;
    if (forcedAggroTimer.current <= 0) {
      forcedAggroTimer.current = 0.5;
      const set = forcedAggroRef.current;
      set.clear();
      if (!combatRef.current.invulnerable && spawnConfig.minAggressors > 0) {
        const ppos = combatRef.current.playerPos;
        const own = registryRef.current.filter((h) => !h.ownerId && h.isAlive());
        own.sort((a, b) => a.getPosition().distanceToSquared(ppos) - b.getPosition().distanceToSquared(ppos));
        for (let i = 0; i < Math.min(spawnConfig.minAggressors, own.length); i++) set.add(own[i].id);
      }
    }

    // --- Boss-Spawn (eigener, seltener Track; max. 1 Boss gleichzeitig) ------
    if (spawnConfig.bossSpawnIntervalMaxSec > 0) {
      bossTimer.current -= delta;
      if (bossTimer.current <= 0) {
        bossTimer.current =
          spawnConfig.bossSpawnIntervalMinSec +
          Math.random() * Math.max(0, spawnConfig.bossSpawnIntervalMaxSec - spawnConfig.bossSpawnIntervalMinSec);
        setSpawns((curr) => {
          if (curr.some((s) => s.type.isBoss)) return curr; // schon ein Boss aktiv
          const bosses = monsterTypes.filter((t) => t.isBoss && t.enabled);
          if (!bosses.length) return curr;
          const bossType = bosses[Math.floor(Math.random() * bosses.length)];
          const scale = streakMobScale(streakKillCount, killStreakConfig);
          const dmgMult = spawnConfig.monsterDamageMultiplier ?? 1;
          const scaledBoss: MonsterTypeConfig = {
            ...bossType,
            health: Math.round(bossType.health * scale),
            attackDamage: Math.max(1, Math.round(bossType.attackDamage * scale * dmgMult)),
            throwDamage: bossType.throwDamage ? Math.max(1, Math.round(bossType.throwDamage * dmgMult)) : bossType.throwDamage,
          };
          return [...curr, { id: `${userId.slice(0, 8)}_b${++spawnSeq}`, type: scaledBoss, position: randomSpawnPosition(spawnConfig.spawnSafeRadius, obstaclesRef?.current) }];
        });
      }
    }

    // --- Minion-Beschwörung (Bosse/Giftspinne spawnen verkleinerte Mini-Mobs) -
    {
      const ready: { parentId: string; minionType: MonsterTypeConfig; max: number; x: number; z: number }[] = [];
      for (const s of spawnsRef.current) {
        const mt = s.type;
        if (!mt.minionTypeId || !mt.minionMaxAlive || mt.minionMaxAlive <= 0) continue;
        const interval = mt.minionIntervalSec ?? 8;
        let timer = minionTimers.current.get(s.id);
        if (timer === undefined) { minionTimers.current.set(s.id, interval); continue; } // erst nach 1 Intervall
        timer -= delta;
        if (timer > 0) { minionTimers.current.set(s.id, timer); continue; }
        minionTimers.current.set(s.id, interval);
        const minionType = monsterTypes.find((t) => t.id === mt.minionTypeId && t.enabled);
        if (!minionType) continue;
        const pos = registryRef.current.find((h) => h.id === s.id)?.getPosition();
        ready.push({
          parentId: s.id,
          minionType,
          max: mt.minionMaxAlive,
          x: pos ? pos.x : s.position[0],
          z: pos ? pos.z : s.position[2],
        });
      }
      if (ready.length) {
        setSpawns((curr) => {
          let next = curr;
          for (const rp of ready) {
            if (next.filter((x) => x.minionOf === rp.parentId).length >= rp.max) continue;
            // Mini-Variante: kleiner, schwächer, weniger Belohnung.
            const mini: MonsterTypeConfig = {
              ...rp.minionType,
              scale: rp.minionType.scale * 0.5,
              health: Math.max(1, Math.round(rp.minionType.health * 0.4)),
              attackDamage: Math.max(1, Math.round(rp.minionType.attackDamage * 0.6 * (spawnConfig.monsterDamageMultiplier ?? 1))),
              rewardMin: Math.max(1, Math.round(rp.minionType.rewardMin * 0.4)),
              rewardMax: Math.max(1, Math.round(rp.minionType.rewardMax * 0.4)),
              isBoss: false,
              minionTypeId: undefined,
              minionMaxAlive: 0,
            };
            const ang = Math.random() * Math.PI * 2;
            next = [
              ...next,
              {
                id: `${userId.slice(0, 8)}_n${++spawnSeq}`,
                type: mini,
                position: [rp.x + Math.cos(ang) * 1.6, 0, rp.z + Math.sin(ang) * 1.6],
                minionOf: rp.parentId,
              },
            ];
          }
          return next;
        });
      }
    }

    spawnTimer.current -= delta;
    if (spawnTimer.current > 0) return;
    const extra = Math.max(0, playerCount.current - 1);
    const intervalScale = Math.max(
      spawnConfig.spawnIntervalFloor,
      Math.pow(0.85, extra)
    );
    spawnTimer.current =
      (spawnConfig.spawnIntervalMinSec +
        Math.random() * (spawnConfig.spawnIntervalMaxSec - spawnConfig.spawnIntervalMinSec)) *
      intervalScale;
    const aliveCap = Math.min(
      spawnConfig.aliveCapMax,
      spawnConfig.maxAliveMonsters + extra * spawnConfig.aliveCapPerExtraPlayer
    );

    setSpawns((curr) => {
      // Normalo-Zählung getrennt vom Boss; während ein Boss lebt, sinkt die
      // Normalo-Obergrenze (Faktor) → nie 40 Mobs + Boss gleichzeitig.
      const bossAlive = curr.some((s) => s.type.isBoss);
      // Minions (minionOf) zählen NICHT gegen die Normalo-Obergrenze (sie sind
      // pro Elternmonster gedeckelt) — sonst würden Boss-Minions normale Spawns ersticken.
      const nonBossCount = curr.filter((s) => !s.type.isBoss && !s.minionOf).length;
      const effCap = bossAlive ? Math.max(1, Math.ceil(aliveCap * spawnConfig.bossActiveAliveCapFactor)) : aliveCap;
      if (nonBossCount >= effCap) return curr;
      const type = pickWeightedMonsterType(monsterTypes.filter((t) => !t.isBoss));
      if (!type) return curr;
      const scale = streakMobScale(streakKillCount, killStreakConfig);
      const dmgMult = spawnConfig.monsterDamageMultiplier ?? 1;
      // A fresh object, never mutating the shared `type` config other
      // spawns/the admin panel still read — only this one spawn's copy gets
      // the streak-scaled numbers + den globalen Schadens-Multiplikator.
      const scaledType: MonsterTypeConfig = {
        ...type,
        health: Math.round(type.health * scale),
        attackDamage: Math.max(1, Math.round(type.attackDamage * scale * dmgMult)),
        throwDamage: type.throwDamage ? Math.max(1, Math.round(type.throwDamage * dmgMult)) : type.throwDamage,
      };
      // Namespace the spawn id with the first 8 chars of userId to avoid id
      // collisions with remote monsters that also use sequential counters.
      return [...curr, { id: `${userId.slice(0, 8)}_m${++spawnSeq}`, type: scaledType, position: randomSpawnPosition(spawnConfig.spawnSafeRadius, obstaclesRef?.current) }];
    });
  });

  function handleRemoteAttack(amount: number) {
    const t = aggroTargetRef.current;
    if (!t || t.expiresAt <= Date.now()) return;
    broadcastMonsterCrossAttack({ ownerId: userId, targetPlayerId: t.userId, amount });
  }

  function handleDied(spawnId: string, typeId: string) {
    minionTimers.current.delete(spawnId); // Minion-Timer des toten Beschwörers freigeben
    const lastHit = lastRemoteHitterRef.current.get(spawnId);
    lastRemoteHitterRef.current.delete(spawnId);
    // Only credit the remote attacker if their last hit was recent enough to
    // plausibly be the killing blow — otherwise a local owner's killing hit
    // after an old remote tag would wrongly hand them the streak (kill steal).
    const remoteKillerId =
      lastHit && Date.now() - lastHit.t < REMOTE_KILL_CREDIT_WINDOW_MS ? lastHit.id : null;

    if (remoteKillerId !== null && remoteKillerId !== userId) {
      // Remote player landed the killing blow — broadcast the kill so they
      // receive the streak reward rather than us.
      broadcastMonsterKill({ ownerId: userId, monsterId: spawnId, typeId, killerId: remoteKillerId });
    } else {
      // Local player's kill.
      onMonsterKilled(typeId);
    }

    setTimeout(() => {
      setSpawns((curr) => curr.filter((s) => s.id !== spawnId));
    }, MONSTER_DEATH_CLEANUP_MS);
  }

  function handleThrow(request: ThrowRequest) {
    const throwId = ++projectileSeq;
    setProjectiles((curr) => [...curr, { ...request, id: throwId }]);
    const [ox, oy, oz] = request.origin;
    const [tx, ty, tz] = request.target;
    const travelMs = (Math.hypot(tx - ox, ty - oy, tz - oz) / PROJECTILE_SPEED) * 1000 + 100;
    setTimeout(() => setProjectiles((curr) => curr.filter((p) => p.id !== throwId)), travelMs);
  }

  // Build a flat list of all remote monsters for rendering, enriched with
  // their MonsterTypeConfig (looked up by typeId from the monsterTypes prop).
  const remoteMonsterList = Array.from(remoteMonsters.entries()).flatMap(([ownerId, monsters]) =>
    monsters.map((m) => ({ ...m, ownerId }))
  );

  return (
    <>
      {spawns.map((s) => (
        <Monster
          key={s.id}
          id={s.id}
          type={s.type}
          initialPosition={s.position}
          combatRef={combatRef}
          registryRef={registryRef}
          onDied={(typeId) => handleDied(s.id, typeId)}
          onThrow={handleThrow}
          characterConfig={characterConfig}
          aggroTargetRef={aggroTargetRef}
          forcedAggroRef={forcedAggroRef}
          obstaclesRef={obstaclesRef}
          navGridRef={navGridRef}
          onRemoteAttack={handleRemoteAttack}
          onAttack={() => pendingAttacksRef.current.add(s.id)}
        />
      ))}
      {projectiles.map((p) => (
        <ThrownProjectile
          key={p.id}
          origin={p.origin}
          target={p.target}
          damage={p.damage}
          color={p.color}
          combatRef={combatRef}
        />
      ))}
      {remoteMonsterList.map((m) => {
        const type = monsterTypes.find((t) => t.id === m.typeId);
        if (!type) return null;
        return (
          <RemoteMonster
            key={`${m.ownerId}_${m.id}`}
            ownerId={m.ownerId}
            localUserId={userId}
            id={m.id}
            type={type}
            x={m.x}
            y={m.y}
            z={m.z}
            hp={m.hp}
            maxHp={m.maxHp}
            alive={m.alive}
            attackPulseRef={remoteAttackPulseRef}
            registryRef={registryRef}
            characterConfig={characterConfig}
          />
        );
      })}
    </>
  );
}
