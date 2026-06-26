"use client";

import { useState } from "react";
import { Save, Loader2, Skull } from "lucide-react";
import { updateWorldSpawnConfig } from "@/lib/actions/world-spawn";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import type { WorldSpawnConfig } from "@/lib/world-spawn-config";
import { useSoundManager } from "@/lib/sound-manager";
import { AdminTooltip } from "@/components/admin/admin-tooltip";

function NumField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
        {label}
        <AdminTooltip text={hint} />
      </span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
      />
    </label>
  );
}

export function WorldSpawnConfigEditor({ config }: { config: WorldSpawnConfig }) {
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  function set<K extends keyof WorldSpawnConfig>(key: K, value: WorldSpawnConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    sound.click();
    const res = await updateWorldSpawnConfig(form);
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
          <Skull className="h-5 w-5 text-rose-400" />
          <span className="text-base font-bold text-zinc-100">Monster-Spawn</span>
          <AdminTooltip text="Steuert, wie und wie viele Monster in der 3D-Welt erscheinen. Diese Einstellungen sind global und gelten für alle laufenden Spieler-Sessions sofort." />
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumField
          label="Max. lebende Monster (1 Spieler)"
          hint="Wie viele Monster gleichzeitig für einen einzelnen Spieler aktiv sein können."
          value={form.maxAliveMonsters}
          min={1} max={200} step={1}
          onChange={(v) => set("maxAliveMonsters", v)}
        />
        <NumField
          label="Alive-Cap-Zuwachs pro extra Spieler"
          hint="So viel erhöht sich die Obergrenze pro weiterem Spieler im selben Raum."
          value={form.aliveCapPerExtraPlayer}
          min={0} max={50} step={1}
          onChange={(v) => set("aliveCapPerExtraPlayer", v)}
        />
        <NumField
          label="Alive-Cap-Maximum"
          hint="Absolutes Maximum, egal wie viele Spieler im Raum sind."
          value={form.aliveCapMax}
          min={1} max={500} step={1}
          onChange={(v) => set("aliveCapMax", v)}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumField
          label="Spawn-Intervall Min (Sekunden)"
          hint="Mindestwartezeit zwischen zwei Spawn-Versuchen."
          value={form.spawnIntervalMinSec}
          min={0.1} max={60} step={0.1}
          onChange={(v) => set("spawnIntervalMinSec", v)}
        />
        <NumField
          label="Spawn-Intervall Max (Sekunden)"
          hint="Maximale Wartezeit — tatsächliches Intervall wird zufällig zwischen Min und Max gewählt."
          value={form.spawnIntervalMaxSec}
          min={0.1} max={120} step={0.1}
          onChange={(v) => set("spawnIntervalMaxSec", v)}
        />
        <NumField
          label="Spawn-Intervall-Floor (0–1)"
          hint="Untere Grenze für den Multiplikator, der das Intervall bei mehr Spielern verkürzt — verhindert zu schnelles Spawnen."
          value={form.spawnIntervalFloor}
          min={0.05} max={1} step={0.05}
          onChange={(v) => set("spawnIntervalFloor", v)}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumField
          label="Sicherheitsradius (Einheiten)"
          hint="Keine Spawns innerhalb dieses Radius vom Mittelpunkt — verhindert Spawns direkt auf dem Startpunkt."
          value={form.spawnSafeRadius}
          min={0} max={60} step={1}
          onChange={(v) => set("spawnSafeRadius", v)}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumField
          label="Cross-Aggro-Dauer (Sekunden)"
          hint="Wie lange ALLE Monster des angegriffenen Spielers auf den Angreifer losgehen, wenn ein Monster getroffen wird. 0 = Feature deaktiviert. Erfordert DB-Migration: scripts/add-cross-player-aggro.mjs"
          value={form.crossPlayerAggroDurationSec}
          min={0} max={120} step={1}
          onChange={(v) => set("crossPlayerAggroDurationSec", v)}
        />
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
