"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Music, Plus, Trash2, Save, Check, Loader2, ChevronDown, ChevronUp,
  Volume2, VolumeX, AlertTriangle, Play, Square, Eye, EyeOff,
  Home, Gamepad2, Disc3, Globe, Package, Store, Users, LayoutDashboard,
  CircleDot, Award, ShoppingBag, Gavel, ArrowLeftRight, ClipboardList,
  UserCog, Pickaxe, Shield, Settings, Cpu, Info,
} from "lucide-react";
import { getMusicConfig, saveMusicConfig } from "@/lib/actions/music";
import {
  DEFAULT_MUSIC_CONFIG, PAGE_LABELS, PAGE_ROUTES, VIBE_LABELS,
  type MusicConfig, type MusicTrack, type MusicPageKey, type MusicVibe,
} from "@/lib/music-config";
import { useSoundManager } from "@/lib/sound-manager";

// ── Vibe colors ────────────────────────────────────────────────────────────────

const VIBE_COLORS: Record<MusicVibe, string> = {
  arcade:     "text-red-400     border-red-500/40     bg-red-500/10",
  chill:      "text-blue-400    border-blue-500/40    bg-blue-500/10",
  adventure:  "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  electronic: "text-cyan-400    border-cyan-500/40    bg-cyan-500/10",
  retro:      "text-yellow-400  border-yellow-500/40  bg-yellow-500/10",
  ambient:    "text-indigo-400  border-indigo-500/40  bg-indigo-500/10",
  epic:       "text-orange-400  border-orange-500/40  bg-orange-500/10",
};

// ── Page icons ─────────────────────────────────────────────────────────────────

const PAGE_ICONS: Record<MusicPageKey, React.FC<{ className?: string }>> = {
  homepage:   Home,
  snake:      Gamepad2,
  don:        Disc3,
  world:      Globe,
  cases:      Package,
  shop:       Store,
  community:  Users,
  dashboard:  LayoutDashboard,
  plinko:     CircleDot,
  battlepass: Award,
  garderobe:  ShoppingBag,
  auctions:   Gavel,
  trading:    ArrowLeftRight,
  surveys:    ClipboardList,
  account:    UserCog,
  mine:       Pickaxe,
  mod:        Shield,
  admin:      Cpu,
};

// ── Small toggle component ─────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <div className="relative mt-0.5 shrink-0">
        <div
          onClick={() => onChange(!checked)}
          className={`h-6 w-11 rounded-full border transition-colors cursor-pointer ${
            checked ? "border-purple-500/60 bg-purple-500/30" : "border-zinc-700 bg-zinc-800"
          }`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-all ${
            checked ? "left-5 bg-purple-400" : "left-0.5 bg-zinc-600"
          }`} />
        </div>
      </div>
      <div>
        <p className="text-sm text-zinc-200">{label}</p>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

// ── Track row with test button ─────────────────────────────────────────────────

type PreviewState = "idle" | "loading" | "playing" | "error";

function TrackRow({
  track,
  onChange,
  onDelete,
  previewingId,
  previewState,
  onTogglePreview,
}: {
  track: MusicTrack;
  onChange: (t: MusicTrack) => void;
  onDelete: () => void;
  previewingId: string | null;
  previewState: PreviewState;
  onTogglePreview: (track: MusicTrack) => void;
}) {
  const [open, setOpen] = useState(false);
  const isThisPlaying = previewingId === track.id;

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.015] overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2.5 text-left min-w-0"
        >
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${VIBE_COLORS[track.vibe]}`}>
            {VIBE_LABELS[track.vibe]}
          </span>
          <span className="flex-1 truncate text-sm font-semibold text-zinc-100">{track.name}</span>
          <span className="shrink-0 text-xs text-zinc-500 truncate max-w-[90px]">{track.artist}</span>
          {open ? <ChevronUp className="shrink-0 h-3.5 w-3.5 text-zinc-600" /> : <ChevronDown className="shrink-0 h-3.5 w-3.5 text-zinc-600" />}
        </button>

        {/* Test button */}
        <button
          type="button"
          onClick={() => onTogglePreview(track)}
          title={isThisPlaying ? "Test stoppen" : "Vorschau abspielen"}
          className={`shrink-0 flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
            isThisPlaying
              ? "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
              : "border-purple-500/30 bg-purple-500/8 text-purple-300 hover:bg-purple-500/15"
          }`}
        >
          {isThisPlaying && previewState === "loading" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isThisPlaying ? (
            <Square className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          <span className="ml-0.5">
            {isThisPlaying && previewState === "loading" ? "Lädt…" : isThisPlaying ? "Stop" : "Test"}
          </span>
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded text-zinc-600 hover:text-red-400 transition-colors"
          title="Track entfernen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded editor */}
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
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Vibe / Stil</label>
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
              placeholder="/music/mein-track.mp3  oder  https://cdn.example.com/track.mp3"
              onChange={(e) => onChange({ ...track, url: e.target.value })}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60 placeholder-zinc-600"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.FC<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 border border-purple-500/20">
        <Icon className="h-3.5 w-3.5 text-purple-400" />
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">{title}</p>
        {subtitle && <p className="text-[10px] text-zinc-600">{subtitle}</p>}
      </div>
    </div>
  );
}

function genId() {
  return `trk_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Main editor ────────────────────────────────────────────────────────────────

export function MusicConfigEditor() {
  const [config, setConfig]   = useState<MusicConfig>(DEFAULT_MUSIC_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const sound = useSoundManager();

  // Preview audio
  const previewAudioRef                 = useRef<HTMLAudioElement | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");

  // Track library vibe filter
  const [vibeFilter, setVibeFilter] = useState<MusicVibe | "all">("all");

  useEffect(() => {
    getMusicConfig().then((cfg) => { setConfig(cfg); setLoading(false); });
  }, []);

  // Cleanup preview on unmount
  useEffect(() => {
    return () => { previewAudioRef.current?.pause(); };
  }, []);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewingId(null);
    setPreviewState("idle");
  }, []);

  const togglePreview = useCallback((track: MusicTrack) => {
    if (previewingId === track.id) { stopPreview(); return; }
    stopPreview();
    if (!track.url) return;

    const audio = new Audio(track.url);
    audio.volume = Math.min(config.defaultVolume * 2, 0.4);
    previewAudioRef.current = audio;
    setPreviewingId(track.id);
    setPreviewState("loading");

    audio.addEventListener("playing", () => setPreviewState("playing"), { once: true });
    audio.addEventListener("error",   () => { setPreviewingId(null); setPreviewState("error"); }, { once: true });
    audio.addEventListener("ended",   () => { setPreviewingId(null); setPreviewState("idle"); },  { once: true });
    audio.play().catch(() => { setPreviewingId(null); setPreviewState("error"); });
  }, [previewingId, stopPreview, config.defaultVolume]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    stopPreview();
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
  }, [config, sound, stopPreview]);

  const updateTrack = useCallback((idx: number, t: MusicTrack) => {
    setConfig((c) => { const tracks = [...c.tracks]; tracks[idx] = t; return { ...c, tracks }; });
  }, []);

  const deleteTrack = useCallback((idx: number) => {
    setConfig((c) => {
      const deletedId = c.tracks[idx].id;
      const tracks = c.tracks.filter((_, i) => i !== idx);
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
        <Loader2 className="h-4 w-4 animate-spin" /> Lade Musik-Konfiguration…
      </div>
    );
  }

  const trackOptions = [
    { value: "", label: "— Kein Musik —" },
    ...config.tracks.map((t) => ({ value: t.id, label: `${t.name}  ·  ${VIBE_LABELS[t.vibe]}` })),
  ];

  const filteredTracks = vibeFilter === "all"
    ? config.tracks
    : config.tracks.filter((t) => t.vibe === vibeFilter);

  return (
    <div className="flex flex-col gap-5">

      {/* ── Header + Save ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Music className="h-5 w-5 text-purple-400" />
          <div>
            <p className="text-base font-extrabold text-zinc-100">Musik-System</p>
            <p className="text-[11px] text-zinc-500">
              {config.tracks.length} Tracks · {PAGE_ROUTES.length} Seiten · {config.enabled ? "Aktiviert" : "Deaktiviert"}
            </p>
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
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── System-Einstellungen ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <SectionHeader icon={Settings} title="System-Einstellungen" subtitle="Globale Musik-Konfiguration" />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Toggle
            checked={config.enabled}
            onChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
            label="Musik aktiviert"
            description="Schaltet das gesamte Musik-System ein oder aus."
          />
          <Toggle
            checked={config.showPlayerUI}
            onChange={(v) => setConfig((c) => ({ ...c, showPlayerUI: v }))}
            label="Player-Widget anzeigen"
            description="Zeigt das Widget unten links. Wenn aus: Musik spielt unsichtbar im Hintergrund."
          />
        </div>

        {/* Default volume */}
        <div className="mt-5 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-zinc-500" />
            <span className="text-sm text-zinc-300">Standard-Lautstärke</span>
            <span className="ml-auto text-sm font-bold text-purple-300 tabular-nums">
              {Math.round(config.defaultVolume * 100)}%
            </span>
          </div>
          <input
            type="range" min={0} max={1} step={0.01}
            value={config.defaultVolume}
            onChange={(e) => setConfig((c) => ({ ...c, defaultVolume: parseFloat(e.target.value) }))}
            className="w-full accent-purple-400"
            style={{ height: "6px" }}
          />
          <p className="text-[10px] text-zinc-600">Startlautstärke für neue Besucher (wird von gespeicherten User-Einstellungen überschrieben).</p>
        </div>

        {/* Fade times */}
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">Fade-In</span>
              <span className="text-sm font-bold text-purple-300 tabular-nums">{(config.fadeInMs / 1000).toFixed(1)}s</span>
            </div>
            <input
              type="range" min={300} max={5000} step={100}
              value={config.fadeInMs}
              onChange={(e) => setConfig((c) => ({ ...c, fadeInMs: Number(e.target.value) }))}
              className="w-full accent-purple-400"
              style={{ height: "6px" }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">Fade-Out</span>
              <span className="text-sm font-bold text-purple-300 tabular-nums">{(config.fadeOutMs / 1000).toFixed(1)}s</span>
            </div>
            <input
              type="range" min={100} max={3000} step={100}
              value={config.fadeOutMs}
              onChange={(e) => setConfig((c) => ({ ...c, fadeOutMs: Number(e.target.value) }))}
              className="w-full accent-purple-400"
              style={{ height: "6px" }}
            />
          </div>
        </div>

        {/* Info hint */}
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-900/30 bg-amber-950/20 px-4 py-3">
          <Info className="h-4 w-4 shrink-0 text-amber-400/70 mt-0.5" />
          <p className="text-xs text-amber-300/70">
            <strong>Tracks hinzufügen:</strong> MP3-Dateien in{" "}
            <code className="rounded bg-black/40 px-1 py-0.5">/public/music/</code> ablegen, dann Pfad im Track-Editor eintragen.
            Externe HTTPS-URLs ebenfalls möglich — CORS muss erlaubt sein.
            Der <strong>Test-Button</strong> prüft ob die URL lädt.
          </p>
        </div>
      </div>

      {/* ── User-Steuerung ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <SectionHeader icon={UserCog} title="User-Steuerung" subtitle="Was dürfen normale User einstellen?" />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Toggle
            checked={config.userCanControl}
            onChange={(v) => setConfig((c) => ({ ...c, userCanControl: v }))}
            label="Player-Widget für User sichtbar"
            description="Wenn aus: Widget komplett ausgeblendet, User haben keinerlei Kontrolle."
          />
          <Toggle
            checked={config.userCanMute}
            onChange={(v) => setConfig((c) => ({ ...c, userCanMute: v }))}
            label="Stummschalten erlauben"
            description="User können auf den Lautsprecher-Button klicken um Musik zu muten."
          />
          <Toggle
            checked={config.userCanAdjustVolume}
            onChange={(v) => setConfig((c) => ({ ...c, userCanAdjustVolume: v }))}
            label="Lautstärke anpassen erlauben"
            description="User können den Lautstärke-Slider verschieben."
          />
        </div>

        {/* Max user volume */}
        <div className="mt-5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-zinc-500" />
              <span className="text-sm text-zinc-300">Max. User-Lautstärke</span>
            </div>
            <span className="text-sm font-bold text-purple-300 tabular-nums">
              {Math.round(config.maxUserVolume * 100)}%
            </span>
          </div>
          <input
            type="range" min={0.1} max={1} step={0.05}
            value={config.maxUserVolume}
            onChange={(e) => setConfig((c) => ({ ...c, maxUserVolume: parseFloat(e.target.value) }))}
            className="w-full accent-purple-400"
            style={{ height: "6px" }}
          />
          <p className="text-[10px] text-zinc-600">User können die Lautstärke nicht über diesen Wert hinaus erhöhen. Standard: 100%.</p>
        </div>

        {/* Status summary badges */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-bold ${config.userCanControl ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-700 bg-zinc-800/50 text-zinc-500"}`}>
            {config.userCanControl ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            Widget {config.userCanControl ? "sichtbar" : "versteckt"}
          </span>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${config.userCanMute ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-700 bg-zinc-800/50 text-zinc-500"}`}>
            Muten {config.userCanMute ? "erlaubt" : "gesperrt"}
          </span>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${config.userCanAdjustVolume ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-700 bg-zinc-800/50 text-zinc-500"}`}>
            Lautstärke {config.userCanAdjustVolume ? "frei" : "gesperrt"}
          </span>
          <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[11px] font-bold text-purple-300">
            Max {Math.round(config.maxUserVolume * 100)}%
          </span>
        </div>
      </div>

      {/* ── Musik pro Seite ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <SectionHeader icon={Music} title="Musik pro Seite" subtitle="Welcher Track läuft auf welcher Seite?" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PAGE_ROUTES.map((pageKey) => {
            const Icon = PAGE_ICONS[pageKey];
            const currentId    = config.pageAssignments[pageKey] ?? "";
            const currentTrack = config.tracks.find((t) => t.id === currentId);
            return (
              <div key={pageKey} className="flex items-center gap-2.5 rounded-xl border border-white/6 bg-white/[0.01] px-3 py-2.5">
                <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
                <span className="w-32 shrink-0 text-xs font-semibold text-zinc-300">{PAGE_LABELS[pageKey]}</span>
                <select
                  value={currentId}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      pageAssignments: { ...c.pageAssignments, [pageKey]: e.target.value || null },
                    }))
                  }
                  className="flex-1 min-w-0 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
                >
                  {trackOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {currentTrack && (
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${VIBE_COLORS[currentTrack.vibe]}`}>
                    {VIBE_LABELS[currentTrack.vibe].split(" ")[0]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Track-Bibliothek ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SectionHeader
            icon={Music}
            title={`Track-Bibliothek (${config.tracks.length})`}
            subtitle="Test-Button prüft ob die URL lädt und spielt sie kurz ab."
          />
          <button
            type="button"
            onClick={addTrack}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-bold text-purple-300 hover:bg-purple-500/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Track hinzufügen
          </button>
        </div>

        {/* Vibe filter pills */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setVibeFilter("all")}
            className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
              vibeFilter === "all"
                ? "border-purple-500/40 bg-purple-500/15 text-purple-300"
                : "border-white/10 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Alle ({config.tracks.length})
          </button>
          {(Object.keys(VIBE_LABELS) as MusicVibe[]).map((v) => {
            const count = config.tracks.filter((t) => t.vibe === v).length;
            if (count === 0) return null;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setVibeFilter(v)}
                className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                  vibeFilter === v ? VIBE_COLORS[v] : "border-white/10 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {VIBE_LABELS[v]} ({count})
              </button>
            );
          })}
        </div>

        {/* Preview status bar */}
        {previewingId && (
          <div className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
            previewState === "playing" ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-300"
            : previewState === "loading" ? "border-yellow-500/30 bg-yellow-500/8 text-yellow-300"
            : "border-red-500/30 bg-red-500/8 text-red-300"
          }`}>
            {previewState === "playing" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            {previewState === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {previewState === "playing"
              ? `Spielt: ${config.tracks.find((t) => t.id === previewingId)?.name}`
              : previewState === "loading"
              ? "Audio-Datei wird geladen…"
              : "Fehler: URL nicht erreichbar oder CORS nicht erlaubt"}
            <button type="button" onClick={stopPreview} className="ml-auto text-zinc-500 hover:text-zinc-300 transition-colors" title="Vorschau stoppen">
              <VolumeX className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {filteredTracks.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-600">
            {config.tracks.length === 0
              ? "Keine Tracks vorhanden. Füge deinen ersten Track hinzu."
              : "Keine Tracks für diesen Filter."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredTracks.map((track) => {
              const idx = config.tracks.indexOf(track);
              return (
                <TrackRow
                  key={track.id}
                  track={track}
                  onChange={(t) => updateTrack(idx, t)}
                  onDelete={() => deleteTrack(idx)}
                  previewingId={previewingId}
                  previewState={previewState}
                  onTogglePreview={togglePreview}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
