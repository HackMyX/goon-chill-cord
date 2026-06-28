"use client";

import { useState } from "react";
import { Shield, Save, Loader2, Info, Trophy, Bot } from "lucide-react";
import { AdminTooltip } from "@/components/admin/admin-tooltip";

function fmt(n: number) { return new Intl.NumberFormat("de-DE").format(n); }
import { useSoundManager } from "@/lib/sound-manager";
import { updateModPermissions } from "@/lib/actions/mod";
import type { ModPermissions } from "@/lib/mod";

interface Props {
  permissions: ModPermissions;
}

function Toggle({
  label, description, value, onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <div>
        <p className="text-sm font-semibold text-zinc-200">{label}</p>
        {description && <p className="mt-0.5 text-[11px] text-zinc-500">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900"
      >
        <span className={`relative block h-6 w-11 overflow-hidden rounded-full transition-colors duration-200 ${value ? "bg-purple-600" : "bg-zinc-700"}`}>
          <span className={`absolute left-0 top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
        </span>
      </button>
    </div>
  );
}

export function ModConfigEditor({ permissions: initialPermissions }: Props) {
  const [perms, setPerms] = useState(initialPermissions);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  function set<K extends keyof ModPermissions>(key: K, value: ModPermissions[K]) {
    setPerms((p) => ({ ...p, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateModPermissions(perms);
    setSaving(false);
    if (res.success) { sound.save(); setMessage("Gespeichert."); }
    else { sound.error(); setMessage(res.error ?? "Fehler."); }
    setTimeout(() => setMessage(null), 3000);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-xs text-sky-300">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          Diese Einstellungen gelten für <strong>alle Moderatoren</strong> gleichzeitig. Admins haben immer
          vollen Zugriff unabhängig von diesen Einstellungen.
        </span>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#0f0e18] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-zinc-100">
          <Shield className="h-5 w-5 text-sky-400" />
          Moderator-Berechtigungen
          <AdminTooltip text="Diese Einstellungen gelten für ALLE Moderatoren gleichzeitig (globale Standard-Berechtigungen). Einzelne Mods können abweichende Berechtigungen über 'Nutzer-Management → Berechtigungen anpassen' erhalten. Admins haben immer vollen Zugriff, unabhängig von diesen Einstellungen." />
        </h3>

        <div className="flex flex-col gap-2">
          <Toggle
            label="Tickets ansehen"
            description="Moderatoren können alle Support-Tickets lesen"
            value={perms.canViewTickets}
            onChange={(v) => set("canViewTickets", v)}
          />
          <Toggle
            label="Tickets schließen"
            description="Moderatoren können Support-Tickets als erledigt markieren"
            value={perms.canCloseTickets}
            onChange={(v) => set("canCloseTickets", v)}
          />
          <Toggle
            label="Nutzer verwarnen / Notizen hinzufügen"
            description="Moderatoren können Verwarnungen und interne Notizen zu Nutzern erfassen"
            value={perms.canWarnUsers}
            onChange={(v) => set("canWarnUsers", v)}
          />
          <Toggle
            label="Temporäre Bans verhängen"
            description="Moderatoren können Nutzer zeitlich begrenzt sperren"
            value={perms.canTempBanUsers}
            onChange={(v) => set("canTempBanUsers", v)}
          />
          <Toggle
            label="Nutzerdetails einsehen"
            description="Moderatoren sehen Credits, Streak und andere Profildetails"
            value={perms.canViewUserDetails}
            onChange={(v) => set("canViewUserDetails", v)}
          />
          <Toggle
            label="Audit-Log einsehen"
            description="Moderatoren können das vollständige Aktionsprotokoll aller Mods sehen"
            value={perms.canViewAuditLog}
            onChange={(v) => set("canViewAuditLog", v)}
          />
          <Toggle
            label="Credits vergeben / entfernen"
            description="Moderatoren können Nutzer-Credits manuell anpassen"
            value={perms.canAddCredits}
            onChange={(v) => set("canAddCredits", v)}
          />
          <Toggle
            label="Begründung bei Verwarnungen Pflicht"
            description="Verwarnungen ohne Begründung werden abgelehnt"
            value={perms.warnRequiresReason}
            onChange={(v) => set("warnRequiresReason", v)}
          />
        </div>

        <h3 className="mt-5 mb-3 flex items-center gap-2 text-sm font-bold text-zinc-300">
          Erweiterte Ticket-Berechtigungen
          <AdminTooltip text="Erweiterte Aktionen rund um das Support-Ticket-System. Jede Berechtigung kann separat vergeben werden, um die Verantwortung aufzuteilen." />
        </h3>
        <div className="flex flex-col gap-2">
          <Toggle
            label="Tickets löschen"
            description="Moderatoren können Tickets permanent löschen"
            value={perms.canDeleteTickets}
            onChange={(v) => set("canDeleteTickets", v)}
          />
          <Toggle
            label="Ticket-Priorität setzen"
            description="Moderatoren können Priorität (Niedrig / Normal / Hoch / Dringend) ändern"
            value={perms.canSetTicketPriority}
            onChange={(v) => set("canSetTicketPriority", v)}
          />
          <Toggle
            label="Ticket-Status ändern"
            description="Moderatoren können Status (Offen / In Bearbeitung / Pausiert / Geschlossen) setzen"
            value={perms.canUpdateTicketStatus}
            onChange={(v) => set("canUpdateTicketStatus", v)}
          />
          <Toggle
            label="Ticketbelohnungen vergeben"
            description="Moderatoren können Credits-Belohnungen für hilfreiche Reports vergeben"
            value={perms.canRewardTickets}
            onChange={(v) => set("canRewardTickets", v)}
          />
          <Toggle
            label="Tickets pausieren"
            description="Moderatoren können Tickets auf 'Pausiert' setzen und wieder fortsetzen (z.B. wartend auf User-Antwort)"
            value={perms.canPauseTickets}
            onChange={(v) => set("canPauseTickets", v)}
          />
        </div>

        {perms.canRewardTickets && (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <Trophy className="h-3.5 w-3.5" />
                Max. Belohnung pro Ticket (Credits, 0 = kein Limit)
                <AdminTooltip text="Maximale Credits, die ein Moderator für ein einzelnes Ticket als Belohnung vergeben kann. 0 = kein Limit (Mods können beliebig viele Credits vergeben). Empfehlung: setze hier einen realistischen Wert um zu verhindern, dass Mods versehentlich oder absichtlich exzessive Belohnungen vergeben." />
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  value={perms.maxRewardPerTicket}
                  onChange={(e) => set("maxRewardPerTicket", Number(e.target.value))}
                  className="w-32 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60"
                />
                <span className="text-xs text-zinc-500">
                  {perms.maxRewardPerTicket === 0 ? "kein Limit" : `max. ${fmt(perms.maxRewardPerTicket)} CR`}
                </span>
              </div>
            </label>
          </div>
        )}

        <h3 className="mt-5 mb-3 flex items-center gap-2 text-sm font-bold text-zinc-300">
          Chat-Berechtigungen
          <AdminTooltip text="Berechtigungen für Moderationsaktionen im globalen Chat. Chat-Leeren ist eine mächtige Funktion — vergib sie mit Bedacht." />
        </h3>
        <div className="flex flex-col gap-2">
          <Toggle
            label="Global Chat leeren"
            description="Moderatoren können den gesamten Chat mit einem Klick löschen (muss auch in Chat-Einstellungen aktiviert sein)"
            value={perms.canClearChat}
            onChange={(v) => set("canClearChat", v)}
          />
        </div>

        <h3 className="mt-5 mb-1 flex items-center gap-2 text-sm font-bold text-zinc-300">
          <Bot className="h-4 w-4 text-rose-400" />
          KI-Berechtigungen
        </h3>
        <p className="mb-3 text-xs text-zinc-500">
          Steuert, ob Moderatoren Zugriff auf die Admin-KI (mit erweiterten Admin-Werkzeugen wie Credits vergeben, Rollen setzen etc.) haben.
          <span className="ml-1 text-rose-400 font-semibold">Standard: DEAKTIVIERT</span>
        </p>
        <div className="flex flex-col gap-2">
          <Toggle
            label="Admin-KI für Mods erlauben"
            description="Moderatoren können die Admin-KI nutzen (set_role, add_credits, get_user_history etc.) — standardmäßig deaktiviert. Individuelle Ausnahmen im Nutzer-Berechtigungseditor möglich."
            value={perms.canUseAdminAi}
            onChange={(v) => set("canUseAdminAi", v)}
          />
        </div>

        {perms.canTempBanUsers && (
          <div className="mt-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-400">
                Maximale Temp-Ban-Dauer (Stunden)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={8760}
                  value={perms.maxTempBanHours}
                  onChange={(e) => set("maxTempBanHours", Number(e.target.value))}
                  className="w-28 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
                />
                <span className="text-xs text-zinc-500">
                  = {perms.maxTempBanHours < 24 ? `${perms.maxTempBanHours}h` : `${Math.round(perms.maxTempBanHours / 24 * 10) / 10} Tage`}
                </span>
              </div>
            </label>
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            onMouseEnter={sound.hover}
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-sky-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Speichern
          </button>
          {message && <span className="text-sm text-zinc-400">{message}</span>}
        </div>
      </div>
    </div>
  );
}
