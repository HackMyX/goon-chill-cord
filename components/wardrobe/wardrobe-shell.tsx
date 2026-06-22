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
import { ItemPreviewModal } from "@/components/wardrobe/item-preview-modal";
import { toggleEquip, updateGender } from "@/lib/actions/wardrobe";
import { getCategoryByDbType, getCategories, ALL_CATEGORY } from "@/lib/wardrobe";
import { useSoundManager } from "@/lib/sound-manager";
import { useConfirm } from "@/components/layout/confirm-dialog-provider";
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
    damage?: number | null;
  };
}

interface WardrobeShellProps {
  credits: number;
  inventoryCount: number;
  streakDays: number;
  initialInventory: InventoryRow[];
  initialGender: "m" | "w";
  genderLocked: boolean;
  /** Admins are exempt from the gender lock (lib/actions/wardrobe.ts
   * enforces this server-side) — they need to freely flip between both
   * bodies to test the male/female Garderobe and World rendering. */
  isAdmin?: boolean;
}

const ROW_HEIGHT = 76; // row height incl. gap, used by the virtualizer's size estimate

export function WardrobeShell({
  credits,
  inventoryCount,
  streakDays,
  initialInventory,
  initialGender,
  genderLocked: initialGenderLocked,
  isAdmin = false,
}: WardrobeShellProps) {
  const [inventory, setInventory] = useState(initialInventory);
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY.id);
  const [gender, setGender] = useState<"m" | "w">(initialGender);
  const [genderLocked, setGenderLocked] = useState(initialGenderLocked);
  const [query, setQuery] = useState("");
  const [activeRarities, setActiveRarities] = useState<Set<Rarity>>(new Set());
  const [equippedOnly, setEquippedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("rarity-desc");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const sound = useSoundManager();
  const confirm = useConfirm();

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

  const categories = useMemo(() => getCategories(), []);
  const currentCategory = categories.find((c) => c.id === activeCategory) ?? categories[0];

  const handleGenderChange = useCallback(
    async (next: "m" | "w") => {
      // One-way door: once locked, this is purely informational — the
      // server rejects it anyway (lib/actions/wardrobe.ts), but bailing out
      // here means clicking the disabled-looking button doesn't even fire
      // a request, and the confirm dialog below only ever has to ask
      // about something that's actually still changeable.
      if (genderLocked && !isAdmin) return;
      if (
        !isAdmin &&
        !(await confirm({
          title: "Geschlecht festlegen",
          message: `Geschlecht endgültig auf "${next === "m" ? "Männlich" : "Weiblich"}" festlegen? Das kann später nicht mehr geändert werden.`,
          confirmLabel: "Festlegen",
          danger: true,
        }))
      ) {
        return;
      }
      const previousGender = gender;
      sound.click();
      setGender(next);
      if (!isAdmin) setGenderLocked(true);
      debugLog("Wardrobe", isAdmin ? "gender change (admin, not locking)" : "gender change (locking permanently)", { next });
      // Persisted server-side so the World page (and a future reload of the
      // Garderobe itself) shows the same body instead of always falling
      // back to "m" — previously this was only ever local component state.
      updateGender(next).then((res) => {
        if (!res.success) {
          debugWarn("Wardrobe", "updateGender failed", res.error);
          sound.error();
          // Server rejected it (most likely: an already-locked profile, e.g.
          // a stale page loaded before a lock set elsewhere) — roll the
          // optimistic update back instead of leaving the UI claiming a
          // change took effect when it didn't.
          setGender(previousGender);
          if (!isAdmin) setGenderLocked(false);
        }
      });
    },
    [sound, genderLocked, gender, isAdmin, confirm]
  );

  const visibleItems = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    const filtered = inventory.filter((row) => {
      if (currentCategory.dbType !== "*" && row.item.type !== currentCategory.dbType) return false;
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
        map[row.item.type] = {
          id: row.id,
          name: row.item.name,
          rarity: row.item.rarity,
          damage: row.item.damage,
        };
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

  const previewRow = previewId ? inventory.find((r) => r.id === previewId) : undefined;

  const scrollParentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => scrollParentRef.current,
    // ROW_HEIGHT is only the *initial guess* before a row has actually been
    // measured — `measureElement` below corrects it against the real
    // rendered height. A fixed estimate alone used to be the whole story,
    // and it was wrong: a real row (icon + name + type label + rarity
    // badge, with padding) renders taller than this guess, so the next
    // absolutely-positioned row would overlap and paint over the bottom
    // half of this one's hover ring — exactly the "border only goes
    // half-way around" bug.
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} inventoryCount={inventoryCount} streakDays={streakDays} isAdmin={isAdmin} />

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
            genderLocked={genderLocked && !isAdmin}
            isAdmin={isAdmin}
            onGenderChange={handleGenderChange}
            equippedByCategory={equippedByCategory}
            onUnequip={handleToggle}
          />

          <div className="flex flex-col gap-4">
            <CategoryFilters
              categories={categories}
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
                        ref={virtualizer.measureElement}
                        data-index={virtualRow.index}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          // No fixed `height` here on purpose — letting the
                          // row size itself naturally is what
                          // `measureElement` actually measures. Forcing it
                          // back to the (possibly still-wrong) estimate
                          // would defeat the whole point of measuring.
                          transform: `translateY(${virtualRow.start}px)`,
                          paddingBottom: 8,
                        }}
                      >
                        <ItemRow
                          id={row.id}
                          name={row.item.name}
                          rarity={row.item.rarity}
                          type={row.item.type}
                          damage={row.item.damage}
                          equipped={row.equipped}
                          onToggle={handleToggle}
                          onPreview={setPreviewId}
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

      {previewRow && (
        <ItemPreviewModal
          item={previewRow.item}
          gender={gender}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}
