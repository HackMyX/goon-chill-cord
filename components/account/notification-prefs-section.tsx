"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Sparkles, Repeat, Gavel, ShieldCheck, Loader2, Check, Lock, Users, Gauge, Wind } from "lucide-react";
import { updateNotificationPrefs, type NotificationPrefs } from "@/lib/actions/account";
import { useSoundManager } from "@/lib/sound-manager";
import { isModerator } from "@/lib/admin";
import {
  FB_INTENSITY_PREF_KEY, FB_REDUCE_MOTION_PREF_KEY, type UserFeedbackIntensity,
} from "@/lib/feedback-config";

const INTENSITY_OPTIONS: { value: UserFeedbackIntensity; label: string; desc: string }[] = [
  { value: "full",    label: "Voll 🎉",  desc: "Alle Feiern in voller Pracht — Vollbild, Konfetti, alle Effekte." },
  { value: "reduced", label: "Dezent",   desc: "Ruhiger: keine Vollbild-Feiern, weniger Effekte, kein Bildschirm-Blitz." },
  { value: "minimal", label: "Minimal",  desc: "Nur kleine Hinweis-Pillen — keine Partikel, kein Blitz, keine großen Popups." },
];

type NotifEntry = { type: string; label: string; desc: string };
type NotifGroup = {
  key: string;
  label: string;
  color: "amber" | "cyan" | "emerald" | "violet" | "fuchsia";
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
      { type: "streak_claim",      label: "Tägliche Streak-Belohnung",   desc: "Daily-Reward und Meilenstein-Boni" },
      { type: "streak_commit",     label: "Kill-Streak Auszahlung",       desc: "Wenn du Streak-Credits einlöst" },
      { type: "case_opened",       label: "Case-Öffnung",                 desc: "Ergebnis nach dem Öffnen einer Case" },
      { type: "double_or_nothing", label: "Double or Nothing",            desc: "Ergebnis des Glücksspiels" },
      { type: "shop_purchase",     label: "Shop-Kauf",                    desc: "Bestätigung nach einem Kauf im Shop" },
      { type: "snake_record",      label: "Neuer Snake-Rekord",           desc: "Wenn du einen neuen Highscore im Snake-Spiel aufstellst" },
      { type: "mine_collect",      label: "Mine: Credits abgebaut",       desc: "Wenn du erfolgreich Credits aus deiner Mine abbaust" },
      { type: "mine_upgrade",      label: "Mine: Aufgewertet",            desc: "Wenn deine Mine auf das nächste Level aufgewertet wird" },
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
  {
    key: "social",
    label: "Soziales & Freunde",
    color: "violet",
    icon: <Users className="h-3.5 w-3.5" />,
    types: [
      { type: "friend_request",  label: "Neue Freundschaftsanfrage", desc: "Wenn dir jemand eine Freundschaftsanfrage sendet" },
      { type: "friend_accepted", label: "Freundschaft bestätigt",    desc: "Wenn jemand deine Anfrage annimmt" },
    ],
  },
  {
    key: "feedback",
    label: "Belohnungs-Feedback (Popups)",
    color: "fuchsia",
    icon: <Sparkles className="h-3.5 w-3.5" />,
    types: [
      { type: "fb_xp_gain",         label: "XP-Anzeige",                 desc: "Kleiner Toast, wenn du XP erhältst" },
      { type: "fb_level_up",        label: "Level-Up-Feier",             desc: "Popup, wenn du ein Level aufsteigst" },
      { type: "fb_level_milestone", label: "Meilenstein-Feier",          desc: "Große Konfetti-Feier bei besonderen Levels" },
      { type: "fb_daily_quest",     label: "Tagesquest abgeschlossen",   desc: "Popup, wenn du eine Tagesquest fertigstellst" },
      { type: "fb_bp_quest",        label: "Battle-Pass-Quest",          desc: "Popup, wenn du eine Battle-Pass-Aufgabe abschließt" },
      { type: "fb_bp_tier",         label: "Battle-Pass-Belohnung",      desc: "Feier, wenn du eine Battle-Pass-Stufe einlöst" },
      { type: "fb_reward",          label: "Sonstige Belohnungen",       desc: "Allgemeines Feedback bei weiteren Gewinnen" },
      { type: "fb_limit_meter",     label: "Spiel-Limit-Anzeige",        desc: "Die animierte „Restanzahl\"-Anzeige in Plinko, Snake & DON. Aus = nur schlichter Text." },
      { type: "notif_toast",        label: "Benachrichtigungs-Toasts",   desc: "Animierter Live-Toast oben rechts bei neuen Benachrichtigungen (Trade, Shop, Freunde …)." },
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
  violet:  { dot: "bg-violet-400",  border: "border-violet-400/25",  bg: "bg-violet-400/[0.04]",  text: "text-violet-300"  },
  fuchsia: { dot: "bg-fuchsia-400", border: "border-fuchsia-400/25", bg: "bg-fuchsia-400/[0.04]", text: "text-fuchsia-300" },
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

  // Auto-save: skip the very first render (that's just `initialPrefs`
  // echoing back), then debounce so rapid toggle clicks collapse into one
  // save instead of firing a request per click.
  const skipFirstRef = useRef(true);
  const savedFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (skipFirstRef.current) {
      skipFirstRef.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      setSaving(true);
      setSaveError(null);
      const res = await updateNotificationPrefs(prefs);
      setSaving(false);
      if (res.success) {
        sound.save();
        setSavedFlash(true);
        if (savedFlashTimeoutRef.current) clearTimeout(savedFlashTimeoutRef.current);
        savedFlashTimeoutRef.current = setTimeout(() => setSavedFlash(false), 2200);
      } else {
        sound.error();
        setSaveError(res.error ?? "Speichern fehlgeschlagen.");
      }
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

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

  const intensity: UserFeedbackIntensity =
    prefs[FB_INTENSITY_PREF_KEY] === "reduced" || prefs[FB_INTENSITY_PREF_KEY] === "minimal"
      ? (prefs[FB_INTENSITY_PREF_KEY] as UserFeedbackIntensity)
      : "full";
  const reduceMotion = prefs[FB_REDUCE_MOTION_PREF_KEY] === true;

  function setIntensity(v: UserFeedbackIntensity) {
    sound.click();
    setPrefs((p) => ({ ...p, [FB_INTENSITY_PREF_KEY]: v }));
  }
  function toggleReduceMotion() {
    sound.click();
    setPrefs((p) => ({ ...p, [FB_REDUCE_MOTION_PREF_KEY]: !reduceMotion }));
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-zinc-400" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500">Benachrichtigungen</h2>
      </div>

      <div className="flex flex-col gap-2.5">
        {/* Feedback-Stärke (persönlich) */}
        <div className="overflow-hidden rounded-xl border border-fuchsia-400/25 bg-fuchsia-400/[0.04]">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <Gauge className="h-3.5 w-3.5 text-fuchsia-300" />
            <span className="text-xs font-bold text-fuchsia-300">Feedback-Stärke</span>
            <span className="text-[10px] text-zinc-600">— gilt für alle Feiern &amp; Belohnungs-Popups</span>
          </div>
          <div className="space-y-3 border-t border-white/[0.05] px-4 py-3">
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-200">Wie krass sollen Feiern sein?</p>
              <div className="grid grid-cols-3 gap-1.5">
                {INTENSITY_OPTIONS.map((opt) => {
                  const active = intensity === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setIntensity(opt.value)}
                      className={`rounded-lg border px-2 py-2 text-xs font-bold transition-colors ${
                        active
                          ? "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-200 shadow-[0_0_14px_-2px_rgba(232,121,249,0.6)]"
                          : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/25 hover:text-zinc-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
                {INTENSITY_OPTIONS.find((o) => o.value === intensity)?.desc}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-white/[0.05] pt-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-200">
                  <Wind className="h-3.5 w-3.5 text-zinc-400" /> Bewegungsarm
                </p>
                <p className="text-[11px] leading-snug text-zinc-500">
                  Schaltet Animationen, Konfetti und Bildschirm-Blitze ab — gut bei empfindlichen Augen oder schwachen Geräten.
                </p>
              </div>
              <Toggle checked={reduceMotion} onChange={toggleReduceMotion} />
            </div>
          </div>
        </div>

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

      {/* Auto-save status — no Speichern-Button, jede Änderung speichert sich selbst */}
      <div className="mt-3 flex min-h-[20px] items-center gap-2">
        {saving && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Speichert...
          </span>
        )}
        {!saving && savedFlash && (
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
