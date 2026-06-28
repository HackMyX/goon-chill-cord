"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Music, VolumeX, Volume1, Volume2 } from "lucide-react";
import { getMusicConfig } from "@/lib/actions/music";
import { createClient } from "@/lib/supabase/client";
import { MusicSynth } from "@/lib/music-synth";
import { resolvePageVolume, resolveTrackId, clampVolume, type MusicConfig, type MusicPageKey } from "@/lib/music-config";
import { setMusicVolume, setMusicMuted, subscribeClientSettings } from "@/lib/client-settings";
import { getMusicMode, subscribeMusicMode, getMusicTempoMult, subscribeMusicTempoMult } from "@/lib/music-dynamics";

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
  // Current absolute tempo multiplier (1 = normal). Mirrors the music-dynamics
  // channel; a game steps it on events and we hold it until the next event.
  const tempoMultRef   = useRef(getMusicTempoMult());

  // ── Synth tracks ────────────────────────────────────────────────────────────
  const synthRef       = useRef<MusicSynth | null>(null);

  // ── Shared state ────────────────────────────────────────────────────────────
  const activeUrlRef   = useRef<string | null>(null);
  const activeIsSynth  = useRef(false);
  const interactedRef  = useRef(false);
  const pendingUrlRef  = useRef<string | null>(null);
  // Monotonic transition counter. Every (re)start of a track bumps it; a
  // deferred loadAndPlay scheduled behind a fade-out only fires if it is still
  // the latest transition. Without this, two near-simultaneous applyRoute()
  // calls (route change + mode change + config reload can all land at once)
  // each queue their own loadAndPlay behind the same fade-out → two tracks
  // start at once. The token collapses concurrent transitions to "latest wins".
  const transitionSeqRef = useRef(0);
  // User's manually-chosen volume (null = never set). Only honored when the
  // admin allows users to adjust volume; ignored in dictator mode.
  const userOverrideRef = useRef<number | null>(null);

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
      // Remember the user's choice, but do NOT force it onto playback yet — the
      // effective volume is resolved per page once the config loads (and the
      // override is only honored when the admin allows volume control).
      if (Number.isFinite(v)) userOverrideRef.current = clampVolume(v);
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

  // ── Live updates: admin saves broadcast on "music-live" → re-fetch & re-apply
  //    per-page volume / track assignments without a page reload (AGENTS §3).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("music-live")
      .on("broadcast", { event: "music_changed" }, () => {
        getMusicConfig().then(setConfig);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
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
      synthRef.current?.start(url, targetVol, cfg.fadesEnabled ? cfg.fadeInMs : 0).then(() => {
        synthRef.current?.setTempo(getMusicTempoMult());
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
          audio.playbackRate = getMusicTempoMult();
          fadeIn(audio, mutedRef.current ? 0 : volumeRef.current, cfg.fadesEnabled ? cfg.fadeInMs : 0);
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

  // ── Resolve the EXACT volume for a page and apply it ──────────────────────
  // Per-page admin volume is authoritative. In dictator mode (no user volume
  // control) localStorage is ignored entirely, so the admin value is taken over
  // 1:1 on every page. When users may adjust volume, their saved override wins
  // (capped to maxUserVolume); otherwise the per-page admin value is the default.
  const resolveVolumeForPage = useCallback((cfg: MusicConfig, pageKey: MusicPageKey) => {
    const base = resolvePageVolume(cfg, pageKey);
    let eff = base;
    if (cfg.userCanAdjustVolume && userOverrideRef.current !== null) {
      eff = Math.min(userOverrideRef.current, cfg.maxUserVolume ?? 1);
    }
    eff = clampVolume(eff);
    if (eff !== volumeRef.current) {
      volumeRef.current = eff;
      setVolume(eff);
    }
    return eff;
  }, []);

  // ── Decide track for current pathname ─────────────────────────────────────
  const applyRoute = useCallback((pn: string) => {
    const cfg = configRef.current;
    if (!cfg?.enabled) return;

    const pageKey = getPageKey(pn);
    // Apply this page's exact volume BEFORE (re)starting any track, so the synth
    // and audio element both start at the configured level — never a stale value.
    resolveVolumeForPage(cfg, pageKey);
    // Per-mode override (e.g. "snake:x2") wins over the page-level track.
    const trackId = resolveTrackId(cfg, pageKey, getMusicMode());
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

    // Claim this transition. A fade-out can take hundreds of ms, during which
    // another applyRoute() may run; only the latest transition's deferred
    // loadAndPlay is allowed to actually start a track (latest wins, no overlap).
    const seq = ++transitionSeqRef.current;
    if (activeUrlRef.current && activeUrlRef.current !== track.url) {
      stopCurrent(cfg.fadesEnabled ? cfg.fadeOutMs : 0, () => {
        if (seq !== transitionSeqRef.current) return; // superseded by a newer transition
        loadAndPlay(track.url);
      });
    } else {
      loadAndPlay(track.url);
    }
  }, [stopCurrent, loadAndPlay, resolveVolumeForPage]);

  // ── First user interaction — start music / resume iOS AudioContext ─────────
  useEffect(() => {
    const handler = () => {
      if (interactedRef.current) return;
      interactedRef.current = true;
      // Resume synth context for iOS
      synthRef.current?.resume();
      const cfg = configRef.current;
      if (pendingUrlRef.current && cfg) {
        // Resolve the exact volume for the current page before the deferred start.
        resolveVolumeForPage(cfg, getPageKey(pathname));
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

  // ── Dynamic tempo: a game (Snake) steps an absolute multiplier on events and
  //    holds it. We apply it to the synth (takes effect at its next bar — smooth)
  //    and to file audio (instant playbackRate). No decay, no settle-back: the
  //    value stays put until the next event pushes a new one.
  const applyTempo = useCallback((mult: number) => {
    if (activeIsSynth.current) {
      synthRef.current?.setTempo(mult);
    } else {
      const audio = audioRef.current;
      if (audio) audio.playbackRate = mult;
    }
  }, []);

  useEffect(() => subscribeMusicTempoMult((m) => { tempoMultRef.current = m; applyTempo(m); }), [applyTempo]);

  // Re-resolve the current page's track whenever the active game mode changes,
  // so a per-mode track override switches in live (e.g. Snake Classic → Turbo).
  useEffect(() => {
    return subscribeMusicMode(() => {
      if (!configRef.current?.enabled || !interactedRef.current) return;
      applyRoute(pathname);
    });
  }, [pathname, applyRoute]);

  // ── External control: the profile's Client-Settings panel (and the legacy
  //    floating widget) both drive volume/mute through the shared
  //    client-settings store. Subscribe so changes there apply live here,
  //    still respecting the admin gate (volume only honored if userCanAdjustVolume).
  useEffect(() => {
    return subscribeClientSettings((s) => {
      const cfg = configRef.current;
      if (cfg?.userCanAdjustVolume) {
        const v = Math.min(s.musicVolume, cfg.maxUserVolume ?? 1);
        userOverrideRef.current = v;
        if (v !== volumeRef.current) {
          volumeRef.current = v;
          setVolume(v);
        }
      }
      if ((cfg?.userCanMute ?? true) && s.musicMuted !== mutedRef.current) {
        mutedRef.current = s.musicMuted;
        setMuted(s.musicMuted);
      }
    });
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const cfg = configRef.current;
    const max = cfg?.maxUserVolume ?? 1;
    const v = Math.min(parseFloat(e.target.value), max);
    setVolume(v);
    volumeRef.current = v;
    userOverrideRef.current = v;
    setMusicVolume(v);
    if (v > 0 && muted) {
      setMuted(false);
      mutedRef.current = false;
      setMusicMuted(false);
    }
  }, [muted]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      setMusicMuted(next);
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
