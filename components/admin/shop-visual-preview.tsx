"use client";

import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { View } from "@react-three/drei";
import { CaseDropView } from "@/components/cases/case-item-3d";
import type { PreviewSubject } from "@/components/ui/universal-preview-modal";
import type { AdminShopListing } from "@/lib/actions/shop";

/**
 * Krasse 3D-Direkt-Ansicht des generierten Shops (wie die Battle-Pass-3D-Timeline):
 * jede Listing wird als echtes 3D-Modell gezeigt. EINE geteilte WebGL-Canvas
 * (drei <View.Port/>) mit einem <View> pro Kachel — vermeidet das Browser-Limit
 * an WebGL-Kontexten und ist performant.
 */

const RARITY_COL: Record<string, string> = { normal: "#9ca3af", selten: "#3b82f6", mythisch: "#f59e0b", ultra: "#a855f7" };

function listingToSubject(l: AdminShopListing): PreviewSubject {
  switch (l.listingType) {
    case "ability":    return { kind: "ability", abilityKey: "", name: l.itemName, rarity: l.itemRarity };
    case "name_style": return { kind: "name_style", styleKey: "", displayName: l.itemName };
    case "badge":      return { kind: "badge", badgeKey: "", badgeText: l.itemName };
    case "voucher":    return { kind: "case_voucher", mode: "rarity", rarityFloor: l.itemRarity, label: l.itemName };
    default:           return { kind: "item", item: { id: l.itemId, name: l.itemName, rarity: l.itemRarity, type: l.itemType } };
  }
}

function ShopVisualCard({ listing, viewIndex }: { listing: AdminShopListing; viewIndex: number }) {
  const tileRef = useRef<HTMLDivElement>(null);
  const subject = listingToSubject(listing);
  const col = RARITY_COL[listing.itemRarity] ?? "#a78bfa";
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/30">
      <div ref={tileRef} className="relative h-28 w-full" style={{ background: `radial-gradient(circle at 50% 60%, ${col}18 0%, transparent 70%)` }}>
        <CaseDropView subject={subject} viewIndex={viewIndex} track={tileRef} rotate shadow={false} />
      </div>
      <div className="flex items-center justify-between gap-1 border-t border-white/[0.06] px-2 py-1.5">
        <span className="truncate text-[11px] text-zinc-300" title={listing.itemName}>{listing.itemName}</span>
        <span className="shrink-0 font-mono text-[11px] text-zinc-100">{listing.priceCr.toLocaleString("de-DE")}</span>
      </div>
    </div>
  );
}

export function ShopVisualPreview({ listings }: { listings: AdminShopListing[] }) {
  const shellRef = useRef<HTMLDivElement>(null);
  if (listings.length === 0) return <p className="text-xs text-zinc-500">Noch keine Angebote für die 3D-Vorschau.</p>;
  return (
    <div ref={shellRef} className="relative">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {listings.map((l, i) => (
          <ShopVisualCard key={l.id} listing={l} viewIndex={i} />
        ))}
      </div>
      {/* Geteilte transparente Canvas — die Views scissoren auf die Kacheln. */}
      <Canvas
        style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", pointerEvents: "none", zIndex: 10 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        eventSource={shellRef as React.RefObject<HTMLElement>}
        dpr={[1, 1.5]}
      >
        <View.Port />
      </Canvas>
    </div>
  );
}
