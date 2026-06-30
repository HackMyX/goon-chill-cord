// ─────────────────────────────────────────────────────────────────────────────
// GLTF-Modell-Registry für die 3D-Welt (client-safe, KEIN server-only Import).
//
// Ordnet einem ObstacleKind (lib/world-obstacles.ts) ein echtes GLB-Modell zu.
// LEER per Default → ALLES rendert prozedural (unverändertes Verhalten). Sobald
// eine CC0-GLB-Datei unter public/models/world/ liegt UND hier ein Eintrag steht,
// rendert dieser Kind automatisch als Modell — Instancing-artiges Cloning,
// Frustum-Culling und Suspense-Fallback übernimmt
// components/world/world-model-instances.tsx. Kein weiterer Code nötig.
//
// WICHTIG: Geometrie/Kollision/Navigation bleiben unberührt — das Modell ist NUR
// die Optik. Die Kollisions-Box/Radius kommt weiter aus dem Obstacle-Record
// (lib/world-obstacles.ts). Darum: Modell-`scale`/`yOffset` so wählen, dass das
// Modell die bestehende Kollisionsform sinnvoll ausfüllt (sonst "man kollidiert
// mit Luft" oder "läuft ins Modell"). blockH/hx/hz NICHT hier ändern.
// ─────────────────────────────────────────────────────────────────────────────

import type { ObstacleKind } from "@/lib/world-obstacles";

export interface WorldModelDef {
  /** Pfad relativ zu /public, z.B. "/models/world/wreck.glb". */
  url: string;
  /** Uniform-Skalierung des Modells, multipliziert mit Obstacle.scale. Default 1. */
  scale?: number;
  /** Y-Versatz, falls der Modell-Origin nicht auf dem Boden (y=0) sitzt. Default 0. */
  yOffset?: number;
  /** Zusätzliche Y-Rotation (rad), falls das Modell anders ausgerichtet ist. Default 0. */
  yawOffset?: number;
}

/**
 * Aktive Modell-Zuordnungen. Leer = alles prozedural. Zum Aktivieren:
 *   1. CC0-GLB nach public/models/world/<name>.glb legen (siehe README dort).
 *   2. Hier einen Eintrag ergänzen, z.B.:
 *        wreck: { url: "/models/world/wreck.glb", scale: 1, yOffset: 0 },
 *      Render-Switch + Frustum-Culling + Fallback passieren dann automatisch.
 *
 * Sinnvoll austauschbare (deko-artige) Kinds: tree, rock, ruin, wreck, debris,
 * crate, lamp, campfire. Strukturelle Kinds (wall, roof, road, monument) bleiben
 * besser prozedural, weil ihre Form direkt an die Kollision/Nav gekoppelt ist.
 */
export const WORLD_MODEL_REGISTRY: Partial<Record<ObstacleKind, WorldModelDef>> = {
  // CC0-Modelle von Quaternius (poly.pizza), Skalierung/yOffset aus echter
  // Bounding-Box auf die jeweilige Kollisionsform abgestimmt. Siehe ATTRIBUTION.txt.
  //
  // Renderer-Wahl automatisch nach Stückzahl (world-model-instances.tsx): viele
  // (tree ~224, rock ~150) → echtes GPU-Instancing (InstancedMesh, wenige Draw-Calls,
  // Phase-2); wenige (ruin/wreck/debris) → <Clone>.
  tree: { url: "/models/world/tree.glb", scale: 1.199, yOffset: 0.086 }, // "Dead Tree with Snow"
  rock: { url: "/models/world/rock.glb", scale: 1.72, yOffset: 0.031 }, // "Rock"
  ruin: { url: "/models/world/ruin.glb", scale: 0.589, yOffset: 0 }, // "Column"
  debris: { url: "/models/world/debris.glb", scale: 0.571, yOffset: 0 }, // "Debris Pile"
  // Auto-Länge ist nativ Z → 90° drehen, damit sie zur Kollisionsbox (lang in X) passt.
  wreck: { url: "/models/world/wreck.glb", scale: 0.617, yOffset: 0, yawOffset: Math.PI / 2 }, // "Police Car"
};

/** Kinds, die überhaupt per Modell ersetzbar sind (Rest bleibt immer prozedural).
 * crate = dimensionsgetrieben (Theken/Regale/Zelte) → NICHT swappen. campfire/lamp
 * tragen Licht/Animation → bleiben prozedural (können bei Bedarf hier ergänzt werden). */
export const MODEL_SWAPPABLE_KINDS: ObstacleKind[] = [
  "tree", "rock", "ruin", "wreck", "debris", "lamp", "campfire",
];

export function modelForKind(kind: ObstacleKind): WorldModelDef | undefined {
  return WORLD_MODEL_REGISTRY[kind];
}

/** Hat dieser Kind ein aktives Modell? (→ prozedurales Rendern überspringen) */
export function isModelKind(kind: ObstacleKind): boolean {
  return Boolean(WORLD_MODEL_REGISTRY[kind]);
}
