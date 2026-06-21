"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Canvas } from "@react-three/fiber";
import { ArrowLeft, Keyboard } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Scene } from "@/components/world/scene";
import { useCameraControls } from "@/components/world/use-camera-controls";
import { useSoundManager } from "@/lib/sound-manager";
import { debugLog } from "@/lib/debug";
import type { EquippedItem } from "@/lib/rarity-colors";

interface WorldShellProps {
  credits: number;
  streakDays: number;
  inventoryCount: number;
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
  username: string;
}

export function WorldShell({
  credits,
  streakDays,
  inventoryCount,
  equippedByCategory,
  gender,
  username,
}: WorldShellProps) {
  const [showHint, setShowHint] = useState(true);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const cameraControls = useCameraControls(canvasWrapRef);
  const sound = useSoundManager();

  useEffect(() => {
    debugLog("World", "mounted with equipped items", { username, gender, equippedByCategory });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only log once on mount
  }, []);

  // The whole reason the canvas previously rendered tiny: this component
  // was nested inside several `flex flex-1` ancestors with no `min-h-0`
  // anywhere in the chain. A flex item with `flex: 1 1 0%` but no
  // `min-height: 0` can collapse to its content's *intrinsic* size instead
  // of actually stretching — and an R3F <Canvas> sized at 100% of a
  // collapsed (effectively auto-height) parent resolves to ~0px. Forcing
  // `h-screen` on this component's own root sidesteps the whole ancestor
  // chain instead of trying to fix `min-h-0` at every level above it.
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    debugLog("World", "canvas wrapper mounted", {
      width: el.clientWidth,
      height: el.clientHeight,
    });
    const observer = new ResizeObserver(([entry]) => {
      debugLog("World", "canvas wrapper resized", {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <TopBar credits={credits} streakDays={streakDays} inventoryCount={inventoryCount} />

      <div ref={canvasWrapRef} className="relative min-h-0 flex-1">
        <Link
          href="/"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          className="absolute top-4 left-4 z-10 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-sm text-zinc-300 backdrop-blur transition-colors hover:border-white/30"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Link>

        {showHint && (
          <button
            onMouseEnter={sound.hover}
            onClick={() => {
              sound.click();
              setShowHint(false);
            }}
            className="absolute top-4 right-4 z-10 flex items-center gap-2 rounded-lg border border-purple-400/40 bg-purple-500/10 px-3 py-1.5 text-sm font-semibold text-purple-200 shadow-[0_0_16px_rgba(168,85,247,0.3)] backdrop-blur"
          >
            <Keyboard className="h-4 w-4" />
            WASD laufen · Shift sprinten · Leertaste springen · Rechtsklick halten = Kamera · Scrollen = Zoom
          </button>
        )}

        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 2.6, 6], fov: 55 }}
          className="absolute inset-0"
          onCreated={({ gl, size }) => {
            debugLog("World", "canvas created", { size, pixelRatio: gl.getPixelRatio() });
          }}
        >
          <Suspense fallback={null}>
            <Scene
              equippedByCategory={equippedByCategory}
              gender={gender}
              username={username}
              cameraControls={cameraControls}
            />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
