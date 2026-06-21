"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TopBar } from "@/components/layout/top-bar";
import { CharacterViewer, type EquippedItem } from "@/components/wardrobe/character-viewer";
import { CategoryFilters } from "@/components/wardrobe/category-filters";
import { WardrobeFilters, type SortKey } from "@/components/wardrobe/wardrobe-filters";
import { ItemRow } from "@/components/wardrobe/item-row";
import { toggleEquip, updateGender } from "@/lib/actions/wardrobe";
import { getCategoryByDbType, getCategoriesForGender, WARDROBE_CATEGORIES } from "@/lib/wardrobe";
import { useSoundManager } from "@/lib/sound-manager";
import { debugLog, debugWarn } from "@/lib/debug";
import { RARITY_ORDER, type Rarity } from "@/lib/cases";

export interface InventoryRow {
  id: string;
  equipped: boolean;
  obtained_at?: string;
  item: {
    id: string;
    name: string;
    rarity: Rarity;
    type: string;
    price_cr?: number;
  };
}

interface WardrobeShellProps {
  credits: number;
  inventoryCount: number;
  streakDays: number;
  initialInventory: InventoryRow[];
  initialGender: "m" | "w";
}

const ROW_HEIGHT = 76; // row height incl. gap, used by the virtualizer's size estimate

export function WardrobeShell({
  credits,
  inventoryCount,
  streakDays,
  initialInventory,
  initialGender,
}: WardrobeShellProps) {
  const [inventory, setInventory] = useState(initialInventory);
  const [activeCategory, setActiveCategory] = useState(WARDROBE_CATEGORIES[0].id);
  const [gender, setGender] = useState<"m" | "w">(initialGender);
  const [query, setQuery] = useState("");
  const [activeRarities, setActiveRarities] = useState<Set<Rarity>>(new Set());
  const [equippedOnly, setEquippedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("rarity-desc");
  const sound = useSoundManager();

  const toggleRarityFilter = useCallback((rarity: Rarity) => {
    setActiveRarities((curr) => {
      const next = new Set(curr);
      if (next.has(rarity)) next.delete(rarity);
      else next.add(rarity);
      return next;
    });
  }, []);

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
      debugLog("Wardrobe", "gender change", { next });
      // Persisted server-side so the World page (and a future reload of the
      // Garderobe itself) shows the same body instead of always falling
      // back to "m" — previously this was only ever local component state.
      updateGender(next).then((res) => {
        if (!res.success) {
          debugWarn("Wardrobe", "updateGender failed", res.error);
          sound.error();
        }
      });
    },
    [sound]
  );

  const visibleItems = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    const filtered = inventory.filter((row) => {
      if (row.item.type !== currentCategory.dbType) return false;
      if (equippedOnly && !row.equipped) return false;
      if (activeRarities.size > 0 && !activeRarities.has(row.item.rarity)) return false;
      if (trimmedQuery && !row.item.name.toLowerCase().includes(trimmedQuery)) return false;
      return true;
    });

    const rarityRank = (r: Rarity) => RARITY_ORDER.indexOf(r);
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case "rarity-desc":
          return rarityRank(b.item.rarity) - rarityRank(a.item.rarity);
        case "rarity-asc":
          return rarityRank(a.item.rarity) - rarityRank(b.item.rarity);
        case "name-asc":
          return a.item.name.localeCompare(b.item.name, "de");
        case "name-desc":
          return b.item.name.localeCompare(a.item.name, "de");
        case "value-desc":
          return (b.item.price_cr ?? 0) - (a.item.price_cr ?? 0);
        case "value-asc":
          return (a.item.price_cr ?? 0) - (b.item.price_cr ?? 0);
        case "newest":
          return (b.obtained_at ?? "").localeCompare(a.obtained_at ?? "");
        case "oldest":
          return (a.obtained_at ?? "").localeCompare(b.obtained_at ?? "");
        default:
          return 0;
      }
    });

    return sorted;
  }, [inventory, currentCategory, query, activeRarities, equippedOnly, sort]);

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
    debugLog("Wardrobe", "toggleEquip start", { id, name: row.item.name, dbType, nextEquipped });

    setInventory((curr) =>
      curr.map((r) => {
        if (r.id === id) return { ...r, equipped: nextEquipped };
        if (nextEquipped && r.item.type === dbType) return { ...r, equipped: false };
        return r;
      })
    );

    const category = getCategoryByDbType(dbType);
    if (!category) {
      debugWarn("Wardrobe", "toggleEquip: no WardrobeCategory found for dbType", dbType);
    }
    const res = await toggleEquip(id, category?.dbType ?? dbType, nextEquipped);
    if (!res.success) {
      debugWarn("Wardrobe", "toggleEquip failed, rolling back optimistic update", res.error);
      setInventory(previous);
      sound.error();
    } else {
      debugLog("Wardrobe", "toggleEquip confirmed", { id, nextEquipped });
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

            <WardrobeFilters
              query={query}
              onQueryChange={setQuery}
              activeRarities={activeRarities}
              onToggleRarity={toggleRarityFilter}
              equippedOnly={equippedOnly}
              onToggleEquippedOnly={() => setEquippedOnly((v) => !v)}
              sort={sort}
              onSortChange={setSort}
              resultCount={visibleItems.length}
            />

            {visibleItems.length === 0 ? (
              <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500">
                Keine Items gefunden — Filter anpassen oder zurücksetzen.
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
