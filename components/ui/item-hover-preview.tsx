"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ItemThumbnail3D } from "@/components/shop/item-thumbnail-3d";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { UniversalPreviewModal, type PreviewSubject } from "@/components/ui/universal-preview-modal";
import type { Rarity } from "@/lib/cases";

// ─────────────────────────────────────────────────────────────────────────────
// Wiederverwendbare Item-Hover-Vorschau als HOOK (funktioniert auch mit
// inline-gerenderten Listen-Zeilen). Über ein Item hovern → kleines 3D-Popup am
// Cursor (Item am Charakter, dreht sich); klicken → großes Dreh-/Zoom-Modal.
//
// Nutzung:
//   const { bindItem, overlay } = useItemHoverPreview("m");
//   <div {...bindItem(item)}> … </div>
//   {overlay}   // einmal im Komponenten-Return rendern
// ─────────────────────────────────────────────────────────────────────────────

export interface HoverItem {
  id: string;
  name: string;
  rarity: Rarity;
  type: string;
  damage?: number | null;
  armor?: number | null;
  perk_type?: string | null;
  perk_magnitude?: number | null;
  shield_hp?: number | null;
}

const CARD = 200;

export function useItemHoverPreview(gender: "m" | "w" = "m") {
  const [hover, setHover] = useState<{ item: HoverItem; x: number; y: number } | null>(null);
  const [modal, setModal] = useState<PreviewSubject | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); return () => { if (hideTimer.current) clearTimeout(hideTimer.current); }; }, []);

  const bindItem = useCallback((item: HoverItem) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setHover({ item, x: e.clientX, y: e.clientY });
    },
    onMouseMove: (e: React.MouseEvent) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h)),
    onMouseLeave: () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setHover(null), 120);
    },
    onClick: () => {
      setHover(null);
      setModal({
        kind: "item",
        gender,
        item: {
          id: item.id, name: item.name, rarity: item.rarity, type: item.type,
          damage: item.damage ?? null, armor: item.armor ?? null,
          perk_type: item.perk_type ?? null, perk_magnitude: item.perk_magnitude ?? null,
          shield_hp: item.shield_hp ?? null,
        },
      });
    },
  }), [gender]);

  let px = 0, py = 0;
  if (hover && typeof window !== "undefined") {
    px = Math.min(hover.x + 18, window.innerWidth - CARD - 8);
    py = Math.min(Math.max(hover.y - CARD / 2, 8), window.innerHeight - CARD - 8);
  }

  const overlay: ReactNode = (
    <>
      {mounted && hover && createPortal(
        <div
          className="pointer-events-none fixed z-[650] overflow-hidden rounded-2xl border border-white/15 bg-[#0a0712]/95 shadow-[0_16px_48px_rgba(0,0,0,0.7)] backdrop-blur-md"
          style={{ left: px, top: py, width: CARD, height: CARD + 38 }}
        >
          <div className="h-[200px] w-full">
            <ItemThumbnail3D
              item={{ id: hover.item.id, name: hover.item.name, rarity: hover.item.rarity, type: hover.item.type, damage: hover.item.damage }}
              gender={gender}
            />
          </div>
          <div className="flex items-center justify-between gap-1.5 border-t border-white/10 px-2.5 py-1.5">
            <span className="truncate text-[11px] font-bold text-zinc-200">{hover.item.name}</span>
            <RarityBadge rarity={hover.item.rarity} />
          </div>
        </div>,
        document.body,
      )}
      {modal && <UniversalPreviewModal subject={modal} onClose={() => setModal(null)} />}
    </>
  );

  return { bindItem, overlay };
}
