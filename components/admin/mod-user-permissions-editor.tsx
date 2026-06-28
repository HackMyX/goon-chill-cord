"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Save, RotateCcw, UserCog, Bot, Check, X, Minus } from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import { getModeratorUsers, setModUserPermissions } from "@/lib/actions/mod";
import { ADMIN_MOD_PERMISSIONS, DEFAULT_MOD_PERMISSIONS, type ModPermissions, type ModeratorWithPermissions } from "@/lib/mod";

const PERM_LABELS: {
  key: keyof ModPermissions;
  label: string;
  description: string;
  isNumber?: true;
  min?: number;
  max?: number;
  section?: string;
}[] = [
  // Tickets
  { key: "canViewTickets",        label: "Tickets ansehen",           description: "Kann alle Support-Tickets lesen",                             section: "Tickets" },
  { key: "canCloseTickets",       label: "Tickets schließen",         description: "Kann Tickets als erledigt markieren",                         section: "Tickets" },
  { key: "canDeleteTickets",      label: "Tickets löschen",           description: "Kann Tickets permanent löschen",                              section: "Tickets" },
  { key: "canSetTicketPriority",  label: "Ticket-Priorität",          description: "Kann Priorität (Niedrig/Normal/Hoch/Dringend) ändern",        section: "Tickets" },
  { key: "canUpdateTicketStatus", label: "Ticket-Status",             description: "Kann Status (Offen/Bearbeitung/Geschlossen) setzen",          section: "Tickets" },
  { key: "canRewardTickets",      label: "Ticketbelohnungen",         description: "Kann Credits-Belohnungen für hilfreiche Reports vergeben",     section: "Tickets" },
  { key: "canPauseTickets",       label: "Tickets pausieren",         description: "Kann Tickets auf 'Pausiert' setzen und wieder fortsetzen",    section: "Tickets" },
  { key: "maxRewardPerTicket",    label: "Max. Belohnung/Ticket (CR)",description: "Maximale Credits pro Ticketbelohnung (0 = kein Limit)",       section: "Tickets", isNumber: true, min: 0, max: 1000000 },
  // Nutzer
  { key: "canWarnUsers",          label: "Nutzer verwarnen",          description: "Kann Verwarnungen und Notizen erfassen",                      section: "Nutzer" },
  { key: "canTempBanUsers",       label: "Temporäre Bans",            description: "Kann Nutzer zeitlich begrenzt sperren",                       section: "Nutzer" },
  { key: "canViewUserDetails",    label: "Nutzerdetails",             description: "Sieht Credits, Streak und Profildetails",                     section: "Nutzer" },
  { key: "canAddCredits",         label: "Credits vergeben",          description: "Kann Nutzer-Credits manuell anpassen",                        section: "Nutzer" },
  { key: "warnRequiresReason",    label: "Begründung Pflicht",        description: "Verwarnungen ohne Begründung werden abgelehnt",               section: "Nutzer" },
  { key: "maxTempBanHours",       label: "Max. Temp-Ban (Stunden)",   description: "Maximale Dauer eines Temp-Bans in Stunden",                  section: "Nutzer", isNumber: true, min: 1, max: 8760 },
  // System
  { key: "canViewAuditLog",       label: "Audit-Log",                 description: "Kann das vollständige Aktionsprotokoll einsehen",             section: "System" },
  { key: "canClearChat",          label: "Chat leeren",               description: "Kann den Global-Chat mit einem Klick löschen",               section: "System" },
  { key: "canMuteChat",           label: "Chat stummschalten",        description: "Kann Nutzer zeitlich begrenzt im Global-Chat stummschalten",  section: "System" },
  { key: "maxChatMuteHours",      label: "Max. Chat-Mute (Stunden)",  description: "Maximale Dauer einer Chat-Stummschaltung in Stunden",         section: "System", isNumber: true, min: 1, max: 8760 },
  { key: "canUseAdminAi",         label: "Admin-KI nutzen",           description: "Zugriff auf die Admin-KI mit erweiterten Admin-Werkzeugen — STANDARDMÄBIG DEAKTIVIERT", section: "System" },
];

const SECTIONS = ["Tickets", "Nutzer", "System"] as const;

type TriMode = "allow" | "inherit" | "deny";

/**
 * Three-state permission switch:
 *  - "Erlaubt" (grün ✓)  → Recht wird dem Mod individuell GEGEBEN
 *  - "Standard" (grau)    → erbt den globalen Gruppen-Wert (kein Override)
 *  - "Gesperrt" (rot ✕)   → Recht wird dem Mod individuell ENTZOGEN
 */
function TriStateSwitch({ mode, groupVal, onChange }: {
  mode: TriMode;
  groupVal: boolean;
  onChange: (m: TriMode) => void;
}) {
  const segs: { k: TriMode; label: string; Icon: typeof Check; active: string }[] = [
    { k: "allow",   label: "Erlaubt",  Icon: Check, active: "bg-emerald-500/25 text-emerald-200 shadow-[inset_0_0_0_1.5px_rgba(16,185,129,0.55)]" },
    { k: "inherit", label: "Standard", Icon: Minus, active: "bg-zinc-500/30 text-zinc-100 shadow-[inset_0_0_0_1.5px_rgba(161,161,170,0.5)]" },
    { k: "deny",    label: "Gesperrt", Icon: X,     active: "bg-red-500/25 text-red-200 shadow-[inset_0_0_0_1.5px_rgba(239,68,68,0.55)]" },
  ];
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-white/10 text-[11px] font-bold">
      {segs.map((s, i) => (
        <button
          key={s.k}
          type="button"
          onClick={() => onChange(s.k)}
          aria-pressed={mode === s.k}
          title={s.k === "inherit" ? `Standard (erbt: ${groupVal ? "Erlaubt" : "Gesperrt"})` : s.label}
          className={`flex items-center gap-1 px-2 py-1.5 transition-all duration-150 ${i > 0 ? "border-l border-white/10" : ""} ${
            mode === s.k ? s.active : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
          }`}
        >
          <s.Icon className="h-3 w-3" /> {s.label}
        </button>
      ))}
    </div>
  );
}

/** Inline badge that spells out what the current choice MEANS for this mod. */
function ModeBadge({ mode, groupVal }: { mode: TriMode; groupVal: boolean }) {
  if (mode === "allow") {
    return (
      <span className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300 bg-emerald-500/15">
        <Check className="h-2.5 w-2.5" /> erlaubt · gibt Recht
      </span>
    );
  }
  if (mode === "deny") {
    return (
      <span className="flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-300 bg-red-500/15">
        <X className="h-2.5 w-2.5" /> gesperrt · entzieht Recht
      </span>
    );
  }
  return (
    <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-zinc-400 bg-zinc-700/40">
      Standard · erbt {groupVal ? "Erlaubt" : "Gesperrt"}
    </span>
  );
}

function ModRow({ mod, globalPerms }: { mod: ModeratorWithPermissions; globalPerms: ModPermissions }) {
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<Partial<ModPermissions> | null>(mod.override);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const sound = useSoundManager();

  const isAdminRole = mod.role === "admin";
  const overrideKeys = override ? Object.keys(override) : [];
  const overrideCount = overrideKeys.length;

  // Effective value for a permission key
  // GOLDEN RULE: individual override always beats group default
  function getVal(key: keyof ModPermissions) {
    if (isAdminRole) return ADMIN_MOD_PERMISSIONS[key];
    if (override && key in override) return override[key] as ModPermissions[typeof key];
    return globalPerms[key];
  }

  // Source tells the UI where this value comes from
  function getSource(key: keyof ModPermissions): "admin" | "individual" | "group" {
    if (isAdminRole) return "admin";
    if (override && key in override) return "individual";
    return "group";
  }

  function setVal<K extends keyof ModPermissions>(key: K, val: ModPermissions[K]) {
    setOverride((prev) => {
      const next = { ...(prev ?? {}) };
      // If value matches group default → remove override (falls back to group)
      if (val === globalPerms[key]) {
        delete next[key];
      } else {
        // Different from group → store as individual override (beats group)
        (next as Record<string, unknown>)[key] = val;
      }
      return Object.keys(next).length === 0 ? null : next;
    });
  }

  // Three-state mode of a boolean permission: explicit allow/deny or inherited.
  function getMode(key: keyof ModPermissions): TriMode {
    if (override && key in override) return override[key] ? "allow" : "deny";
    return "inherit";
  }

  // Set the three-state mode. "inherit" removes the override (falls back to group),
  // "allow"/"deny" stores an explicit individual override (beats the group).
  function setMode(key: keyof ModPermissions, mode: TriMode) {
    setOverride((prev) => {
      const next = { ...(prev ?? {}) };
      if (mode === "inherit") {
        delete next[key];
      } else {
        (next as Record<string, unknown>)[key] = mode === "allow";
      }
      return Object.keys(next).length === 0 ? null : next;
    });
  }

  // Reset single permission back to group default
  function resetOne(key: keyof ModPermissions) {
    setOverride((prev) => {
      if (!prev) return null;
      const next = { ...prev };
      delete next[key];
      return Object.keys(next).length === 0 ? null : next;
    });
  }

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await setModUserPermissions(mod.id, overrideCount > 0 ? override : null);
    setSaving(false);
    if (res.success) { sound.save(); setMsg("Gespeichert."); }
    else { sound.error(); setMsg(res.error ?? "Fehler."); }
    setTimeout(() => setMsg(null), 3000);
  }

  function handleResetAll() {
    sound.click();
    setOverride(null);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0e18] overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
        onClick={() => { setOpen((o) => !o); sound.click(); }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <UserCog className="h-4 w-4 text-zinc-500 shrink-0" />
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-zinc-100">{mod.username}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${isAdminRole ? "bg-amber-500/20 text-amber-400" : "bg-sky-500/20 text-sky-400"}`}>
              {isAdminRole ? "Admin" : "Mod"}
            </span>
            {overrideCount > 0 && !isAdminRole && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                {overrideCount} individuelle Rechte
              </span>
            )}
            {(override as Record<string, unknown> | null)?.canUseAdminAi === true && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400">
                <Bot className="h-2.5 w-2.5" /> Admin-KI
              </span>
            )}
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3">
          {isAdminRole ? (
            <p className="text-xs text-zinc-500">Admins haben immer vollen Zugriff — keine individuelle Einschränkung möglich.</p>
          ) : (
            <>
              {/* Legend */}
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-[10px] text-zinc-400">
                <span className="font-semibold text-zinc-500">Legende:</span>
                <span className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 rounded bg-emerald-500/25 px-1.5 py-0.5 font-bold text-emerald-200">
                    <Check className="h-2.5 w-2.5" /> Erlaubt
                  </span>
                  <span className="text-zinc-500">= Recht GEGEBEN</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 rounded bg-red-500/25 px-1.5 py-0.5 font-bold text-red-200">
                    <X className="h-2.5 w-2.5" /> Gesperrt
                  </span>
                  <span className="text-zinc-500">= Recht ENTZOGEN</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 rounded bg-zinc-500/30 px-1.5 py-0.5 font-bold text-zinc-200">
                    <Minus className="h-2.5 w-2.5" /> Standard
                  </span>
                  <span className="text-zinc-500">= erbt globale Einstellung</span>
                </span>
                <span className="w-full text-zinc-600 italic">Erlaubt/Gesperrt überschreiben IMMER die globale Gruppe — Standard folgt der Gruppe.</span>
              </div>

              {SECTIONS.map((section) => {
                const permsInSection = PERM_LABELS.filter((p) => p.section === section);
                return (
                  <div key={section} className="mb-4">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-600">{section}</p>
                    <div className="flex flex-col gap-1.5">
                      {permsInSection.map(({ key, label, description, isNumber, min, max }) => {
                        const val = getVal(key);
                        const source = getSource(key);
                        const isIndividual = source === "individual";
                        const groupVal = globalPerms[key];

                        if (isNumber) {
                          return (
                            <div
                              key={key}
                              className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors ${
                                isIndividual
                                  ? "border-amber-500/40 bg-amber-500/[0.06]"
                                  : "border-white/8 bg-white/[0.02]"
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-xs font-semibold text-zinc-200">{label}</p>
                                  {isIndividual ? (
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-amber-300 bg-amber-500/20 px-1 py-0.5 rounded">
                                      überschrieben (Standard: {String(groupVal)})
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-400 bg-zinc-700/40 px-1 py-0.5 rounded">
                                      Standard ({String(groupVal)})
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-zinc-500">{description}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <input
                                  type="number"
                                  min={min ?? 0}
                                  max={max ?? 9999999}
                                  value={val as number}
                                  onChange={(e) => setVal(key as "maxTempBanHours" | "maxRewardPerTicket" | "maxChatMuteHours", Number(e.target.value))}
                                  className={`w-24 rounded-lg border bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none transition-colors ${
                                    isIndividual ? "border-amber-400/40 focus:border-amber-400/70" : "border-white/10 focus:border-purple-400/60"
                                  }`}
                                />
                                {isIndividual && (
                                  <button
                                    onClick={() => resetOne(key)}
                                    title={`Auf Standard zurücksetzen (${String(groupVal)})`}
                                    className="flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-1 text-[10px] font-semibold text-zinc-400 transition-colors hover:border-amber-400/40 hover:text-amber-300"
                                  >
                                    <RotateCcw className="h-2.5 w-2.5" /> Standard
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        }

                        const mode = getMode(key);
                        const rowTint =
                          mode === "allow"
                            ? "border-emerald-500/30 bg-emerald-500/[0.05]"
                            : mode === "deny"
                              ? "border-red-500/25 bg-red-500/[0.04]"
                              : "border-white/8 bg-white/[0.02]";

                        return (
                          <div
                            key={key}
                            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors ${rowTint}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs font-semibold text-zinc-200">{label}</p>
                                <ModeBadge mode={mode} groupVal={groupVal as boolean} />
                              </div>
                              <p className="text-[10px] text-zinc-500">{description}</p>
                            </div>
                            <TriStateSwitch
                              mode={mode}
                              groupVal={groupVal as boolean}
                              onChange={(m) => setMode(key, m)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <button
                  onMouseEnter={sound.hover}
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-sky-500 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Speichern
                </button>
                {overrideCount > 0 && (
                  <button
                    onMouseEnter={sound.hover}
                    onClick={handleResetAll}
                    className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-400"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Alle Overrides zurücksetzen
                  </button>
                )}
                {msg && <span className="text-xs text-zinc-400">{msg}</span>}
              </div>

              {overrideCount > 0 && (
                <p className="mt-2 text-[10px] text-zinc-600">
                  {overrideCount} individuelle Überschreibung{overrideCount !== 1 ? "en" : ""} aktiv.
                  Individuelle Rechte überschreiben IMMER die Gruppeneinstellungen.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ModUserPermissionsEditor({ globalPerms }: { globalPerms: ModPermissions }) {
  const [mods, setMods] = useState<ModeratorWithPermissions[] | null>(null);

  useEffect(() => {
    getModeratorUsers().then(setMods);
  }, []);

  if (mods === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Lade Moderatoren…</span>
      </div>
    );
  }

  // Admins always have full access and are NOT configurable here — only show
  // moderators in the individual-permissions list.
  const modsOnly = mods.filter((m) => m.role !== "admin");

  if (modsOnly.length === 0) {
    return <p className="text-sm text-zinc-500">Keine Moderatoren gefunden.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="mb-1 text-xs text-zinc-500">
        Individuelle Berechtigungen überschreiben <span className="text-purple-400 font-semibold">immer</span> die globalen Gruppen-Einstellungen. Beim Zuweisen der Mod-Rolle werden die aktuellen Gruppen-Defaults automatisch als Startpunkt gesetzt. Admins haben immer vollen Zugriff und sind hier nicht aufgeführt.
      </p>
      {modsOnly.map((mod) => (
        <ModRow key={mod.id} mod={mod} globalPerms={globalPerms} />
      ))}
    </div>
  );
}

// Re-export DEFAULT_MOD_PERMISSIONS so the editor parent can pass it if needed
export { DEFAULT_MOD_PERMISSIONS };
