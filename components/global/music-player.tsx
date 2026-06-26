"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Music, VolumeX, Volume1, Volume2 } from "lucide-react";
import { getMusicConfig } from "@/lib/actions/music";
import { MusicSynth } from "@/lib/music-synth";
import type { MusicConfig, MusicPageKey } from "@/lib/music-config";

const LS_VOL   = "gn_music_vol";
const LS_MUTED = "gn_music_muted";

function getPageKey(pathname: string): MusicPageKey {
  if (pathname.startsWith("/snake"))      return "snake";
  if (pathname.startsWith("/don"))        return "don";
  if (pathname.startsWith("/world"))      return "world";
  if (pathname.startsWith("/cases"))      return "cases";
  if (pathname.startsWith("/shop"))       return "shop";
  if (pathname.startsWith("/community"))  return "community";
  if (pathname.startsWith("/dashboard"))  return "dashboard";
  if (pathname.startsWith("/plinko"))     return "plinko";
  if (pathname.startsWith("/battlepass")) return "battlepass";
  if (pathname.startsWith("/garderobe"))  return "garderobe";
  if (pathname.startsWith("/auctions"))   return "auctions";
  if (pathname.startsWith("/trading"))    return "trading";
  if (pathname.startsWith("/surveys"))    return "surveys";
  if (pathname.startsWith("/account"))    return "account";
  if (pathname.startsWith("/mine"))       return "mine";
  if (pathname.startsWith("/mod"))        return "mod";
  if (pathname.startsWith("/admin"))      return "admin";
  return "homepage";
}

export function MusicPlayer() {
  const pathname   = usePathname();

  // ── File-based audio (non-synth:// tracks) ─────────────────────────────────
  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const fadeRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Synth tracks ────────────────────────────────────────────────────────────
  const synthRef       = useRef<MusicSynth | null>(null);

  // ── Shared state ────────────────────────────────────────────────────────────
  const activeUrlRef   = useRef<string | null>(null);
  const activeIsSynth  = useRef(false);
  const interactedRef  = useRef(false);
  const pendingUrlRef  = useRef<string | null>(null);

  const [config, setConfig]       = useState<MusicConfig | null>(null);
  const [volume, setVolume]       = useState(0.12);
  const [muted, setMuted]         = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackName, setTrackName] = useState<string | null>(null);
  const [hovered, setHovered]     = useState(false);

  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const mutedRef  = useRef(muted);
  mutedRef.current = muted;
  const configRef = useRef(config);
  configRef.current = config;

  // ── Create audio element + synth instance once on mount ─────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.loop    = true;
    audio.preload = "auto";
    audioRef.current = audio;

    synthRef.current = new MusicSynth();

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
      synthRef.current?.stop();
      synthRef.current = null;
    };
  }, []);

  // ── Load music config ────────────────────────────────────────────────────────
  useEffect(() => {
    getMusicConfig().then(setConfig);
  }, []);

  // ── File-based fade helpers ──────────────────────────────────────────────────
  const clearFade = useCallback(() => {
    if (fadeRef.current) { clearInterval(fadeRef.current); fadeRef.current = null; }
  }, []);

  const fadeIn = useCallback((audio: HTMLAudioElement, targetVol: number, durationMs: number) => {
    clearFade();
    audio.volume = 0;
    const steps = Math.max(1, Math.round(durationMs / 50));
    const step  = targetVol / steps;
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
    const cfg   = configRef.current;
    if (!cfg) return;
    // Guard against empty or obviously invalid URLs — these would cause the
    // browser to request the current page as audio (→ 500/HTML response).
    if (!url || url.trim() === "") return;

    if (activeUrlRef.current === url) {
      const alreadyPlaying = activeIsSynth.current
        ? synthRef.current?.playing
        : audioRef.current && !audioRef.current.paused;
      if (alreadyPlaying) return;
    }

    const isSynth = url.startsWith("synth://");
    activeUrlRef.current = url;
    activeIsSynth.current = isSynth;

    if (isSynth) {
      const audio = audioRef.current;
      if (audio && !audio.paused) { clearFade(); audio.pause(); audio.src = ""; }

      const targetVol = mutedRef.current ? 0 : volumeRef.current;
      synthRef.current?.start(url, targetVol).then(() => {
        setIsPlaying(true);
      }).catch(() => {
        pendingUrlRef.current = url;
        activeUrlRef.current = null;
      });
    } else {
      synthRef.current?.stop();

      const audio = audioRef.current;
      if (!audio) return;

      // Only accept direct audio file URLs (no HTML-page URLs, no YouTube etc.)
      const isDirectAudio = (
        url.startsWith("/") ||
        url.startsWith("http://") ||
        url.startsWith("https://")
      );
      if (!isDirectAudio) {
        activeUrlRef.current = null;
        return;
      }

      audio.src = url;
      audio.currentTime = 0;
      audio.volume = 0;
      audio.play()
        .then(() => {
          fadeIn(audio, mutedRef.current ? 0 : volumeRef.current, cfg.fadeInMs);
          setIsPlaying(true);
        })
        .catch(() => {
          pendingUrlRef.current = url;
          activeUrlRef.current = null;
        });
    }
  }, [clearFade, fadeIn]);

  // ── Stop current playback (synth or file) with fade ───────────────────────
  const stopCurrent = useCallback((durationMs: number, onDone: () => void) => {
    if (activeIsSynth.current) {
      synthRef.current?.fadeOut(durationMs).then(() => {
        setIsPlaying(false);
        setTrackName(null);
        activeUrlRef.current = null;
        onDone();
      });
    } else {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        fadeOut(audio, durationMs, () => {
          setIsPlaying(false);
          setTrackName(null);
          activeUrlRef.current = null;
          onDone();
        });
      } else {
        onDone();
      }
    }
  }, [fadeOut]);

  // ── Decide track for current pathname ─────────────────────────────────────
  const applyRoute = useCallback((pn: string) => {
    const cfg = configRef.current;
    if (!cfg?.enabled) return;

    const pageKey = getPageKey(pn);
    const trackId = cfg.pageAssignments[pageKey] ?? null;
    const track   = trackId ? cfg.tracks.find((t) => t.id === trackId) : null;

    if (!track) {
      stopCurrent(cfg.fadeOutMs, () => {});
      return;
    }

    setTrackName(track.name);

    if (activeUrlRef.current === track.url) {
      const stillPlaying = activeIsSynth.current
        ? synthRef.current?.playing
        : audioRef.current && !audioRef.current.paused;
      if (stillPlaying) return;
    }

    if (activeUrlRef.current && activeUrlRef.current !== track.url) {
      stopCurrent(cfg.fadeOutMs, () => loadAndPlay(track.url));
    } else {
      loadAndPlay(track.url);
    }
  }, [stopCurrent, loadAndPlay]);

  // ── First user interaction — start music / resume iOS AudioContext ─────────
  useEffect(() => {
    const handler = () => {
      if (interactedRef.current) return;
      interactedRef.current = true;
      // Resume synth context for iOS
      synthRef.current?.resume();
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
    if (!interactedRef.current) return;
    applyRoute(pathname);
  }, [pathname, config, applyRoute]);

  // ── Config loaded after first interaction ──────────────────────────────────
  useEffect(() => {
    if (!config?.enabled) return;
    if (!interactedRef.current) return;
    applyRoute(pathname);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // ── Volume / mute live sync ────────────────────────────────────────────────
  useEffect(() => {
    const effectiveVol = muted ? 0 : volume;
    if (activeIsSynth.current) {
      synthRef.current?.setVolume(effectiveVol);
    } else {
      const audio = audioRef.current;
      if (audio && !audio.paused) audio.volume = effectiveVol;
    }
  }, [volume, muted]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const cfg = configRef.current;
    const max = cfg?.maxUserVolume ?? 1;
    const v = Math.min(parseFloat(e.target.value), max);
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
      const effectiveVol = next ? 0 : volumeRef.current;
      if (activeIsSynth.current) {
        synthRef.current?.setVolume(effectiveVol);
      } else {
        const audio = audioRef.current;
        if (audio && !audio.paused) audio.volume = effectiveVol;
      }
      return next;
    });
  }, []);

  if (!config?.enabled) return null;
  if (!config.showPlayerUI) return null;

  const canControl = config.userCanControl;
  const maxVol = config.maxUserVolume ?? 1;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.4 ? Volume1 : Volume2;

  // Dictator mode: show a minimal "now playing" indicator without any controls
  if (!canControl) {
    if (!isPlaying) return null; // nothing to show if not playing
    return (
      <div
        className="fixed bottom-4 left-4 z-[45] flex items-center gap-2 rounded-full border border-white/8 bg-black/50 px-3 py-1.5 shadow-lg backdrop-blur-md"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Music className="h-3 w-3 shrink-0 text-purple-400 animate-pulse" />
        {hovered && trackName && (
          <span className="max-w-[120px] truncate text-[10px] text-zinc-500">
            {trackName}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-4 left-4 z-[45] flex items-center gap-2.5 rounded-full border border-white/10 bg-black/70 px-3 py-2 shadow-xl backdrop-blur-md transition-all"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Music icon */}
      <Music className={`h-3.5 w-3.5 shrink-0 ${isPlaying ? "text-purple-400 animate-pulse" : "text-zinc-600"}`} />

      {/* Mute toggle */}
      {config.userCanMute && (
        <button
          type="button"
          onClick={handleToggleMute}
          className={`shrink-0 transition-colors ${muted ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-300 hover:text-white"}`}
          aria-label={muted ? "Stummschaltung aufheben" : "Musik stummschalten"}
          title={muted ? "Stummschaltung aufheben" : "Stummschalten"}
        >
          <VolumeIcon className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Volume slider */}
      {config.userCanAdjustVolume && (
        <input
          type="range"
          min={0}
          max={maxVol}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={handleVolumeChange}
          className="h-1 cursor-pointer accent-purple-400"
          style={{ width: 72 }}
          aria-label="Musiklautstärke"
          title={`Lautstärke: ${Math.round((muted ? 0 : volume) * 100)}%`}
        />
      )}

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
