"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { CharacterModel } from "@/components/world/character-model";
import {
  subscribeToParkourGhosts,
  subscribeToParkourLeave,
  type ParkourGhostPayload,
} from "@/lib/parkour-realtime";

interface GhostRuntime {
  name: string;
  gender: "m" | "w";
  target: THREE.Vector3;
  yaw: number;
  finished: boolean;
  group: THREE.Group | null;
}

interface GhostView { id: string; name: string; gender: "m" | "w"; finished: boolean }

const EMPTY_EQUIP: Record<string, undefined> = {};

/** Renders the other lobby players as their actual (default-cosmetic) character
 * models that lerp toward each broadcast transform. Position/yaw stay in the ref
 * and are applied imperatively every frame; React only re-renders when the SET
 * of ghosts (or a name/gender/finish flag) changes — never on a position tick. */
export function ParkourGhosts({ selfId }: { selfId: string }) {
  const ghosts = useRef<Map<string, GhostRuntime>>(new Map());
  const [views, setViews] = useState<GhostView[]>([]);

  useEffect(() => {
    const snapshot = () =>
      setViews(Array.from(ghosts.current.entries()).map(([id, g]) => ({ id, name: g.name, gender: g.gender, finished: g.finished })));
    const unGhost = subscribeToParkourGhosts((p: ParkourGhostPayload) => {
      if (p.id === selfId) return;
      const existing = ghosts.current.get(p.id);
      if (!existing) {
        ghosts.current.set(p.id, {
          name: p.name, gender: p.gender ?? "m", target: new THREE.Vector3(p.x, p.y, p.z), yaw: p.yaw, finished: p.finished, group: null,
        });
        snapshot();
      } else {
        existing.target.set(p.x, p.y, p.z);
        existing.yaw = p.yaw;
        if (existing.name !== p.name || existing.finished !== p.finished || existing.gender !== p.gender) {
          existing.name = p.name;
          existing.finished = p.finished;
          existing.gender = p.gender ?? existing.gender;
          snapshot();
        }
      }
    });
    const unLeave = subscribeToParkourLeave((id) => {
      if (ghosts.current.delete(id)) snapshot();
    });
    return () => { unGhost(); unLeave(); };
  }, [selfId]);

  useFrame((_, delta) => {
    const k = 1 - Math.exp(-delta * 12);
    for (const gr of ghosts.current.values()) {
      if (!gr.group) continue;
      gr.group.position.lerp(gr.target, k);
      gr.group.rotation.y = gr.yaw;
    }
  });

  return (
    <group>
      {views.map((v) => (
        <group
          key={v.id}
          ref={(el) => { const g = ghosts.current.get(v.id); if (g) g.group = el; }}
          position={[0, -999, 0]}
        >
          <group scale={0.98}>
            <CharacterModel equippedByCategory={EMPTY_EQUIP} gender={v.gender} />
          </group>
          <Html position={[0, 2.4, 0]} center distanceFactor={10} occlude={false} style={{ pointerEvents: "none", userSelect: "none" }}>
            <div style={{
              fontSize: "12px", fontWeight: 800, color: "#fff", whiteSpace: "nowrap",
              textShadow: "0 1px 3px rgba(0,0,0,0.9)", display: "flex", alignItems: "center", gap: "4px",
              background: "rgba(0,0,0,0.35)", padding: "1px 6px", borderRadius: "6px",
            }}>
              {v.finished && <span>🏁</span>}
              {v.name}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
