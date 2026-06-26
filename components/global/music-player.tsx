"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Music, VolumeX, Volume1, Volume2 } from "lucide-react";
import { getMusicConfig } from "@/lib/actions/music";
import type { MusicConfig, MusicPageKey } from "@/lib/music-config";

const LS_VOL   = "gn_music_vol";
const LS_MUTED = "gn_music_muted";

function getPageKey(pathname: string): MusicPageKey {
  if (pathname.startsWith("/snake"))     return "snake";
  if (pathname.startsWith("/don"))       return "don";
  if (pathname.startsWith("/world"))     return "world";
  if (pathname.startsWith("/cases"))     return "cases";
  if (pathname.startsWith("/shop"))      return "shop";
  if (pathname.startsWith("/community")) return "community";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  return "homepage";
}

export function MusicPlayer() {
  const pathname   = usePathname();
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const fadeRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeUrlRef   = useRef<string | null>(null);
  const interactedRef  = useRef(false);
  const pendingUrlRef  = useRef<string | null>(null); // track waiting for first interaction

  const [config, setConfig]     = useState<MusicConfig | null>(null);
  const [volume, setVolume]     = useState(0.12);
  const [muted, setMuted]       = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackName, setTrackName] = useState<string | null>(null);
  const [hovered, setHovered]   = useState(false);

  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const mutedRef  = useRef(muted);
  mutedRef.current = muted;
  const configRef = useRef(config);
  configRef.current = config;

  // ── Create audio element once on mount ──────────────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.loop     = true;
    audio.preload  = "auto";
    audioRef.current = audio;

    // Restore user prefs from localStorage
    const savedVol   = localStorage.getItem(LS_VOL);
    const savedMuted = localStorage.getItem(LS_MUTED);
    if (savedVol !== null) {
      const v = parseFloat(savedVol);
      setVolume(v);
      volumeRef.current = v;
    }
    if (savedMuted !== null) {
      const m = savedMuted === "true";
      setMuted(m);
      mutedRef.current = m;
    }

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  // ── Load music config ────────────────────────────────────────────────────────
  useEffect(() => {
    getMusicConfig().then(setConfig);
  }, []);

  // ── Fade helpers ─────────────────────────────────────────────────────────────
  const clearFade = useCallback(() => {
    if (fadeRef.current) { clearInterval(fadeRef.current); fadeRef.current = null; }
  }, []);

  const fadeIn = useCallback((audio: HTMLAudioElement, targetVol: number, durationMs: number) => {
    clearFade();
    audio.volume = 0;
    const steps  = Math.max(1, Math.round(durationMs / 50));
    const step   = targetVol / steps;
    let v = 0;
    fadeRef.current = setInterval(() => {
      v = Math.min(v + step, targetVol);
      audio.volume = mutedRef.current ? 0 : v;
      if (v >= targetVol) clearFade();
    }, 50);
  }, [clearFade]);

  const fadeOut = useCallback((audio: HTMLAudioElement, durationMs: number, onDone: () => void) => {
    clearFade();
    const startVol = audio.volume;
    if (startVol < 0.005) { audio.pause(); onDone(); return; }
    const steps = Math.max(1, Math.round(durationMs / 50));
    const step  = startVol / steps;
    fadeRef.current = setInterval(() => {
      const next = Math.max(audio.volume - step, 0);
      audio.volume = next;
      if (next <= 0.005) {
        clearFade();
        audio.pause();
        onDone();
      }
    }, 50);
  }, [clearFade]);

  // ── Core: load & play a track URL ─────────────────────────────────────────
  const loadAndPlay = useCallback((url: string) => {
    const audio = audioRef.current;
    const cfg   = configRef.current;
    if (!audio || !cfg) return;

    if (activeUrlRef.current === url && !audio.paused) return; // already playing this track

    activeUrlRef.current = url;
    audio.src = url;
    audio.currentTime = 0;
    audio.volume = 0;
    audio.play()
      .then(() => {
        fadeIn(audio, mutedRef.current ? 0 : volumeRef.current, cfg.fadeInMs);
        setIsPlaying(true);
      })
      .catch(() => {
        // Autoplay blocked — keep pendingUrlRef so first-interaction handler retries
        pendingUrlRef.current = url;
        activeUrlRef.current = null;
      });
  }, [fadeIn]);

  // ── Decide track for current pathname ──────────────────────────────────────
  const applyRoute = useCallback((pn: string) => {
    const cfg = configRef.current;
    if (!cfg?.enabled) return;

    const pageKey = getPageKey(pn);
    const trackId = cfg.pageAssignments[pageKey] ?? null;
    const track   = trackId ? cfg.tracks.find((t) => t.id === trackId) : null;
    const audio   = audioRef.current;

    if (!track) {
      // No music for this page — fade out
      if (audio && !audio.paused) {
        fadeOut(audio, cfg.fadeOutMs, () => {
          setIsPlaying(false);
          setTrackName(null);
          activeUrlRef.current = null;
        });
      }
      return;
    }

    setTrackName(track.name);

    if (!audio) return;
    if (activeUrlRef.current === track.url && !audio.paused) return; // same track

    if (!audio.paused && activeUrlRef.current !== track.url) {
      // Different track — crossfade
      fadeOut(audio, cfg.fadeOutMs, () => loadAndPlay(track.url));
    } else {
      loadAndPlay(track.url);
    }
  }, [fadeOut, loadAndPlay]);

  // ── First user interaction — start music ─────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (interactedRef.current) return;
      interactedRef.current = true;

      // If a track was blocked by autoplay policy, retry it now
      if (pendingUrlRef.current) {
        loadAndPlay(pendingUrlRef.current);
        pendingUrlRef.current = null;
      } else {
        applyRoute(pathname);
      }
    };
    document.addEventListener("click",      handler, { once: true, passive: true });
    document.addEventListener("touchstart", handler, { once: true, passive: true });
    document.addEventListener("keydown",    handler, { once: true, passive: true });
    return () => {
      document.removeEventListener("click",      handler);
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("keydown",    handler);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Route changes ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!config?.enabled) return;
    if (!interactedRef.current) return; // not yet unlocked
    applyRoute(pathname);
  }, [pathname, config, applyRoute]);

  // ── Config loaded after first interaction ──────────────────────────────────
  useEffect(() => {
    if (!config?.enabled) return;
    if (!interactedRef.current) return;
    applyRoute(pathname);
  // Only fire when config first arrives (not on every pathname change — applyRoute effect handles that)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // ── Volume / mute live sync ────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    volumeRef.current = v;
    localStorage.setItem(LS_VOL, String(v));
    if (v > 0 && muted) {
      setMuted(false);
      mutedRef.current = false;
      localStorage.setItem(LS_MUTED, "false");
    }
  }, [muted]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      localStorage.setItem(LS_MUTED, String(next));
      const audio = audioRef.current;
      if (audio && !audio.paused) audio.volume = next ? 0 : volumeRef.current;
      return next;
    });
  }, []);

  // Don't render the player at all if music is globally disabled
  if (!config?.enabled) return null;

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.4 ? Volume1 : Volume2;

  return (
    <div
      className="fixed bottom-4 left-4 z-[45] flex items-center gap-2.5 rounded-full border border-white/10 bg-black/70 px-3 py-2 shadow-xl backdrop-blur-md transition-all"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Music icon — decorative, always visible */}
      <Music className={`h-3.5 w-3.5 shrink-0 ${isPlaying ? "text-purple-400 animate-pulse" : "text-zinc-600"}`} />

      {/* Mute toggle */}
      <button
        type="button"
        onClick={handleToggleMute}
        className={`shrink-0 transition-colors ${muted ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-300 hover:text-white"}`}
        aria-label={muted ? "Stummschaltung aufheben" : "Musik stummschalten"}
        title={muted ? "Stummschaltung aufheben" : "Stummschalten"}
      >
        <VolumeIcon className="h-3.5 w-3.5" />
      </button>

      {/* Volume slider */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={handleVolumeChange}
        className="w-18 h-1 cursor-pointer accent-purple-400"
        style={{ width: 72 }}
        aria-label="Musiklautstärke"
        title={`Lautstärke: ${Math.round((muted ? 0 : volume) * 100)}%`}
      />

      {/* Volume % */}
      <span className="w-6 text-right text-[10px] font-bold text-zinc-500 tabular-nums">
        {Math.round((muted ? 0 : volume) * 100)}%
      </span>

      {/* Track name — visible on hover when playing */}
      {hovered && isPlaying && trackName && (
        <span className="max-w-[110px] truncate border-l border-white/10 pl-2.5 text-[10px] text-zinc-400">
          {trackName}
        </span>
      )}
    </div>
  );
}
