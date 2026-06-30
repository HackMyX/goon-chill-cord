"use client";

import { Suspense } from "react";
import { useGLTF, Clone } from "@react-three/drei";
import type { Obstacle } from "@/lib/world-obstacles";
import { WORLD_MODEL_REGISTRY, type WorldModelDef } from "@/lib/world-models";

// Alle registrierten Modelle beim Laden vorab kompilieren/holen (analog <Preload all/>
// in world-shell.tsx) → kein Lade-Stall mitten im Spiel. Bei leerer Registry No-Op.
for (const def of Object.values(WORLD_MODEL_REGISTRY)) {
  if (def) useGLTF.preload(def.url);
}

function ModelGroup({ def, items }: { def: WorldModelDef; items: Obstacle[] }) {
  // useGLTF cached pro URL → die Geometrie/Material werden EINMAL geladen und über
  // alle <Clone>-Instanzen geteilt (drei <Clone> dupliziert nur die Knoten-Hülle,
  // nicht die GPU-Buffer). Frustum-Culling ist per-Mesh standardmäßig an → was
  // außerhalb der Kamera liegt, wird nicht gezeichnet.
  const { scene } = useGLTF(def.url);
  const baseScale = def.scale ?? 1;
  const yOff = def.yOffset ?? 0;
  const yaw = def.yawOffset ?? 0;
  return (
    <group>
      {items.map((o, i) => (
        <Clone
          key={i}
          object={scene}
          position={[o.x, yOff, o.z]}
          rotation={[0, (o.rot ?? 0) + yaw, 0]}
          scale={(o.scale ?? 1) * baseScale}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

/**
 * Rendert alle Obstacles eines Kinds als echtes GLTF-Modell. Eigene Suspense →
 * ein langsames/fehlendes Modell blockiert NIE die ganze Szene; Fallback ist
 * "nichts" (bei korrektem Gating übernimmt der prozedurale Renderer, solange das
 * Kind nicht in der Registry steht — steht es drin, ist dies die einzige Optik).
 *
 * Hinweis: <Clone> teilt Buffers, ist aber kein GPU-Instancing. Für sehr hohe
 * Stückzahlen (Bäume/Felsen, 100+) sollte später auf InstancedMesh/<Merged>
 * umgestellt werden (Phase-2-Performance) — für deko-arme Kinds (Wracks, Ruinen,
 * Laternen, Kisten) ist Clone + Frustum-Culling völlig ausreichend.
 */
export function WorldModelInstances({ def, items }: { def: WorldModelDef; items: Obstacle[] }) {
  if (!items.length) return null;
  return (
    <Suspense fallback={null}>
      <ModelGroup def={def} items={items} />
    </Suspense>
  );
}
