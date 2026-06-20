"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, Loader2, LogOut, Ban, ShieldOff, Eraser } from "lucide-react";
import {
  getUserDetail,
  searchItems,
  grantItemToUser,
  removeUserItem,
  setUserBanned,
  kickUser,
  wipeUserInventory,
  type UserDetail,
} from "@/lib/actions/admin";
import { ItemRenderer } from "@/components/items/item-renderer";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { AuditTimeline } from "@/components/admin/audit-timeline";
import { useSoundManager } from "@/lib/sound-manager";
import type { Rarity } from "@/lib/cases";

export function UserDetailPanel({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; rarity: Rarity; type: string }[]>([]);
  const [modAction, setModAction] = useState<string | null>(null);
  const [modMessage, setModMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  async function refresh() {
    const res = await getUserDetail(userId);
    if (res.detail) setDetail(res.detail);
  }

  useEffect(() => {
    let active = true;
    getUserDetail(userId).then((res) => {
      if (active && res.detail) setDetail(res.detail);
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!query.trim()) {
      const timeout = setTimeout(() => setResults([]), 0);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(() => {
      searchItems(query).then(setResults);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  async function handleGrant(itemId: string) {
    const res = await grantItemToUser(userId, itemId);
    if (res.success) await refresh();
  }

  async function handleRemove(inventoryId: string) {
    const res = await removeUserItem(inventoryId);
    if (res.success && detail) {
      setDetail({ ...detail, inventory: detail.inventory.filter((r) => r.id !== inventoryId) });
    }
  }

  async function handleKick() {
    if (!confirm("User wirklich sofort ausloggen? Er kann sich nach ~30s wieder anmelden.")) return;
    setModAction("kick");
    const res = await kickUser(userId);
    setModAction(null);
    setModMessage(res.success ? "Ausgeloggt." : res.error ?? "Fehler.");
  }

  async function handleBanToggle() {
    if (!detail) return;
    const next = !detail.banned;
    if (
      !confirm(
        next
          ? "User wirklich permanent bannen? Er kann sich danach nicht mehr einloggen."
          : "Bann wirklich aufheben?"
      )
    )
      return;
    setModAction("ban");
    const res = await setUserBanned(userId, next);
    setModAction(null);
    if (res.success) {
      setDetail({ ...detail, banned: next });
      setModMessage(next ? "User gebannt." : "User entbannt.");
    } else {
      setModMessage(res.error ?? "Fehler.");
    }
  }

  async function handleWipe() {
    if (!confirm("Inventar dieses Users wirklich komplett leeren? Das kann nicht rückgängig gemacht werden."))
      return;
    setModAction("wipe");
    const res = await wipeUserInventory(userId);
    setModAction(null);
    if (res.success) {
      setDetail((d) => (d ? { ...d, inventory: [] } : d));
      setModMessage("Inventar geleert.");
    } else {
      setModMessage(res.error ?? "Fehler.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="border-t border-white/10 pt-4">
      {/* Moderation actions */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.03] p-3">
        <span className="mr-1 text-xs font-semibold tracking-wide text-red-300">MODERATION</span>
        <button
          onMouseEnter={sound.hover}
          onClick={handleKick}
          disabled={modAction !== null}
          className="flex items-center gap-1.5 rounded-lg border border-orange-500/40 px-3 py-1.5 text-xs font-semibold text-orange-300 transition-colors hover:bg-orange-500/10 disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          Force Logout / Kick
        </button>
        <button
          onMouseEnter={sound.hover}
          onClick={handleBanToggle}
          disabled={modAction !== null}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            detail.banned
              ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
              : "border-red-500/40 text-red-300 hover:bg-red-500/10"
          }`}
        >
          {detail.banned ? <ShieldOff className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
          {detail.banned ? "Entbannen" : "User bannen"}
        </button>
        <button
          onMouseEnter={sound.hover}
          onClick={handleWipe}
          disabled={modAction !== null}
          className="flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          <Eraser className="h-3.5 w-3.5" />
          Inventar wipen
        </button>
        {detail.banned && (
          <span className="ml-auto rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">
            GEBANNT
          </span>
        )}
        {modMessage && <span className="text-xs text-zinc-400">{modMessage}</span>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-purple-300">
            INVENTAR ({detail.inventory.length})
          </h4>

          <div className="relative mb-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Item suchen & hinzufügen..."
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-[#0f0e18] shadow-lg">
                {results.map((item) => (
                  <button
                    key={item.id}
                    onMouseEnter={sound.hover}
                    onClick={() => {
                      sound.click();
                      handleGrant(item.id);
                      setQuery("");
                      setResults([]);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-purple-500/10"
                  >
                    <span className="flex items-center gap-2">
                      <ItemRenderer type={item.type} rarity={item.rarity} size="sm" />
                      {item.name}
                    </span>
                    <Plus className="h-4 w-4 text-purple-300" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {detail.inventory.length === 0 && (
              <p className="text-sm text-zinc-500">Kein Inventar.</p>
            )}
            {detail.inventory.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-zinc-200">
                  <ItemRenderer type={row.item.type} rarity={row.item.rarity} size="sm" />
                  {row.item.name}
                  {row.equipped && (
                    <span className="text-[10px] font-semibold text-emerald-400">aktiv</span>
                  )}
                  <RarityBadge rarity={row.item.rarity} className="ml-1" />
                </span>
                <button
                  onMouseEnter={sound.hover}
                  onClick={() => {
                    sound.click();
                    handleRemove(row.id);
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-purple-300">
            PERSÖNLICHES LOG
          </h4>
          <div className="max-h-[28rem] overflow-y-auto pr-1">
            <AuditTimeline entries={detail.logs.map((l) => ({ ...l, payload: l.payload as Record<string, unknown> | null }))} />
          </div>
        </div>
      </div>
    </div>
  );
}
