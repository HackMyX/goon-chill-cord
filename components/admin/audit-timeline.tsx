"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import {
  Package,
  Coins,
  Settings,
  ShieldCheck,
  Plus,
  Minus,
  Trash2,
  Ban,
  LogOut,
  Flame,
  Gift,
  Swords,
  Gavel,
  Repeat,
  X,
  RotateCcw,
  ShoppingBag,
  Pickaxe,
  Gamepad2,
  Trophy,
  UserX,
  UserPlus,
  UserCheck,
  Tag,
  Crown,
  Sparkles,
  Star,
  Camera,
  TrendingUp,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

export interface AuditEntry {
  id: string;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  /** Owner of the entry — used to bundle consecutive same-user/same-action rows. */
  user_id?: string;
  /** Username of the actor who performed the action (global log only). */
  actor?: string | null;
}

interface ActionMeta {
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  format: (payload: Record<string, unknown>, currencyName: string) => string;
  /** German noun phrase for the grouped header, e.g. "Plinko gespielt" → "20× Plinko gespielt". */
  groupNoun?: string;
  /** Numeric payload key totalled across a group (e.g. CR earned). */
  sumKey?: string;
  /** Label shown before the group total, e.g. "verdient". */
  sumLabel?: string;
}

function str(v: unknown, fallback = "—"): string {
  return typeof v === "string" || typeof v === "number" ? String(v) : fallback;
}

function cr(v: unknown, currencyName: string): string {
  return typeof v === "number" ? v.toLocaleString("de-DE") + " " + currencyName : str(v);
}

const ACTION_META: Record<string, ActionMeta> = {
  case_open: {
    icon: Package,
    color: "text-blue-300",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    groupNoun: "Case geöffnet",
    sumKey: "price",
    sumLabel: "ausgegeben",
    format: (p, c) =>
      `Case "${str(p.tierId)}" geöffnet für ${str(p.price)} ${c} — gewann "${str(p.wonItemName)}" (${str(p.rarity)})`,
  },
  double_or_nothing: {
    icon: Coins,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    groupNoun: "Double or Nothing gespielt",
    sumKey: "stake",
    sumLabel: "Einsatz",
    format: (p, c) =>
      p.won
        ? `Double or Nothing gewonnen: +${str(p.stake)} ${c}`
        : `Double or Nothing verloren: -${str(p.stake)} ${c}`,
  },
  streak_kill: {
    icon: Flame,
    color: "text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    groupNoun: "Kill-Streak-Kills",
    sumKey: "reward",
    sumLabel: "verdient",
    format: (p, c) =>
      `Kill-Streak: Monster "${str(p.monsterTypeId)}" besiegt — +${cr(p.reward, c)}, Streak: ${str(p.newStreakKillCount)} Kills (${cr(p.newPendingStreakCr, c)} ausstehend)`,
  },
  streak_commit: {
    icon: Coins,
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    format: (p, c) =>
      `Kill-Streak abgerechnet: ${cr(p.committed, c)} gutgeschrieben (Guthaben: ${cr(p.newCredits, c)})`,
  },
  streak_forfeit: {
    icon: X,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    format: (p, c) =>
      `Kill-Streak abgebrochen: ${cr(p.forfeitedCr, c)} und ${str(p.forfeitedKillCount)} Kills verloren`,
  },
  streak_claim: {
    icon: Gift,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p, c) =>
      `Daily-Streak abgeholt: +${cr(p.reward, c)}${p.milestoneBonus ? ` (+${cr(p.milestoneBonus, c)} Meilenstein-Bonus)` : ""} — Streak: ${str(p.newStreak)} Tage`,
  },
  pvp_hit_attempt: {
    icon: Swords,
    color: "text-rose-300",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    groupNoun: "PvP-Angriffe",
    format: (p) => {
      const target = typeof p.targetUsername === "string" ? p.targetUsername : `${str(p.targetUserId).slice(0, 8)}…`;
      return `PvP-Angriff: ${str(p.damage)} Schaden auf ${target}`;
    },
  },
  auction_sold: {
    icon: Gavel,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    format: (p, c) => {
      const buyer = typeof p.buyerUsername === "string" ? p.buyerUsername : `${str(p.buyerId).slice(0, 8)}…`;
      const item = typeof p.itemName === "string" ? ` — „${p.itemName}"` : "";
      return `Auktion verkauft${item} an ${buyer} für ${cr(p.price, c)}`;
    },
  },
  auction_buyout: {
    icon: Gavel,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    format: (p, c) => {
      const buyer = typeof p.buyerUsername === "string" ? p.buyerUsername : `${str(p.buyerId).slice(0, 8)}…`;
      const item = typeof p.itemName === "string" ? ` „${p.itemName}"` : "";
      return `Sofortkauf${item} von ${buyer} für ${cr(p.price, c)}`;
    },
  },
  trade_accepted: {
    icon: Repeat,
    color: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    format: (p) => {
      const sender = typeof p.senderUsername === "string" ? p.senderUsername : typeof p.senderId === "string" ? `${p.senderId.slice(0, 8)}…` : null;
      return sender ? `Trade mit ${sender} angenommen` : `Trade angenommen`;
    },
  },
  shop_purchase: {
    icon: ShoppingBag,
    color: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    groupNoun: "im Shop gekauft",
    sumKey: "price",
    sumLabel: "ausgegeben",
    format: (p, c) => `"${str(p.itemName)}" im Shop gekauft für ${cr(p.price, c)}`,
  },
  admin_economy_update: {
    icon: Settings,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p, c) =>
      `Case-Tier "${str(p.tierId)}" angepasst — Preis ${str(p.price)} ${c}, ${
        p.enabled ? "aktiv" : "deaktiviert"
      }`,
  },
  admin_set_credits: {
    icon: Coins,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p, c) => `Credits auf ${str(p.credits)} ${c} gesetzt`,
  },
  admin_set_role: {
    icon: ShieldCheck,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) => `Rolle geändert zu "${str(p.role)}"`,
  },
  admin_set_gender: {
    icon: Settings,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) => `Geschlecht geändert zu "${str(p.gender)}"`,
  },
  admin_grant_all_items: {
    icon: Plus,
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    format: (p) => `${str(p.count, "0")} fehlende Items ins Inventar vergeben`,
  },
  admin_streak_config_update: {
    icon: Settings,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p, c) =>
      `Daily-Streak-Einstellungen angepasst — Basis ${str(p.baseReward)} ${c}, +${str(p.dailyIncrement)}/Tag, max. ${str(p.maxReward)} ${c}${p.enabled === false ? " (deaktiviert)" : ""}`,
  },
  admin_item_create: {
    icon: Plus,
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    format: (p) => `Item erstellt: "${str(p.name)}" (${str(p.rarity)})`,
  },
  admin_item_update: {
    icon: Package,
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    format: (p) => `Item aktualisiert: "${str(p.name)}"`,
  },
  admin_item_delete: {
    icon: Trash2,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    format: () => `Item aus dem Katalog gelöscht`,
  },
  admin_grant_item: {
    icon: Plus,
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    format: () => `Item ins Inventar vergeben`,
  },
  admin_remove_item: {
    icon: Minus,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    format: () => `Item aus dem Inventar entfernt`,
  },
  admin_ban_user: {
    icon: Ban,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    format: (p) => (p.banned ? "User gebannt" : "User entbannt"),
  },
  admin_support_ban: {
    icon: Ban,
    color: "text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    format: (p) => (p.banned ? "Support-Button gesperrt" : "Support-Button entsperrt"),
  },
  admin_kick_user: {
    icon: LogOut,
    color: "text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    format: () => "User zwangsweise ausgeloggt",
  },
  admin_wipe_inventory: {
    icon: Trash2,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    format: (p) => `Inventar geleert (${str(p.count, "0")} Items entfernt)`,
  },
  admin_full_reset: {
    icon: RotateCcw,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    format: (p) =>
      `Account vollständig zurückgesetzt — Credits, Stats & Inventar (${str(p.deletedInventoryCount, "0")} Items) gelöscht`,
  },
  admin_monster_type_update: {
    icon: Settings,
    color: "text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    format: (p) => `Monster "${str(p.name ?? p.id)}" konfiguriert`,
  },
  admin_pet_config_update: {
    icon: Settings,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    format: (p) => `Pet-Spezies "${str(p.species ?? p.id)}" konfiguriert`,
  },
  admin_delete_user_completely: {
    icon: UserX,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    format: () => `Account dauerhaft gelöscht`,
  },
  admin_bulk_reprice: {
    icon: Tag,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) => `${str(p.updated, "0")} Item-Preise aktualisiert`,
  },
  mine_collect: {
    icon: Pickaxe,
    color: "text-yellow-300",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    groupNoun: "Mine abgebaut",
    sumKey: "earned",
    sumLabel: "abgebaut",
    format: (p, c) =>
      `Mining-Ertrag eingesammelt: +${cr(p.earned, c)} (Level ${str(p.level)}, ${str(p.elapsed_hours)} Std.)`,
  },
  mine_upgrade: {
    icon: Pickaxe,
    color: "text-yellow-300",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    groupNoun: "Mine upgegraded",
    sumKey: "cost",
    sumLabel: "ausgegeben",
    format: (p, c) =>
      `Mine auf Level ${str(p.new_level)} upgegraded (war ${str(p.old_level)}, Kosten: ${cr(p.cost, c)})`,
  },
  snake_earn: {
    icon: Gamepad2,
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    groupNoun: "Snake gespielt",
    sumKey: "credits_earned",
    sumLabel: "verdient",
    format: (p, c) =>
      `Snake: Score ${str(p.score)} · +${cr(p.credits_earned, c)} (${str(p.speed_mode)})${p.is_new_record ? " 🏆 Neuer Rekord!" : ""}`,
  },
  parkour_finish: {
    icon: Gamepad2,
    color: "text-fuchsia-300",
    bg: "bg-fuchsia-500/10",
    border: "border-fuchsia-500/30",
    groupNoun: "Parkour geschafft",
    sumKey: "credits_awarded",
    sumLabel: "verdient",
    format: (p, c) =>
      `Parkour: ${str(p.map_name)} in ${((Number(p.time_ms) || 0) / 1000).toFixed(2)}s${p.is_new_record ? " 🏆 Bestzeit!" : ""}${Number(p.credits_awarded) > 0 ? ` · +${cr(p.credits_awarded, c)}` : ""}`,
  },
  admin_parkour_reset: {
    icon: Gamepad2,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    format: (p) => `Parkour-Bestenliste zurückgesetzt: ${str(p.map_id)} (${str(p.removed)} Einträge)`,
  },
  ticket_reward_granted: {
    icon: Trophy,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    format: (p, c) =>
      `Ticket-Belohnung vergeben${p.credits ? `: +${cr(p.credits, c)}` : ""}${p.note ? ` — "${str(p.note)}"` : ""}`,
  },
  case_batch_open: {
    icon: Package,
    color: "text-blue-300",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    groupNoun: "Case-Batches geöffnet",
    sumKey: "totalCost",
    sumLabel: "ausgegeben",
    format: (p, c) =>
      `${str(p.count)}× Cases geöffnet für ${cr(p.totalCost, c)} — ${str(p.wonItemIds && Array.isArray(p.wonItemIds) ? p.wonItemIds.length : p.count)} Items gewonnen`,
  },
  battle_pass_purchase: {
    icon: Crown,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    format: (p, c) =>
      `Battle Pass Premium gekauft für ${cr(p.cost, c)} — Pass ${str(p.passId).slice(0, 8)}…`,
  },
  battle_pass_elite_purchase: {
    icon: Sparkles,
    color: "text-violet-300",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    format: (p, c) =>
      `Battle Pass Elite gekauft für ${cr(p.cost, c)} — Pass ${str(p.passId).slice(0, 8)}…`,
  },
  battle_pass_tier_claim: {
    icon: Gift,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) =>
      `Battle Pass Tier ${str(p.tierNum)} abgeholt — ${str(p.rewardMsg ?? p.rewardType)}`,
  },
  don_upgrade_purchase: {
    icon: TrendingUp,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    format: (p, c) =>
      `DON-Upgrade Stufe ${str(p.targetTier)} gekauft für ${cr(p.cost, c)}`,
  },
  admin_snake_score_edit: {
    icon: Gamepad2,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) =>
      `Snake-Score bearbeitet: ${str(p.speed_mode)} → ${str(p.best_score)} Punkte (${str(p.games_played)} Spiele)`,
  },
  admin_snake_score_delete: {
    icon: Trash2,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    format: (p) =>
      `Snake-Score gelöscht: ${str(p.speed_mode)}`,
  },
  admin_snake_lb_restore: {
    icon: RotateCcw,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) =>
      `Snake-Rangliste wiederhergestellt (${str(p.restored)} Einträge, Modus: ${str(p.speed_mode)})`,
  },
  admin_mine_progress_edit: {
    icon: Pickaxe,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) =>
      `Mining-Fortschritt bearbeitet: Level ${str(p.level)}, ${cr(p.total_mined, "CR")} abgebaut`,
  },
  admin_mine_progress_delete: {
    icon: Trash2,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    format: () => `Mining-Fortschritt gelöscht`,
  },
  admin_mine_lb_snapshot: {
    icon: Camera,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) =>
      `Mine-Rangliste-Snapshot erstellt: "${str(p.snapshot_name)}"`,
  },
  admin_mine_lb_restore: {
    icon: RotateCcw,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) =>
      `Mine-Rangliste wiederhergestellt (${str(p.restored)} Einträge)`,
  },
  plinko_drop: {
    icon: Star,
    color: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/10",
    groupNoun: "Plinko gespielt",
    sumKey: "payout",
    sumLabel: "Auszahlung",
    format: (p, c) =>
      `Plinko: Einsatz ${cr(p.betAmount, c)} · ${str(p.resultMultiplier)}x · ${p.won ? `+${cr(p.payout, c)}` : `-${cr(p.betAmount, c)}`} (${str(p.riskLevel)})`,
  },
  plinko_play: {
    icon: Star,
    color: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    groupNoun: "Plinko gespielt",
    sumKey: "payout",
    sumLabel: "Auszahlung",
    format: (p, c) =>
      `Plinko: Einsatz ${cr(p.ballCost, c)} · ${str(p.multiplier)}x · Auszahlung ${cr(p.payout, c)} (${str(p.riskLevel)})`,
  },
  friend_request_sent: {
    icon: UserPlus,
    color: "text-sky-300",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    groupNoun: "Freundschaftsanfragen gesendet",
    format: (p) => `Freundschaftsanfrage an ${str(p.targetName, str(p.targetUserId).slice(0, 8) + "…")} gesendet`,
  },
  friend_request_accepted: {
    icon: UserCheck,
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    groupNoun: "Freundschaften bestätigt",
    format: (p) => `Freundschaftsanfrage von ${str(p.fromName, str(p.fromUserId).slice(0, 8) + "…")} angenommen`,
  },
  user_blocked: {
    icon: UserX,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    groupNoun: "Nutzer blockiert",
    format: (p) => `${str(p.targetName, str(p.targetUserId).slice(0, 8) + "…")} blockiert`,
  },
  voucher_received: {
    icon: Gift,
    color: "text-pink-300",
    bg: "bg-pink-500/10",
    border: "border-pink-500/30",
    groupNoun: "Geschenke erhalten",
    format: (p) =>
      `Gutschein erhalten: ${str(p.summary)}${p.by ? ` (von ${str(p.by)})` : ""}${p.note ? ` — „${str(p.note)}"` : ""}`,
  },
};

const FALLBACK_ICON: ActionMeta = {
  icon: Settings,
  color: "text-zinc-300",
  bg: "bg-white/5",
  border: "border-white/10",
  format: () => "",
};

function formatFallback(action: string, p: Record<string, unknown>): string {
  const humanAction = action.replace(/_/g, " ");
  const keys = Object.keys(p);
  if (keys.length === 0) return `Aktion: ${humanAction}`;
  const pairs = keys
    .slice(0, 5)
    .map((k) => `${k}: ${typeof p[k] === "string" || typeof p[k] === "number" ? p[k] : JSON.stringify(p[k])}`)
    .join(" · ");
  return `${humanAction} — ${pairs}`;
}

function displayFor(action: string): ActionMeta {
  return ACTION_META[action] ?? FALLBACK_ICON;
}

function entryText(entry: AuditEntry, currencyName: string): string {
  const meta = ACTION_META[entry.action];
  return meta ? meta.format(entry.payload ?? {}, currencyName) : formatFallback(entry.action, entry.payload ?? {});
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE");
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

// ── Grouping ────────────────────────────────────────────────────────────────
// Bundle ONLY directly-consecutive entries that share the same owner (user_id —
// falls back to actor for the global log) AND the same action. The list is
// already chronologically sorted (newest first), so this never merges across
// gaps in time.

interface AuditGroup {
  key: string;
  action: string;
  entries: AuditEntry[];
}

function buildGroups(entries: AuditEntry[]): AuditGroup[] {
  const groups: AuditGroup[] = [];
  for (const entry of entries) {
    const owner = entry.user_id ?? entry.actor ?? "";
    const key = `${owner}::${entry.action}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, action: entry.action, entries: [entry] });
  }
  return groups;
}

// ── Single row (unchanged style) ──────────────────────────────────────────────

function SingleRow({ entry, currencyName }: { entry: AuditEntry; currencyName: string }) {
  const display = displayFor(entry.action);
  const Icon = display.icon;
  const text = entryText(entry, currencyName);

  return (
    <div className="relative flex gap-3">
      <div
        className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${display.border} ${display.bg}`}
      >
        <Icon className={`h-4 w-4 ${display.color}`} />
      </div>
      <div className={`min-w-0 flex-1 rounded-xl border bg-white/[0.02] px-3 py-2 ${display.border}`}>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${display.color} opacity-60`}>
            {entry.action.replace(/_/g, " ")}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {entry.actor && <span className="text-[10px] font-semibold text-zinc-400">{entry.actor}</span>}
            <span className="text-[10px] text-zinc-500">{fmtDateTime(entry.created_at)}</span>
          </div>
        </div>
        <p className={`mt-0.5 text-sm leading-relaxed ${display.color}`}>{text}</p>
      </div>
    </div>
  );
}

// ── Grouped row (collapsible) ─────────────────────────────────────────────────

function GroupedRow({ group, currencyName }: { group: AuditGroup; currencyName: string }) {
  const [open, setOpen] = useState(false);
  const display = displayFor(group.action);
  const meta = ACTION_META[group.action];
  const Icon = display.icon;
  const count = group.entries.length;

  // entries[0] = newest, entries[last] = oldest (list is newest-first).
  const newest = group.entries[0].created_at;
  const oldest = group.entries[count - 1].created_at;

  const noun = meta?.groupNoun ?? group.action.replace(/_/g, " ");

  // Total of the configured numeric payload key across the group.
  let total = 0;
  if (meta?.sumKey) {
    for (const e of group.entries) {
      const v = e.payload?.[meta.sumKey];
      if (typeof v === "number") total += v;
    }
  }

  return (
    <div className="relative flex gap-3">
      <div
        className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${display.border} ${display.bg}`}
      >
        <Icon className={`h-4 w-4 ${display.color}`} />
      </div>
      <div className={`min-w-0 flex-1 rounded-xl border bg-white/[0.02] ${display.border}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-start gap-2 px-3 py-2 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <span className={`text-[10px] font-bold uppercase tracking-widest ${display.color} opacity-60`}>
                {group.action.replace(/_/g, " ")}
              </span>
              <div className="flex items-center gap-2 ml-auto">
                {group.entries[0].actor && (
                  <span className="text-[10px] font-semibold text-zinc-400">{group.entries[0].actor}</span>
                )}
                <span className="text-[10px] text-zinc-500">
                  {fmtTime(oldest)} – {fmtTime(newest)} Uhr
                </span>
              </div>
            </div>
            <p className={`mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm leading-relaxed ${display.color}`}>
              <span className="font-semibold">
                {count}× {noun}
              </span>
              {meta?.sumKey && total > 0 && (
                <span className="text-xs text-zinc-400">
                  {meta.sumLabel ? `${meta.sumLabel}: ` : ""}
                  {cr(total, currencyName)} gesamt
                </span>
              )}
            </p>
          </div>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="mt-0.5 shrink-0 text-zinc-400"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <ul className="space-y-1 border-t border-white/5 px-3 py-2">
                {group.entries.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-2 text-xs">
                    <span className={`min-w-0 flex-1 leading-relaxed ${display.color} opacity-90`}>
                      {entryText(e, currencyName)}
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-500">{fmtTime(e.created_at)} Uhr</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  const { currencyName } = useSiteConfig();

  if (entries.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-zinc-500">Noch keine Einträge.</p>;
  }

  const groups = buildGroups(entries);

  return (
    <div className="relative space-y-3 pl-2">
      <div className="absolute top-1 bottom-1 left-[19px] w-px bg-white/10" />
      {groups.map((group) =>
        group.entries.length === 1 ? (
          <SingleRow key={group.entries[0].id} entry={group.entries[0]} currencyName={currencyName} />
        ) : (
          <GroupedRow key={group.entries[0].id} group={group} currencyName={currencyName} />
        ),
      )}
    </div>
  );
}
