"use client";

import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { X } from "lucide-react";
import { CharacterModel } from "@/components/world/character-model";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { ItemStatBadges } from "@/components/items/item-stat-badges";
import type { EquippedItem } from "@/lib/rarity-colors";
import type { Rarity } from "@/lib/cases";

interface ItemPreviewModalProps {
  item: {
    id: string;
    name: string;
    rarity: Rarity;
    type: string;
    damage?: number | null;
    armor?: number | null;
    perk_type?: string | null;
    perk_magnitude?: number | null;
    shield_hp?: number | null;
    shield_regen_cooldown_sec?: number | null;
  };
  gender: "m" | "w";
  onClose: () => void;
}

/**
 * "Solo" preview — the character with *only* this one item equipped and
 * nothing else, so you can actually see what a piece looks like on its own
 * instead of squinting at it buried under your current full outfit in the
 * regular Garderobe preview. Portaled to `document.body` (same reasoning as
 * GamesMenu) so it always renders above everything regardless of where in
 * the item list it was opened from.
 */
export function ItemPreviewModal({ item, gender, onClose }: ItemPreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const equippedByCategory: Record<string, EquippedItem | undefined> = {
    [item.type]: {
      id: item.id,
      name: item.name,
      rarity: item.rarity,
      damage: item.damage,
      armor: item.armor,
      perk_type: item.perk_type as EquippedItem["perk_type"],
      perk_magnitude: item.perk_magnitude,
      shield_hp: item.shield_hp,
      shield_regen_cooldown_sec: item.shield_regen_cooldown_sec,
    },
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[min(92vw,420px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 rounded-full border border-white/10 bg-[#16121f] p-1.5 text-zinc-300 transition-colors hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="rounded-2xl border border-purple-500/30 bg-[#0b0814] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
          <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
            <p className="text-center text-sm font-semibold text-zinc-100">{item.name}</p>
            <RarityBadge rarity={item.rarity} />
            <ItemStatBadges
              damage={item.damage}
              armor={item.armor}
              perk_type={item.perk_type}
              perk_magnitude={item.perk_magnitude}
              shield_hp={item.shield_hp}
              shield_regen_cooldown_sec={item.shield_regen_cooldown_sec}
              itemName={item.name}
              itemType={item.type}
            />
          </div>

          <div className="h-80 w-full overflow-hidden rounded-xl border border-white/10 bg-[#08050f]">
            {/* Explicit shadow map type — see components/world/world-shell.tsx's
                matching comment for why (the bare `shadows` shorthand's
                default type is deprecated and spams a console warning per
                shadow pass). */}
            <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 1.6, 3.6], fov: 42 }}>
              <Suspense fallback={null}>
                <color attach="background" args={["#08050f"]} />
                <ambientLight intensity={0.6} color="#a78bfa" />
                <directionalLight position={[3, 5, 3]} intensity={1.1} castShadow />
                <pointLight position={[-3, 2, -2]} intensity={10} color="#8b5cf6" />

                <group position={[0, -1.3, 0]}>
                  <CharacterModel equippedByCategory={equippedByCategory} gender={gender} />
                </group>

                <ContactShadows position={[0, -1.3, 0]} opacity={0.5} scale={4} blur={2} far={3} />

                <OrbitControls
                  target={[0, 0.1, 0]}
                  enablePan={false}
                  minDistance={1.6}
                  maxDistance={5}
                  minPolarAngle={Math.PI / 4}
                  maxPolarAngle={Math.PI / 1.9}
                  autoRotate
                  autoRotateSpeed={1.8}
                />
              </Suspense>
            </Canvas>
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500">
            Solo-Vorschau — alle anderen Slots sind hier leer.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
