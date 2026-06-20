"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TopBar } from "@/components/layout/top-bar";
import { CharacterViewer, type EquippedItem } from "@/components/wardrobe/character-viewer";
import { CategoryFilters } from "@/components/wardrobe/category-filters";
import { ItemRow } from "@/components/wardrobe/item-row";
import { toggleEquip } from "@/lib/actions/wardrobe";
import { getCategoryByDbType, getCategoriesForGender, WARDROBE_CATEGORIES } from "@/lib/wardrobe";
import { useSoundManager } from "@/lib/sound-manager";
import type { Rarity } from "@/lib/cases";

export interface InventoryRow {
  id: string;
  equipped: boolean;
  item: {
    id: string;
    name: string;
    rarity: Rarity;
    type: string;
  };
}

interface WardrobeShellProps {
  credits: number;
  inventoryCount: number;
  streakDays: number;
  initialInventory: InventoryRow[];
}

const ROW_HEIGHT = 76; // row height incl. gap, used by the virtualizer's size estimate

export function WardrobeShell({
  credits,
  inventoryCount,
  streakDays,
  initialInventory,
}: WardrobeShellProps) {
  const [inventory, setInventory] = useState(initialInventory);
  const [activeCategory, setActiveCategory] = useState(WARDROBE_CATEGORIES[0].id);
  const [gender, setGender] = useState<"m" | "w">("m");
  const sound = useSoundManager();

  const inventoryRef = useRef(inventory);
  inventoryRef.current = inventory;

  const categoriesForGender = useMemo(() => getCategoriesForGender(gender), [gender]);
  const currentCategory =
    categoriesForGender.find((c) => c.id === activeCategory) ?? categoriesForGender[0];

  const handleGenderChange = useCallback(
    (next: "m" | "w") => {
      sound.click();
      setGender(next);
      // Hair is gender-locked (hair_m vs hair_f) — if the player was looking
      // at "their" hair slot when switching gender, follow them to the new
      // gender's hair slot instead of silently falling back to category 0.
      setActiveCategory((curr) => (curr === "hair_m" || curr === "hair_f" ? `hair_${next}` : curr));
    },
    [sound]
  );

  const visibleItems = useMemo(
    () => inventory.filter((row) => row.item.type === currentCategory.dbType),
    [inventory, currentCategory]
  );

  const equippedByCategory = useMemo(() => {
    const map: Record<string, EquippedItem | undefined> = {};
    for (const row of inventory) {
      if (row.equipped) {
        map[row.item.type] = { id: row.id, name: row.item.name, rarity: row.item.rarity };
      }
    }
    return map;
  }, [inventory]);

  // Stable reference (empty deps) so React.memo on ItemRow actually skips
  // re-rendering rows that didn't change — always reads the latest
  // inventory via the ref instead of closing over a stale snapshot.
  const handleToggle = useCallback(async (id: string) => {
    const row = inventoryRef.current.find((r) => r.id === id);
    if (!row) return;

    const nextEquipped = !row.equipped;
    const dbType = row.item.type;
    const previous = inventoryRef.current;
    sound.click();

    setInventory((curr) =>
      curr.map((r) => {
        if (r.id === id) return { ...r, equipped: nextEquipped };
        if (nextEquipped && r.item.type === dbType) return { ...r, equipped: false };
        return r;
      })
    );

    const category = getCategoryByDbType(dbType);
    const res = await toggleEquip(id, category?.dbType ?? dbType, nextEquipped);
    if (!res.success) {
      setInventory(previous);
      sound.error();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable; latest state read via inventoryRef
  }, []);

  const scrollParentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} inventoryCount={inventoryCount} streakDays={streakDays} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Link>
        <h1 className="glow-text mb-6 text-2xl font-extrabold text-zinc-50">Garderobe</h1>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          <CharacterViewer
            gender={gender}
            onGenderChange={handleGenderChange}
            equippedByCategory={equippedByCategory}
            onUnequip={handleToggle}
          />

          <div className="flex flex-col gap-4">
            <CategoryFilters
              categories={categoriesForGender}
              active={currentCategory.id}
              onSelect={(id) => {
                sound.click();
                setActiveCategory(id);
              }}
            />

            {visibleItems.length === 0 ? (
              <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500">
                Keine Items in der Kategorie &quot;{currentCategory.label}&quot;.
              </p>
            ) : (
              <div ref={scrollParentRef} className="h-[70vh] overflow-y-auto pr-1">
                <div
                  style={{ height: virtualizer.getTotalSize(), position: "relative" }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const row = visibleItems[virtualRow.index];
                    return (
                      <div
                        key={row.id}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: virtualRow.size,
                          transform: `translateY(${virtualRow.start}px)`,
                          paddingBottom: 8,
                        }}
                      >
                        <ItemRow
                          id={row.id}
                          name={row.item.name}
                          rarity={row.item.rarity}
                          type={row.item.type}
                          equipped={row.equipped}
                          onToggle={handleToggle}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
