"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Store, Clock, Sparkles, ShoppingCart, Check } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { ItemPreviewModal } from "@/components/wardrobe/item-preview-modal";
import { ItemThumbnail3D } from "@/components/shop/item-thumbnail-3d";
import { useSoundManager } from "@/lib/sound-manager";
import { isWeaponType, getEquippedDamage, formatDamage } from "@/lib/combat";
import { purchaseShopItem, type ShopListingEntry } from "@/lib/actions/shop";

interface ShopShellProps {
  credits: number;
  streakDays: number;
  gender: "m" | "w";
  listings: ShopListingEntry[];
  resetsAt: string;
  isAdmin?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  hat: "Hüte",
  jacket: "Jacken",
  pants: "Hosen",
  shoes: "Schuhe",
  weapon_cosmetic: "Waffen-Skins",
  pet: "Pets",
  aura: "Auren",
  trail: "Trails",
  ring: "Ringe",
  amulet: "Amulette",
  hair: "Haare",
  face: "Gesichter",
  shield_cosmetic: "Schilde",
};

function useCountdown(targetIso: string): string {
  const [label, setLabel] = useState("--:--:--");
  useEffect(() => {
    function tick() {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) {
        setLabel("00:00:00");
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setLabel([h, m, s].map((n) => n.toString().padStart(2, "0")).join(":"));
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetIso]);
  return label;
}

function fmt(n: number) {
  return new Intl.NumberFormat("de-DE").format(n);
}

function ShopCard({
  listing,
  credits,
  gender,
  onPreview,
  onPurchased,
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
      className={`flex flex-col gap-3 rounded-2xl border p-4 transition-all ${
        listing.featured
          ? "border-amber-400/40 bg-gradient-to-b from-amber-500/10 to-transparent shadow-[0_0_24px_rgba(251,191,36,0.15)]"
          : "border-white/10 bg-[#0f0e18]"
      }`}
    >
      {listing.featured && (
        <span className="flex items-center gap-1 self-start rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          <Sparkles className="h-3 w-3" />
          Featured
        </span>
      )}

      <ItemThumbnail3D
        item={{
          id: listing.itemId,
          name: listing.itemName,
          rarity: listing.itemRarity,
          type: listing.itemType,
          damage: listing.itemDamage,
        }}
        gender={gender}
        onClick={() => {
          sound.click();
          onPreview(listing);
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-semibold text-zinc-100">{listing.itemName}</p>
        <RarityBadge rarity={listing.itemRarity} />
      </div>
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] text-zinc-500">{CATEGORY_LABELS[listing.itemType] ?? listing.itemType}</p>
        {isWeaponType(listing.itemType) && (
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
            {formatDamage(getEquippedDamage({ damage: listing.itemDamage }))}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-lg font-extrabold text-purple-300">{fmt(listing.priceCr)} CR</span>
        <button
          onMouseEnter={sound.hover}
          onClick={handleBuy}
          disabled={soldOut || !canAfford || buying}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
            soldOut
              ? "cursor-not-allowed bg-zinc-700 text-zinc-400"
              : !canAfford
                ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
                : "bg-purple-600 text-white hover:bg-purple-500"
          }`}
        >
          {soldOut ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Gekauft
            </>
          ) : (
            <>
              <ShoppingCart className="h-3.5 w-3.5" />
              Kaufen
            </>
          )}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

export function ShopShell({
  credits: initialCredits,
  streakDays,
  gender,
  listings,
  resetsAt,
  isAdmin = false,
}: ShopShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  const [category, setCategory] = useState<string | "all">("all");
  const [previewListing, setPreviewListing] = useState<ShopListingEntry | null>(null);
  const sound = useSoundManager();
  const router = useRouter();
  const countdown = useCountdown(resetsAt);

  const categories = useMemo(() => {
    const set = new Set(listings.map((l) => l.itemType));
    return Array.from(set);
  }, [listings]);

  const filtered = category === "all" ? listings : listings.filter((l) => l.itemType === category);

  function handlePurchased(newCredits: number) {
    setCredits(newCredits);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} onCreditsChange={setCredits} isAdmin={isAdmin} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Link
          href="/"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Link>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="heading-shimmer flex items-center gap-2 text-2xl font-extrabold">
            <Store className="heading-icon-bob h-6 w-6 text-purple-400" />
            Shop
          </h1>
          <div className="flex items-center gap-1.5 rounded-2xl bg-white/5 px-4 py-2 text-sm text-zinc-300">
            <Clock className="h-4 w-4 text-purple-400" />
            Neuer Shop in <span className="font-mono font-bold text-purple-300">{countdown}</span>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <button
            onClick={() => setCategory("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              category === "all" ? "bg-purple-500/30 text-purple-200" : "bg-white/5 text-zinc-400 hover:bg-white/10"
            }`}
          >
            Alle
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                category === c ? "bg-purple-500/30 text-purple-200" : "bg-white/5 text-zinc-400 hover:bg-white/10"
              }`}
            >
              {CATEGORY_LABELS[c] ?? c}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-16 text-center">
            <Store className="h-10 w-10 text-zinc-600" />
            <p className="text-sm text-zinc-500">Der Shop ist heute leer — schau morgen wieder vorbei.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((listing) => (
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
          }}
          gender={gender}
          onClose={() => setPreviewListing(null)}
        />
      )}
    </div>
  );
}
