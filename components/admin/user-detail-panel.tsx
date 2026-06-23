"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, Loader2, LogOut, Ban, ShieldOff, Eraser, PackagePlus, UserX, AlertTriangle, StickyNote, Clock } from "lucide-react";
import {
  getUserDetail,
  searchItems,
  grantItemToUser,
  grantAllItemsToUser,
  removeUserItem,
  setUserBanned,
  setUserGender,
  kickUser,
  wipeUserInventory,
  deleteUserCompletely,
  type UserDetail,
} from "@/lib/actions/admin";
import { ItemRenderer } from "@/components/items/item-renderer";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { AuditTimeline } from "@/components/admin/audit-timeline";
import { useSoundManager } from "@/lib/sound-manager";
import { useConfirm } from "@/components/layout/confirm-dialog-provider";
import type { Rarity } from "@/lib/cases";

export function UserDetailPanel({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; rarity: Rarity; type: string }[]>([]);
  const [modAction, setModAction] = useState<string | null>(null);
  const [modMessage, setModMessage] = useState<string | null>(null);
  const sound = useSoundManager();
  const confirm = useConfirm();

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
    const ok = await confirm({
      title: "Force Logout",
      message: "User wirklich sofort ausloggen? Er kann sich nach ~30s wieder anmelden.",
      confirmLabel: "Ausloggen",
    });
    if (!ok) return;
    setModAction("kick");
    const res = await kickUser(userId);
    setModAction(null);
    setModMessage(res.success ? "Ausgeloggt." : res.error ?? "Fehler.");
  }

  async function handleBanToggle() {
    if (!detail) return;
    const next = !detail.banned;
    const ok = await confirm({
      title: next ? "User bannen" : "Bann aufheben",
      message: next
        ? "User wirklich permanent bannen? Er kann sich danach nicht mehr einloggen."
        : "Bann wirklich aufheben?",
      confirmLabel: next ? "Bannen" : "Entbannen",
      danger: next,
    });
    if (!ok) return;
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
    const ok = await confirm({
      title: "Inventar wipen",
      message: "Inventar dieses Users wirklich komplett leeren? Das kann nicht rückgängig gemacht werden.",
      confirmLabel: "Leeren",
      danger: true,
    });
    if (!ok) return;
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

  async function handleDeleteCompletely() {
    const ok = await confirm({
      title: "User komplett löschen",
      message:
        "Diesen User und ALLE seine Daten (Inventar, Credits, Tickets, Login-Verlauf, …) dauerhaft löschen? Er kann sich danach mit seinem Discord neu registrieren — als komplett frischer Account ohne jede Erinnerung an diesen hier.",
      confirmLabel: "Ja, unwiderruflich löschen",
      danger: true,
    });
    if (!ok) return;

    const ok2 = await confirm({
      title: "Letzte Bestätigung",
      message: "Wirklich alles löschen? Das kann NICHT rückgängig gemacht werden.",
      confirmLabel: "Endgültig löschen",
      danger: true,
    });
    if (!ok2) return;

    setModAction("delete");
    const res = await deleteUserCompletely(userId);
    setModAction(null);
    if (res.success) {
      // User is gone — reload the admin page so the row disappears
      window.location.reload();
    } else {
      setModMessage(res.error ?? "Fehler beim Löschen.");
    }
  }

  async function handleGrantAll() {
    const ok = await confirm({
      title: "Alle Items geben",
      message: "Diesem User wirklich ALLE Items aus dem Katalog geben (alles, was er noch nicht hat)?",
      confirmLabel: "Vergeben",
    });
    if (!ok) return;
    setModAction("grant-all");
    const res = await grantAllItemsToUser(userId);
    setModAction(null);
    if (res.success) {
      await refresh();
      setModMessage("Alle Items vergeben.");
    } else {
      setModMessage(res.error ?? "Fehler.");
    }
  }

  async function handleGenderOverride(gender: "m" | "w") {
    if (!detail || detail.gender === gender) return;
    const ok = await confirm({
      title: "Geschlecht manuell ändern",
      message: `Geschlecht dieses Users manuell auf "${gender === "m" ? "Männlich" : "Weiblich"}" setzen? Admin-Override — umgeht die normale Sperre, z.B. falls sich der User vertippt/verklickt hat.`,
      confirmLabel: "Ändern",
    });
    if (!ok) return;
    setModAction("gender");
    const res = await setUserGender(userId, gender);
    setModAction(null);
    if (res.success) {
      setDetail({ ...detail, gender });
      setModMessage("Geschlecht geändert.");
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
        <button
          onMouseEnter={sound.hover}
          onClick={handleGrantAll}
          disabled={modAction !== null}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
        >
          <PackagePlus className="h-3.5 w-3.5" />
          Alle Items geben
        </button>

        {/* Manual gender override — for "User hat sich vertippt/verklickt"
            support requests, bypasses the player-facing permanent lock
            entirely (lib/actions/admin.ts setUserGender). */}
        <div className="flex items-center gap-1 rounded-lg border border-white/10 p-0.5">
          <button
            onMouseEnter={sound.hover}
            onClick={() => handleGenderOverride("m")}
            disabled={modAction !== null}
            title="Geschlecht manuell auf Männlich setzen"
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
              detail.gender === "m"
                ? "bg-purple-500/25 text-purple-200"
                : "text-zinc-400 hover:bg-white/5"
            }`}
          >
            ♂ M
          </button>
          <button
            onMouseEnter={sound.hover}
            onClick={() => handleGenderOverride("w")}
            disabled={modAction !== null}
            title="Geschlecht manuell auf Weiblich setzen"
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
              detail.gender === "w"
                ? "bg-purple-500/25 text-purple-200"
                : "text-zinc-400 hover:bg-white/5"
            }`}
          >
            ♀ W
          </button>
        </div>
        <button
          onMouseEnter={sound.hover}
          onClick={handleDeleteCompletely}
          disabled={modAction !== null}
          title="User und ALLE Daten permanent löschen — er kann sich danach neu registrieren"
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-700/60 bg-red-700/10 px-3 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-700/20 disabled:opacity-50"
        >
          <UserX className="h-3.5 w-3.5" />
          {modAction === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "User löschen"}
        </button>

        {detail.banned && (
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">
            GEBANNT
          </span>
        )}
        {modMessage && <span className="text-xs text-zinc-400">{modMessage}</span>}
      </div>

      {/* Mod history — only shown when there are actions on record */}
      {(detail.warningCount > 0 || detail.noteCount > 0 || detail.modActions.length > 0) && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-amber-300">MOD-VERLAUF</span>
            {detail.warningCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                <AlertTriangle className="h-2.5 w-2.5" />
                {detail.warningCount} Verwarnung{detail.warningCount !== 1 ? "en" : ""}
              </span>
            )}
            {detail.noteCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                <StickyNote className="h-2.5 w-2.5" />
                {detail.noteCount} Notiz{detail.noteCount !== 1 ? "en" : ""}
              </span>
            )}
          </div>
          <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto pr-1">
            {detail.modActions.map((a) => {
              const colorMap: Record<string, string> = {
                warning: "bg-amber-500/15 text-amber-300",
                note: "bg-sky-500/15 text-sky-300",
                temp_ban: "bg-red-500/15 text-red-300",
                ticket_close: "bg-purple-500/15 text-purple-300",
                credits_add: "bg-emerald-500/15 text-emerald-300",
              };
              const labelMap: Record<string, string> = {
                warning: "Verwarnung",
                note: "Notiz",
                temp_ban: "Temp-Ban",
                ticket_close: "Ticket",
                credits_add: "Credits",
              };
              return (
                <div key={a.id} className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${colorMap[a.actionType] ?? "bg-zinc-700 text-zinc-300"}`}>
                    {labelMap[a.actionType] ?? a.actionType}
                  </span>
                  {a.modUsername && <span className="flex-shrink-0 text-zinc-500">von <strong className="text-zinc-300">{a.modUsername}</strong></span>}
                  {a.reason && <span className="flex-1 truncate text-zinc-500">· {a.reason}</span>}
                  <span className="flex-shrink-0 text-zinc-600 flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(a.createdAt).toLocaleDateString("de-DE")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
