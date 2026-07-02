"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { CharacterModel, type CharacterLimbRefs } from "@/components/world/character-model";
import { angleDelta } from "@/components/world/player";
import {
  subscribeToParkourGhosts,
  subscribeToParkourProfile,
  subscribeToParkourLeave,
  type ParkourGhostPayload,
  type ParkourProfilePayload,
} from "@/lib/parkour-realtime";
import type { EquippedItem } from "@/lib/rarity-colors";

/** Live transform + animation state for one remote player (mutated on every 20 Hz
 * broadcast; the avatar's useFrame reads it — no React re-render per tick). */
interface GhostRuntime {
  target: THREE.Vector3;
  yaw: number;
  moving: boolean;
  grounded: boolean;
  sprinting: boolean;
  dashing: boolean;
  hurt: boolean;
  finished: boolean;
  hasPos: boolean;
  // per-ghost animation accumulators (mirror the local player's)
  walkClock: number;
  walkAmp: number;
  jumpPose: number;
  dashPose: number;
  hurtPose: number;
}

interface GhostView {
  id: string;
  name: string;
  gender: "m" | "w";
  equipped: Record<string, EquippedItem | undefined>;
  finished: boolean;
}

const EMPTY_EQUIP: Record<string, EquippedItem | undefined> = {};

function newRuntime(): GhostRuntime {
  return {
    target: new THREE.Vector3(0, -999, 0), yaw: 0,
    moving: false, grounded: true, sprinting: false, dashing: false, hurt: false, finished: false, hasPos: false,
    walkClock: 0, walkAmp: 0, jumpPose: 0, dashPose: 0, hurtPose: 0,
  };
}

/** Renders every OTHER lobby player as their real character (equipped cosmetics +
 * gender), fully animated (walk cycle / airborne splay / dash crouch) and smoothly
 * interpolated from their 20 Hz transform broadcast — so players see each other's
 * gear + movements perfectly in sync. */
export function ParkourGhosts({ selfId }: { selfId: string }) {
  const ghosts = useRef<Map<string, GhostRuntime>>(new Map());
  const [views, setViews] = useState<GhostView[]>([]);

  useEffect(() => {
    const ensure = (id: string) => {
      let gr = ghosts.current.get(id);
      if (!gr) { gr = newRuntime(); ghosts.current.set(id, gr); }
      return gr;
    };

    const unGhost = subscribeToParkourGhosts((p: ParkourGhostPayload) => {
      if (p.id === selfId) return;
      const gr = ensure(p.id);
      gr.target.set(p.x, p.y, p.z);
      gr.yaw = p.yaw;
      gr.moving = p.moving;
      gr.grounded = p.grounded;
      gr.sprinting = p.sprinting;
      gr.dashing = p.dashing;
      gr.hurt = p.hurt;
      const finishChanged = gr.finished !== p.finished;
      gr.finished = p.finished;
      if (!gr.hasPos) {
        gr.hasPos = true;
        setViews((v) => v.some((e) => e.id === p.id) ? v : [...v, { id: p.id, name: "Spieler", gender: "m", equipped: EMPTY_EQUIP, finished: p.finished }]);
      } else if (finishChanged) {
        setViews((v) => v.map((e) => e.id === p.id ? { ...e, finished: p.finished } : e));
      }
    });

    const unProfile = subscribeToParkourProfile((p: ParkourProfilePayload) => {
      if (p.id === selfId) return;
      ensure(p.id);
      setViews((v) => {
        const i = v.findIndex((e) => e.id === p.id);
        if (i === -1) return [...v, { id: p.id, name: p.name, gender: p.gender, equipped: p.equipped ?? EMPTY_EQUIP, finished: false }];
        const next = [...v];
        next[i] = { ...next[i], name: p.name, gender: p.gender, equipped: p.equipped ?? EMPTY_EQUIP };
        return next;
      });
    });

    const unLeave = subscribeToParkourLeave((id) => {
      if (ghosts.current.delete(id)) setViews((v) => v.filter((e) => e.id !== id));
    });

    return () => { unGhost(); unProfile(); unLeave(); };
  }, [selfId]);

  return (
    <group>
      {views.map((v) => (
        <GhostAvatar key={v.id} id={v.id} name={v.name} gender={v.gender} equipped={v.equipped} finished={v.finished} ghostsRef={ghosts} />
      ))}
    </group>
  );
}

function GhostAvatar({
  id, name, gender, equipped, finished, ghostsRef,
}: {
  id: string; name: string; gender: "m" | "w";
  equipped: Record<string, EquippedItem | undefined>; finished: boolean;
  ghostsRef: React.RefObject<Map<string, GhostRuntime>>;
}) {
  const group = useRef<THREE.Group>(null);
  const limbs = useRef<CharacterLimbRefs>(null);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    const gr = ghostsRef.current?.get(id);
    const g = group.current;
    if (!gr || !g) return;

    // Smooth interpolation toward the latest broadcast transform.
    g.position.lerp(gr.target, 1 - Math.exp(-delta * 14));
    g.rotation.y += angleDelta(g.rotation.y, gr.yaw) * (1 - Math.exp(-delta * 16));

    // Dash crouch + hurt recoil.
    gr.dashPose = THREE.MathUtils.lerp(gr.dashPose, gr.dashing ? 1 : 0, Math.min(1, delta * 12));
    gr.hurtPose = THREE.MathUtils.lerp(gr.hurtPose, gr.hurt ? 1 : 0, Math.min(1, delta * (gr.hurt ? 22 : 8)));
    g.scale.y = 1 - gr.dashPose * 0.2;
    // A wild stumble-back when knocked: tilt the body backward.
    g.rotation.x = -gr.hurtPose * 0.5;

    // Limb animation — identical maths to the local player, + hurt flail.
    gr.jumpPose = THREE.MathUtils.lerp(gr.jumpPose, gr.grounded ? 0 : 1, Math.min(1, delta * 10));
    gr.walkClock += delta * (gr.sprinting ? 13 : 9);
    gr.walkAmp = THREE.MathUtils.lerp(gr.walkAmp, gr.moving && gr.grounded ? 1 : 0, Math.min(1, delta * 8));
    const swing = Math.sin(gr.walkClock) * gr.walkAmp * 0.6;
    const hp = gr.hurtPose;
    const l = limbs.current;
    if (l) {
      const jp = gr.jumpPose;
      if (l.legL.current) l.legL.current.rotation.x = THREE.MathUtils.lerp(swing, -0.3, jp);
      if (l.legR.current) l.legR.current.rotation.x = THREE.MathUtils.lerp(-swing, 0.3, jp);
      if (l.armL.current) { l.armL.current.rotation.x = THREE.MathUtils.lerp(-swing, -0.5, jp) - hp * 1.4; l.armL.current.rotation.z = -0.15 - jp * 0.5 - hp * 0.5; }
      if (l.armR.current) { l.armR.current.rotation.x = THREE.MathUtils.lerp(swing, -0.5, jp) - hp * 1.4; l.armR.current.rotation.z = 0.15 + jp * 0.5 + hp * 0.5; }
    }
  });

  return (
    <group ref={group} position={[0, -999, 0]}>
      <CharacterModel ref={limbs} equippedByCategory={equipped} gender={gender} />
      <Html position={[0, 2.5, 0]} center distanceFactor={10} occlude={false} style={{ pointerEvents: "none", userSelect: "none" }}>
        <div style={{
          fontSize: "12px", fontWeight: 800, color: "#fff", whiteSpace: "nowrap",
          textShadow: "0 1px 3px rgba(0,0,0,0.9)", display: "flex", alignItems: "center", gap: "4px",
          background: "rgba(0,0,0,0.35)", padding: "1px 6px", borderRadius: "6px",
        }}>
          {finished && <span>🏁</span>}
          {name}
        </div>
      </Html>
    </group>
  );
}
