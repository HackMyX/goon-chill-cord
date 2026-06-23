"use client";

import { useState } from "react";
import { Bell, Sparkles, Repeat, Gavel, ShieldCheck, Save, Loader2, Check, Lock } from "lucide-react";
import { updateNotificationPrefs, type NotificationPrefs } from "@/lib/actions/account";
import { useSoundManager } from "@/lib/sound-manager";
import { isModerator } from "@/lib/admin";

type NotifEntry = { type: string; label: string; desc: string };
type NotifGroup = {
  key: string;
  label: string;
  color: "amber" | "cyan" | "emerald";
  icon: React.ReactNode;
  types: NotifEntry[];
};

const USER_GROUPS: NotifGroup[] = [
  {
    key: "rewards",
    label: "Belohnungen & Aktivitäten",
    color: "amber",
    icon: <Sparkles className="h-3.5 w-3.5" />,
    types: [
      { type: "streak_claim",    label: "Tägliche Streak-Belohnung",   desc: "Daily-Reward und Meilenstein-Boni" },
      { type: "streak_commit",   label: "Kill-Streak Auszahlung",       desc: "Wenn du Streak-Credits einlöst" },
      { type: "case_opened",     label: "Case-Öffnung",                 desc: "Ergebnis nach dem Öffnen einer Case" },
      { type: "double_or_nothing", label: "Double or Nothing",          desc: "Ergebnis des Glücksspiels" },
      { type: "shop_purchase",   label: "Shop-Kauf",                    desc: "Bestätigung nach einem Kauf im Shop" },
    ],
  },
  {
    key: "trading",
    label: "Trading",
    color: "cyan",
    icon: <Repeat className="h-3.5 w-3.5" />,
    types: [
      { type: "trade_offer",     label: "Eingehende Trade-Anfrage",     desc: "Wenn jemand dir ein Angebot sendet" },
      { type: "trade_accepted",  label: "Trade angenommen",             desc: "Wenn der Empfänger deinen Trade annimmt" },
      { type: "trade_declined",  label: "Trade abgelehnt",              desc: "Wenn dein Angebot abgelehnt wird" },
      { type: "trade_cancelled", label: "Trade zurückgezogen",          desc: "Wenn der Sender sein Angebot zurückzieht" },
    ],
  },
  {
    key: "auctions",
    label: "Auktionen",
    color: "emerald",
    icon: <Gavel className="h-3.5 w-3.5" />,
    types: [
      { type: "auction_bid",     label: "Neues Gebot auf deine Auktion", desc: "Wenn jemand auf deine Auktion bietet" },
      { type: "auction_outbid",  label: "Überboten",                     desc: "Wenn du bei einer Auktion überboten wirst" },
      { type: "auction_won",     label: "Auktion gewonnen",              desc: "Wenn du eine Auktion gewinnst" },
      { type: "auction_sold",    label: "Auktion verkauft",              desc: "Wenn dein Angebot verkauft wurde" },
    ],
  },
];

const STAFF_ENTRIES: NotifEntry[] = [
  { type: "new_user",     label: "Neuer Spieler registriert",   desc: "Wenn sich ein neuer Spieler registriert" },
  { type: "ticket_new",   label: "Neues Support-Ticket",        desc: "Wenn ein Spieler ein Ticket oder Verbesserungsvorschlag einreicht" },
  { type: "ticket_reply", label: "User-Antwort auf Ticket",     desc: "Wenn ein Spieler auf ein bestehendes Ticket antwortet" },
];

const LOCKED_ENTRIES: { label: string; desc: string }[] = [
  { label: "Ticket-Antworten",     desc: "Support-Team hat auf dein Ticket geantwortet" },
  { label: "Ticket-Statusänderung", desc: "Dein Ticket wurde bearbeitet oder geschlossen" },
  { label: "Admin-Aktionen",        desc: "Credits, Items, Rollen oder Konto-Änderungen durch Admins" },
];

const COLORS = {
  amber:   { dot: "bg-amber-400",   border: "border-amber-400/25",   bg: "bg-amber-400/[0.04]",   text: "text-amber-300"   },
  cyan:    { dot: "bg-cyan-400",    border: "border-cyan-400/25",    bg: "bg-cyan-400/[0.04]",    text: "text-cyan-300"    },
  emerald: { dot: "bg-emerald-400", border: "border-emerald-400/25", bg: "bg-emerald-400/[0.04]", text: "text-emerald-300" },
} as const;

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900"
    >
      <span
        className={`relative block h-6 w-11 overflow-hidden rounded-full transition-colors duration-200 ${
          checked ? "bg-purple-600" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute left-0 top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-[22px]" : "translate-x-[2px]"
          }`}
        />
      </span>
    </button>
  );
}

export function NotificationPrefsSection({
  initialPrefs,
  role,
}: {
  initialPrefs: NotificationPrefs;
  role: string;
}) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initialPrefs);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sound = useSoundManager();
  const isStaff = isModerator({ role });

  function isEnabled(type: string) {
    return prefs[type] !== false;
  }

  function toggle(type: string) {
    sound.click();
    setPrefs((p) => ({ ...p, [type]: !isEnabled(type) }));
  }

  function setGroupAll(types: NotifEntry[], enabled: boolean) {
    sound.click();
    setPrefs((p) => {
      const next = { ...p };
      types.forEach((t) => { next[t.type] = enabled; });
      return next;
    });
  }

  const allUserTypes = USER_GROUPS.flatMap((g) => g.types.map((t) => t.type));
  const allStaffTypes = isStaff ? STAFF_ENTRIES.map((t) => t.type) : [];
  const allTypes = [...allUserTypes, ...allStaffTypes];

  const dirty = allTypes.some((t) => {
    const was = initialPrefs[t] !== false;
    const is = prefs[t] !== false;
    return was !== is;
  });

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    sound.click();
    const res = await updateNotificationPrefs(prefs);
    setSaving(false);
    if (res.success) {
      sound.win();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } else {
      sound.error();
      setSaveError(res.error ?? "Speichern fehlgeschlagen.");
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-zinc-400" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500">Benachrichtigungen</h2>
      </div>

      <div className="flex flex-col gap-2.5">
        {/* Toggleable groups */}
        {USER_GROUPS.map((group) => {
          const c = COLORS[group.color];
          const enabledCount = group.types.filter((t) => isEnabled(t.type)).length;
          const allOn = enabledCount === group.types.length;
          const allOff = enabledCount === 0;

          return (
            <div key={group.key} className={`overflow-hidden rounded-xl border ${c.border} ${c.bg}`}>
              {/* Group header */}
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${c.dot}`} />
                  <span className={`flex items-center gap-1.5 text-xs font-bold ${c.text}`}>
                    {group.icon}
                    {group.label}
                  </span>
                  <span className="text-[10px] tabular-nums text-zinc-600">
                    {enabledCount}/{group.types.length}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setGroupAll(group.types, true)}
                    disabled={allOn}
                    className="rounded px-2 py-0.5 text-[10px] font-semibold text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-25"
                  >
                    Alle
                  </button>
                  <span className="text-[10px] text-zinc-700">/</span>
                  <button
                    type="button"
                    onClick={() => setGroupAll(group.types, false)}
                    disabled={allOff}
                    className="rounded px-2 py-0.5 text-[10px] font-semibold text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-25"
                  >
                    Keine
                  </button>
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-white/[0.04] border-t border-white/[0.05]">
                {group.types.map((t) => (
                  <div
                    key={t.type}
                    className="flex items-center justify-between gap-4 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{t.label}</p>
                      <p className="text-[11px] leading-snug text-zinc-600">{t.desc}</p>
                    </div>
                    <Toggle checked={isEnabled(t.type)} onChange={() => toggle(t.type)} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Locked / always-on */}
        <div className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.01]">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <Lock className="h-3 w-3 text-zinc-600" />
            <span className="text-xs font-bold text-zinc-500">Immer aktiv</span>
            <span className="text-[10px] text-zinc-700">— können nicht deaktiviert werden</span>
          </div>
          <div className="divide-y divide-white/[0.04] border-t border-white/[0.05]">
            {LOCKED_ENTRIES.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-4 px-4 py-2.5 opacity-40"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-200">{item.label}</p>
                  <p className="text-[11px] leading-snug text-zinc-600">{item.desc}</p>
                </div>
                {/* Locked toggle — always-on, non-interactive */}
                <div className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full bg-purple-700">
                  <span className="absolute left-0 top-[2px] h-5 w-5 translate-x-[22px] rounded-full bg-white shadow-sm" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Staff-only section */}
        {isStaff && (
          <div className="overflow-hidden rounded-xl border border-red-500/25 bg-red-500/[0.03]">
            <div className="flex items-center gap-2 px-4 py-2.5">
              <ShieldCheck className="h-3.5 w-3.5 text-red-400" />
              <span className="text-xs font-bold text-red-300">Staff-Benachrichtigungen</span>
              <span className="inline-flex items-center rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                {role === "admin" ? "Admin" : "Mod"}
              </span>
            </div>
            <div className="divide-y divide-white/[0.04] border-t border-red-500/10">
              {STAFF_ENTRIES.map((t) => (
                <div
                  key={t.type}
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{t.label}</p>
                    <p className="text-[11px] leading-snug text-zinc-600">{t.desc}</p>
                  </div>
                  <Toggle checked={isEnabled(t.type)} onChange={() => toggle(t.type)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Save footer */}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Speichern
        </button>
        {savedFlash && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
            <Check className="h-4 w-4" />
            Gespeichert
          </span>
        )}
        {saveError && <span className="text-sm text-red-400">{saveError}</span>}
      </div>
    </div>
  );
}
