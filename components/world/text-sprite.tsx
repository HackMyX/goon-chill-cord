"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// Leichter 3D-Text als Canvas-Textur-Sprite — Ersatz für drei/troika <Text> in
// der Welt. troika baut Glyphen im Next-Bundle auf dem MAIN-THREAD (→ Ruckler
// beim ersten Namen/Schadenszahl). Ein Canvas-2D-Text ist dagegen sub-ms,
// blockiert nie, und ein Sprite ist von Natur aus zur Kamera gerichtet
// (Billboard). Gleiches Aussehen (Outline + Farbe), null Stall.
// ─────────────────────────────────────────────────────────────────────────────

function buildTextTexture(text: string, color: string, outline: string) {
  if (typeof document === "undefined" || !text) return null;
  const fontPx = 72;
  const padX = 18;
  const padY = 14;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const fontSpec = `900 ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.font = fontSpec;
  const w = Math.max(2, Math.ceil(ctx.measureText(text).width) + padX * 2);
  const h = fontPx + padY * 2;
  canvas.width = w;
  canvas.height = h;
  // Nach dem Resize Font + Ausrichtung erneut setzen (Resize löscht den State).
  ctx.font = fontSpec;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = 10;
  ctx.strokeStyle = outline;
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { texture, aspect: w / h };
}

export function TextSprite({
  text,
  color = "#ffffff",
  outline = "#000000",
  height = 0.3,
  position,
  renderOrder = 12,
}: {
  text: string;
  color?: string;
  outline?: string;
  /** Welt-Höhe des Textes (entspricht etwa troikas fontSize). */
  height?: number;
  position?: [number, number, number];
  renderOrder?: number;
}) {
  const built = useMemo(() => buildTextTexture(text, color, outline), [text, color, outline]);
  useEffect(() => {
    const tex = built?.texture;
    return () => { tex?.dispose(); };
  }, [built]);
  if (!built) return null;
  return (
    <sprite position={position} scale={[height * built.aspect, height, 1]} renderOrder={renderOrder}>
      <spriteMaterial map={built.texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}
