"use client";

import { X, Lock } from "lucide-react";
import { getCategories } from "@/lib/wardrobe";
import { CharacterPreview3D } from "@/components/wardrobe/character-preview-3d";
import { isWeaponType, getEquippedDamage, formatDamage } from "@/lib/combat";
import type { EquippedItem } from "@/lib/rarity-colors";

export type { EquippedItem };

interface CharacterViewerProps {
  gender: "m" | "w";
  /** Once true, gender can never change again (lib/actions/wardrobe.ts
   * enforces this server-side too) — the toggle below becomes a read-only
   * display instead of a control. */
  genderLocked: boolean;
  /** Admins never actually lock — shown a plain toggle with no "this is
   * forever" warning, since for them it genuinely isn't. */
  isAdmin?: boolean;
  onGenderChange: (gender: "m" | "w") => void;
  equippedByCategory: Record<string, EquippedItem | undefined>;
  /** Unequip straight from this summary list — id of the inventory row. */
  onUnequip: (id: string) => void;
}

export function CharacterViewer({
  gender,
  genderLocked,
  isAdmin = false,
  onGenderChange,
  equippedByCategory,
  onUnequip,
}: CharacterViewerProps) {
  // The "Alle" pseudo-category (lib/wardrobe.ts ALL_CATEGORY) only makes
  // sense as a browsing filter in the item list — it isn't a real equip
  // slot, so it has no place in this equipped-summary list.
  const categories = getCategories().filter((c) => c.dbType !== "*");

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-black/30 p-5">
      <h3 className="text-center text-sm font-semibold tracking-wide text-zinc-300">
        Dein Charakter
      </h3>

      <CharacterPreview3D gender={gender} equippedByCategory={equippedByCategory} />

      {genderLocked ? (
        // Locked players don't get a disabled-but-visible control — they
        // never had a choice to begin with once it's set, so there's
        // nothing here to interact with, just what's already true.
        <div className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm font-semibold text-zinc-300">
          <Lock className="h-3.5 w-3.5 text-zinc-500" />
          {gender === "m" ? "♂ Männlich" : "♀ Weiblich"}
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              onClick={() => onGenderChange("m")}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                gender === "m"
                  ? "border-purple-400 bg-purple-500/20 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                  : "border-white/10 text-zinc-400 hover:border-white/30"
              }`}
            >
              ♂ Männlich
            </button>
            <button
              onClick={() => onGenderChange("w")}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                gender === "w"
                  ? "border-purple-400 bg-purple-500/20 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                  : "border-white/10 text-zinc-400 hover:border-white/30"
              }`}
            >
              ♀ Weiblich
            </button>
          </div>
          {isAdmin ? (
            <p className="mt-2 text-center text-[11px] text-zinc-500">
              Admin: frei wechselbar zum Testen, wird nicht festgelegt.
            </p>
          ) : (
            <p className="mt-2 text-center text-[11px] text-amber-300/80">
              Achtung: Diese Wahl ist endgültig und kann später nicht mehr geändert werden.
            </p>
          )}
        </>
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
                {isWeaponType(category.dbType) && equipped && (
                  <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                    {formatDamage(getEquippedDamage(equipped))}
                  </span>
                )}
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
