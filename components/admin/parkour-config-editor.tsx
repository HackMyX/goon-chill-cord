"use client";

import { useState } from "react";
import { Save, Loader2, Zap, RotateCcw, Trophy } from "lucide-react";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import { AdminTooltip } from "@/components/admin/admin-tooltip";
import { useSoundManager } from "@/lib/sound-manager";
import {
  PARKOUR_MAPS, formatParkourTime,
  type ParkourConfig, type ParkourMap, type ParkourMapOverride,
} from "@/lib/parkour-config";
import {
  updateParkourConfig, getParkourLeaderboard, adminResetParkourMap, type ParkourLeaderboardEntry,
} from "@/lib/actions/parkour";

/** Numeric field bound to a per-map override — placeholder shows the code
 * default so an empty field means "use the built-in value". */
function NumField({
  label, tip, value, def, step = 1, onChange,
}: {
  label: string; tip: string; value: number | undefined; def: number; step?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400">
        {label} <AdminTooltip text={tip} />
      </span>
      <input
        type="number"
        step={step}
        value={value ?? ""}
        placeholder={String(def)}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
      />
    </label>
  );
}

function MapLeaderboardPreview({ map }: { map: ParkourMap }) {
  const [rows, setRows] = useState<ParkourLeaderboardEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const sound = useSoundManager();

  async function load() {
    setLoading(true);
    setRows(await getParkourLeaderboard(map.id, 10));
    setLoading(false);
  }
  async function reset() {
    if (!confirm(`Bestenliste für "${map.name}" wirklich komplett zurücksetzen?`)) return;
    setResetting(true);
    const res = await adminResetParkourMap(map.id);
    setResetting(false);
    if (res.success) { sound.save(); void load(); } else sound.error();
  }

  return (
    <div className="mt-3 rounded-lg border border-white/5 bg-black/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-bold text-zinc-300">Bestenliste</span>
        <button onClick={load} className="ml-auto rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:border-white/30">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Laden"}
        </button>
        <button onClick={reset} disabled={resetting}
          className="inline-flex items-center gap-1 rounded-md border border-red-400/30 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-50">
          {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Reset
        </button>
      </div>
      {rows === null ? (
        <p className="text-[11px] text-zinc-600">„Laden" klicken für die aktuellen Top-Zeiten.</p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-zinc-600">Noch keine Zeiten.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map((r) => (
            <div key={r.userId} className="flex items-center gap-2 text-xs">
              <span className="w-6 text-zinc-600">#{r.rank}</span>
              <span className="flex-1 truncate text-zinc-300">{r.username}</span>
              <span className="font-mono text-emerald-300">{formatParkourTime(r.bestTimeMs)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ParkourConfigEditor({ config }: { config: ParkourConfig }) {
  const [form, setForm] = useState<ParkourConfig>(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  function setMapOverride(mapId: string, patch: Partial<ParkourMapOverride>) {
    setForm((f) => ({ ...f, maps: { ...f.maps, [mapId]: { ...f.maps[mapId], ...patch } } }));
  }

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateParkourConfig(form);
    setSaving(false);
    if (res.success) { sound.save(); setMessage("Gespeichert."); }
    else { sound.error(); setMessage(res.error ?? "Fehler."); }
    setTimeout(() => setMessage(null), 3000);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Master switches */}
      <CollapsibleAdminRow
        header={
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-fuchsia-400" />
            <span className="text-base font-bold text-zinc-100">Parkour — Global</span>
            <AdminTooltip text="Master-Schalter für das gesamte Parkour-Spiel, Lobby-Größe und das tägliche Belohnungs-Limit." />
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
            <span className="text-sm text-zinc-200">Parkour aktiviert</span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
            <input type="checkbox" checked={form.adminOnly} onChange={(e) => setForm((f) => ({ ...f, adminOnly: e.target.checked }))} />
            <span className="text-sm text-zinc-200">Nur für Admins (Soft-Launch)</span>
          </label>
          <NumField label="Max. Lobby-Größe" tip="Wie viele Spieler passen in eine Multiplayer-Lobby (1–6)." value={form.maxLobbySize} def={6} onChange={(v) => setForm((f) => ({ ...f, maxLobbySize: v ?? 6 }))} />
          <NumField label="Belohnte Ziele / Tag" tip="Wie viele Ziel-Ankünfte pro Tag Credits/XP geben (Anti-Farm). 0 = unbegrenzt." value={form.dailyRewardedFinishes} def={3} onChange={(v) => setForm((f) => ({ ...f, dailyRewardedFinishes: v ?? 3 }))} />
          <NumField label="Todes-Strafe (ms)" tip="Millisekunden, die jeder Tod zum kombinierten T/D-Score addiert. ALLE Parkour-Bestenlisten ranken standardmäßig nach T/D (Zeit + Todes-Strafe) — weniger Zeit UND weniger Tode = besser." step={100} value={form.deathPenaltyMs} def={2500} onChange={(v) => setForm((f) => ({ ...f, deathPenaltyMs: v ?? 2500 }))} />
        </div>
      </CollapsibleAdminRow>

      {/* Per-map tuning */}
      {PARKOUR_MAPS.map((map) => {
        const o = form.maps[map.id] ?? {};
        const enabled = o.enabled ?? true;
        return (
          <CollapsibleAdminRow
            key={map.id}
            header={
              <div id={`parkour-map-${map.id}`} className="flex items-center gap-2">
                <span className="text-base font-bold text-zinc-100">{map.name}</span>
                <span className="text-xs text-zinc-500">· {map.difficulty}</span>
                {!enabled && <span className="rounded bg-red-500/20 px-1.5 text-[10px] font-bold text-red-300">AUS</span>}
              </div>
            }
          >
            <label className="mb-3 flex items-center gap-2">
              <input type="checkbox" checked={enabled} onChange={(e) => setMapOverride(map.id, { enabled: e.target.checked })} />
              <span className="text-sm text-zinc-200">Map aktiviert</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumField label="Gravitation" tip="Fallbeschleunigung (negativ). Stärker = schnellerer Fall. Code-Default in Klammern." value={o.gravity} def={map.gravity} onChange={(v) => setMapOverride(map.id, { gravity: v })} />
              <NumField label="Sprungkraft" tip="Anfangs-Vertikalgeschwindigkeit beim Sprung." step={0.1} value={o.jumpVelocity} def={map.jumpVelocity} onChange={(v) => setMapOverride(map.id, { jumpVelocity: v })} />
              <NumField label="Luftsprünge" tip="Zusätzliche Sprünge in der Luft (0 = nur Bodensprung, 1 = Doppelsprung)." value={o.airJumps} def={map.airJumps} onChange={(v) => setMapOverride(map.id, { airJumps: v })} />
              <NumField label="Lauftempo" tip="Grundgeschwindigkeit (Welt-Einheiten/Sek)." step={0.1} value={o.moveSpeed} def={map.moveSpeed} onChange={(v) => setMapOverride(map.id, { moveSpeed: v })} />
              <NumField label="Sprint-Faktor" tip="Multiplikator auf das Lauftempo beim Sprinten (Shift)." step={0.05} value={o.sprintMultiplier} def={map.sprintMultiplier} onChange={(v) => setMapOverride(map.id, { sprintMultiplier: v })} />
              <NumField label="Void-Höhe (Y)" tip="Fällt der Spieler unter diesen Y-Wert, respawnt er am letzten Checkpoint (der Abgrund bzw. die Lava). Negativ." value={o.voidY} def={map.voidY} onChange={(v) => setMapOverride(map.id, { voidY: v })} />
              <NumField label="Credits / Ziel" tip="Credits beim Erreichen des Ziels (über den zentralen Reward-Dispatcher)." value={o.rewardCredits} def={map.rewardCredits} onChange={(v) => setMapOverride(map.id, { rewardCredits: v })} />
              <NumField label="XP / Ziel" tip="XP beim Erreichen des Ziels." value={o.rewardXp} def={map.rewardXp} onChange={(v) => setMapOverride(map.id, { rewardXp: v })} />
              <NumField label="Bestzeit-Bonus" tip="Extra-Credits, wenn eine neue persönliche Bestzeit gesetzt wird." value={o.bestBonusCredits} def={map.bestBonusCredits} onChange={(v) => setMapOverride(map.id, { bestBonusCredits: v })} />
              <NumField label="Credits / Checkpoint" tip="Credits pro tatsächlich erreichtem Checkpoint (beim Ziel gutgeschrieben, innerhalb des Tageslimits)." value={o.checkpointCredits} def={map.checkpointCredits} onChange={(v) => setMapOverride(map.id, { checkpointCredits: v })} />
            </div>
            <p className="mt-2 text-[11px] text-zinc-600">
              Medaillen-Ziele: 💎 {formatParkourTime(map.medals.diamond)} · 🥇 {formatParkourTime(map.medals.gold)} · 🥈 {formatParkourTime(map.medals.silver)} · 🥉 {formatParkourTime(map.medals.bronze)}
            </p>
            <MapLeaderboardPreview map={map} />
          </CollapsibleAdminRow>
        );
      })}

      <div className="flex items-center gap-3">
        <button onMouseEnter={sound.hover} onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-500 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Speichern
        </button>
        {message && <span className="text-sm text-zinc-400">{message}</span>}
      </div>
    </div>
  );
}
