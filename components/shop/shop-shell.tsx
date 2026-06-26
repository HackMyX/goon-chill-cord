"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Store, Clock, Sparkles, ShoppingCart, Check, Megaphone,
  Star, Zap, Package, TrendingUp, Eye, X, ChevronLeft, ChevronRight, Crown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { View } from "@react-three/drei";
import { TopBar } from "@/components/layout/top-bar";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { UniversalPreviewModal } from "@/components/ui/universal-preview-modal";
import { ShopCharacterView, type ItemForPreview } from "@/components/shop/shop-character-view";
import { useSoundManager } from "@/lib/sound-manager";
import { ItemStatBadges } from "@/components/items/item-stat-badges";
import { purchaseShopItem, type ShopListingEntry, type ShopCategoryMeta } from "@/lib/actions/shop";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import { resolveShopCategoryIcon, resolveShopCategoryColor } from "@/lib/shop-category-icons";
import { RARITY_STYLES, type Rarity } from "@/lib/cases";
import { BP_THEMES, type BattlePass } from "@/lib/battle-pass";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RARITY_GLOW: Record<Rarity, string> = {
  normal:   "shadow-[0_0_18px_rgba(59,130,246,0.2)] hover:shadow-[0_0_32px_rgba(59,130,246,0.45)]",
  selten:   "shadow-[0_0_18px_rgba(168,85,247,0.2)] hover:shadow-[0_0_32px_rgba(168,85,247,0.45)]",
  mythisch: "shadow-[0_0_24px_rgba(245,158,11,0.3)] hover:shadow-[0_0_44px_rgba(245,158,11,0.55)]",
  ultra:    "shadow-[0_0_28px_rgba(217,70,239,0.3)] hover:shadow-[0_0_50px_rgba(217,70,239,0.6)]",
};

const RARITY_CARD_BG: Record<Rarity, string> = {
  normal:   "bg-gradient-to-b from-blue-500/8 via-[#0a0a14] to-[#0a0a14]",
  selten:   "bg-gradient-to-b from-purple-500/10 via-[#0a0a14] to-[#0a0a14]",
  mythisch: "bg-gradient-to-b from-amber-500/14 via-[#0a0a14] to-[#0a0a14]",
  ultra:    "bg-gradient-to-b from-fuchsia-500/12 via-[#0a0a14] to-[#0a0a14]",
};

const RARITY_BORDER: Record<Rarity, string> = {
  normal:   "border-blue-400/25 hover:border-blue-400/50",
  selten:   "border-purple-400/30 hover:border-purple-400/55",
  mythisch: "border-amber-400/45 hover:border-amber-400/70",
  ultra:    "border-fuchsia-400/45 hover:border-fuchsia-400/70",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  hat: "Helm", jacket: "Jacke", pants: "Hose", shoes: "Schuhe",
  trail: "Spur", shield_cosmetic: "Schild", aura: "Aura", face: "Maske",
  hair: "Haare", pet: "Haustier", weapon_cosmetic: "Waffe", ring: "Ring",
  amulet: "Amulett", weapon: "Waffe",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function listingToPreview(l: ShopListingEntry): ItemForPreview {
  return {
    id: l.itemId,
    name: l.itemName,
    rarity: l.itemRarity,
    type: l.itemType,
    damage: l.itemDamage,
    armor: l.itemArmor,
    perk_type: l.itemPerkType,
    perk_magnitude: l.itemPerkMagnitude,
    shield_hp: l.itemShieldHp,
    shield_regen_cooldown_sec: l.itemShieldCooldown,
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useCountdown(targetIso: string): { h: number; m: number; s: number; urgent: boolean } {
  const [diff, setDiff] = useState(0);
  useEffect(() => {
    function tick() { setDiff(Math.max(0, new Date(targetIso).getTime() - Date.now())); }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return {
    h: Math.floor(diff / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
    urgent: diff < 3_600_000,
  };
}

function fmt(n: number) { return new Intl.NumberFormat("de-DE").format(n); }

// ---------------------------------------------------------------------------
// Shop card — 3D character preview embedded in the thumbnail area
// ---------------------------------------------------------------------------

function ShopCard({
  listing, credits, gender, index, viewIndex, onPreview, onPurchased,
}: {
  listing: ShopListingEntry;
  credits: number;
  gender: "m" | "w";
  index: number;
  viewIndex: number;
  onPreview: (listing: ShopListingEntry) => void;
  onPurchased: (newCredits: number) => void;
}) {
  const [buying, setBuying] = useState(false);
  const [justBought, setJustBought] = useState(false);
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
      setJustBought(true);
      onPurchased(res.newCredits ?? credits);
      setTimeout(() => setJustBought(false), 2000);
    } else {
      sound.error();
      setError(res.error ?? "Fehler.");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4, ease: "easeOut" }}
      whileHover={{ y: -4 }}
      className={`group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 transition-all duration-300 ${
        RARITY_BORDER[rarity]
      } ${RARITY_CARD_BG[rarity]} ${RARITY_GLOW[rarity]} ${soldOut ? "opacity-60" : ""}`}
    >
      {/* Ambient top glow */}
      <div
        className="pointer-events-none absolute -top-8 left-1/2 h-24 w-2/3 -translate-x-1/2 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            rarity === "ultra"   ? "radial-gradient(ellipse, rgba(217,70,239,0.2) 0%, transparent 70%)"
          : rarity === "mythisch"? "radial-gradient(ellipse, rgba(245,158,11,0.2) 0%, transparent 70%)"
          : rarity === "selten"  ? "radial-gradient(ellipse, rgba(168,85,247,0.15) 0%, transparent 70%)"
          : "radial-gradient(ellipse, rgba(59,130,246,0.12) 0%, transparent 70%)",
        }}
      />
      {rarity === "ultra" && <span aria-hidden className="rainbow-border" />}

      {/* Badge row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {listing.featured && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
            <Star className="h-2.5 w-2.5 fill-current" /> Featured
          </span>
        )}
        {rarity === "ultra" && (
          <span className="relative flex items-center gap-1 overflow-hidden rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold">
            <span aria-hidden className="rainbow-border" />
            <Zap className="h-2.5 w-2.5 rainbow-text" />
            <span className="rainbow-text">Ultra</span>
          </span>
        )}
        {rarity === "mythisch" && !listing.featured && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
            <Sparkles className="h-2.5 w-2.5" /> Mythisch
          </span>
        )}
        {soldOut && <span className="ml-auto rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] font-bold text-zinc-400">Gekauft</span>}
      </div>

      {/* 3D character preview — tap to open full-screen modal */}
      <div
        className="group/thumb relative h-48 cursor-pointer overflow-hidden rounded-xl border border-white/8 transition-all hover:border-white/20"
        onClick={() => { sound.click(); onPreview(listing); }}
      >
        <ShopCharacterView
          item={listingToPreview(listing)}
          gender={gender}
          viewIndex={viewIndex}
        />
        {/* "Full view" hint on hover */}
        {/* Show hint always on touch devices, hover-only on desktop */}
        <div className="pointer-events-none absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-zinc-300 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover/thumb:opacity-100">
          <Eye className="h-3 w-3" /> Vollansicht
        </div>
      </div>

      {/* Name */}
      <div>
        <p className={`truncate text-sm font-bold ${rarity === "ultra" ? "rainbow-text" : style.text}`}>{listing.itemName}</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">{ITEM_TYPE_LABELS[listing.itemType] ?? listing.itemType}</p>
      </div>

      {/* Rarity + stats */}
      <div className="flex flex-wrap items-center gap-1">
        <RarityBadge rarity={listing.itemRarity} />
        <ItemStatBadges
          damage={listing.itemDamage} armor={listing.itemArmor}
          perk_type={listing.itemPerkType} perk_magnitude={listing.itemPerkMagnitude}
          shield_hp={listing.itemShieldHp} shield_regen_cooldown_sec={listing.itemShieldCooldown}
          itemName={listing.itemName} itemType={listing.itemType}
        />
      </div>

      {/* Buy row */}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className={`text-base font-extrabold ${canAfford && !soldOut ? "text-purple-300" : "text-zinc-500"}`}>
          {fmt(listing.priceCr)}<span className="ml-1 text-xs font-semibold opacity-70">{currencyName}</span>
        </span>
        <motion.button
          onMouseEnter={sound.hover}
          onClick={handleBuy}
          disabled={soldOut || !canAfford || buying}
          whileTap={soldOut || !canAfford ? {} : { scale: 0.93 }}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            justBought
              ? "bg-emerald-600 text-white shadow-[0_0_16px_rgba(52,211,153,0.5)]"
              : soldOut
                ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
                : !canAfford
                  ? "cursor-not-allowed bg-zinc-800/80 text-zinc-600"
                  : "bg-purple-600 text-white shadow-[0_0_14px_rgba(147,51,234,0.5)] hover:bg-purple-500 hover:shadow-[0_0_22px_rgba(147,51,234,0.7)]"
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {buying ? (
              <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="animate-pulse">…</motion.span>
            ) : justBought ? (
              <motion.span key="done" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />Gekauft!
              </motion.span>
            ) : soldOut ? (
              <motion.span key="sold" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5" />Besessen
              </motion.span>
            ) : (
              <motion.span key="buy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5">
                <ShoppingCart className="h-3.5 w-3.5" />Kaufen
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
      {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-[11px] font-medium text-red-400">{error}</motion.p>}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Featured Hero Banner — large 3D character on the left
// ---------------------------------------------------------------------------

function FeaturedHero({
  listings, credits, gender, viewIndexOf, onPreview, onPurchased,
}: {
  listings: ShopListingEntry[];
  credits: number;
  gender: "m" | "w";
  viewIndexOf: Map<string, number>;
  onPreview: (listing: ShopListingEntry) => void;
  onPurchased: (newCredits: number) => void;
}) {
  const [active, setActive] = useState(0);
  const listing = listings[active];
  const [buying, setBuying] = useState(false);
  const [justBought, setJustBought] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();
  const { currencyName } = useSiteConfig();
  const soldOut = listing.purchasedByMe >= listing.purchaseLimit;
  const canAfford = credits >= listing.priceCr;
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
      setJustBought(true);
      onPurchased(res.newCredits ?? credits);
      setTimeout(() => setJustBought(false), 2000);
    } else {
      sound.error();
      setError(res.error ?? "Fehler.");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative overflow-hidden rounded-3xl border border-amber-400/30"
    >
      {/* Animated background */}
      <AnimatePresence mode="wait">
        <motion.div
          key={listing.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0"
          style={{
            background:
              rarity === "ultra"
                ? "radial-gradient(ellipse at 25% 50%, rgba(239,68,68,0.2) 0%, transparent 55%), radial-gradient(ellipse at 75% 30%, rgba(147,51,234,0.15) 0%, transparent 55%), #050410"
                : "radial-gradient(ellipse at 25% 50%, rgba(245,158,11,0.18) 0%, transparent 55%), radial-gradient(ellipse at 75% 30%, rgba(147,51,234,0.12) 0%, transparent 55%), #050410",
          }}
        />
      </AnimatePresence>

      {rarity === "ultra" && <span aria-hidden className="rainbow-border" />}

      {/* Particle dots (pure CSS) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[12, 28, 45, 62, 78].map((x, i) => (
          <div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-white/20 animate-pulse"
            style={{ left: `${x}%`, top: `${20 + i * 15}%`, animationDelay: `${i * 0.4}s` }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-8 lg:p-8">

        {/* 3D character preview — all hero items mounted, only the active one visible */}
        <div className="flex flex-shrink-0 items-stretch justify-center sm:w-52">
          <div
            className="group/fhero relative h-56 w-full cursor-pointer overflow-hidden rounded-2xl border border-white/10 transition-all hover:border-white/24 sm:h-64"
            onClick={() => { sound.click(); onPreview(listing); }}
          >
            {listings.map((l, i) => (
              <ShopCharacterView
                key={l.id}
                item={listingToPreview(l)}
                gender={gender}
                viewIndex={viewIndexOf.get(l.id) ?? i}
                visible={i === active}
              />
            ))}
            <div className="pointer-events-none absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-zinc-300 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover/fhero:opacity-100">
              <Eye className="h-3 w-3" /> Vollansicht
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/25 px-3 py-1 text-xs font-bold text-amber-200">
              <Star className="h-3.5 w-3.5 fill-current" />
              Heutiges Highlight
            </span>
            <RarityBadge rarity={listing.itemRarity} />
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={listing.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <h2 className={`text-2xl font-extrabold sm:text-3xl ${rarity === "ultra" ? "rainbow-text" : style.text}`}>
                {listing.itemName}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">{ITEM_TYPE_LABELS[listing.itemType] ?? listing.itemType}</p>
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-wrap gap-1.5">
            <ItemStatBadges
              damage={listing.itemDamage} armor={listing.itemArmor}
              perk_type={listing.itemPerkType} perk_magnitude={listing.itemPerkMagnitude}
              shield_hp={listing.itemShieldHp} shield_regen_cooldown_sec={listing.itemShieldCooldown}
              itemName={listing.itemName} itemType={listing.itemType}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-[11px] text-zinc-500">Preis</p>
              <p className="text-3xl font-extrabold text-purple-300">
                {fmt(listing.priceCr)}<span className="ml-1 text-lg font-semibold opacity-70">{currencyName}</span>
              </p>
            </div>
            <motion.button
              onMouseEnter={sound.hover}
              onClick={handleBuy}
              disabled={soldOut || !canAfford || buying}
              whileTap={soldOut || !canAfford ? {} : { scale: 0.95 }}
              className={`flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black uppercase tracking-widest transition-all ${
                justBought
                  ? "bg-emerald-600 text-white shadow-[0_0_20px_rgba(52,211,153,0.5)]"
                  : soldOut
                    ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
                    : !canAfford
                      ? "cursor-not-allowed bg-zinc-800/80 text-zinc-600"
                      : "bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-[0_0_28px_rgba(147,51,234,0.6)] hover:shadow-[0_0_40px_rgba(147,51,234,0.8)]"
              }`}
            >
              {buying ? "…" : justBought ? <><Check className="h-4 w-4" />Gekauft!</> : soldOut ? <><Check className="h-4 w-4" />Besessen</> : <><ShoppingCart className="h-4 w-4" />Jetzt kaufen</>}
            </motion.button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>

      {/* Carousel navigation — prev/next arrows + dot indicators */}
      {listings.length > 1 && (
        <div className="relative z-10 flex items-center justify-center gap-4 pb-5 pt-1">
          {/* Prev */}
          <button
            onClick={() => { sound.click(); setActive((i) => (i - 1 + listings.length) % listings.length); setJustBought(false); setError(null); }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/40 text-zinc-300 backdrop-blur-sm transition-all hover:border-purple-400/50 hover:bg-purple-500/20 hover:text-purple-200 active:scale-90"
            aria-label="Vorheriges Highlight"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Dots + counter */}
          <div className="flex items-center gap-2">
            {listings.map((l, i) => (
              <button
                key={l.id}
                onClick={() => { sound.click(); setActive(i); setJustBought(false); setError(null); }}
                aria-label={`Highlight ${i + 1}`}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  i === active ? "w-10 bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.7)]" : "w-2.5 bg-zinc-600 hover:bg-zinc-400"
                }`}
              />
            ))}
          </div>

          {/* Next */}
          <button
            onClick={() => { sound.click(); setActive((i) => (i + 1) % listings.length); setJustBought(false); setError(null); }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/40 text-zinc-300 backdrop-blur-sm transition-all hover:border-purple-400/50 hover:bg-purple-500/20 hover:text-purple-200 active:scale-90"
            aria-label="Nächstes Highlight"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Counter badge */}
          <span className="absolute right-5 bottom-5 rounded-full border border-white/10 bg-black/50 px-2 py-0.5 text-[10px] font-bold text-zinc-400 backdrop-blur-sm">
            {active + 1} / {listings.length}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Countdown display
// ---------------------------------------------------------------------------

function CountdownDisplay({ resetsAt }: { resetsAt: string }) {
  const { h, m, s, urgent } = useCountdown(resetsAt);
  const parts = [
    { val: h, label: "H" },
    { val: m, label: "M" },
    { val: s, label: "S" },
  ];
  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 transition-colors ${
      urgent ? "border-red-500/40 bg-red-500/10" : "border-white/10 bg-white/[0.03]"
    }`}>
      <Clock className={`h-4 w-4 flex-shrink-0 ${urgent ? "text-red-400" : "text-purple-400"}`} />
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Reset in</span>
        <div className="flex items-center gap-1">
          {parts.map(({ val, label }, i) => (
            <span key={label} className="flex items-end gap-0.5">
              <span className={`font-mono text-lg font-extrabold tabular-nums ${urgent ? "text-red-300" : "text-purple-300"}`}>
                {val.toString().padStart(2, "0")}
              </span>
              <span className="mb-0.5 text-[10px] text-zinc-500">{label}</span>
              {i < 2 && <span className={`mb-1 text-sm font-bold ${urgent ? "text-red-400" : "text-purple-400"}`}>:</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon, label, colorClass, count,
}: {
  icon: typeof Store;
  label: string;
  colorClass: string;
  count?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
      className="flex items-center gap-3"
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 shadow-[0_0_12px_rgba(0,0,0,0.3)] ${colorClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <h2 className={`text-lg font-extrabold ${colorClass}`}>{label}</h2>
      {count !== undefined && (
        <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-zinc-400">
          {count}
        </span>
      )}
      <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Battle Pass banner components
// ---------------------------------------------------------------------------

function BpBannerCard({ bp, size }: { bp: BattlePass; size: "card" | "banner" | "hero" }) {
  const theme = BP_THEMES[bp.theme] ?? BP_THEMES.default;
  const accent = bp.accentColor || theme.accent;
  const glow = theme.glow;

  if (size === "hero") {
    return (
      <Link href="/battlepass" className="group relative block w-full overflow-hidden rounded-3xl border transition-all duration-300 hover:-translate-y-1">
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}20 0%, #080612 60%)`, borderColor: `${accent}50` }} />
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-3xl"
          animate={{ opacity: [0, 0.3, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          style={{ background: `radial-gradient(ellipse at 50% 0%, ${glow}, transparent 70%)` }}
        />
        {bp.bannerImageUrl && (
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.07]"
            style={{ backgroundImage: `url(${bp.bannerImageUrl})` }}
          />
        )}
        <div className="relative flex items-center justify-between p-6 sm:p-8">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2" style={{ color: accent }}>
              {bp.passIcon ?? "🏆"} {bp.seasonLabel}
            </p>
            <h2 className="text-2xl sm:text-4xl font-black text-white mb-2" style={{ textShadow: `0 0 60px ${glow}` }}>
              {bp.name}
            </h2>
            {bp.description && (
              <p className="text-sm text-white/50 mb-4 max-w-xl line-clamp-2">{bp.description}</p>
            )}
            <div className="flex flex-wrap gap-3">
              <span className="rounded-full border px-3 py-1.5 text-xs font-bold" style={{ borderColor: `${accent}40`, color: accent, background: `${accent}12` }}>
                👑 ab {bp.priceCr.toLocaleString("de-DE")} CR
              </span>
              {bp.showTierCountInShop && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/50">
                  {bp.tierCount} Tiers
                </span>
              )}
              {bp.eliteEnabled && (
                <span className="rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1.5 text-xs font-bold text-violet-300">
                  💎 Elite {bp.elitePriceCr.toLocaleString("de-DE")} CR
                </span>
              )}
            </div>
          </div>
          <div
            className="shrink-0 ml-6 flex items-center justify-center rounded-2xl border p-5 transition-all group-hover:scale-110"
            style={{ borderColor: `${accent}30`, background: `${accent}14`, boxShadow: `0 0 30px ${glow}` }}
          >
            <Crown className="h-10 w-10" style={{ color: accent }} />
          </div>
        </div>
        <div className="relative px-6 pb-4 sm:px-8">
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: accent }}>
            <ChevronRight className="h-4 w-4" />
            Zum Battle Pass — Jetzt kaufen
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      </Link>
    );
  }

  if (size === "banner") {
    return (
      <Link href="/battlepass" className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border px-5 py-4 transition-all duration-300 hover:-translate-y-0.5"
        style={{ borderColor: `${accent}35`, background: `linear-gradient(90deg, ${accent}14 0%, #080612 50%)` }}
      >
        <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 0% 50%, ${glow}, transparent 60%)`, opacity: 0.4 }} />
        <div className="relative flex items-center justify-center rounded-xl border p-3 shrink-0"
          style={{ borderColor: `${accent}30`, background: `${accent}12`, boxShadow: `0 0 20px ${glow}` }}
        >
          <span className="text-2xl">{bp.passIcon ?? "🏆"}</span>
        </div>
        <div className="relative flex-1 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: `${accent}80` }}>{bp.seasonLabel}</p>
          <h3 className="text-base font-black text-white truncate">{bp.name}</h3>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="font-bold" style={{ color: accent }}>ab {bp.priceCr.toLocaleString("de-DE")} CR</span>
            {bp.showTierCountInShop && <span className="text-white/30">· {bp.tierCount} Tiers</span>}
          </div>
        </div>
        <div className="relative shrink-0 flex items-center gap-1 text-xs font-black" style={{ color: accent }}>
          <ChevronRight className="h-4 w-4" />
        </div>
      </Link>
    );
  }

  // card (default)
  return (
    <Link href="/battlepass" className="group relative overflow-hidden rounded-2xl border transition-all duration-300 hover:-translate-y-1"
      style={{ borderColor: `${accent}40`, background: `linear-gradient(135deg, ${accent}10 0%, #0a090f 60%)`, boxShadow: `0 0 0 1px ${accent}15` }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 60% 0%, ${glow}, transparent 70%)`, opacity: 0.4 }} />
      <div className="relative flex items-center justify-between p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: accent }}>{bp.seasonLabel}</p>
          <h3 className="text-base font-black text-white">{bp.name}</h3>
          {bp.description && <p className="mt-1 text-xs text-white/40 line-clamp-1">{bp.description}</p>}
          <div className="mt-2 flex items-center gap-2 text-xs">
            {bp.showTierCountInShop && (
              <span className="rounded-full border px-2 py-0.5 font-bold" style={{ borderColor: `${accent}40`, color: accent, background: `${accent}10` }}>
                {bp.tierCount} Tiers
              </span>
            )}
            <span className="text-white/30">ab {bp.priceCr.toLocaleString("de-DE")} CR</span>
          </div>
        </div>
        <div className="shrink-0 ml-4 flex items-center justify-center rounded-xl border p-3 transition-all group-hover:scale-110"
          style={{ borderColor: `${accent}30`, background: `${accent}12`, boxShadow: `0 0 16px ${glow}` }}
        >
          <Crown className="h-6 w-6" style={{ color: accent }} />
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: accent }}>
          <ChevronRight className="h-3 w-3" />
          Zum Battle Pass
        </div>
      </div>
    </Link>
  );
}

function BpPositionSlot({
  passes,
  position,
}: {
  passes: BattlePass[];
  position: import("@/lib/battle-pass").BpShopPosition;
}) {
  const filtered = passes.filter((bp) => bp.showInShop && bp.shopPosition === position);
  if (!filtered.length) return null;

  const hasHero = filtered.some((bp) => bp.shopBannerSize === "hero");

  return (
    <div className="mb-6">
      {position === "top" || position === "below_motd" ? null : (
        <SectionHeader icon={Star} label="Battle Pass" colorClass="text-amber-300" />
      )}
      <div className={`mt-3 ${hasHero ? "flex flex-col gap-3" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}`}>
        {filtered
          .sort((a, b) => a.shopSortOrder - b.shopSortOrder)
          .map((bp) => (
            <BpBannerCard key={bp.id} bp={bp} size={bp.shopBannerSize ?? "card"} />
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main shop shell
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
  isModerator?: boolean;
  activeBattlePasses?: BattlePass[];
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
  isModerator = false,
  activeBattlePasses = [],
}: ShopShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  useRealtimeProfile((row) => { if (typeof row.credits === "number") setCredits(row.credits); });
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all");
  const [previewListing, setPreviewListing] = useState<ShopListingEntry | null>(null);
  const [motdDismissed, setMotdDismissed] = useState(false);
  const sound = useSoundManager();
  const router = useRouter();
  const { currencyName } = useSiteConfig();

  // Root ref for the shared Canvas's eventSource — required so OrbitControls
  // in each View receives pointer events from the correct DOM region.
  const shopRootRef = useRef<HTMLDivElement>(null);

  // Stable 0-based view index per listing — each listing gets exactly one
  // View slot in the shared Canvas. Must never change between renders.
  const viewIndexOf = useMemo(
    () => new Map(listings.map((l, i) => [l.id, i])),
    [listings]
  );

  // Split featured hero items (mythisch/ultra + featured)
  const heroItems = useMemo(
    () => listings.filter((l) => l.featured && (l.itemRarity === "mythisch" || l.itemRarity === "ultra")).slice(0, 3),
    [listings]
  );
  const heroIds = useMemo(() => new Set(heroItems.map((l) => l.id)), [heroItems]);

  const availableRarities = useMemo(() => {
    const set = new Set(listings.filter((l) => !heroIds.has(l.id)).map((l) => l.itemRarity));
    return (["ultra", "mythisch", "selten", "normal"] as Rarity[]).filter((r) => set.has(r));
  }, [listings, heroIds]);

  const filteredListings = useMemo(
    () => listings.filter((l) => !heroIds.has(l.id) && (rarityFilter === "all" || l.itemRarity === rarityFilter)),
    [listings, heroIds, rarityFilter]
  );

  // Group by category
  type Section = { id: string | null; name: string; icon: string | null; color: string | null; items: ShopListingEntry[]; sortOrder: number };
  const sections = useMemo((): Section[] => {
    const catOrder = categories.map((c) => c.id);
    const byCategory = new Map<string | null, ShopListingEntry[]>();
    for (const l of filteredListings) {
      const list = byCategory.get(l.categoryId) ?? [];
      list.push(l);
      byCategory.set(l.categoryId, list);
    }
    const result: Section[] = [];
    for (const catId of catOrder) {
      const items = byCategory.get(catId);
      if (!items?.length) continue;
      const cat = categories.find((c) => c.id === catId)!;
      result.push({ id: catId, name: cat.name, icon: cat.icon, color: cat.color, items, sortOrder: cat.sortOrder });
    }
    const uncategorized = byCategory.get(null);
    if (uncategorized?.length) {
      result.push({ id: null, name: "Weitere Items", icon: "Package", color: "purple", items: uncategorized, sortOrder: 9999 });
    }
    return result;
  }, [filteredListings, categories]);

  function handlePurchased(newCredits: number) {
    setCredits(newCredits);
    router.refresh();
  }

  const totalListings = listings.length;

  return (
    <div ref={shopRootRef} className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} onCreditsChange={setCredits} isAdmin={isAdmin} isModerator={isModerator} />

      {/* Hero banner area */}
      <div className="relative overflow-hidden border-b border-white/5 bg-[#030305]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(147,51,234,0.12)_0%,transparent_60%)]" />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                onMouseEnter={sound.hover}
                onClick={sound.click}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Zurück
              </Link>
              <div>
                <h1 className="heading-shimmer flex items-center gap-2 text-2xl font-extrabold sm:text-3xl">
                  <Store className="heading-icon-bob h-6 w-6 text-purple-400" />
                  Tages-Shop
                </h1>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {totalListings} Items · täglich neue Auswahl
                </p>
              </div>
            </div>
            <CountdownDisplay resetsAt={resetsAt} />
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-8">
        {/* BP: top position (before MOTD) */}
        <BpPositionSlot passes={activeBattlePasses} position="top" />

        {/* MOTD Banner */}
        <AnimatePresence>
          {motd && !motdDismissed && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-6 overflow-hidden"
            >
              <div className="flex items-start gap-3 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-500/15 via-purple-500/5 to-transparent px-4 py-3 shadow-[0_0_20px_rgba(147,51,234,0.1)]">
                <Megaphone className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-400" />
                <p className="flex-1 text-sm text-purple-200">{motd}</p>
                <button onClick={() => setMotdDismissed(true)} className="text-zinc-600 hover:text-zinc-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* BP: below_motd position */}
        <BpPositionSlot passes={activeBattlePasses} position="below_motd" />

        {listings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4 rounded-3xl border border-white/5 bg-white/[0.02] px-4 py-24 text-center"
          >
            <Package className="h-14 w-14 text-zinc-700" />
            <div>
              <p className="text-lg font-semibold text-zinc-400">Shop ist heute leer</p>
              <p className="mt-1 text-sm text-zinc-600">Schau morgen wieder vorbei.</p>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-12">

            {/* BP: below_featured (default) — shown before featured hero */}
            {activeBattlePasses.some((bp) => bp.showInShop && bp.shopPosition === "below_featured") && (
              <BpPositionSlot passes={activeBattlePasses} position="below_featured" />
            )}

            {/* Featured Hero */}
            {heroItems.length > 0 && (
              <div className="flex flex-col gap-4">
                <SectionHeader icon={Sparkles} label="Heutiger Highlight" colorClass="text-amber-300" />
                <FeaturedHero
                  listings={heroItems}
                  credits={credits}
                  gender={gender}
                  viewIndexOf={viewIndexOf}
                  onPreview={setPreviewListing}
                  onPurchased={handlePurchased}
                />
              </div>
            )}

            {/* Stats bar */}
            {(filteredListings.length > 0 || availableRarities.length > 0) && (
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Rarity filter pills */}
                {availableRarities.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => { sound.click(); setRarityFilter("all"); }}
                      className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${
                        rarityFilter === "all" ? "border-purple-400/60 bg-purple-500/20 text-purple-200 shadow-[0_0_10px_rgba(147,51,234,0.3)]" : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                      }`}
                    >
                      Alle <span className="ml-1 opacity-60">({filteredListings.length})</span>
                    </button>
                    {availableRarities.map((r) => {
                      const s = RARITY_STYLES[r];
                      const count = listings.filter((l) => !heroIds.has(l.id) && l.itemRarity === r).length;
                      return (
                        <button
                          key={r}
                          onClick={() => { sound.click(); setRarityFilter(rarityFilter === r ? "all" : r); }}
                          className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${
                            rarityFilter === r ? `${s.border} ${s.bg} ${s.text} shadow-[0_0_10px_rgba(0,0,0,0.3)]` : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                          }`}
                        >
                          {r === "normal" ? "Normal" : r === "selten" ? "Selten" : r === "mythisch" ? "Mythisch" : "Ultra"}
                          <span className="ml-1 opacity-60">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-zinc-600">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>{filteredListings.length} Items</span>
                </div>
              </div>
            )}

            {/* Category Sections */}
            {sections.length === 0 && filteredListings.length === 0 && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center text-sm text-zinc-500">
                Keine Items für diesen Filter.
              </motion.p>
            )}

            {/* BP: between_categories — before the first category */}
            {activeBattlePasses.some((bp) => bp.showInShop && bp.shopPosition === "between_categories") && (
              <BpPositionSlot passes={activeBattlePasses} position="between_categories" />
            )}

            {sections.map((section, si) => {
              const CatIcon = resolveShopCategoryIcon(section.icon);
              const catColor = resolveShopCategoryColor(section.color);
              return (
                <motion.div
                  key={section.id ?? "uncategorized"}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: si * 0.08, duration: 0.4 }}
                  className="flex flex-col gap-5"
                >
                  <SectionHeader icon={CatIcon} label={section.name} colorClass={catColor.text} count={section.items.length} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {section.items.map((listing, i) => (
                      <ShopCard
                        key={listing.id}
                        listing={listing}
                        credits={credits}
                        gender={gender}
                        index={i}
                        viewIndex={viewIndexOf.get(listing.id) ?? i}
                        onPreview={setPreviewListing}
                        onPurchased={handlePurchased}
                      />
                    ))}
                  </div>
                </motion.div>
              );
            })}

            {/* BP: bottom — after all categories */}
            {activeBattlePasses.some((bp) => bp.showInShop && bp.shopPosition === "bottom") && (
              <BpPositionSlot passes={activeBattlePasses} position="bottom" />
            )}
          </div>
        )}
      </main>

      {/* Shared Canvas — one WebGL context for ALL ShopCharacterViews.
          position:fixed + alpha:true means it's transparent everywhere except
          where a View renders its scene. pointer-events:none so HTML buttons
          and links remain fully interactive. z-[10] puts it above cards but
          below the preview modal (z-[200]) and the TopBar. */}
      <Canvas
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: 10,
        }}
        gl={{ alpha: true, antialias: true }}
        eventSource={shopRootRef as React.RefObject<HTMLElement>}
        onCreated={({ gl, scene }) => {
          const renderer = gl;
          const rootScene = scene;
          return () => {
            rootScene.traverse((obj) => {
              const mesh = obj as import("three").Mesh;
              mesh.geometry?.dispose();
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach((m) => m.dispose());
              } else {
                (mesh.material as import("three").Material | undefined)?.dispose();
              }
            });
            renderer.dispose();
          };
        }}
      >
        <View.Port />
      </Canvas>

      {/* Preview modal — z-[300], universal preview engine */}
      {previewListing && (
        <UniversalPreviewModal
          subject={{
            kind: "item",
            item: {
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
            },
            gender,
          }}
          onClose={() => setPreviewListing(null)}
        />
      )}
    </div>
  );
}
