"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {
  subscribeToParkourGhosts,
  subscribeToParkourLeave,
  type ParkourGhostPayload,
} from "@/lib/parkour-realtime";

interface GhostRuntime {
  name: string;
  target: THREE.Vector3;
  yaw: number;
  finished: boolean;
  group: THREE.Group | null;
}

interface GhostView { id: string; name: string; finished: boolean }

/** Renders the other lobby players as lightweight translucent capsules that
 * lerp toward their last broadcast transform. Deliberately NOT full
 * CharacterModels — we don't have remote players' equipped items here and a
 * capsule keeps a 6-player race cheap on mobile. The capsule position is
 * updated imperatively every frame; React only re-renders when the SET of
 * ghosts changes (join/leave), never on a position tick. */
export function ParkourGhosts({ selfId, colorHex }: { selfId: string; colorHex: string }) {
  const ghosts = useRef<Map<string, GhostRuntime>>(new Map());
  // Render-driving snapshot (id + name + finished). Position/yaw stay in the ref
  // and are applied imperatively in useFrame, so nothing reads the ref during
  // render. This only changes on join/leave/finish — never per position tick.
  const [views, setViews] = useState<GhostView[]>([]);

  useEffect(() => {
    const snapshot = () =>
      setViews(Array.from(ghosts.current.entries()).map(([id, g]) => ({ id, name: g.name, finished: g.finished })));
    const unGhost = subscribeToParkourGhosts((p: ParkourGhostPayload) => {
      if (p.id === selfId) return;
      const existing = ghosts.current.get(p.id);
      if (!existing) {
        ghosts.current.set(p.id, {
          name: p.name, target: new THREE.Vector3(p.x, p.y, p.z), yaw: p.yaw, finished: p.finished, group: null,
        });
        snapshot();
      } else {
        existing.target.set(p.x, p.y, p.z);
        existing.yaw = p.yaw;
        // Name/finish rarely change — only re-snapshot (re-render) when they do.
        if (existing.name !== p.name || existing.finished !== p.finished) {
          existing.name = p.name;
          existing.finished = p.finished;
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
          // Placeholder position — useFrame lerps it to the live target every
          // frame, so we never read the ref during render.
          ref={(el) => { const g = ghosts.current.get(v.id); if (g) g.group = el; }}
          position={[0, -999, 0]}
        >
          <mesh position={[0, 0.9, 0]} castShadow>
            <capsuleGeometry args={[0.35, 1.0, 4, 10]} />
            <meshStandardMaterial color={colorHex} emissive={colorHex} emissiveIntensity={0.35} transparent opacity={0.7} />
          </mesh>
          <Html position={[0, 2.1, 0]} center distanceFactor={9} occlude={false} style={{ pointerEvents: "none", userSelect: "none" }}>
            <div style={{
              fontSize: "12px", fontWeight: 800, color: "#fff", whiteSpace: "nowrap",
              textShadow: "0 1px 3px rgba(0,0,0,0.9)", display: "flex", alignItems: "center", gap: "4px",
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
