"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Gavel, Plus, Clock, Trophy, Ban } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { useSoundManager } from "@/lib/sound-manager";
import { useConfirm } from "@/components/layout/confirm-dialog-provider";
import { createAuction, placeBid, cancelAuction } from "@/lib/actions/auctions";
import { computeListingFee } from "@/lib/auctions";
import type { Rarity } from "@/lib/cases";

export interface OwnedItem {
  inventoryId: string;
  name: string;
  rarity: Rarity;
  type: string;
}

export interface AuctionListEntry {
  id: string;
  sellerId: string;
  sellerName: string;
  itemId: string;
  itemName: string;
  itemRarity: Rarity;
  itemType: string;
  currentBid: number;
  currentBidderName: string | null;
  listingFee: number;
  status: "active" | "sold" | "expired" | "cancelled";
  endsAt: string;
  createdAt: string;
}

interface AuctionsShellProps {
  credits: number;
  streakDays: number;
  viewerId: string;
  myItems: OwnedItem[];
  auctions: AuctionListEntry[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("de-DE").format(n);
}

/** Plain derivation, not a live-ticking clock — "roughly how long is left"
 * recomputed on every render (which already happens often enough here,
 * driven by bid/refresh actions) is all this needs, no interval/effect
 * required. */
function countdownLabel(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "abgelaufen";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const STATUS_LABEL: Record<AuctionListEntry["status"], string> = {
  active: "Aktiv",
  sold: "Verkauft",
  expired: "Abgelaufen",
  cancelled: "Abgebrochen",
};

function CreateAuctionForm({
  myItems,
  onCreated,
  onCancel,
}: {
  myItems: OwnedItem[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<OwnedItem | null>(null);
  const [startingBid, setStartingBid] = useState(500);
  const [durationHours, setDurationHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();

  const fee = computeListingFee(startingBid || 0);

  async function handleSubmit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    sound.click();
    const res = await createAuction({ inventoryId: selected.inventoryId, startingBid, durationHours });
    setSubmitting(false);
    if (res.success) {
      sound.win();
      onCreated();
    } else {
      sound.error();
      setError(res.error ?? "Fehler.");
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-purple-500/20 bg-[#0f0e18] p-5">
      <h3 className="mb-3 text-sm font-bold text-purple-300">Item inserieren</h3>

      <p className="mb-2 text-xs font-semibold text-zinc-400">Item wählen</p>
      <div className="mb-4 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-white/5 p-1.5">
        {myItems.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-zinc-500">Keine Items verfügbar.</p>
        )}
        {myItems.map((item) => (
          <button
            key={item.inventoryId}
            onMouseEnter={sound.hover}
            onClick={() => {
              sound.click();
              setSelected(item);
            }}
            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors ${
              selected?.inventoryId === item.inventoryId
                ? "border-purple-400/60 bg-purple-500/15 text-purple-200"
                : "border-white/10 text-zinc-300 hover:border-white/25"
            }`}
          >
            <span className="truncate">{item.name}</span>
            <RarityBadge rarity={item.rarity} />
          </button>
        ))}
      </div>

      {selected && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-400">Startgebot (CR)</span>
              <input
                type="number"
                min={1}
                value={startingBid}
                onChange={(e) => setStartingBid(Math.max(1, Number(e.target.value)))}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-400">Laufzeit (Stunden)</span>
              <input
                type="number"
                min={1}
                max={72}
                value={durationHours}
                onChange={(e) => setDurationHours(Math.max(1, Math.min(72, Number(e.target.value))))}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
          </div>

          <p className="mt-3 text-xs text-amber-300">
            Einstellgebühr: <span className="font-bold">{fmt(fee)} CR</span> (5%, min. 50 CR) — wird sofort
            abgezogen, auch falls die Auktion ohne Gebot endet.
          </p>

          <div className="mt-4 flex items-center justify-end gap-2">
            {error && <span className="text-xs text-red-400">{error}</span>}
            <button
              onMouseEnter={sound.hover}
              onClick={onCancel}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
            >
              Abbrechen
            </button>
            <button
              onMouseEnter={sound.hover}
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-60"
            >
              Auktion starten
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AuctionRow({
  auction,
  viewerId,
  credits,
  onChanged,
}: {
  auction: AuctionListEntry;
  viewerId: string;
  credits: number;
  onChanged: () => void;
}) {
  const sound = useSoundManager();
  const confirm = useConfirm();
  const countdown = countdownLabel(auction.endsAt);
  const [bidAmount, setBidAmount] = useState(auction.currentBid + 1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSeller = auction.sellerId === viewerId;
  const isActive = auction.status === "active";

  async function handleBid() {
    setSubmitting(true);
    setError(null);
    sound.click();
    const res = await placeBid(auction.id, bidAmount);
    setSubmitting(false);
    if (res.success) {
      sound.win();
      onChanged();
    } else {
      sound.error();
      setError(res.error ?? "Fehler.");
    }
  }

  async function handleCancel() {
    const ok = await confirm({
      title: "Auktion abbrechen",
      message: "Die Einstellgebühr wird nicht erstattet. Fortfahren?",
      confirmLabel: "Abbrechen",
      danger: true,
    });
    if (!ok) return;
    sound.click();
    const res = await cancelAuction(auction.id);
    if (res.success) onChanged();
    else sound.error();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#0f0e18] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Trophy className="h-5 w-5 shrink-0 text-amber-400" />
        <div>
          <p className="flex items-center gap-2 font-semibold text-zinc-100">
            {auction.itemName}
            <RarityBadge rarity={auction.itemRarity} />
          </p>
          <p className="text-[11px] text-zinc-500">
            von {auction.sellerName}
            {auction.currentBidderName && (
              <>
                {" "}
                · höchstes Gebot von <span className="text-purple-300">{auction.currentBidderName}</span>
              </>
            )}
            {!auction.currentBidderName && isActive && " · Kein Gebot"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold text-purple-300">{fmt(auction.currentBid)} CR</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            auction.status === "active"
              ? "bg-emerald-500/20 text-emerald-300"
              : auction.status === "sold"
                ? "bg-purple-500/20 text-purple-300"
                : "bg-zinc-500/20 text-zinc-400"
          }`}
        >
          {STATUS_LABEL[auction.status]}
        </span>
        {isActive && (
          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
            <Clock className="h-3 w-3" />
            {countdown}
          </span>
        )}

        {isActive && !isSeller && (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={auction.currentBid + 1}
              value={bidAmount}
              onChange={(e) => setBidAmount(Number(e.target.value))}
              className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
            <button
              onMouseEnter={sound.hover}
              onClick={handleBid}
              disabled={submitting || credits < bidAmount}
              className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-60"
            >
              Bieten
            </button>
          </div>
        )}
        {isActive && isSeller && !auction.currentBidderName && (
          <button
            onMouseEnter={sound.hover}
            onClick={handleCancel}
            className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-white/5"
          >
            <Ban className="h-3.5 w-3.5" />
            Abbrechen
          </button>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}

export function AuctionsShell({ credits, streakDays, viewerId, myItems, auctions }: AuctionsShellProps) {
  const [creating, setCreating] = useState(false);
  const sound = useSoundManager();
  const router = useRouter();

  const active = auctions.filter((a) => a.status === "active");
  const history = auctions.filter((a) => a.status !== "active");

  function refresh() {
    setCreating(false);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <Link
          href="/"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Link>

        <div className="mb-6 flex items-center justify-between">
          <h1 className="glow-text flex items-center gap-2 text-2xl font-extrabold text-zinc-50">
            <Gavel className="h-6 w-6 text-purple-400" />
            Auktionshaus
          </h1>
          {!creating && (
            <button
              onMouseEnter={sound.hover}
              onClick={() => {
                sound.click();
                setCreating(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-500"
            >
              <Plus className="h-4 w-4" />
              Item inserieren
            </button>
          )}
        </div>

        {creating && (
          <CreateAuctionForm myItems={myItems} onCreated={refresh} onCancel={() => setCreating(false)} />
        )}

        {active.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-2 text-xs font-bold tracking-wide text-zinc-500 uppercase">
              Aktive Auktionen ({active.length})
            </h2>
            <div className="flex flex-col gap-3">
              {active.map((a) => (
                <AuctionRow key={a.id} auction={a} viewerId={viewerId} credits={credits} onChanged={refresh} />
              ))}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-bold tracking-wide text-zinc-500 uppercase">
              Verlauf ({history.length})
            </h2>
            <div className="flex flex-col gap-3">
              {history.map((a) => (
                <AuctionRow key={a.id} auction={a} viewerId={viewerId} credits={credits} onChanged={refresh} />
              ))}
            </div>
          </div>
        )}

        {active.length === 0 && history.length === 0 && !creating && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-16 text-center">
            <Gavel className="h-10 w-10 text-zinc-600" />
            <p className="text-sm text-zinc-500">Noch keine Auktionen — starte eine!</p>
          </div>
        )}
      </main>
    </div>
  );
}
