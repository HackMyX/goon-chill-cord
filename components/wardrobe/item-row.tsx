"use client";

import { memo } from "react";
import { Eye } from "lucide-react";
import { RARITY_STYLES, getTypeLabel, type Rarity } from "@/lib/cases";
import { ItemRenderer } from "@/components/items/item-renderer";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { useSoundManager } from "@/lib/sound-manager";

interface ItemRowProps {
  id: string;
  name: string;
  rarity: Rarity;
  type: string;
  equipped: boolean;
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
}

function ItemRowComponent({ id, name, rarity, type, equipped, onToggle, onPreview }: ItemRowProps) {
  const style = RARITY_STYLES[rarity];
  const sound = useSoundManager();

  return (
    <div
      onMouseEnter={sound.hover}
      className={`flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0f0e18] px-4 py-3 transition-all duration-200 ${style.hoverRing} ${style.hoverGlow}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          {style.pulseGlow && (
            <span aria-hidden className={`absolute inset-0 rounded-lg ${style.pulseGlow}`} />
          )}
          <div
            className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border ${
              style.rainbow ? "border-transparent" : `${style.border} ${style.bg}`
            }`}
          >
            {style.rainbow && <span aria-hidden className="rainbow-border" />}
            <ItemRenderer type={type} rarity={rarity} size="sm" />
          </div>
        </div>
        <div className="min-w-0">
          {/* `truncate` is load-bearing, not cosmetic — the wardrobe list
              is virtualized with a fixed per-row height estimate
              (ROW_HEIGHT in wardrobe-shell.tsx). A long name wrapping to a
              second line makes the *actual* rendered row taller than that
              estimate, so the next absolutely-positioned row overlaps and
              paints over the bottom half of this row's hover ring/glow —
              exactly the "border only goes half-way around" symptom. */}
          <p className="truncate font-semibold text-zinc-100">{name}</p>
          <p className="text-[11px] tracking-wide text-zinc-500 uppercase">{getTypeLabel(type)}</p>
          <RarityBadge rarity={rarity} className="mt-1" />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onMouseEnter={sound.hover}
          onClick={() => {
            sound.click();
            onPreview(id);
          }}
          title="Solo-Vorschau am eigenen Charakter"
          className="rounded-full border border-white/10 p-2 text-zinc-400 transition-colors hover:border-purple-400/40 hover:text-purple-200"
        >
          <Eye className="h-4 w-4" />
        </button>
        <button
          onClick={() => onToggle(id)}
          className={
            equipped
              ? "rounded-full border border-red-500/50 px-4 py-1.5 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10"
              : "rounded-full bg-purple-600/90 px-4 py-1.5 text-sm font-semibold text-white shadow-[0_0_10px_rgba(147,51,234,0.5)] transition-colors hover:bg-purple-500"
          }
        >
          {equipped ? "Ablegen" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}

export const ItemRow = memo(ItemRowComponent);
