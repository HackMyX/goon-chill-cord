"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Repeat, Plus, Search, Check, X as XIcon, Ban } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { useSoundManager } from "@/lib/sound-manager";
import { useConfirm } from "@/components/layout/confirm-dialog-provider";
import {
  createTradeOffer,
  cancelTrade,
  respondToTrade,
  getPlayerInventoryForTrade,
  type OwnedItemSummary,
} from "@/lib/actions/trading";
import type { Rarity } from "@/lib/cases";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";
import { useSiteConfig } from "@/components/layout/site-config-provider";

export interface TradablePlayer {
  id: string;
  username: string;
  acceptsTrades?: boolean;
}

export interface OwnedItem {
  inventoryId: string;
  name: string;
  rarity: Rarity;
  type: string;
}

export interface TradeListEntry {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  offeredItems: { id: string; name: string; rarity: Rarity; type: string }[];
  requestedItems: { id: string; name: string; rarity: Rarity; type: string }[];
  offeredCredits: number;
  requestedCredits: number;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
}

interface TradingShellProps {
  credits: number;
  streakDays: number;
  viewerId: string;
  myItems: OwnedItem[];
  players: TradablePlayer[];
  trades: TradeListEntry[];
  isAdmin?: boolean;
  isModerator?: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat("de-DE").format(n);
}

function ItemPicker({
  items,
  selected,
  onToggle,
  emptyLabel,
}: {
  items: { id: string; name: string; rarity: Rarity }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Items suchen..."
          className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-purple-400/60"
        />
      </div>
      <div className="h-64 space-y-1 overflow-y-auto rounded-lg border border-white/5 p-1.5">
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-zinc-500">{emptyLabel}</p>
        )}
        {filtered.map((item) => {
          const active = selected.has(item.id);
          return (
            <button
              key={item.id}
              onClick={() => onToggle(item.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors ${
                active
                  ? "border-purple-400/60 bg-purple-500/15 text-purple-200"
                  : "border-white/10 text-zinc-300 hover:border-white/25"
              }`}
            >
              <span className="truncate">{item.name}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <RarityBadge rarity={item.rarity} />
                <Plus className={`h-3.5 w-3.5 ${active ? "rotate-45 text-purple-300" : "text-zinc-500"} transition-transform`} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreateTradeForm({
  myItems,
  players,
  onCreated,
  onCancel,
}: {
  myItems: OwnedItem[];
  players: TradablePlayer[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<TradablePlayer | null>(null);
  const [theirItems, setTheirItems] = useState<OwnedItemSummary[]>([]);
  const [loadingTheirs, setLoadingTheirs] = useState(false);
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set());
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [offeredCredits, setOfferedCredits] = useState(0);
  const [requestedCredits, setRequestedCredits] = useState(0);
  const { currencyName } = useSiteConfig();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();

  async function selectPlayer(player: TradablePlayer) {
    sound.click();
    setSelectedPlayer(player);
    setRequestedIds(new Set());
    setLoadingTheirs(true);
    const items = await getPlayerInventoryForTrade(player.id);
    setTheirItems(items);
    setLoadingTheirs(false);
  }

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  async function handleSubmit() {
    if (!selectedPlayer) return;
    setSubmitting(true);
    setError(null);
    sound.click();
    const res = await createTradeOffer({
      receiverId: selectedPlayer.id,
      offeredItemIds: Array.from(offeredIds),
      requestedItemIds: Array.from(requestedIds),
      offeredCredits,
      requestedCredits,
    });
    setSubmitting(false);
    if (res.success) {
      sound.win();
      onCreated();
    } else {
      sound.error();
      setError(res.error ?? "Fehler.");
    }
  }

  const myItemOptions = myItems.map((i) => ({ id: i.inventoryId, name: i.name, rarity: i.rarity }));
  const theirItemOptions = theirItems.map((i) => ({ id: i.inventoryId, name: i.name, rarity: i.rarity }));

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-[#0f0e18] p-5">
      <h3 className="mb-3 text-sm font-bold text-purple-300">Trade erstellen</h3>

      <p className="mb-2 text-xs font-semibold text-zinc-400">Spieler wählen</p>
      <div className="mb-5 flex flex-wrap gap-2">
        {players.map((p) => {
          const blocked = p.acceptsTrades === false;
          return (
            <button
              key={p.id}
              onMouseEnter={sound.hover}
              onClick={() => !blocked && selectPlayer(p)}
              disabled={blocked}
              title={blocked ? "Dieser Spieler nimmt aktuell keine Trade-Anfragen an" : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                blocked
                  ? "cursor-not-allowed border-white/5 text-zinc-600 line-through"
                  : selectedPlayer?.id === p.id
                  ? "border-purple-400 bg-purple-500/20 text-purple-200"
                  : "border-white/10 text-zinc-300 hover:border-white/30"
              }`}
            >
              {p.username}
            </button>
          );
        })}
      </div>

      {selectedPlayer && (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-emerald-400">Deine Items (anbieten)</p>
              <ItemPicker
                items={myItemOptions}
                selected={offeredIds}
                onToggle={(id) => toggle(offeredIds, setOfferedIds, id)}
                emptyLabel="Keine Items"
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                {currencyName} dazu anbieten:
                <input
                  type="number"
                  min={0}
                  value={offeredCredits}
                  onChange={(e) => setOfferedCredits(Math.max(0, Number(e.target.value)))}
                  className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
              </label>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-amber-400">
                Items von {selectedPlayer.username} (anfordern)
              </p>
              {loadingTheirs ? (
                <p className="py-8 text-center text-xs text-zinc-500">Lade Inventar...</p>
              ) : (
                <ItemPicker
                  items={theirItemOptions}
                  selected={requestedIds}
                  onToggle={(id) => toggle(requestedIds, setRequestedIds, id)}
                  emptyLabel="Keine Items"
                />
              )}
              <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                {currencyName} dazu fordern:
                <input
                  type="number"
                  min={0}
                  value={requestedCredits}
                  onChange={(e) => setRequestedCredits(Math.max(0, Number(e.target.value)))}
                  className="w-28 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
              </label>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {offeredIds.size === 0 && requestedIds.size === 0 && offeredCredits === 0 && requestedCredits === 0
                ? "Wähle Items aus"
                : `${offeredIds.size} Item(s) angeboten ↔ ${requestedIds.size} Item(s) gefordert`}
            </span>
            <div className="flex items-center gap-2">
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
                Trade senden
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ItemChips({ items, credits }: { items: { id: string; name: string; rarity: Rarity }[]; credits: number }) {
  const { currencyName } = useSiteConfig();
  if (items.length === 0 && credits === 0) return <span className="text-xs text-zinc-600">nichts</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((i) => (
        <span key={i.id} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-zinc-300">
          {i.name}
        </span>
      ))}
      {credits > 0 && (
        <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[11px] font-semibold text-purple-300">
          {fmt(credits)} {currencyName}
        </span>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<TradeListEntry["status"], string> = {
  pending: "Offen",
  accepted: "Angenommen",
  declined: "Abgelehnt",
  cancelled: "Abgebrochen",
};

function TradeRow({ trade, viewerId, onChanged }: { trade: TradeListEntry; viewerId: string; onChanged: () => void }) {
  const sound = useSoundManager();
  const confirm = useConfirm();
  const { currencyName } = useSiteConfig();
  const isReceiver = trade.receiverId === viewerId;
  const isSender = trade.senderId === viewerId;
  const otherName = isReceiver ? trade.senderName : trade.receiverName;

  async function handleAccept() {
    sound.click();
    const ok = await confirm({
      title: "Trade annehmen",
      message: `Items und ${currencyName} werden sofort ausgetauscht. Das kann nicht rückgängig gemacht werden.`,
      confirmLabel: "Annehmen",
    });
    if (!ok) return;
    const res = await respondToTrade(trade.id, true);
    if (res.success) {
      sound.win();
      onChanged();
    } else {
      sound.error();
    }
  }

  async function handleDecline() {
    sound.click();
    await respondToTrade(trade.id, false);
    onChanged();
  }

  async function handleCancel() {
    sound.click();
    await cancelTrade(trade.id);
    onChanged();
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-200">
          {isSender ? "An" : "Von"} <span className="text-purple-300">{otherName}</span>
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            trade.status === "pending"
              ? "bg-amber-500/20 text-amber-300"
              : trade.status === "accepted"
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-red-500/20 text-red-300"
          }`}
        >
          {STATUS_LABEL[trade.status]}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] text-zinc-500">Angeboten von {trade.senderName}</p>
          <ItemChips items={trade.offeredItems} credits={trade.offeredCredits} />
        </div>
        <div>
          <p className="mb-1 text-[11px] text-zinc-500">Gefordert von {trade.receiverName}</p>
          <ItemChips items={trade.requestedItems} credits={trade.requestedCredits} />
        </div>
      </div>

      {trade.status === "pending" && (
        <div className="mt-3 flex justify-end gap-2">
          {isReceiver && (
            <>
              <button
                onMouseEnter={sound.hover}
                onClick={handleDecline}
                className="flex items-center gap-1 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10"
              >
                <XIcon className="h-3.5 w-3.5" />
                Ablehnen
              </button>
              <button
                onMouseEnter={sound.hover}
                onClick={handleAccept}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <Check className="h-3.5 w-3.5" />
                Annehmen
              </button>
            </>
          )}
          {isSender && (
            <button
              onMouseEnter={sound.hover}
              onClick={handleCancel}
              className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:bg-white/5"
            >
              <Ban className="h-3.5 w-3.5" />
              Abbrechen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TradingShell({
  credits: initialCredits,
  streakDays,
  viewerId,
  myItems,
  players,
  trades,
  isAdmin = false,
  isModerator = false,
}: TradingShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setCredits(row.credits);
  });
  const [creating, setCreating] = useState(false);
  const sound = useSoundManager();
  const router = useRouter();

  const sortedTrades = useMemo(
    () => [...trades].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [trades]
  );

  function refresh() {
    setCreating(false);
    // Server actions already revalidatePath("/trading"); router.refresh()
    // is what actually makes *this* mounted client component re-fetch the
    // server-component props (trades/myItems) on a soft navigation.
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} isAdmin={isAdmin} isModerator={isModerator} />

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
            <Repeat className="h-6 w-6 text-purple-400" />
            Trading
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
              Neuer Trade
            </button>
          )}
        </div>

        {creating && (
          <div className="mb-6">
            <CreateTradeForm
              myItems={myItems}
              players={players}
              onCreated={refresh}
              onCancel={() => setCreating(false)}
            />
          </div>
        )}

        {sortedTrades.length === 0 && !creating ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-16 text-center">
            <Repeat className="h-10 w-10 text-zinc-600" />
            <p className="text-sm text-zinc-500">Noch keine Trades — starte einen!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sortedTrades.map((trade) => (
              <TradeRow key={trade.id} trade={trade} viewerId={viewerId} onChanged={refresh} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
