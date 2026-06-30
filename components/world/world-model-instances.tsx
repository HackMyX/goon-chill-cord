"use client";

import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF, Clone } from "@react-three/drei";
import * as THREE from "three";
import type { Obstacle } from "@/lib/world-obstacles";
import { WORLD_MODEL_REGISTRY, type WorldModelDef } from "@/lib/world-models";

/** Ab dieser Stückzahl wird ECHTES GPU-Instancing (InstancedMesh) statt <Clone>
 * genutzt — sonst würden Bäume/Felsen (100+) hunderte Draw-Calls erzeugen. */
const INSTANCING_THRESHOLD = 40;
const YAXIS = new THREE.Vector3(0, 1, 0);

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

/** Ein InstancedMesh pro GLTF-Teilmesh: setzt die Pro-Instanz-Matrix als
 * (Außen-Transform aus dem Obstacle) × (gebackene Teilmesh-Weltmatrix). Korrekt
 * per Matrix-Komposition — ein Draw-Call pro Teilmesh statt einem pro Objekt. */
function InstancedChunk({
  geometry, material, meshMatrix, items, base, yOff, yaw,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  meshMatrix: THREE.Matrix4;
  items: Obstacle[];
  base: number;
  yOff: number;
  yaw: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const inst = ref.current;
    if (!inst) return;
    const outer = new THREE.Matrix4();
    const tmp = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    for (let i = 0; i < items.length; i++) {
      const o = items[i];
      const s = (o.scale ?? 1) * base;
      pos.set(o.x, yOff, o.z);
      q.setFromAxisAngle(YAXIS, (o.rot ?? 0) + yaw);
      scl.set(s, s, s);
      outer.compose(pos, q, scl);
      tmp.multiplyMatrices(outer, meshMatrix);
      inst.setMatrixAt(i, tmp);
    }
    inst.instanceMatrix.needsUpdate = true;
  }, [items, meshMatrix, base, yOff, yaw]);
  // frustumCulled aus: die Instanzen spannen die ganze Welt → eine batch-weite
  // Bounding-Sphere würde nie cullen, also kein Nutzen, aber Risiko (alles weg).
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow receiveShadow frustumCulled={false} />;
}

function InstancedModel({ def, items }: { def: WorldModelDef; items: Obstacle[] }) {
  const { scene } = useGLTF(def.url);
  // Alle Teilmeshes mit ihrer gebackenen Weltmatrix einsammeln (einmal pro Modell).
  const chunks = useMemo(() => {
    scene.updateMatrixWorld(true);
    const list: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; matrix: THREE.Matrix4 }[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) list.push({ geometry: m.geometry, material: m.material, matrix: m.matrixWorld.clone() });
    });
    return list;
  }, [scene]);
  const base = def.scale ?? 1;
  const yOff = def.yOffset ?? 0;
  const yaw = def.yawOffset ?? 0;
  return (
    <>
      {chunks.map((c, i) => (
        <InstancedChunk key={i} geometry={c.geometry} material={c.material} meshMatrix={c.matrix} items={items} base={base} yOff={yOff} yaw={yaw} />
      ))}
    </>
  );
}

/**
 * Rendert alle Obstacles eines Kinds als echtes GLTF-Modell. Eigene Suspense →
 * ein langsames/fehlendes Modell blockiert NIE die ganze Szene; Fallback ist
 * "nichts" (bei korrektem Gating übernimmt der prozedurale Renderer).
 *
 * Renderer-Wahl nach Stückzahl: viele (Bäume/Felsen) → echtes GPU-Instancing
 * (InstancedMesh, 1 Draw-Call pro Teilmesh); wenige (Wracks/Ruinen/Schutt) →
 * <Clone> (teilt Buffers, per-Mesh Frustum-Culling, einfachste korrekte Variante).
 */
export function WorldModelInstances({ def, items }: { def: WorldModelDef; items: Obstacle[] }) {
  if (!items.length) return null;
  return (
    <Suspense fallback={null}>
      {items.length >= INSTANCING_THRESHOLD ? <InstancedModel def={def} items={items} /> : <ModelGroup def={def} items={items} />}
    </Suspense>
  );
}
