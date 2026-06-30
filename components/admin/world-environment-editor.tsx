"use client";

import { useState } from "react";
import { Save, Loader2, Mountain } from "lucide-react";
import { updateWorldEnvironmentConfig } from "@/lib/actions/world-environment";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import {
  TIME_OF_DAY_PRESETS,
  type WorldEnvironmentConfig,
  type TimeOfDay,
} from "@/lib/world-environment-config";
import { useSoundManager } from "@/lib/sound-manager";
import { AdminTooltip } from "@/components/admin/admin-tooltip";

function NumField({
  label, hint, value, min, max, step, onChange,
}: {
  label: string; hint: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
        {label}
        <AdminTooltip text={hint} />
      </span>
      <input
        type="number"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
      />
    </label>
  );
}

export function WorldEnvironmentConfigEditor({ config }: { config: WorldEnvironmentConfig }) {
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  function set<K extends keyof WorldEnvironmentConfig>(key: K, value: WorldEnvironmentConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateWorldEnvironmentConfig(form);
    setSaving(false);
    if (res.success) {
      sound.save();
      setMessage("Gespeichert — Welt aktualisiert sich live.");
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
          <Mountain className="h-5 w-5 text-emerald-400" />
          <span className="text-base font-bold text-zinc-100">Welt-Optik &amp; Atmosphäre</span>
          <AdminTooltip text="Steuert das Aussehen der 3D-Farmwelt: Tageszeit (Himmel/Sonne/Nebelfarbe/Lichtfarben), Nebel-Dichte, Lichtstärke, Sterne und die Dichte der Map-Strukturen (Bäume, Gras, Felsen, Ruinen, Leuchtpilze). Änderungen gelten live für alle Spieler. Erfordert Migration scripts/add-world-environment-config.cjs" />
        </div>
      }
    >
      {/* Tageszeit */}
      <div className="mb-4">
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
          Tageszeit
          <AdminTooltip text="Preset für Himmel, Sonnenstand, Nebelfarbe und Lichtfarben." />
        </span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TIME_OF_DAY_PRESETS) as TimeOfDay[]).map((k) => (
            <button
              key={k}
              type="button"
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); set("timeOfDay", k); }}
              className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                form.timeOfDay === k
                  ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                  : "border-white/10 bg-white/[0.02] text-zinc-300 hover:border-white/30"
              }`}
            >
              {TIME_OF_DAY_PRESETS[k].label}
            </button>
          ))}
        </div>
      </div>

      {/* Atmosphäre */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <NumField label="Nebel-Dichte" hint="Höher = dichter/näher. 1 = Standard." value={form.fogDensity} min={0.4} max={3} step={0.1} onChange={(v) => set("fogDensity", v)} />
        <NumField label="Umgebungslicht" hint="Helligkeit des Grundlichts. 1 = Standard." value={form.ambientIntensity} min={0} max={3} step={0.1} onChange={(v) => set("ambientIntensity", v)} />
        <NumField label="Akzentlichter" hint="Stärke der farbigen Punktlichter (lila/blau/rot). 1 = Standard." value={form.accentIntensity} min={0} max={3} step={0.1} onChange={(v) => set("accentIntensity", v)} />
        <NumField label="Sterne" hint="Menge/Helligkeit der Sterne. 0 = aus." value={form.starIntensity} min={0} max={2} step={0.1} onChange={(v) => set("starIntensity", v)} />
      </div>

      {/* Struktur-Dichten */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-5">
        <NumField label="Bäume" hint="Dichte der Bäume. 1 = Standard, 0 = keine." value={form.treeDensity} min={0} max={3} step={0.1} onChange={(v) => set("treeDensity", v)} />
        <NumField label="Gras" hint="Dichte der Grasbüschel." value={form.grassDensity} min={0} max={3} step={0.1} onChange={(v) => set("grassDensity", v)} />
        <NumField label="Felsen" hint="Dichte der Felsbrocken." value={form.rockDensity} min={0} max={3} step={0.1} onChange={(v) => set("rockDensity", v)} />
        <NumField label="Ruinen" hint="Dichte der verfallenen Steinsäulen (in Clustern)." value={form.ruinDensity} min={0} max={3} step={0.1} onChange={(v) => set("ruinDensity", v)} />
        <NumField label="Leuchtpilze" hint="Dichte der leuchtenden Pilze." value={form.mushroomDensity} min={0} max={3} step={0.1} onChange={(v) => set("mushroomDensity", v)} />
      </div>

      {/* Highlights */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <NumField label="Fireflies (Glühpartikel)" hint="Schwebende Leuchtpartikel in der Luft. 0 = aus, 2–3 = sehr dicht." value={form.fireflyDensity} min={0} max={3} step={0.1} onChange={(v) => set("fireflyDensity", v)} />
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
            Monument
            <AdminTooltip text="Leuchtendes Wahrzeichen (Obelisk + orbitierende Kristalle + Runen-Kreis) nahe dem Spawn." />
          </span>
          <button
            type="button"
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); set("monument", !form.monument); }}
            className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              form.monument
                ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                : "border-white/10 bg-white/[0.02] text-zinc-400 hover:border-white/30"
            }`}
          >
            {form.monument ? "An" : "Aus"}
          </button>
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
