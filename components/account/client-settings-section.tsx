"use client";

import { useCallback, useEffect, useState } from "react";
import { Music, Volume2, VolumeX, Palette, Check, Lock, MonitorSmartphone } from "lucide-react";
import { useTheme } from "@/components/layout/theme-provider";
import { useSoundManager } from "@/lib/sound-manager";
import { getMusicConfig } from "@/lib/actions/music";
import type { MusicConfig } from "@/lib/music-config";
import {
  getClientSettings,
  subscribeClientSettings,
  setMusicVolume,
  setMusicMuted,
  setSfxVolume,
  setSfxMuted,
  setReducedMotion,
  type ClientSettings,
} from "@/lib/client-settings";

/** A labelled 0–100% volume slider with a mute toggle. */
function VolumeRow({
  icon,
  title,
  hint,
  volume,
  muted,
  disabled,
  onVolume,
  onToggleMute,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  volume: number;
  muted: boolean;
  disabled?: boolean;
  onVolume: (v: number) => void;
  onToggleMute: () => void;
}) {
  return (
    <div className={`rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMute}
          disabled={disabled}
          aria-label={muted ? "Ton an" : "Stumm"}
          className="shrink-0 text-zinc-300 transition-colors hover:text-white disabled:cursor-not-allowed"
        >
          {muted || volume === 0 ? (
            <VolumeX className="h-5 w-5 text-zinc-500" />
          ) : (
            icon
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-200">{title}</p>
          <p className="truncate text-xs text-zinc-500">{hint}</p>
        </div>
        <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-zinc-400">
          {Math.round((muted ? 0 : volume) * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        disabled={disabled}
        onChange={(e) => onVolume(parseFloat(e.target.value))}
        className="mt-2.5 h-1.5 w-full cursor-pointer accent-purple-400 disabled:cursor-not-allowed"
        aria-label={title}
      />
    </div>
  );
}

/**
 * Central per-device client settings: theme, music + SFX volume. Notification
 * toggles live in their own section right below this one (already granular per
 * system). All values are local/live — no reload needed.
 */
export function ClientSettingsSection() {
  const theme = useTheme();
  const sound = useSoundManager();
  const [settings, setSettings] = useState<ClientSettings>(() => getClientSettings());
  const [musicCfg, setMusicCfg] = useState<MusicConfig | null>(null);

  useEffect(() => {
    // Hydrate from the store after mount (SSR has no localStorage).
    setSettings(getClientSettings());
    return subscribeClientSettings(setSettings);
  }, []);

  useEffect(() => {
    getMusicConfig().then(setMusicCfg).catch(() => {});
  }, []);

  const canMusicVolume = !!musicCfg?.userCanControl && !!musicCfg?.userCanAdjustVolume;
  const canMusicMute = !!musicCfg?.userCanControl && !!musicCfg?.userCanMute;
  const musicMax = musicCfg?.maxUserVolume ?? 1;

  const onMusicVol = useCallback(
    (v: number) => setMusicVolume(Math.min(v, musicMax)),
    [musicMax]
  );
  const onSfxVol = useCallback(
    (v: number) => {
      setSfxVolume(v);
      sound.tick(); // audible feedback at the new level
    },
    [sound]
  );

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">Client-Einstellungen</h2>

      {/* ── Theme ─────────────────────────────────────────────────────────── */}
      <div className="mb-4 rounded-2xl border border-purple-500/15 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-purple-300" />
          <span className="text-sm font-bold text-zinc-200">Design / Theme</span>
          {!theme.canChoose && (
            <span className="ml-auto flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
              <Lock className="h-3 w-3" /> Vom Admin gesperrt
            </span>
          )}
        </div>

        {theme.canChoose ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* Follow the global/admin theme */}
            <button
              type="button"
              onClick={() => { sound.click(); theme.setUserTheme(null); }}
              className={`flex flex-col items-start gap-2 rounded-xl border p-2.5 text-left transition-all ${
                theme.userTheme === null
                  ? "border-purple-400/70 bg-purple-500/10 shadow-[0_0_14px_rgba(168,85,247,0.3)]"
                  : "border-white/10 hover:border-white/30"
              }`}
            >
              <span className="flex h-8 w-full items-center justify-center rounded-lg border border-white/10 bg-black/40">
                <MonitorSmartphone className="h-4 w-4 text-zinc-400" />
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-200">
                {theme.userTheme === null && <Check className="h-3 w-3 text-purple-300" />}
                Auto (Global)
              </span>
            </button>

            {theme.catalog.map((t) => {
              const active = theme.userTheme === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  title={t.description}
                  onClick={() => { sound.click(); theme.setUserTheme(t.key); }}
                  className={`flex flex-col items-start gap-2 rounded-xl border p-2.5 text-left transition-all ${
                    active
                      ? "border-purple-400/70 shadow-[0_0_14px_rgba(168,85,247,0.3)]"
                      : "border-white/10 hover:border-white/30"
                  }`}
                  style={active ? { background: "rgba(168,85,247,0.08)" } : undefined}
                >
                  <span
                    className="h-8 w-full rounded-lg border border-white/10"
                    style={{ background: `radial-gradient(circle at 30% 30%, ${t.brand}, ${t.bg} 70%)` }}
                  />
                  <span className="flex items-center gap-1 text-[11px] font-bold text-zinc-200">
                    {active && <Check className="h-3 w-3 text-purple-300" />}
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            Der Admin hat ein festes Theme für die Seite gewählt. Eigene Designs sind aktuell deaktiviert.
          </p>
        )}
      </div>

      {/* ── Audio ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-purple-500/15 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-purple-300" />
          <span className="text-sm font-bold text-zinc-200">Audio</span>
        </div>
        <div className="flex flex-col gap-2">
          <VolumeRow
            icon={<Music className="h-5 w-5 text-purple-300" />}
            title="Hintergrundmusik"
            hint={
              musicCfg && !canMusicVolume
                ? "Lautstärke wird vom Admin vorgegeben."
                : "Lautstärke der Spielmusik."
            }
            volume={settings.musicVolume}
            muted={settings.musicMuted}
            disabled={!!musicCfg && !canMusicVolume && !canMusicMute}
            onVolume={onMusicVol}
            onToggleMute={() => { if (canMusicMute || !musicCfg) setMusicMuted(!settings.musicMuted); }}
          />
          <VolumeRow
            icon={<Volume2 className="h-5 w-5 text-purple-300" />}
            title="Soundeffekte (SFX)"
            hint="Klicks, Gewinne, Kämpfe und alle UI-Sounds."
            volume={settings.sfxVolume}
            muted={settings.sfxMuted}
            onVolume={onSfxVol}
            onToggleMute={() => setSfxMuted(!settings.sfxMuted)}
          />
        </div>
      </div>

      {/* ── Accessibility ─────────────────────────────────────────────────── */}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-purple-500/15 bg-white/[0.02] p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-200">Animationen reduzieren</p>
          <p className="text-xs text-zinc-500">Minimiert Bewegung &amp; Übergänge auf der ganzen Seite (Barrierefreiheit).</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.reducedMotion}
          onClick={() => setReducedMotion(!settings.reducedMotion)}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
          <span className={`relative block h-6 w-11 rounded-full transition-colors duration-200 ${settings.reducedMotion ? "bg-purple-600" : "bg-white/10"}`}>
            <span className={`absolute top-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${settings.reducedMotion ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
          </span>
        </button>
      </div>
    </div>
  );
}
