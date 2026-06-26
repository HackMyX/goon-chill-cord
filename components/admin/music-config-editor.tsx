"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Music, Plus, Trash2, Save, Check, Loader2, ChevronDown, ChevronUp,
  Volume2, Disc3, Gamepad2, Globe, Package, Store, Users, LayoutDashboard,
  AlertTriangle,
} from "lucide-react";
import { getMusicConfig, saveMusicConfig } from "@/lib/actions/music";
import {
  DEFAULT_MUSIC_CONFIG, PAGE_LABELS, PAGE_ROUTES, VIBE_LABELS,
  type MusicConfig, type MusicTrack, type MusicPageKey, type MusicVibe,
} from "@/lib/music-config";
import { useSoundManager } from "@/lib/sound-manager";

// ── Helpers ────────────────────────────────────────────────────────────────────

const PAGE_ICONS: Record<MusicPageKey, React.FC<{ className?: string }>> = {
  homepage:  Globe,
  snake:     Gamepad2,
  don:       Disc3,
  world:     Globe,
  cases:     Package,
  shop:      Store,
  community: Users,
  dashboard: LayoutDashboard,
};

const VIBE_COLORS: Record<MusicVibe, string> = {
  arcade:    "text-red-400    border-red-500/40    bg-red-500/10",
  chill:     "text-blue-400   border-blue-500/40   bg-blue-500/10",
  adventure: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
};

function genId() {
  return `trk_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Track edit row ─────────────────────────────────────────────────────────────

function TrackRow({
  track,
  onChange,
  onDelete,
}: {
  track: MusicTrack;
  onChange: (t: MusicTrack) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.015] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${VIBE_COLORS[track.vibe]}`}>
            {VIBE_LABELS[track.vibe]}
          </span>
          <span className="flex-1 truncate text-sm font-semibold text-zinc-100">{track.name}</span>
          <span className="text-xs text-zinc-500">{track.artist}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-zinc-600" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-1 flex h-6 w-6 items-center justify-center rounded text-zinc-600 hover:text-red-400 transition-colors"
          title="Track entfernen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="border-t border-white/6 px-4 py-3 grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Track-Name</label>
            <input
              type="text"
              value={track.name}
              maxLength={60}
              onChange={(e) => onChange({ ...track, name: e.target.value })}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Künstler</label>
            <input
              type="text"
              value={track.artist}
              maxLength={60}
              onChange={(e) => onChange({ ...track, artist: e.target.value })}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Vibe</label>
            <select
              value={track.vibe}
              onChange={(e) => onChange({ ...track, vibe: e.target.value as MusicVibe })}
              className="rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
            >
              {(Object.keys(VIBE_LABELS) as MusicVibe[]).map((v) => (
                <option key={v} value={v}>{VIBE_LABELS[v]}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">URL / Pfad</label>
            <input
              type="text"
              value={track.url}
              placeholder="/music/my-track.mp3 oder https://cdn.example.com/track.mp3"
              onChange={(e) => onChange({ ...track, url: e.target.value })}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60 placeholder-zinc-600"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main editor ────────────────────────────────────────────────────────────────

export function MusicConfigEditor() {
  const [config, setConfig] = useState<MusicConfig>(DEFAULT_MUSIC_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();

  useEffect(() => {
    getMusicConfig().then((cfg) => {
      setConfig(cfg);
      setLoading(false);
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const res = await saveMusicConfig(config);
    setSaving(false);
    if (res.success) {
      sound.save();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      sound.error();
      setError(res.error ?? "Fehler beim Speichern.");
    }
  }, [config, sound]);

  const updateTrack = useCallback((idx: number, t: MusicTrack) => {
    setConfig((c) => {
      const tracks = [...c.tracks];
      tracks[idx] = t;
      return { ...c, tracks };
    });
  }, []);

  const deleteTrack = useCallback((idx: number) => {
    setConfig((c) => {
      const tracks = c.tracks.filter((_, i) => i !== idx);
      // Clear page assignments pointing to deleted track
      const deletedId = c.tracks[idx].id;
      const pageAssignments = { ...c.pageAssignments };
      for (const k of Object.keys(pageAssignments) as MusicPageKey[]) {
        if (pageAssignments[k] === deletedId) pageAssignments[k] = null;
      }
      return { ...c, tracks, pageAssignments };
    });
  }, []);

  const addTrack = useCallback(() => {
    setConfig((c) => ({
      ...c,
      tracks: [...c.tracks, { id: genId(), name: "Neuer Track", artist: "", vibe: "chill", url: "" }],
    }));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-zinc-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Lade Musik-Konfiguration…
      </div>
    );
  }

  const trackOptions = [{ value: "", label: "— Kein Musik —" }, ...config.tracks.map((t) => ({ value: t.id, label: `${t.name} (${VIBE_LABELS[t.vibe]})` }))];

  return (
    <div className="flex flex-col gap-5">
      {/* Header + save */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Music className="h-5 w-5 text-purple-400" />
          <div>
            <p className="text-base font-extrabold text-zinc-100">Musik-System</p>
            <p className="text-[11px] text-zinc-500">Hintergrundmusik pro Seite konfigurieren</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-5 py-2 text-sm font-bold text-purple-300 hover:bg-purple-500/20 transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4 text-emerald-400" /> : <Save className="h-4 w-4" />}
          {saved ? "Gespeichert!" : "Speichern"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Global Settings ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Globale Einstellungen</p>
        <div className="flex flex-wrap gap-6">
          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-300">Musik aktiviert</label>
            <button
              type="button"
              onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
              className={`relative h-6 w-11 rounded-full border transition-colors ${config.enabled ? "border-purple-500/60 bg-purple-500/30" : "border-zinc-700 bg-zinc-800"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-all ${config.enabled ? "left-5 bg-purple-400" : "left-0.5 bg-zinc-600"}`} />
            </button>
          </div>

          {/* Default volume */}
          <div className="flex items-center gap-3">
            <Volume2 className="h-4 w-4 text-zinc-500" />
            <label className="text-sm text-zinc-300">Standard-Lautstärke</label>
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={config.defaultVolume}
              onChange={(e) => setConfig((c) => ({ ...c, defaultVolume: parseFloat(e.target.value) }))}
              className="w-24 accent-purple-400"
            />
            <span className="w-10 text-right text-sm font-bold text-purple-300 tabular-nums">
              {Math.round(config.defaultVolume * 100)}%
            </span>
          </div>

          {/* Fade in */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-300">Fade-In</label>
            <select
              value={config.fadeInMs}
              onChange={(e) => setConfig((c) => ({ ...c, fadeInMs: Number(e.target.value) }))}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1 text-xs text-zinc-100 outline-none"
            >
              <option value={600}>0.6s</option>
              <option value={1200}>1.2s</option>
              <option value={2000}>2.0s</option>
              <option value={3000}>3.0s</option>
            </select>
          </div>

          {/* Fade out */}
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-300">Fade-Out</label>
            <select
              value={config.fadeOutMs}
              onChange={(e) => setConfig((c) => ({ ...c, fadeOutMs: Number(e.target.value) }))}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1 text-xs text-zinc-100 outline-none"
            >
              <option value={300}>0.3s</option>
              <option value={500}>0.5s</option>
              <option value={800}>0.8s</option>
              <option value={1200}>1.2s</option>
            </select>
          </div>
        </div>

        {/* Info hint */}
        <div className="mt-4 rounded-xl border border-amber-900/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-300/80">
          <strong>Tracks hinzufügen:</strong> Lege MP3-Dateien in <code className="rounded bg-black/40 px-1 py-0.5">/public/music/</code> ab und trag den Pfad im Track-Editor ein. Alternativ sind auch externe URLs (https://…) möglich — stelle sicher, dass die Quelle CORS-frei erreichbar ist.
        </div>
      </div>

      {/* ── Page Assignments ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-zinc-500">Musik pro Seite</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PAGE_ROUTES.map((pageKey) => {
            const Icon = PAGE_ICONS[pageKey];
            const currentId = config.pageAssignments[pageKey] ?? "";
            const currentTrack = config.tracks.find((t) => t.id === currentId);
            return (
              <div key={pageKey} className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.01] px-3 py-2.5">
                <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
                <span className="w-28 shrink-0 text-xs font-semibold text-zinc-300">{PAGE_LABELS[pageKey]}</span>
                <select
                  value={currentId}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      pageAssignments: { ...c.pageAssignments, [pageKey]: e.target.value || null },
                    }))
                  }
                  className="flex-1 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
                >
                  {trackOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {currentTrack && (
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${VIBE_COLORS[currentTrack.vibe]}`}>
                    {VIBE_LABELS[currentTrack.vibe]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Track Library ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
            Track-Bibliothek <span className="ml-1 text-zinc-600">({config.tracks.length} Tracks)</span>
          </p>
          <button
            type="button"
            onClick={addTrack}
            className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-bold text-purple-300 hover:bg-purple-500/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Track hinzufügen
          </button>
        </div>

        {config.tracks.length === 0 ? (
          <p className="text-sm text-zinc-600">Keine Tracks. Füge deinen ersten Track oben hinzu.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {config.tracks.map((track, idx) => (
              <TrackRow
                key={track.id}
                track={track}
                onChange={(t) => updateTrack(idx, t)}
                onDelete={() => deleteTrack(idx)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
