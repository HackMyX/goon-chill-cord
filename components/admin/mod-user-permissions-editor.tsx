"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Save, RotateCcw, UserCog } from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import { getModeratorUsers, setModUserPermissions } from "@/lib/actions/mod";
import { ADMIN_MOD_PERMISSIONS, type ModPermissions, type ModeratorWithPermissions } from "@/lib/mod";

const PERM_LABELS: { key: keyof ModPermissions; label: string; description: string; isNumber?: true; min?: number; max?: number }[] = [
  { key: "canViewTickets", label: "Tickets ansehen", description: "Kann alle Support-Tickets lesen" },
  { key: "canCloseTickets", label: "Tickets schließen", description: "Kann Tickets als erledigt markieren" },
  { key: "canWarnUsers", label: "Nutzer verwarnen", description: "Kann Verwarnungen und Notizen erfassen" },
  { key: "canTempBanUsers", label: "Temporäre Bans", description: "Kann Nutzer zeitlich begrenzt sperren" },
  { key: "canViewUserDetails", label: "Nutzerdetails", description: "Sieht Credits, Streak und Profildetails" },
  { key: "canViewAuditLog", label: "Audit-Log", description: "Kann das vollständige Aktionsprotokoll einsehen" },
  { key: "canAddCredits", label: "Credits vergeben", description: "Kann Nutzer-Credits manuell anpassen" },
  { key: "warnRequiresReason", label: "Begründung Pflicht", description: "Verwarnungen ohne Begründung werden abgelehnt" },
  { key: "canClearChat", label: "Chat leeren", description: "Kann den Global-Chat mit einem Klick löschen" },
  { key: "canDeleteTickets", label: "Tickets löschen", description: "Kann Tickets permanent löschen" },
  { key: "canSetTicketPriority", label: "Ticket-Priorität", description: "Kann Priorität (Niedrig/Normal/Hoch/Dringend) ändern" },
  { key: "canUpdateTicketStatus", label: "Ticket-Status", description: "Kann Status (Offen/Bearbeitung/Gelöst/Geschlossen) setzen" },
  { key: "canRewardTickets", label: "Ticketbelohnungen", description: "Kann Credits-Belohnungen für hilfreiche Reports vergeben" },
  { key: "maxTempBanHours", label: "Max. Temp-Ban (Stunden)", description: "Maximale Dauer eines Temp-Bans in Stunden", isNumber: true, min: 1, max: 8760 },
  { key: "maxRewardPerTicket", label: "Max. Belohnung pro Ticket (CR)", description: "Maximale Credits pro Ticketbelohnung (0 = kein Limit)", isNumber: true, min: 0, max: 1000000 },
];

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      role="switch"
      aria-checked={value}
      disabled={disabled}
      className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-40"
    >
      <span className={`relative block h-5 w-9 overflow-hidden rounded-full transition-colors ${value ? "bg-purple-600" : "bg-zinc-700"}`}>
        <span className={`absolute left-0 top-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-[18px]" : "translate-x-[2px]"}`} />
      </span>
    </button>
  );
}

function ModRow({ mod, globalPerms }: { mod: ModeratorWithPermissions; globalPerms: ModPermissions }) {
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<Partial<ModPermissions> | null>(mod.override);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const sound = useSoundManager();

  const isAdmin = mod.role === "admin";
  const hasOverride = override !== null && Object.keys(override).length > 0;

  function getVal(key: keyof ModPermissions) {
    if (isAdmin) return ADMIN_MOD_PERMISSIONS[key];
    if (override && key in override) return override[key] as ModPermissions[typeof key];
    return globalPerms[key];
  }

  function setVal<K extends keyof ModPermissions>(key: K, val: ModPermissions[K]) {
    setOverride((prev) => {
      const next = { ...(prev ?? {}) };
      if (val === globalPerms[key]) {
        delete next[key];
      } else {
        (next as Record<string, unknown>)[key] = val;
      }
      return Object.keys(next).length === 0 ? null : next;
    });
  }

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await setModUserPermissions(mod.id, hasOverride ? override : null);
    setSaving(false);
    if (res.success) { sound.save(); setMsg("Gespeichert."); }
    else { sound.error(); setMsg(res.error ?? "Fehler."); }
    setTimeout(() => setMsg(null), 3000);
  }

  function handleReset() {
    sound.click();
    setOverride(null);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0e18] overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
        onClick={() => { setOpen((o) => !o); sound.click(); }}
      >
        <div className="flex items-center gap-3">
          <UserCog className="h-4 w-4 text-zinc-500 shrink-0" />
          <div>
            <span className="text-sm font-semibold text-zinc-100">{mod.username}</span>
            <span className={`ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${isAdmin ? "bg-amber-500/20 text-amber-400" : "bg-sky-500/20 text-sky-400"}`}>
              {isAdmin ? "Admin" : "Mod"}
            </span>
            {hasOverride && !isAdmin && (
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                individuelle Rechte
              </span>
            )}
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-zinc-500" /> : <ChevronRight className="h-4 w-4 text-zinc-500" />}
      </button>

      {open && (
        <div className="border-t border-white/5 px-4 pb-4 pt-3">
          {isAdmin ? (
            <p className="text-xs text-zinc-500">Admins haben immer vollen Zugriff — keine individuelle Einschränkung möglich.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-zinc-500">
                Abweichungen von den globalen Mod-Einstellungen werden hier individuell überschrieben. Felder ohne Override erben die globale Einstellung.
              </p>

              <div className="flex flex-col gap-1.5">
                {PERM_LABELS.map(({ key, label, description, isNumber, min, max }) => {
                  const val = getVal(key);
                  const hasLocalOverride = override !== null && key in override;

                  if (isNumber) {
                    return (
                      <div key={key} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${hasLocalOverride ? "border-purple-500/30 bg-purple-500/5" : "border-white/5 bg-white/[0.02]"}`}>
                        <div>
                          <p className="text-xs font-semibold text-zinc-200">{label}</p>
                          <p className="text-[10px] text-zinc-500">{description}</p>
                        </div>
                        <input
                          type="number"
                          min={min ?? 0}
                          max={max ?? 9999999}
                          value={val as number}
                          onChange={(e) => setVal(key as "maxTempBanHours" | "maxRewardPerTicket", Number(e.target.value))}
                          className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
                        />
                      </div>
                    );
                  }

                  return (
                    <div key={key} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${hasLocalOverride ? "border-purple-500/30 bg-purple-500/5" : "border-white/5 bg-white/[0.02]"}`}>
                      <div>
                        <p className="text-xs font-semibold text-zinc-200">{label}</p>
                        <p className="text-[10px] text-zinc-500">{description}</p>
                      </div>
                      <Toggle
                        value={val as boolean}
                        onChange={(v) => setVal(key as keyof ModPermissions, v as ModPermissions[typeof key])}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onMouseEnter={sound.hover}
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-sky-500 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Speichern
                </button>
                {hasOverride && (
                  <button
                    onMouseEnter={sound.hover}
                    onClick={handleReset}
                    className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-400"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Overrides zurücksetzen
                  </button>
                )}
                {msg && <span className="text-xs text-zinc-400">{msg}</span>}
              </div>
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

  if (mods.length === 0) {
    return <p className="text-sm text-zinc-500">Keine Moderatoren oder Admins gefunden.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {mods.map((mod) => (
        <ModRow key={mod.id} mod={mod} globalPerms={globalPerms} />
      ))}
    </div>
  );
}
