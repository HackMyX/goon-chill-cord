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
};

const FALLBACK_META: ActionMeta = {
  icon: Settings,
  color: "text-zinc-300",
  bg: "bg-white/5",
  border: "border-white/10",
  format: (p) => JSON.stringify(p),
};

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-zinc-500">Noch keine Einträge.</p>;
  }

  return (
    <div className="relative space-y-3 pl-2">
      <div className="absolute top-1 bottom-1 left-[19px] w-px bg-white/10" />
      {entries.map((entry) => {
        const meta = ACTION_META[entry.action] ?? FALLBACK_META;
        const Icon = meta.icon;
        const text = meta.format(entry.payload ?? {});

        return (
          <div key={entry.id} className="relative flex gap-3">
            <div
              className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${meta.border} ${meta.bg}`}
            >
              <Icon className={`h-4 w-4 ${meta.color}`} />
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
              <p className={`mt-0.5 text-sm ${meta.color}`}>{text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
