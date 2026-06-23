"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Store, Clock, Sparkles, ShoppingCart, Check, Megaphone, Tag, Star, Zap, Package } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { ItemPreviewModal } from "@/components/wardrobe/item-preview-modal";
import { ItemThumbnail3D } from "@/components/shop/item-thumbnail-3d";
import { useSoundManager } from "@/lib/sound-manager";
import { ItemStatBadges } from "@/components/items/item-stat-badges";
import { purchaseShopItem, type ShopListingEntry, type ShopCategoryMeta } from "@/lib/actions/shop";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { resolveShopCategoryIcon, resolveShopCategoryColor } from "@/lib/shop-category-icons";
import { RARITY_STYLES, type Rarity } from "@/lib/cases";

const RARITY_GLOW: Record<Rarity, string> = {
  normal:   "shadow-[0_0_20px_rgba(59,130,246,0.25)] hover:shadow-[0_0_30px_rgba(59,130,246,0.4)]",
  selten:   "shadow-[0_0_20px_rgba(168,85,247,0.25)] hover:shadow-[0_0_30px_rgba(168,85,247,0.4)]",
  mythisch: "shadow-[0_0_24px_rgba(245,158,11,0.35)] hover:shadow-[0_0_40px_rgba(245,158,11,0.5)]",
  ultra:    "shadow-[0_0_28px_rgba(239,68,68,0.35)] hover:shadow-[0_0_44px_rgba(239,68,68,0.5)]",
};

const RARITY_CARD_BG: Record<Rarity, string> = {
  normal:   "bg-gradient-to-b from-blue-500/5 to-transparent",
  selten:   "bg-gradient-to-b from-purple-500/8 to-transparent",
  mythisch: "bg-gradient-to-b from-amber-500/12 to-transparent",
  ultra:    "bg-gradient-to-b from-red-500/12 to-transparent",
};

const RARITY_BORDER: Record<Rarity, string> = {
  normal:   "border-blue-400/30",
  selten:   "border-purple-400/35",
  mythisch: "border-amber-400/50",
  ultra:    "border-red-400/50",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  hat: "Helm", jacket: "Jacke", pants: "Hose", shoes: "Schuhe",
  trail: "Spur", shield_cosmetic: "Schild", aura: "Aura", face: "Maske",
  hair: "Haare", pet: "Haustier", weapon_cosmetic: "Waffe", ring: "Ring",
  amulet: "Amulett", weapon: "Waffe",
};

function useCountdown(targetIso: string): { label: string; urgent: boolean } {
  const [diff, setDiff] = useState(0);
  useEffect(() => {
    function tick() {
      setDiff(Math.max(0, new Date(targetIso).getTime() - Date.now()));
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetIso]);

  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return {
    label: [h, m, s].map((n) => n.toString().padStart(2, "0")).join(":"),
    urgent: diff < 3_600_000,
  };
}

function fmt(n: number) { return new Intl.NumberFormat("de-DE").format(n); }

// ---------------------------------------------------------------------------
// Shop Card
// ---------------------------------------------------------------------------

function ShopCard({
  listing, credits, gender, onPreview, onPurchased,
}: {
  listing: ShopListingEntry;
  credits: number;
  gender: "m" | "w";
  onPreview: (listing: ShopListingEntry) => void;
  onPurchased: (newCredits: number) => void;
}) {
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();
  const soldOut = listing.purchasedByMe >= listing.purchaseLimit;
  const canAfford = credits >= listing.priceCr;
  const { currencyName } = useSiteConfig();
  const rarity = listing.itemRarity;
  const style = RARITY_STYLES[rarity];

  async function handleBuy() {
    if (soldOut || !canAfford || buying) return;
    setBuying(true);
    setError(null);
    sound.click();
    const res = await purchaseShopItem(listing.id);
    setBuying(false);
    if (res.success) {
      sound.win();
      onPurchased(res.newCredits ?? credits);
    } else {
      sound.error();
      setError(res.error ?? "Fehler.");
    }
  }

  return (
    <div
      className={`group relative flex flex-col gap-3 rounded-2xl border p-4 transition-all duration-300 ${
        RARITY_BORDER[rarity]
      } ${RARITY_CARD_BG[rarity]} ${RARITY_GLOW[rarity]} ${
        soldOut ? "opacity-60" : ""
      }`}
    >
      {/* Mythisch/Ultra glow overlay */}
      {(rarity === "mythisch" || rarity === "ultra") && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              rarity === "ultra"
                ? "radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.12) 0%, transparent 70%)"
                : "radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.12) 0%, transparent 70%)",
          }}
        />
      )}
      {/* Rainbow border for ultra */}
      {rarity === "ultra" && <span aria-hidden className="rainbow-border" />}

      {/* Badges row */}
      <div className="flex items-center gap-1.5">
        {listing.featured && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
            <Star className="h-2.5 w-2.5" />
            Featured
          </span>
        )}
        {rarity === "ultra" && (
          <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">
            <Zap className="h-2.5 w-2.5" />
            Ultra Selten
          </span>
        )}
        {rarity === "mythisch" && !listing.featured && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
            <Sparkles className="h-2.5 w-2.5" />
            Mythisch
          </span>
        )}
        {soldOut && (
          <span className="ml-auto rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
            Gekauft
          </span>
        )}
      </div>

      <ItemThumbnail3D
        item={{ id: listing.itemId, name: listing.itemName, rarity: listing.itemRarity, type: listing.itemType, damage: listing.itemDamage }}
        gender={gender}
        onClick={() => { sound.click(); onPreview(listing); }}
      />

      <div>
        <p className={`truncate font-bold ${rarity === "ultra" ? "rainbow-text" : style.text}`}>{listing.itemName}</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">{ITEM_TYPE_LABELS[listing.itemType] ?? listing.itemType}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <RarityBadge rarity={listing.itemRarity} />
        <ItemStatBadges
          damage={listing.itemDamage}
          armor={listing.itemArmor}
          perk_type={listing.itemPerkType}
          perk_magnitude={listing.itemPerkMagnitude}
          shield_hp={listing.itemShieldHp}
          shield_regen_cooldown_sec={listing.itemShieldCooldown}
          itemName={listing.itemName}
          itemType={listing.itemType}
        />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2">
        <span className={`text-lg font-extrabold ${canAfford && !soldOut ? "text-purple-300" : "text-zinc-500"}`}>
          {fmt(listing.priceCr)} {currencyName}
        </span>
        <button
          onMouseEnter={sound.hover}
          onClick={handleBuy}
          disabled={soldOut || !canAfford || buying}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all active:scale-95 ${
            soldOut
              ? "cursor-not-allowed bg-zinc-700 text-zinc-400"
              : !canAfford
                ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
                : "bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.5)] hover:bg-purple-500 hover:shadow-[0_0_20px_rgba(147,51,234,0.7)]"
          }`}
        >
          {buying ? (
            <span className="animate-pulse">...</span>
          ) : soldOut ? (
            <><Check className="h-3.5 w-3.5" />Gekauft</>
          ) : (
            <><ShoppingCart className="h-3.5 w-3.5" />Kaufen</>
          )}
        </button>
      </div>
      {error && <p className="text-[11px] font-medium text-red-400">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Featured Hero Card (for mythisch/ultra items)
// ---------------------------------------------------------------------------

function FeaturedHeroCard({
  listing, credits, gender, onPreview, onPurchased,
}: {
  listing: ShopListingEntry;
  credits: number;
  gender: "m" | "w";
  onPreview: (listing: ShopListingEntry) => void;
  onPurchased: (newCredits: number) => void;
}) {
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();
  const soldOut = listing.purchasedByMe >= listing.purchaseLimit;
  const canAfford = credits >= listing.priceCr;
  const { currencyName } = useSiteConfig();
  const rarity = listing.itemRarity;
  const style = RARITY_STYLES[rarity];

  async function handleBuy() {
    if (soldOut || !canAfford || buying) return;
    setBuying(true);
    setError(null);
    sound.click();
    const res = await purchaseShopItem(listing.id);
    setBuying(false);
    if (res.success) { sound.win(); onPurchased(res.newCredits ?? credits); }
    else { sound.error(); setError(res.error ?? "Fehler."); }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-[#0f0e18] to-purple-500/10">
      {rarity === "ultra" && <span aria-hidden className="rainbow-border" />}
      <div className="pointer-events-none absolute inset-0" style={{
        background: rarity === "ultra"
          ? "radial-gradient(ellipse at 30% 50%, rgba(239,68,68,0.18) 0%, transparent 60%), radial-gradient(ellipse at 70% 50%, rgba(147,51,234,0.14) 0%, transparent 60%)"
          : "radial-gradient(ellipse at 30% 50%, rgba(245,158,11,0.18) 0%, transparent 60%), radial-gradient(ellipse at 70% 50%, rgba(147,51,234,0.12) 0%, transparent 60%)",
      }} />

      <div className="relative z-10 flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex-shrink-0">
          <ItemThumbnail3D
            item={{ id: listing.itemId, name: listing.itemName, rarity: listing.itemRarity, type: listing.itemType, damage: listing.itemDamage }}
            gender={gender}
            onClick={() => { sound.click(); onPreview(listing); }}
          />
        </div>

        <div className="flex flex-1 flex-col gap-3 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300">
              <Star className="h-3.5 w-3.5" />
              Heutiger Highlight
            </span>
            <RarityBadge rarity={listing.itemRarity} />
          </div>

          <div>
            <h3 className={`text-2xl font-extrabold ${rarity === "ultra" ? "rainbow-text" : style.text}`}>
              {listing.itemName}
            </h3>
            <p className="mt-1 text-sm text-zinc-400">{ITEM_TYPE_LABELS[listing.itemType] ?? listing.itemType}</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
            <ItemStatBadges
              damage={listing.itemDamage} armor={listing.itemArmor}
              perk_type={listing.itemPerkType} perk_magnitude={listing.itemPerkMagnitude}
              shield_hp={listing.itemShieldHp} shield_regen_cooldown_sec={listing.itemShieldCooldown}
              itemName={listing.itemName} itemType={listing.itemType}
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            <span className="text-3xl font-extrabold text-purple-300">
              {fmt(listing.priceCr)} <span className="text-xl">{currencyName}</span>
            </span>
            <button
              onMouseEnter={sound.hover}
              onClick={handleBuy}
              disabled={soldOut || !canAfford || buying}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wide transition-all active:scale-95 ${
                soldOut
                  ? "cursor-not-allowed bg-zinc-700 text-zinc-400"
                  : !canAfford
                    ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
                    : "bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-[0_0_24px_rgba(147,51,234,0.6)] hover:shadow-[0_0_36px_rgba(147,51,234,0.8)]"
              }`}
            >
              {buying ? "..." : soldOut ? <><Check className="h-4 w-4" />Gekauft</> : <><ShoppingCart className="h-4 w-4" />Jetzt kaufen</>}
            </button>
          </div>
          {error && <p className="text-sm font-medium text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

function SectionHeader({ icon: Icon, label, colorClass }: { icon: typeof Store; label: string; colorClass: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ${colorClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <h2 className={`text-base font-bold ${colorClass}`}>{label}</h2>
      <div className="h-px flex-1 bg-white/5" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main shell
// ---------------------------------------------------------------------------

interface ShopShellProps {
  credits: number;
  streakDays: number;
  gender: "m" | "w";
  listings: ShopListingEntry[];
  resetsAt: string;
  motd: string | null;
  categories: ShopCategoryMeta[];
  isAdmin?: boolean;
}

export function ShopShell({
  credits: initialCredits,
  streakDays,
  gender,
  listings,
  resetsAt,
  motd,
  categories,
  isAdmin = false,
}: ShopShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  useRealtimeProfile((row) => { if (typeof row.credits === "number") setCredits(row.credits); });
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all");
  const [previewListing, setPreviewListing] = useState<ShopListingEntry | null>(null);
  const sound = useSoundManager();
  const router = useRouter();
  const { label: countdown, urgent } = useCountdown(resetsAt);

  // Split into featured hero items (mythisch/ultra + featured flag) vs. rest
  const heroItems = useMemo(() =>
    listings.filter((l) => l.featured && (l.itemRarity === "mythisch" || l.itemRarity === "ultra"))
      .slice(0, 2),
    [listings]
  );

  // Rarity filter options that are actually present
  const availableRarities = useMemo(() => {
    const set = new Set(listings.map((l) => l.itemRarity));
    return (["ultra", "mythisch", "selten", "normal"] as Rarity[]).filter((r) => set.has(r));
  }, [listings]);

  // Items after rarity filter, excluding hero items so they don't duplicate
  const heroIds = useMemo(() => new Set(heroItems.map((l) => l.id)), [heroItems]);
  const filteredListings = useMemo(() =>
    listings.filter((l) => !heroIds.has(l.id) && (rarityFilter === "all" || l.itemRarity === rarityFilter)),
    [listings, heroIds, rarityFilter]
  );

  // Group by category (DB categories first, sorted by sort_order; uncategorized last)
  type Section = { id: string | null; name: string; icon: string | null; color: string | null; items: ShopListingEntry[] };
  const sections = useMemo((): Section[] => {
    const categoryOrder = categories.map((c) => c.id);
    const byCategory = new Map<string | null, ShopListingEntry[]>();
    for (const l of filteredListings) {
      const key = l.categoryId;
      const list = byCategory.get(key) ?? [];
      list.push(l);
      byCategory.set(key, list);
    }

    const result: Section[] = [];
    // DB categories in sort_order
    for (const catId of categoryOrder) {
      const items = byCategory.get(catId);
      if (!items || items.length === 0) continue;
      const cat = categories.find((c) => c.id === catId)!;
      result.push({ id: catId, name: cat.name, icon: cat.icon, color: cat.color, items });
    }
    // Uncategorized
    const uncategorized = byCategory.get(null);
    if (uncategorized && uncategorized.length > 0) {
      result.push({ id: null, name: "Weitere Items", icon: "Tag", color: "purple", items: uncategorized });
    }
    return result;
  }, [filteredListings, categories]);

  function handlePurchased(newCredits: number) {
    setCredits(newCredits);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} onCreditsChange={setCredits} isAdmin={isAdmin} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Link
          href="/"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Link>

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="heading-shimmer flex items-center gap-2.5 text-3xl font-extrabold">
              <Store className="heading-icon-bob h-7 w-7 text-purple-400" />
              Tages-Shop
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {listings.length} Items verfügbar · täglich neue Auswahl
            </p>
          </div>
          <div className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm transition-colors ${
            urgent ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-white/10 bg-white/5 text-zinc-300"
          }`}>
            <Clock className={`h-4 w-4 ${urgent ? "text-red-400" : "text-purple-400"}`} />
            <span className="text-zinc-400">Neuer Shop in</span>
            <span className={`font-mono text-base font-bold ${urgent ? "text-red-300" : "text-purple-300"}`}>
              {countdown}
            </span>
          </div>
        </div>

        {/* MOTD Banner */}
        {motd && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-500/10 to-transparent px-4 py-3">
            <Megaphone className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-400" />
            <p className="text-sm text-purple-200">{motd}</p>
          </div>
        )}

        {listings.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-20 text-center">
            <Package className="h-12 w-12 text-zinc-700" />
            <div>
              <p className="text-base font-semibold text-zinc-400">Shop ist heute leer</p>
              <p className="mt-1 text-sm text-zinc-600">Schau morgen wieder vorbei.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {/* Featured Hero Section */}
            {heroItems.length > 0 && (
              <div className="flex flex-col gap-4">
                <SectionHeader icon={Sparkles} label="Heutiges Highlight" colorClass="text-amber-300" />
                <div className="grid gap-4 lg:grid-cols-2">
                  {heroItems.map((listing) => (
                    <FeaturedHeroCard
                      key={listing.id}
                      listing={listing}
                      credits={credits}
                      gender={gender}
                      onPreview={setPreviewListing}
                      onPurchased={handlePurchased}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Rarity Filter */}
            {availableRarities.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { sound.click(); setRarityFilter("all"); }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    rarityFilter === "all" ? "border-purple-400/60 bg-purple-500/20 text-purple-200" : "border-white/10 text-zinc-500 hover:border-white/20"
                  }`}
                >
                  Alle
                </button>
                {availableRarities.map((r) => {
                  const s = RARITY_STYLES[r];
                  return (
                    <button
                      key={r}
                      onClick={() => { sound.click(); setRarityFilter(rarityFilter === r ? "all" : r); }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        rarityFilter === r ? `${s.border} ${s.bg} ${s.text}` : "border-white/10 text-zinc-500 hover:border-white/20"
                      }`}
                    >
                      {r === "normal" ? "Normal" : r === "selten" ? "Selten" : r === "mythisch" ? "Mythisch" : "Ultra"}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Category Sections */}
            {sections.length === 0 && filteredListings.length === 0 && (
              <div className="py-8 text-center text-sm text-zinc-500">
                Keine Items für diesen Filter.
              </div>
            )}
            {sections.map((section) => {
              const CatIcon = resolveShopCategoryIcon(section.icon);
              const catColor = resolveShopCategoryColor(section.color);
              return (
                <div key={section.id ?? "uncategorized"} className="flex flex-col gap-4">
                  <SectionHeader
                    icon={CatIcon}
                    label={section.name}
                    colorClass={catColor.text}
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {section.items.map((listing) => (
                      <ShopCard
                        key={listing.id}
                        listing={listing}
                        credits={credits}
                        gender={gender}
                        onPreview={setPreviewListing}
                        onPurchased={handlePurchased}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {previewListing && (
        <ItemPreviewModal
          item={{
            id: previewListing.itemId,
            name: previewListing.itemName,
            rarity: previewListing.itemRarity,
            type: previewListing.itemType,
            damage: previewListing.itemDamage,
            armor: previewListing.itemArmor,
            perk_type: previewListing.itemPerkType,
            perk_magnitude: previewListing.itemPerkMagnitude,
            shield_hp: previewListing.itemShieldHp,
            shield_regen_cooldown_sec: previewListing.itemShieldCooldown,
          }}
          gender={gender}
          onClose={() => setPreviewListing(null)}
        />
      )}
    </div>
  );
}
