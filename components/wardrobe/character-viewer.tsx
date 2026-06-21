"use client";

import { X, Lock } from "lucide-react";
import { getCategoriesForGender } from "@/lib/wardrobe";
import { CharacterPreview3D } from "@/components/wardrobe/character-preview-3d";
import type { EquippedItem } from "@/lib/rarity-colors";

export type { EquippedItem };

interface CharacterViewerProps {
  gender: "m" | "w";
  /** Once true, gender can never change again (lib/actions/wardrobe.ts
   * enforces this server-side too) — the toggle below becomes a read-only
   * display instead of a control. */
  genderLocked: boolean;
  onGenderChange: (gender: "m" | "w") => void;
  equippedByCategory: Record<string, EquippedItem | undefined>;
  /** Unequip straight from this summary list — id of the inventory row. */
  onUnequip: (id: string) => void;
}

export function CharacterViewer({
  gender,
  genderLocked,
  onGenderChange,
  equippedByCategory,
  onUnequip,
}: CharacterViewerProps) {
  // The "Alle" pseudo-category (lib/wardrobe.ts ALL_CATEGORY) only makes
  // sense as a browsing filter in the item list — it isn't a real equip
  // slot, so it has no place in this equipped-summary list.
  const categories = getCategoriesForGender(gender).filter((c) => c.dbType !== "*");

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-black/30 p-5">
      <h3 className="text-center text-sm font-semibold tracking-wide text-zinc-300">
        Dein Charakter
      </h3>

      <CharacterPreview3D gender={gender} equippedByCategory={equippedByCategory} />

      <div className="mt-6 grid grid-cols-2 gap-2">
        <button
          onClick={() => onGenderChange("m")}
          disabled={genderLocked}
          title={genderLocked ? "Geschlecht ist permanent festgelegt" : undefined}
          className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
            gender === "m"
              ? "border-purple-400 bg-purple-500/20 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
              : "border-white/10 text-zinc-400 hover:border-white/30"
          } ${genderLocked ? "cursor-not-allowed opacity-70" : ""}`}
        >
          ♂ Männlich
          {genderLocked && gender === "m" && <Lock className="h-3 w-3" />}
        </button>
        <button
          onClick={() => onGenderChange("w")}
          disabled={genderLocked}
          title={genderLocked ? "Geschlecht ist permanent festgelegt" : undefined}
          className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
            gender === "w"
              ? "border-purple-400 bg-purple-500/20 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
              : "border-white/10 text-zinc-400 hover:border-white/30"
          } ${genderLocked ? "cursor-not-allowed opacity-70" : ""}`}
        >
          ♀ Weiblich
          {genderLocked && gender === "w" && <Lock className="h-3 w-3" />}
        </button>
      </div>
      {!genderLocked && (
        <p className="mt-2 text-center text-[11px] text-amber-300/80">
          Achtung: Diese Wahl ist endgültig und kann später nicht mehr geändert werden.
        </p>
      )}

      <div className="mt-5 space-y-1.5">
        {categories.map((category) => {
          const Icon = category.icon;
          const equipped = equippedByCategory[category.dbType];
          return (
            <div
              key={category.id}
              className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Icon className="h-3.5 w-3.5 text-zinc-500" />
                {category.label}
              </span>
              <span className="flex items-center gap-1.5 pl-2">
                <span className="truncate text-right text-xs text-zinc-500">
                  {equipped?.name ?? "—"}
                </span>
                {equipped?.id && (
                  <button
                    onClick={() => onUnequip(equipped.id!)}
                    title="Ablegen"
                    className="rounded-full bg-white/5 p-1 text-zinc-500 transition-colors hover:bg-red-500/20 hover:text-red-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
