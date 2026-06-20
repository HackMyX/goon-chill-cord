"use client";

import { motion } from "framer-motion";
import { RARITY_HEX, rarityColorFor, type EquippedItem } from "@/lib/rarity-colors";
import { ItemRenderer } from "@/components/items/item-renderer";

export type { EquippedItem };

interface AvatarRendererProps {
  gender: "m" | "w";
  equippedByCategory: Record<string, EquippedItem | undefined>;
}

function fillFor(item: EquippedItem | undefined, fallback: string): string {
  return rarityColorFor(item, fallback);
}

/**
 * "Krunker-style" low-poly vector avatar — angular, clean, faceted (no
 * rounded Minecraft-cube look). Every limb is two overlapping polygons: a
 * lit "front face" and a darker "side face" offset behind it, faking a
 * low-poly 3D bevel in pure flat SVG.
 *
 * Equip state drives a strict z-index layer stack so newly-equipped items
 * are always visible immediately (see lib/equipment-slots.ts for the
 * canonical slot list this mirrors):
 *
 *   z-0  Aura   (blurred glow, behind everything)
 *   z-10 Body   (base silhouette: torso/arms/legs)
 *   z-20 Face   (visor)
 *   z-30 Body   (jacket/pants/shoes/shield recolor — same paint slot as base)
 *   z-40 Head   (hair / hat)
 *   z-50 Weapon (always on top, held in hand)
 *   —    Back   (trail particles, rendered separately below the feet)
 */
export function AvatarRenderer({ gender, equippedByCategory }: AvatarRendererProps) {
  const hat = equippedByCategory.hat;
  const hair = equippedByCategory[gender === "m" ? "hair_m" : "hair_f"];
  const jacket = equippedByCategory.jacket;
  const pants = equippedByCategory.pants;
  const shoes = equippedByCategory.shoes;
  const face = equippedByCategory.face;
  const aura = equippedByCategory.aura;
  const trail = equippedByCategory.trail;
  const shield = equippedByCategory.shield_cosmetic;
  const pet = equippedByCategory.pet;
  const weapon = equippedByCategory.weapon_cosmetic;

  return (
    <div className="relative mx-auto mt-6 flex h-72 w-44 items-center justify-center">
      {/* z-0: aura glow — pulses on the glow layer only, never the avatar itself */}
      {aura && (
        <div
          title={aura.name}
          className="absolute z-0 h-56 w-56 animate-pulse rounded-full blur-2xl"
          style={{ backgroundColor: RARITY_HEX[aura.rarity], opacity: 0.4 }}
        />
      )}

      {pet && (
        <div
          title={pet.name}
          className="absolute right-0 bottom-6 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/60 shadow-[0_0_14px_rgba(168,85,247,0.5)]"
        >
          <ItemRenderer type="pet" rarity={pet.rarity} size="sm" />
        </div>
      )}

      <motion.svg
        viewBox="0 0 160 280"
        className="relative z-10 h-full w-full"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="edgeGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* z-10: angular low-poly body silhouette */}
        <g filter="url(#glow)" stroke="url(#edgeGlow)" strokeWidth="1.5" strokeLinejoin="round">
          {/* head: faceted hexagon, dark side-face + lit front-face */}
          <polygon points="58,16 102,16 114,40 102,64 58,64 46,40" fill="#1b1830" />
          <polygon points="80,16 102,16 114,40 102,64 80,64" fill="#0f0d1c" opacity="0.6" />

          {/* torso: angular trapezoid, cut corners */}
          <polygon points="54,70 106,70 110,76 100,150 90,156 70,156 60,150 50,76" fill="#1b1830" />
          <polygon points="80,70 106,70 110,76 100,150 90,156 80,156" fill="#0f0d1c" opacity="0.55" />

          {/* shoulder pads */}
          <polygon points="40,74 56,70 56,96 38,100" fill="#211e3a" />
          <polygon points="120,74 104,70 104,96 122,100" fill="#15132a" />

          {/* arms */}
          <polygon points="34,98 50,96 46,150 32,150" fill="#1b1830" />
          <polygon points="126,98 110,96 114,150 128,150" fill="#15132a" />

          {/* legs, angular with a notch at the knee */}
          <polygon points="62,158 88,158 86,210 80,214 70,214 64,210" fill="#1b1830" />
          <polygon points="78,158 88,158 86,210 80,214 78,214" fill="#0f0d1c" opacity="0.55" />
          <polygon points="92,158 118,158 122,210 114,214 104,214 98,210" fill="#1b1830" />
          <polygon points="108,158 118,158 122,210 114,214 108,214" fill="#0f0d1c" opacity="0.55" />
        </g>

        {/* z-20: face visor */}
        <polygon
          points="64,36 96,36 100,44 92,48 68,48 60,44"
          fill={fillFor(face, "#67e8f9")}
          opacity={face ? 0.95 : 0.7}
        />

        {/* z-30: clothing recolor (same shapes as body, painted on top) */}
        {jacket && (
          <polygon
            points="54,70 106,70 110,76 100,150 90,156 70,156 60,150 50,76"
            fill={fillFor(jacket, "transparent")}
            opacity={0.82}
          />
        )}
        {pants && (
          <>
            <polygon points="62,158 88,158 86,210 80,214 70,214 64,210" fill={fillFor(pants, "transparent")} opacity={0.82} />
            <polygon points="92,158 118,158 122,210 114,214 104,214 98,210" fill={fillFor(pants, "transparent")} opacity={0.82} />
          </>
        )}
        {shoes && (
          <>
            <polygon points="62,210 88,210 84,222 66,222" fill={fillFor(shoes, "#1e293b")} />
            <polygon points="98,210 122,210 118,222 102,222" fill={fillFor(shoes, "#1e293b")} />
          </>
        )}
        {shield && (
          <polygon
            points="80,98 92,104 92,116 80,122 68,116 68,104"
            fill={fillFor(shield, "#71717a")}
            stroke="white"
            strokeOpacity="0.5"
            strokeWidth="1.5"
          />
        )}

        {/* z-40: hair / hat */}
        {hair && (
          <polygon points="48,18 80,4 112,18 108,30 80,20 52,30" fill={fillFor(hair, "#404040")} />
        )}
        {hat && (
          <polygon
            points="42,18 80,0 118,18 122,30 80,14 38,30"
            fill={fillFor(hat, "#6d28d9")}
            stroke="white"
            strokeOpacity="0.3"
            strokeWidth="1"
          />
        )}

        {/* z-50: weapon, held at the hand */}
        {weapon && (
          <polygon
            points="128,98 134,102 122,166 112,162"
            fill={fillFor(weapon, "#e5e7eb")}
            stroke="white"
            strokeOpacity="0.3"
            strokeWidth="1"
          />
        )}
      </motion.svg>

      {/* Back: trail particles beneath the feet */}
      <div className="absolute bottom-0 left-1/2 z-0 h-2 w-32 -translate-x-1/2">
        <div className="absolute inset-0 rounded-full bg-purple-900/40 blur-[3px]" />
        {trail && (
          <div
            title={trail.name}
            className="absolute inset-x-4 top-0 h-1.5 animate-pulse rounded-full"
            style={{ backgroundColor: RARITY_HEX[trail.rarity] }}
          />
        )}
      </div>
    </div>
  );
}
