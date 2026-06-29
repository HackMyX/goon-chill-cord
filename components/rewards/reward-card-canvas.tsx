"use client";

import { Canvas } from "@react-three/fiber";
import { View } from "@react-three/drei";
import type { RefObject } from "react";

/**
 * EINE geteilte, transparente WebGL-Canvas für viele Belohnungs-3D-Thumbnails.
 * Alle <View>s einer Seite/eines Popups portalen hier hinein und teilen sich
 * DENSELBEN WebGL-Context → beliebig viele Karten ohne Context-Limit/Performance-
 * Problem (gleiche Technik wie der Battle Pass). pointer-events:none lässt Klicks
 * zu den Karten durch. `zIndex` muss über den Karten liegen, in Popups über dem
 * Panel-z. Einmal pro Container (Dock-Popup / Garderobe-Sektion) mounten.
 */
export function RewardCardCanvas({
  eventSourceRef,
  zIndex = 40,
}: {
  eventSourceRef: RefObject<HTMLElement | null>;
  zIndex?: number;
}) {
  return (
    <Canvas
      style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      eventSource={eventSourceRef as RefObject<HTMLElement>}
      dpr={[1, 1.5]}
    >
      <View.Port />
    </Canvas>
  );
}
