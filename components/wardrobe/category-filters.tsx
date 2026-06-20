"use client";

import type { WardrobeCategory } from "@/lib/wardrobe";
import { useSoundManager } from "@/lib/sound-manager";

interface CategoryFiltersProps {
  categories: WardrobeCategory[];
  active: string;
  onSelect: (categoryId: string) => void;
}

export function CategoryFilters({ categories, active, onSelect }: CategoryFiltersProps) {
  const sound = useSoundManager();

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {categories.map((category) => {
        const Icon = category.icon;
        return (
          <button
            key={category.id}
            onMouseEnter={sound.hover}
            onClick={() => onSelect(category.id)}
            className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
              active === category.id
                ? "border-purple-400 bg-purple-500/15 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.45)]"
                : "border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/30"
            }`}
          >
            <Icon className="h-4 w-4" />
            {category.label}
          </button>
        );
      })}
    </div>
  );
}
