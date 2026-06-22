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
  format: (payload: Record<string, unknown>) => string;
}

function str(v: unknown, fallback = "—"): string {
  return typeof v === "string" || typeof v === "number" ? String(v) : fallback;
}

function cr(v: unknown): string {
  return typeof v === "number" ? v.toLocaleString("de-DE") + " CR" : str(v);
}

const ACTION_META: Record<string, ActionMeta> = {
  case_open: {
    icon: Package,
    color: "text-blue-300",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    format: (p) =>
      `Case "${str(p.tierId)}" geöffnet für ${str(p.price)} CR — gewann "${str(p.wonItemName)}" (${str(p.rarity)})`,
  },
  double_or_nothing: {
    icon: Coins,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    format: (p) =>
      p.won
        ? `Double or Nothing gewonnen: +${str(p.stake)} CR`
        : `Double or Nothing verloren: -${str(p.stake)} CR`,
  },
  streak_kill: {
    icon: Flame,
    color: "text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    format: (p) =>
      `Kill-Streak: Monster "${str(p.monsterTypeId)}" besiegt — +${cr(p.reward)}, Streak: ${str(p.newStreakKillCount)} Kills (${cr(p.newPendingStreakCr)} ausstehend)`,
  },
  streak_commit: {
    icon: Coins,
    color: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    format: (p) =>
      `Kill-Streak abgerechnet: ${cr(p.committed)} gutgeschrieben (Guthaben: ${cr(p.newCredits)})`,
  },
  streak_forfeit: {
    icon: X,
    color: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    format: (p) =>
      `Kill-Streak abgebrochen: ${cr(p.forfeitedCr)} und ${str(p.forfeitedKillCount)} Kills verloren`,
  },
  streak_claim: {
    icon: Gift,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) =>
      `Daily-Streak abgeholt: +${cr(p.reward)}${p.milestoneBonus ? ` (+${cr(p.milestoneBonus)} Meilenstein-Bonus)` : ""} — Streak: ${str(p.newStreak)} Tage`,
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
    format: (p) =>
      `Auktion verkauft an Käufer ${str(p.buyerId).slice(0, 8)}… für ${cr(p.price)}`,
  },
  auction_buyout: {
    icon: Gavel,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    format: (p) =>
      `Auktion per Sofortkauf abgeschlossen: ${cr(p.price)} von Käufer ${str(p.buyerId).slice(0, 8)}…`,
  },
  trade_accepted: {
    icon: Repeat,
    color: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    format: (p) =>
      `Trade ${str(p.tradeId).slice(0, 8)}… angenommen`,
  },
  admin_economy_update: {
    icon: Settings,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) =>
      `Case-Tier "${str(p.tierId)}" angepasst — Preis ${str(p.price)} CR, ${
        p.enabled ? "aktiv" : "deaktiviert"
      }`,
  },
  admin_set_credits: {
    icon: Coins,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) => `Credits auf ${str(p.credits)} CR gesetzt`,
  },
  admin_set_role: {
    icon: ShieldCheck,
    color: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    format: (p) => `Rolle geändert zu "${str(p.role)}"`,
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
          ? meta.format(entry.payload ?? {})
          : formatFallback(entry.action, entry.payload ?? {});

        return (
          <div key={entry.id} className="relative flex gap-3">
            <div
              className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${display.border} ${display.bg}`}
            >
              <Icon className={`h-4 w-4 ${display.color}`} />
            </div>
            <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                {entry.actor && (
                  <span className="text-xs font-semibold text-zinc-400">{entry.actor}</span>
                )}
                <span className="ml-auto text-[11px] text-zinc-500">
                  {new Date(entry.created_at).toLocaleString("de-DE")}
                </span>
              </div>
              <p className={`mt-0.5 text-sm leading-relaxed ${display.color}`}>{text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
