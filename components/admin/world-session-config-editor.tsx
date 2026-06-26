"use client";

import { useState } from "react";
import { Save, Loader2, Power, Swords, Timer } from "lucide-react";
import { updateWorldSessionConfig } from "@/lib/actions/world-session";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import type { WorldSessionConfig } from "@/lib/world-session-config";
import { useSoundManager } from "@/lib/sound-manager";
import { AdminTooltip } from "@/components/admin/admin-tooltip";

/**
 * Admin config for the 3D World's session-level settings (lib/world-
 * session-config.ts) — the Disconnect countdown duration and two master
 * kill-switches, neither of which had any admin surface before this.
 * Lives inside the Games tab's "3D World" card (components/admin/games-
 * tab.tsx), not its own top-level tab, since it's specifically about this
 * one game rather than a sitewide setting.
 */
export function WorldSessionConfigEditor({ config }: { config: WorldSessionConfig }) {
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateWorldSessionConfig(form);
    setSaving(false);
    if (res.success) {
      sound.save();
      setMessage("Gespeichert.");
    } else {
      sound.error();
      setMessage(res.error ?? "Fehler.");
    }
    setTimeout(() => setMessage(null), 3000);
  }

  return (
    <CollapsibleAdminRow
      header={
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-cyan-400" />
          <span className="text-base font-bold text-zinc-100">Session-Einstellungen</span>
          <AdminTooltip text="Globale Schalter für die 3D-Farmwelt. Steuert, ob die Welt erreichbar ist und ob PvP zwischen Spielern aktiv ist. Der Disconnect-Timer bestimmt die Schutzdauer beim sauberen Verlassen der Welt." />
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
            Disconnect-Timer (Sekunden)
            <AdminTooltip text="Nachdem ein Spieler auf 'Disconnect' klickt, läuft dieser Timer. Überlebt der Spieler die gesamte Zeit, wird seine Kill-Streak gespeichert. Stirbt er vorher, geht die Streak verloren. Verhindert 'Safe-Disconnect' kurz vor dem Tod. Empfehlung: 5–15 Sekunden." />
          </span>
          <input
            type="number"
            min={1}
            max={120}
            step={1}
            value={form.disconnectCountdownSec}
            onChange={(e) =>
              setForm((f) => ({ ...f, disconnectCountdownSec: Number(e.target.value) || 1 }))
            }
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
          />
          <span className="text-[11px] text-zinc-600">
            So lange muss der Spieler nach Klick auf &bdquo;Disconnect&ldquo; überleben, bevor die Kill-Streak
            gesichert wird.
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
            <Power className="h-3.5 w-3.5" />
            World aktiviert
            <AdminTooltip text="Master-Schalter für die 3D-Farmwelt. Wenn deaktiviert, werden reguläre Spieler beim Versuch /world zu öffnen auf die Startseite umgeleitet. Admins können die Welt trotzdem betreten (z.B. für Wartungsarbeiten)." />
          </span>
          <button
            type="button"
            onMouseEnter={sound.hover}
            onClick={() => {
              sound.click();
              setForm((f) => ({ ...f, worldEnabled: !f.worldEnabled }));
            }}
            className={`flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
              form.worldEnabled
                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                : "border-red-400/50 bg-red-500/15 text-red-200"
            }`}
          >
            {form.worldEnabled ? "An" : "Aus"}
          </button>
          <span className="text-[11px] text-zinc-600">
            Wenn aus: normale Spieler werden von /world auf die Startseite umgeleitet. Admins können
            weiterhin rein.
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
            <Swords className="h-3.5 w-3.5" />
            PvP aktiviert
            <AdminTooltip text="Wenn deaktiviert, können Spieler sich gegenseitig nicht mehr beschädigen — Angriffe gegen andere Spieler treffen serverseitig nie (auch wenn clientseitig eine Animation abgespielt wird). Monster-Kämpfe sind unabhängig davon immer aktiv." />
          </span>
          <button
            type="button"
            onMouseEnter={sound.hover}
            onClick={() => {
              sound.click();
              setForm((f) => ({ ...f, pvpEnabled: !f.pvpEnabled }));
            }}
            className={`flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
              form.pvpEnabled
                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                : "border-red-400/50 bg-red-500/15 text-red-200"
            }`}
          >
            {form.pvpEnabled ? "An" : "Aus"}
          </button>
          <span className="text-[11px] text-zinc-600">
            Wenn aus: Schläge gegen andere Spieler treffen nie (Server-seitig erzwungen).
            Monster-Kämpfe sind unabhängig davon immer aktiv.
          </span>
        </label>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onMouseEnter={sound.hover}
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Speichern
        </button>
        {message && <span className="text-sm text-zinc-400">{message}</span>}
      </div>
    </CollapsibleAdminRow>
  );
}
