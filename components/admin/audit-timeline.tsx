"use client";

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
  Tag,
  type LucideIcon,
} from "lucide-react";

export interface AuditEntry {
  id: string;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  /** Username of the actor who performed the action (global log only). */
  actor?: string | null;
}

interface ActionMeta {
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  format: (payload: Record<string, unknown>, currencyName: string) => string;
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
    format: (p, c) =>
      `Case "${str(p.tierId)}" geöffnet für ${str(p.price)} ${c} — gewann "${str(p.wonItemName)}" (${str(p.rarity)})`,
  },
  double_or_nothing: {
    icon: Coins,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
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
    format: (p) =>
      `PvP-Angriff: ${str(p.damage)} Schaden auf Spieler ${str(p.targetUserId).slice(0, 8)}…`,
  },
  auction_sold: {
    icon: Gavel,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    format: (p, c) =>
      `Auktion verkauft an Käufer ${str(p.buyerId).slice(0, 8)}… für ${cr(p.price, c)}`,
  },
  auction_buyout: {
    icon: Gavel,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    format: (p, c) =>
      `Auktion per Sofortkauf abgeschlossen: ${cr(p.price, c)} von Käufer ${str(p.buyerId).slice(0, 8)}…`,
  },
  trade_accepted: {
    icon: Repeat,
    color: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    format: (p) =>
      `Trade ${str(p.tradeId).slice(0, 8)}… angenommen`,
  },
  shop_purchase: {
    icon: ShoppingBag,
    color: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
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
    format: (p, c) =>
      `Mining-Ertrag eingesammelt: +${cr(p.earned, c)} (Level ${str(p.level)}, ${str(p.elapsed_hours)} Std.)`,
  },
  mine_upgrade: {
    icon: Pickaxe,
    color: "text-yellow-300",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    format: (p, c) =>
      `Mine auf Level ${str(p.new_level)} upgegraded (war ${str(p.old_level)}, Kosten: ${cr(p.cost, c)})`,
  },
  snake_earn: {
    icon: Gamepad2,
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    format: (p, c) =>
      `Snake: Score ${str(p.score)} · +${cr(p.credits_earned, c)} (${str(p.speed_mode)})${p.is_new_record ? " 🏆 Neuer Rekord!" : ""}`,
  },
  ticket_reward_granted: {
    icon: Trophy,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    format: (p, c) =>
      `Ticket-Belohnung vergeben${p.credits ? `: +${cr(p.credits, c)}` : ""}${p.note ? ` — "${str(p.note)}"` : ""}`,
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
  const keys = Object.keys(p);
  if (keys.length === 0) return action;
  const pairs = keys
    .slice(0, 5)
    .map((k) => `${k}: ${typeof p[k] === "string" || typeof p[k] === "number" ? p[k] : JSON.stringify(p[k])}`)
    .join(" · ");
  return `${action} — ${pairs}`;
}

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  const { currencyName } = useSiteConfig();

  if (entries.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-zinc-500">Noch keine Einträge.</p>;
  }

  return (
    <div className="relative space-y-3 pl-2">
      <div className="absolute top-1 bottom-1 left-[19px] w-px bg-white/10" />
      {entries.map((entry) => {
        const meta = ACTION_META[entry.action];
        const display = meta ?? FALLBACK_ICON;
        const Icon = display.icon;
        const text = meta
          ? meta.format(entry.payload ?? {}, currencyName)
          : formatFallback(entry.action, entry.payload ?? {});

        return (
          <div key={entry.id} className="relative flex gap-3">
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
                  {entry.actor && (
                    <span className="text-[10px] font-semibold text-zinc-400">{entry.actor}</span>
                  )}
                  <span className="text-[10px] text-zinc-500">
                    {new Date(entry.created_at).toLocaleString("de-DE")}
                  </span>
                </div>
              </div>
              <p className={`mt-0.5 text-sm leading-relaxed ${display.color}`}>{text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
