"use client";

import { useEffect } from "react";

/**
 * Suppresses THREE.Clock deprecation warnings from @react-three/fiber
 * internals. THREE.Clock was deprecated in three.js r168+ in favour of
 * THREE.Timer, but R3F 9.x still uses it internally — the console noise
 * is not actionable from app code. Restores the original handler on unmount.
 */
export function ThreeWarningsSuppressor() {
  useEffect(() => {
    const original = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].startsWith("THREE.Clock:")) return;
      original(...args);
    };
    return () => {
      console.warn = original;
    };
  }, []);
  return null;
}
