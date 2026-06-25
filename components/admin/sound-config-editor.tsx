"use client";

import { useState, useRef } from "react";
import { Save, RefreshCw, AlertTriangle, CheckCircle2, Volume2, Play, VolumeX } from "lucide-react";
import type { SoundConfig, SoundEventKey } from "@/lib/sound-config";
import { SOUND_EVENT_META, AVAILABLE_SOUND_FILES } from "@/lib/sound-config";
import { getSoundConfig, updateSoundConfig } from "@/lib/actions/sound-config";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";

interface SoundConfigEditorProps {
  initialConfig: SoundConfig;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function SoundConfigEditor({ initialConfig }: SoundConfigEditorProps) {
  const [config, setConfig] = useState<SoundConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function setEvent(key: SoundEventKey, patch: Partial<{ file: string; volume: number; enabled: boolean }>) {
    setConfig((c) => ({
      ...c,
      [key]: { ...c[key], ...patch },
    }));
  }

  function preview(file: string, volume: number) {
    // Skip silent placeholder
    if (file === "/sounds/none" || file === "none") return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = file;
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
      void audioRef.current.play().catch(() => {});
    } else {
      const a = new Audio(file);
      a.volume = Math.max(0, Math.min(1, volume));
      void a.play().catch(() => {});
      audioRef.current = a;
    }
  }

  async function handleSave() {
    setSaving(true); setSaveOk(false); setSaveErr("");
    const result = await updateSoundConfig(config);
    setSaving(false);
    if (result.success) { setSaveOk(true); setTimeout(() => setSaveOk(false), 2500); }
    else setSaveErr(result.error ?? "Fehler");
  }

  async function handleRefresh() {
    setLoading(true);
    const fresh = await getSoundConfig();
    setConfig(fresh);
    setLoading(false);
  }

  const grouped = groupBy(SOUND_EVENT_META, (m) => m.group);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-cyan-400" />
          <h2 className="text-base font-bold text-zinc-100">Sound Manager</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/20 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Neu laden
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-purple-600/80 px-4 py-1.5 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Speichern
          </button>
        </div>
      </div>

      {saveErr && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {saveErr}
        </div>
      )}
      {saveOk && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Gespeichert!
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Lautstärke: 0 (stumm) bis 1 (max). Änderungen werden nach dem nächsten Seitenaufruf aktiv.
        Eigene Dateipfade müssen unter <code className="rounded bg-black/30 px-1">/public/sounds/</code> liegen.
      </p>

      {Object.entries(grouped).map(([group, events]) => (
        <CollapsibleAdminRow
          key={group}
          header={
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">{group}</span>
              <span className="ml-1 text-xs text-zinc-600">({events.length})</span>
            </div>
          }
        >
          <div className="space-y-3 pt-1">
            {events.map((meta) => {
              const key = meta.key as SoundEventKey;
              const ev = config[key] ?? { file: meta.defaultFile, volume: meta.defaultVolume, enabled: true };
              return (
                <div key={key} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-black/20 p-3">
                  <div className="w-36 shrink-0">
                    <p className="text-sm font-medium text-zinc-200">{meta.label}</p>
                    <p className="text-[10px] text-zinc-500 font-mono">{key}</p>
                  </div>

                  {/* Enabled toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setEvent(key, { enabled: !ev.enabled }); }}
                    className={`rounded-lg p-1.5 transition ${ev.enabled ? "text-emerald-400 hover:bg-emerald-500/10" : "text-zinc-600 hover:bg-white/5"}`}
                    title={ev.enabled ? "Deaktivieren" : "Aktivieren"}
                  >
                    {ev.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </button>

                  {/* File selector */}
                  <div className="flex flex-1 min-w-0 flex-col gap-1">
                    <select
                      value={ev.file}
                      onChange={(e) => setEvent(key, { file: e.target.value })}
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-200 outline-none"
                    >
                      {AVAILABLE_SOUND_FILES.map((f) => (
                        <option key={f.file} value={f.file}>{f.label}</option>
                      ))}
                      {!AVAILABLE_SOUND_FILES.some((f) => f.file === ev.file) && (
                        <option value={ev.file}>{ev.file} (Custom)</option>
                      )}
                    </select>
                    {/* Custom path input */}
                    <input
                      value={ev.file}
                      onChange={(e) => setEvent(key, { file: e.target.value })}
                      placeholder="/sounds/custom.wav"
                      className="rounded-lg border border-white/5 bg-black/20 px-2 py-0.5 text-[10px] text-zinc-400 outline-none focus:border-white/20"
                    />
                  </div>

                  {/* Volume */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 w-8 text-right">{Math.round(ev.volume * 100)}%</span>
                    <input
                      type="range"
                      min={0} max={1} step={0.01}
                      value={ev.volume}
                      onChange={(e) => setEvent(key, { volume: Number(e.target.value) })}
                      className="w-24 accent-purple-500"
                    />
                  </div>

                  {/* Preview */}
                  <button
                    onClick={() => preview(ev.file, ev.volume)}
                    disabled={ev.file === "/sounds/none" || ev.file === "none"}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:border-white/20 hover:text-white disabled:opacity-30"
                  >
                    <Play className="h-3 w-3" /> Test
                  </button>
                </div>
              );
            })}
          </div>
        </CollapsibleAdminRow>
      ))}
    </div>
  );
}
