"use client";

import { X } from "lucide-react";
import { getCategoriesForGender } from "@/lib/wardrobe";
import { CharacterPreview3D } from "@/components/wardrobe/character-preview-3d";
import type { EquippedItem } from "@/lib/rarity-colors";

export type { EquippedItem };

interface CharacterViewerProps {
  gender: "m" | "w";
  onGenderChange: (gender: "m" | "w") => void;
  equippedByCategory: Record<string, EquippedItem | undefined>;
  /** Unequip straight from this summary list — id of the inventory row. */
  onUnequip: (id: string) => void;
}

export function CharacterViewer({
  gender,
  onGenderChange,
  equippedByCategory,
  onUnequip,
}: CharacterViewerProps) {
  const categories = getCategoriesForGender(gender);

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-black/30 p-5">
      <h3 className="text-center text-sm font-semibold tracking-wide text-zinc-300">
        Dein Charakter
      </h3>

      <CharacterPreview3D gender={gender} equippedByCategory={equippedByCategory} />

      <div className="mt-6 grid grid-cols-2 gap-2">
        <button
          onClick={() => onGenderChange("m")}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
            gender === "m"
              ? "border-purple-400 bg-purple-500/20 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
              : "border-white/10 text-zinc-400 hover:border-white/30"
          }`}
        >
          ♂ Männlich
        </button>
        <button
          onClick={() => onGenderChange("w")}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
            gender === "w"
              ? "border-purple-400 bg-purple-500/20 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
              : "border-white/10 text-zinc-400 hover:border-white/30"
          }`}
        >
          ♀ Weiblich
        </button>
      </div>

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
