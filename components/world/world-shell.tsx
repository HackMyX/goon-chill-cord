"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Canvas } from "@react-three/fiber";
import { ArrowLeft, Keyboard } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Scene } from "@/components/world/scene";
import type { EquippedItem } from "@/lib/rarity-colors";

interface WorldShellProps {
  credits: number;
  streakDays: number;
  inventoryCount: number;
  equippedByCategory: Record<string, EquippedItem | undefined>;
  gender: "m" | "w";
}

export function WorldShell({
  credits,
  streakDays,
  inventoryCount,
  equippedByCategory,
  gender,
}: WorldShellProps) {
  const [showHint, setShowHint] = useState(true);

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} inventoryCount={inventoryCount} />

      <div className="relative flex-1">
        <Link
          href="/"
          className="absolute top-4 left-4 z-10 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-sm text-zinc-300 backdrop-blur transition-colors hover:border-white/30"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Link>

        {showHint && (
          <button
            onClick={() => setShowHint(false)}
            className="absolute top-4 right-4 z-10 flex items-center gap-2 rounded-lg border border-purple-400/40 bg-purple-500/10 px-3 py-1.5 text-sm font-semibold text-purple-200 shadow-[0_0_16px_rgba(168,85,247,0.3)] backdrop-blur"
          >
            <Keyboard className="h-4 w-4" />
            WASD zum Laufen — Standard-Welt, mehr folgt
          </button>
        )}

        <Canvas
          shadows
          camera={{ position: [0, 2.6, 6], fov: 55 }}
          className="!h-full !w-full"
        >
          <Suspense fallback={null}>
            <Scene equippedByCategory={equippedByCategory} gender={gender} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
