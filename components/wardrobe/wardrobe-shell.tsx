"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getTotalArmor, getPerkMultiplier, getEquippedDamage, FIST_DAMAGE } from "@/lib/combat";
import { useSoundManager } from "@/lib/sound-manager";
import { useConfirm } from "@/components/layout/confirm-dialog-provider";
import { debugLog, debugWarn } from "@/lib/debug";
import { RARITY_ORDER, type Rarity } from "@/lib/cases";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";
import { useSiteConfig } from "@/components/layout/site-config-provider";

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
    armor?: number | null;
    perk_type?: string | null;
    perk_magnitude?: number | null;
    shield_hp?: number | null;
    shield_regen_cooldown_sec?: number | null;
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
  isModerator?: boolean;
}

const ROW_HEIGHT = 76; // row height incl. gap, used by the virtualizer's size estimate

interface StatRowDef {
  label: string;
  value: string;
  color: string;
  tooltip: string;
}

function StatRow({ label, value, color, tooltip }: StatRowDef) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => setOpen(false);
    document.addEventListener("touchstart", dismiss, { once: true, passive: true });
    document.addEventListener("mousedown", dismiss, { once: true });
    return () => {
      document.removeEventListener("touchstart", dismiss);
      document.removeEventListener("mousedown", dismiss);
    };
  }, [open]);
  return (
    <div className="group relative flex items-center justify-between gap-3">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onTouchStart={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`cursor-help text-[11px] font-bold tabular-nums ${color}`}
      >
        {value}
      </span>
      {open && (
        <div className="pointer-events-none absolute right-0 bottom-full z-50 mb-1.5 w-56 rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-300 shadow-xl">
          {tooltip}
        </div>
      )}
    </div>
  );
}

function CombatStatsPanel({ equippedByCategory }: { equippedByCategory: Record<string, EquippedItem | undefined> }) {
  const totalArmor = getTotalArmor(equippedByCategory);
  const speedMult = getPerkMultiplier(equippedByCategory, "speed_boost");
  const jumpMult = getPerkMultiplier(equippedByCategory, "jump_boost");
  const regenMult = getPerkMultiplier(equippedByCategory, "hp_regen_boost");
  const equippedWeapon = equippedByCategory["weapon_cosmetic"];
  const effectiveDmg = getEquippedDamage(equippedWeapon);
  const equippedShield = equippedByCategory["shield_cosmetic"];
  const shieldHp = equippedShield?.shield_hp ?? 0;
  const shieldCooldown = equippedShield?.shield_regen_cooldown_sec ?? 0;
  const { damageLabel, armorLabel } = useSiteConfig();

  const rows: StatRowDef[] = [
    {
      label: "Schaden",
      value: `⚔ ${effectiveDmg} ${damageLabel}${!equippedWeapon ? " (Fäuste)" : ""}`,
      color: effectiveDmg > FIST_DAMAGE ? "text-emerald-300" : "text-zinc-500",
      tooltip: equippedWeapon
        ? `Waffenschaden: Deine ausgerüstete Waffe verursacht ${effectiveDmg} Punkte pro Treffer im Kampf.`
        : `Waffenschaden: Keine Waffe ausgerüstet — du greifst mit Fäusten an (${FIST_DAMAGE} ${damageLabel}). Rüste eine Waffe aus, um mehr Schaden zu machen.`,
    },
    {
      label: "Rüstung",
      value: `🛡 ${totalArmor} ${armorLabel}`,
      color: totalArmor > 0 ? "text-blue-300" : "text-zinc-500",
      tooltip: `Rüstungspunkte gesamt: Reduziert jeden eingehenden Schaden um ${totalArmor} Punkte (min. 1 Schaden geht immer durch). Kommt von Jacke, Hose, Hut und Schuhen zusammen.`,
    },
    ...(speedMult > 1
      ? [
          {
            label: "Tempo",
            value: `⚡ +${Math.round((speedMult - 1) * 100)}%`,
            color: "text-amber-300",
            tooltip: `Tempo-Boost: Deine ausgerüsteten Perks erhöhen die Laufgeschwindigkeit um +${Math.round((speedMult - 1) * 100)}%. Amulett und Ringe stapeln sich multiplikativ (max. +40% gesamt).`,
          },
        ]
      : []),
    ...(jumpMult > 1
      ? [
          {
            label: "Sprung",
            value: `↑ +${Math.round((jumpMult - 1) * 100)}%`,
            color: "text-amber-300",
            tooltip: `Sprung-Boost: Deine ausgerüsteten Perks erhöhen Sprunghöhe und -weite um +${Math.round((jumpMult - 1) * 100)}%. Amulett und Ringe stapeln sich multiplikativ (max. +40% gesamt).`,
          },
        ]
      : []),
    ...(regenMult > 1
      ? [
          {
            label: "Regen",
            value: `♥ +${Math.round((regenMult - 1) * 100)}%`,
            color: "text-amber-300",
            tooltip: `HP-Regen-Boost: Deine ausgerüsteten Perks erhöhen die passive Lebensregeneration um +${Math.round((regenMult - 1) * 100)}%. Regen setzt 4 Sekunden nach dem letzten Treffer ein. Amulett und Ringe stapeln sich multiplikativ (max. +40% gesamt).`,
          },
        ]
      : []),
    ...(shieldHp > 0
      ? [
          {
            label: "Schild",
            value: `🔵 ${shieldHp} HP`,
            color: "text-cyan-300",
            tooltip: `Schild-HP: Dein ausgerüsteter Schild absorbiert bis zu ${shieldHp} Schadenspunkte, bevor deine HP sinken. Leert sich komplett und lädt sich nach dem Cooldown vollständig wieder auf.`,
          },
          ...(shieldCooldown > 0
            ? [
                {
                  label: "Schild CD",
                  value: `⏱ ${shieldCooldown}s`,
                  color: "text-cyan-400/70",
                  tooltip: `Schild-Cooldown: Nach dem vollständigen Leeren des Schildes dauert es ${shieldCooldown} Sekunden, bis es sich wieder vollständig auflädt.`,
                },
              ]
            : []),
        ]
      : []),
  ];

  return (
    <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-600">Kampf-Stats</h3>
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <StatRow key={row.label} {...row} />
        ))}
      </div>
    </div>
  );
}

export function WardrobeShell({
  credits: initialCredits,
  inventoryCount,
  streakDays,
  initialInventory,
  initialGender,
  genderLocked: initialGenderLocked,
  isAdmin = false,
  isModerator = false,
}: WardrobeShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setCredits(row.credits);
  });
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
    // Rings get special treatment: up to 2 can be equipped simultaneously.
    // Sort by obtained_at so the oldest ring always lands in "ring" (right arm)
    // and the newer one in "ring2" (left arm) — stable across re-renders.
    const equippedRings = inventory
      .filter((r) => r.equipped && r.item.type === "ring")
      .sort((a, b) => (a.obtained_at ?? "").localeCompare(b.obtained_at ?? ""));

    for (const row of inventory) {
      if (!row.equipped || row.item.type === "ring") continue;
      map[row.item.type] = {
        id: row.id,
        name: row.item.name,
        rarity: row.item.rarity,
        damage: row.item.damage,
        armor: row.item.armor,
        perk_type: row.item.perk_type as EquippedItem["perk_type"],
        perk_magnitude: row.item.perk_magnitude,
        shield_hp: row.item.shield_hp,
        shield_regen_cooldown_sec: row.item.shield_regen_cooldown_sec,
      };
    }

    const toEquippedItem = (row: InventoryRow): EquippedItem => ({
      id: row.id,
      name: row.item.name,
      rarity: row.item.rarity,
      damage: row.item.damage,
      armor: row.item.armor,
      perk_type: row.item.perk_type as EquippedItem["perk_type"],
      perk_magnitude: row.item.perk_magnitude,
      shield_hp: row.item.shield_hp,
      shield_regen_cooldown_sec: row.item.shield_regen_cooldown_sec,
    });

    if (equippedRings[0]) map["ring"] = toEquippedItem(equippedRings[0]);
    if (equippedRings[1]) map["ring2"] = toEquippedItem(equippedRings[1]);

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

    setInventory((curr) => {
      if (nextEquipped && dbType === "ring") {
        // Up to 2 rings at once. If both slots taken, evict the oldest.
        const equippedRings = curr
          .filter((r) => r.id !== id && r.equipped && r.item.type === "ring")
          .sort((a, b) => (a.obtained_at ?? "").localeCompare(b.obtained_at ?? ""));
        const toUnequipId = equippedRings.length >= 2 ? equippedRings[0].id : null;
        return curr.map((r) => {
          if (r.id === id) return { ...r, equipped: true };
          if (toUnequipId && r.id === toUnequipId) return { ...r, equipped: false };
          return r;
        });
      }
      return curr.map((r) => {
        if (r.id === id) return { ...r, equipped: nextEquipped };
        if (nextEquipped && r.item.type === dbType) return { ...r, equipped: false };
        return r;
      });
    });

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
      <TopBar credits={credits} inventoryCount={inventoryCount} streakDays={streakDays} isAdmin={isAdmin} isModerator={isModerator} />

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
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <CategoryFilters
                  categories={categories}
                  active={currentCategory.id}
                  onSelect={(id) => {
                    sound.click();
                    setActiveCategory(id);
                  }}
                />
              </div>
              <CombatStatsPanel equippedByCategory={equippedByCategory} />
            </div>

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
                          armor={row.item.armor}
                          perk_type={row.item.perk_type}
                          perk_magnitude={row.item.perk_magnitude}
                          shield_hp={row.item.shield_hp}
                          shield_regen_cooldown_sec={row.item.shield_regen_cooldown_sec}
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
          item={{
            id: previewRow.item.id,
            name: previewRow.item.name,
            rarity: previewRow.item.rarity,
            type: previewRow.item.type,
            damage: previewRow.item.damage,
            armor: previewRow.item.armor,
            perk_type: previewRow.item.perk_type,
            perk_magnitude: previewRow.item.perk_magnitude,
            shield_hp: previewRow.item.shield_hp,
            shield_regen_cooldown_sec: previewRow.item.shield_regen_cooldown_sec,
          }}
          gender={gender}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}
