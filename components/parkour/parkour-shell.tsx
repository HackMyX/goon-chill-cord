"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Canvas } from "@react-three/fiber";
import { Preload } from "@react-three/drei";
import {
  ArrowLeft, MousePointerClick, Timer, Flag, RotateCcw, Trophy, Crown, Medal,
  Users, Shuffle, Play, Loader2, LogOut, UserPlus, Home, Zap, Eye,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { ParkourScene } from "@/components/parkour/parkour-scene";
import { ParkourSpectatorScene } from "@/components/parkour/parkour-spectator";
import type { CheckpointProgressRef } from "@/components/parkour/parkour-geometry";
import type { GhostRuntime, GhostView } from "@/components/parkour/parkour-ghosts";
import { MobileControls } from "@/components/world/mobile-controls";
import { useCameraControls } from "@/components/world/use-camera-controls";
import { setActiveKeybinds } from "@/components/world/use-keyboard-controls";
import { loadWorldSettings } from "@/lib/world-settings";
import { useSoundManager } from "@/lib/sound-manager";
import { setMusicMode } from "@/lib/music-dynamics";
import { useLiveConfig } from "@/lib/use-live-config";
import { StyledUsername } from "@/components/ui/styled-username";
import {
  PARKOUR_MAPS, resolveMap, isMapEnabled, formatParkourTime, medalFor,
  type ParkourConfig, type ParkourMap,
} from "@/lib/parkour-config";
import {
  getParkourConfig, submitParkourRun, getParkourLeaderboard, type ParkourLeaderboardEntry, type ParkourSubmitResult,
  createParkourLobby, joinParkourLobby, leaveParkourLobby, getParkourLobby, setParkourLobbyMap,
  startParkourLobbyRun, endParkourLobbyRun, reportParkourLobbyTime, inviteFriendToParkour,
  heartbeatParkourLobby, type ParkourLobbyState,
} from "@/lib/actions/parkour";
import { joinParkourRoom, subscribeToParkourRoster } from "@/lib/parkour-realtime";
import type { EquippedItem } from "@/lib/rarity-colors";

/** How long the host may be absent from the lobby's presence roster before
 * non-host members treat the room as abandoned and leave (covers a hard
 * disconnect / tab-crash where the host never runs an explicit leave). Long
 * enough to ride out a brief network blip and the initial presence-sync delay. */
const HOST_GONE_GRACE_MS = 10000;

export interface ParkourFriend { userId: string; username: string; nameStyleKey: string | null }

export interface ParkourShellProps {
  userId: string;
  username: string;
  gender: "m" | "w";
  equippedByCategory: Record<string, EquippedItem | undefined>;
  credits: number;
  streakDays: number;
  inventoryCount: number;
  config: ParkourConfig;
  myBests: Record<string, number>;
  friends: ParkourFriend[];
  initialLobby: ParkourLobbyState | null;
  /** The raw `?lobby=` query param (invite deep-link). Reflected as a prop so a
   * CLIENT-side navigation to `/parkour?lobby=…` (e.g. clicking an invite in the
   * notification bell while already on the page) re-fires the join effect. */
  initialLobbyId?: string | null;
  isAdmin?: boolean;
  isModerator?: boolean;
}

const CANVAS_DPR: [number, number] = [1, 2];
const CANVAS_DPR_MOBILE: [number, number] = [1, 1.5];
// Exactly the farm world's camera framing (WORLD_CAMERA in world-shell.tsx) so the
// view feels identical: fov 55 (not 60 — a wider fov reads as a different, more
// "arcade"/zoomed-out camera) and the same initial pose. The per-frame chase math
// (ParkourPlayer) is already the farm world's, so this closes the last gap.
const CANVAS_CAMERA = { position: [0, 2.6, 6] as [number, number, number], fov: 55 };

const DIFF_COLOR: Record<ParkourMap["difficulty"], string> = {
  Leicht: "text-emerald-400", Mittel: "text-amber-400", Schwer: "text-orange-400", Extrem: "text-red-400",
};
const MEDAL_META = {
  diamond: { label: "Diamant", color: "#67e8f9", icon: "💎" },
  gold: { label: "Gold", color: "#fbbf24", icon: "🥇" },
  silver: { label: "Silber", color: "#d1d5db", icon: "🥈" },
  bronze: { label: "Bronze", color: "#d97706", icon: "🥉" },
} as const;

export function ParkourShell(props: ParkourShellProps) {
  const {
    userId, username, gender, equippedByCategory, credits: initialCredits, streakDays, inventoryCount,
    config: initialConfig, myBests: initialBests, friends, initialLobby, initialLobbyId = null,
    isAdmin = false, isModerator = false,
  } = props;

  const [config, setConfig] = useState(initialConfig);
  useLiveConfig("parkour-config-live", getParkourConfig, setConfig);
  const [bests, setBests] = useState(initialBests);
  const [credits] = useState(initialCredits);
  const sound = useSoundManager();

  const enabledMaps = useMemo(() => PARKOUR_MAPS.filter((m) => isMapEnabled(m.id, config)), [config]);
  const [selectedId, setSelectedId] = useState(enabledMaps[0]?.id ?? PARKOUR_MAPS[0].id);
  const [randomizer, setRandomizer] = useState(false);

  // view: menu → playing → finished (playing/spectating render the Canvas)
  const [view, setView] = useState<"menu" | "playing" | "finished" | "spectating">("menu");
  const [activeMap, setActiveMap] = useState<ParkourMap | null>(null);
  const [multiplayer, setMultiplayer] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  // Lobby — only adopt the invite-linked lobby as our own state if we're ALREADY a
  // member; otherwise we start with none and join it via the effect below (so a
  // failed/rejected join can never leave a phantom lobby on screen).
  const [lobby, setLobby] = useState<ParkourLobbyState | null>(
    initialLobby && initialLobby.members.some((m) => m.userId === userId) ? initialLobby : null,
  );
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  // A transient banner for lobby lifecycle events (host closed, kicked, join failed).
  const [lobbyToast, setLobbyToast] = useState<string | null>(null);

  // ── Play-vs-spectate bookkeeping ──
  // "resident" = we were sitting in this lobby (status open) → we race every run.
  // A late joiner (first seen while a run is already live) is NOT resident → they
  // spectate the current run, and become resident once it ends (status open).
  const residentRef = useRef<boolean>(
    !!(initialLobby && initialLobby.status === "open" && initialLobby.members.some((m) => m.userId === userId)),
  );
  // The run_seed we're currently engaged with (playing OR spectating) — guards
  // against re-entering the same run on every broadcast.
  const activeRunSeedRef = useRef<number | null>(null);
  // Latest lobby id for the page-leave cleanup (leaving /parkour leaves the lobby).
  const lobbyIdRef = useRef<string | null>(lobby?.id ?? null);
  lobbyIdRef.current = lobby?.id ?? null;
  // Latest view, mirrored into a ref so realtime callbacks can read it without
  // taking `view` as a dependency (which would rebuild the callback every frame
  // of a run and churn the useLiveConfig subscription).
  const viewRef = useRef(view);
  viewRef.current = view;
  // Grace-timer anchor for host-gone (presence) detection.
  const hostGoneSinceRef = useRef<number | null>(null);

  // ── Spectator state ──
  const [spectateMap, setSpectateMap] = useState<ParkourMap | null>(null);
  const [spectateTargetId, setSpectateTargetId] = useState<string | null>(null);
  const [spectateViews, setSpectateViews] = useState<GhostView[]>([]);
  const spectateGhostsRef = useRef<Map<string, GhostRuntime>>(new Map());

  // Mobile detection (same coarse/fine heuristic as the farm world)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () =>
      window.matchMedia("(any-pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches;
    setIsMobile(check());
  }, []);

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const cameraControls = useCameraControls(canvasWrapRef);
  const progressRef = useRef<CheckpointProgressRef>({ current: -1 });
  const deathsRef = useRef(0);

  // In-run side leaderboard (time / deaths)
  const [sideLb, setSideLb] = useState<ParkourLeaderboardEntry[]>([]);
  const [sideLbSort, setSideLbSort] = useState<"td" | "time" | "deaths">("td");
  const [sideLbOpen, setSideLbOpen] = useState(true);
  const loadSideLb = useCallback(async (mapId: string, sort: "td" | "time" | "deaths") => {
    setSideLb(await getParkourLeaderboard(mapId, 10, sort));
  }, []);

  // Timer — the live value is rendered by the self-contained <RunTimer> below so
  // it NEVER re-renders this shell (and thus never reconciles the 100+ platform
  // meshes) each tick. `finalMs` is only set once, at the finish.
  const startMsRef = useRef<number | null>(null);
  const [finalMs, setFinalMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [checkpointToast, setCheckpointToast] = useState<number | null>(null);
  const [finishResult, setFinishResult] = useState<ParkourSubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Leaderboard for the selected/active map
  const [leaderboard, setLeaderboard] = useState<ParkourLeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const loadLeaderboard = useCallback(async (mapId: string) => {
    setLbLoading(true);
    const data = await getParkourLeaderboard(mapId, 15);
    setLeaderboard(data);
    setLbLoading(false);
  }, []);
  useEffect(() => { if (view === "menu") void loadLeaderboard(selectedId); }, [selectedId, view, loadLeaderboard]);

  // Adopt the player's saved world settings (localStorage, shared with the farm
  // world): mouse sensitivity X/Y AND custom key bindings — so the parkour
  // controls feel EXACTLY like the farm world the user already tuned. Applied on
  // mount, before pointer-lock can engage. Re-read on focus so a change made in a
  // farm-world tab is picked up without a reload.
  useEffect(() => {
    const apply = () => {
      const s = loadWorldSettings();
      const st = cameraControls.state.current;
      st.sensitivityXMult = s.sensitivityX;
      st.sensitivityYMult = s.sensitivityY;
      setActiveKeybinds(s.keybinds);
    };
    apply();
    window.addEventListener("focus", apply);
    return () => window.removeEventListener("focus", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Presence roster: everyone currently connected to this lobby's realtime room.
  useEffect(() => {
    if (!lobby) { setOnlineIds(new Set()); return; }
    const untrack = joinParkourRoom(lobby.id, userId);
    const unsub = subscribeToParkourRoster(setOnlineIds);
    return () => { untrack(); unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby?.id, userId]);

  // ── Run lifecycle ──
  const beginRun = useCallback((map: ParkourMap, mp: boolean) => {
    progressRef.current.current = -1;
    deathsRef.current = 0;
    startMsRef.current = null;
    // Per-Map-Hintergrundmusik + Sounds vorladen (nach User-Geste, kein Stall).
    setMusicMode(map.id.split("_")[0]);
    sound.warmupParkour();
    setRunning(true);
    setActiveMap(map);
    setMultiplayer(mp);
    setFinishResult(null);
    setResetSignal((s) => s + 1);
    setView("playing");
    void loadSideLb(map.id, sideLbSort);
    sound.click();
  }, [sound, loadSideLb, sideLbSort]);

  // ── Spectator: watch the ongoing race instead of running it (late joiner, or a
  // finished/exited player watching the rest). Joins nothing new — the lobby room
  // is already subscribed, so ghost broadcasts flow straight in. ──
  const enterSpectate = useCallback((map: ParkourMap) => {
    spectateGhostsRef.current.clear();
    setSpectateViews([]);
    setSpectateTargetId(null);
    setSpectateMap(map);
    setActiveMap(map);
    setMultiplayer(true);
    setRunning(false);
    setMusicMode(map.id.split("_")[0]);
    sound.warmupParkour();
    cameraControls.releaseLock();
    setView("spectating");
    sound.click();
  }, [sound, cameraControls]);

  // Torn out of the lobby (host closed it, kicked, disconnected) — reset EVERYTHING
  // back to a clean menu and surface why.
  const ejectFromLobby = useCallback((msg: string) => {
    residentRef.current = false;
    activeRunSeedRef.current = null;
    hostGoneSinceRef.current = null;
    setLobby(null);
    setOnlineIds(new Set());
    setMultiplayer(false);
    setRunning(false);
    setSpectateMap(null);
    spectateGhostsRef.current.clear();
    setSpectateViews([]);
    setView("menu");
    setActiveMap(null);
    setMusicMode(null);
    cameraControls.releaseLock();
    setLobbyToast(msg);
    window.setTimeout(() => setLobbyToast((t) => (t === msg ? null : t)), 5000);
  }, [cameraControls]);

  // Single source of truth for every lobby state change (initial join, host
  // start, run end, close, kick). Decides play-vs-spectate and ejection.
  const handleLobbyUpdate = useCallback((fresh: ParkourLobbyState | null) => {
    if (!fresh || fresh.status === "closed") {
      ejectFromLobby(fresh ? "Der Host hat die Lobby geschlossen." : "Die Lobby wurde geschlossen.");
      return;
    }
    if (!fresh.members.some((m) => m.userId === userId)) {
      ejectFromLobby("Du bist nicht mehr in der Lobby.");
      return;
    }
    setLobby(fresh);
    if (fresh.status === "open") {
      residentRef.current = true;         // sitting in the waiting room → we race every run
      activeRunSeedRef.current = null;
      // A run just ended → spectators fall back to the lobby waiting room.
      if (viewRef.current === "spectating") {
        setSpectateMap(null); setMultiplayer(false); setRunning(false); setMusicMode(null); setView("menu");
      }
      return;
    }
    if (fresh.status === "in_run" && fresh.activeMapId) {
      const seed = fresh.runSeed ?? 0;
      if (activeRunSeedRef.current === seed) return; // already engaged with this run
      activeRunSeedRef.current = seed;
      const m = PARKOUR_MAPS.find((x) => x.id === fresh.activeMapId);
      if (!m) return;
      const resolved = resolveMap(m, config);
      if (residentRef.current) beginRun(resolved, true); // present at start → race
      else enterSpectate(resolved);                       // joined mid-run → watch
    }
  }, [userId, config, beginRun, enterSpectate, ejectFromLobby]);

  // Lobby realtime: refetch + re-decide on every broadcast (join/leave/start/end/close).
  const loadLobbyState = useCallback(
    async () => (lobbyIdRef.current ? await getParkourLobby(lobbyIdRef.current) : null),
    [],
  );
  useLiveConfig(
    lobby ? `parkour-lobby:${lobby.id}` : "parkour-lobby:none",
    loadLobbyState,
    handleLobbyUpdate,
  );

  // Join an invite-linked lobby (deep-link on load OR a client-side nav to
  // ?lobby=… while already on the page). A rejected join never mounts a lobby.
  useEffect(() => {
    if (!initialLobbyId) return;
    if (lobbyIdRef.current === initialLobbyId) return; // already in it
    let cancelled = false;
    void (async () => {
      const res = await joinParkourLobby(initialLobbyId);
      if (cancelled) return;
      if (!res.ok) {
        setLobbyToast(res.error ?? "Beitritt zur Lobby fehlgeschlagen.");
        window.setTimeout(() => setLobbyToast(null), 5000);
        return;
      }
      const fresh = await getParkourLobby(initialLobbyId);
      if (cancelled || !fresh) return;
      residentRef.current = fresh.status === "open";
      activeRunSeedRef.current = null;
      handleLobbyUpdate(fresh);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLobbyId]);

  // Host-gone detection (presence): if the host vanishes from the room roster for
  // the grace window, non-host members leave the abandoned lobby. Covers a hard
  // disconnect / crash where the host never runs an explicit "leave".
  useEffect(() => {
    if (!lobby || lobby.hostId === userId || lobby.status === "closed") { hostGoneSinceRef.current = null; return; }
    if (onlineIds.size === 0) return;                 // roster not synced yet
    if (onlineIds.has(lobby.hostId)) { hostGoneSinceRef.current = null; return; }
    if (hostGoneSinceRef.current === null) hostGoneSinceRef.current = Date.now();
    const remaining = Math.max(0, HOST_GONE_GRACE_MS - (Date.now() - hostGoneSinceRef.current));
    const t = window.setTimeout(() => ejectFromLobby("Der Host hat die Lobby verlassen."), remaining);
    return () => window.clearTimeout(t);
  }, [lobby, onlineIds, userId, ejectFromLobby]);

  // Host heartbeat: while we host a lobby and sit on /parkour, keep bumping
  // `last_seen_at` so the server-side cleanup never mistakes an active lobby for
  // an abandoned one (and closes a truly crashed host's room after it goes stale).
  useEffect(() => {
    if (!lobby || lobby.hostId !== userId) return;
    const id = lobby.id;
    void heartbeatParkourLobby(id);
    const t = window.setInterval(() => void heartbeatParkourLobby(id), 20000);
    return () => window.clearInterval(t);
  }, [lobby?.id, lobby?.hostId, userId]);

  // Leaving the /parkour page (tab close OR in-app navigation) leaves the lobby;
  // if we're the host, that also closes it for everyone. Best-effort on unload.
  useEffect(() => {
    const leaveNow = () => {
      const id = lobbyIdRef.current;
      if (id) { try { void leaveParkourLobby(id); } catch { /* unloading */ } }
    };
    window.addEventListener("pagehide", leaveNow);
    return () => { window.removeEventListener("pagehide", leaveNow); leaveNow(); };
  }, []);

  const handleFirstMove = useCallback(() => {
    if (startMsRef.current === null) startMsRef.current = performance.now();
  }, []);

  const handleCheckpoint = useCallback((index: number) => {
    sound.pkCheckpoint();
    setCheckpointToast(index);
    setTimeout(() => setCheckpointToast(null), 1500);
  }, [sound]);

  const handleFall = useCallback(() => { sound.pkFall(); deathsRef.current += 1; }, [sound]);

  // Hazard knockback → red screen flash + hit sound (occasional, so re-rendering
  // the shell here is fine; the memoized 3D scene doesn't reconcile).
  const [hazardFlash, setHazardFlash] = useState(false);
  const hazardFlashT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleHazardHit = useCallback(() => {
    sound.pkHazard();
    setHazardFlash(true);
    if (hazardFlashT.current) clearTimeout(hazardFlashT.current);
    hazardFlashT.current = setTimeout(() => setHazardFlash(false), 240);
  }, [sound]);

  const handleFinish = useCallback(async () => {
    if (!activeMap) return;
    const finalMs = startMsRef.current !== null ? performance.now() - startMsRef.current : 0;
    setFinalMs(finalMs);
    setRunning(false);
    setView("finished");
    sound.pkFinish();
    cameraControls.releaseLock();
    setSubmitting(true);
    const checkpointsReached = Math.max(0, (progressRef.current.current ?? -1) + 1);
    const res = await submitParkourRun(activeMap.id, Math.max(1, Math.round(finalMs)), checkpointsReached, deathsRef.current);
    setFinishResult(res);
    setSubmitting(false);
    if (res.success && res.timeMs) {
      setBests((b) => ({ ...b, [activeMap.id]: res.isNewRecord ? res.timeMs! : Math.min(b[activeMap.id] ?? Infinity, res.timeMs!) }));
      if (multiplayer && lobby) void reportParkourLobbyTime(lobby.id, res.timeMs);
      void loadSideLb(activeMap.id, sideLbSort);
    }
  }, [activeMap, sound, cameraControls, multiplayer, lobby, loadSideLb, sideLbSort]);

  const handleRetry = useCallback(() => {
    if (!activeMap) return;
    progressRef.current.current = -1;
    deathsRef.current = 0;
    startMsRef.current = null;
    setFinishResult(null);
    setRunning(true);
    setResetSignal((s) => s + 1);
    setView("playing");
    sound.click();
  }, [activeMap, sound]);

  // Reload the in-run side leaderboard when the sort toggle changes mid-run.
  useEffect(() => {
    if ((view === "playing" || view === "finished") && activeMap) void loadSideLb(activeMap.id, sideLbSort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideLbSort]);

  const handleExitRun = useCallback(() => {
    const wasHostMp = multiplayer && lobby?.hostId === userId && !!lobby;
    setRunning(false);
    setView("menu");
    setActiveMap(null);
    setMusicMode(null); // zurück zum Parkour-/Lobby-Track
    cameraControls.releaseLock();
    // Host leaving a multiplayer run reopens the lobby waiting room for everyone
    // (so it can be re-raced and any spectators fall back to the lobby).
    if (wasHostMp && lobby) {
      activeRunSeedRef.current = null;
      void endParkourLobbyRun(lobby.id);
    } else if (!multiplayer) {
      void loadLeaderboard(selectedId);
    }
    sound.click();
  }, [multiplayer, lobby, userId, cameraControls, loadLeaderboard, selectedId, sound]);

  // Spectate the run currently in progress (finished/exited member wants to watch
  // the rest) — does NOT leave the lobby.
  const handleSpectateCurrent = useCallback(() => {
    if (!lobby || lobby.status !== "in_run" || !lobby.activeMapId) return;
    const m = PARKOUR_MAPS.find((x) => x.id === lobby.activeMapId);
    if (m) enterSpectate(resolveMap(m, config));
  }, [lobby, config, enterSpectate]);

  // Stop spectating → back to the lobby waiting room (still a member).
  const handleLeaveSpectate = useCallback(() => {
    setSpectateMap(null);
    setMultiplayer(false);
    setView("menu");
    setMusicMode(null);
    sound.click();
  }, [sound]);

  // Beim Verlassen der Parkour-Seite den Map-Musik-Modus zurücksetzen.
  useEffect(() => () => setMusicMode(null), []);


  // ── Singleplayer / randomizer launch ──
  const launchSingle = useCallback(() => {
    const pool = enabledMaps.length ? enabledMaps : PARKOUR_MAPS;
    const map = randomizer ? pool[Math.floor(Math.random() * pool.length)] : (pool.find((m) => m.id === selectedId) ?? pool[0]);
    beginRun(resolveMap(map, config), false);
  }, [enabledMaps, randomizer, selectedId, config, beginRun]);

  // ── Lobby actions ──
  const [lobbyBusy, setLobbyBusy] = useState(false);
  const handleCreateLobby = useCallback(async () => {
    setLobbyBusy(true);
    const res = await createParkourLobby(randomizer ? "random" : selectedId, randomizer);
    setLobbyBusy(false);
    if (res.ok && res.lobbyId) {
      const fresh = await getParkourLobby(res.lobbyId);
      setLobby(fresh);
      sound.win();
    } else sound.error();
  }, [randomizer, selectedId, sound]);

  const handleLeaveLobby = useCallback(async () => {
    const id = lobbyIdRef.current;
    if (!id) return;
    residentRef.current = false;
    activeRunSeedRef.current = null;
    hostGoneSinceRef.current = null;
    setLobby(null);
    setOnlineIds(new Set());
    setMultiplayer(false);
    setRunning(false);
    setSpectateMap(null);
    spectateGhostsRef.current.clear();
    setSpectateViews([]);
    setView((v) => (v === "playing" || v === "spectating" || v === "finished" ? "menu" : v));
    setActiveMap(null);
    setMusicMode(null);
    cameraControls.releaseLock();
    await leaveParkourLobby(id);
    sound.click();
  }, [cameraControls, sound]);

  const isHost = lobby?.hostId === userId;
  const handleHostSetMap = useCallback(async (mapId: string, rnd: boolean) => {
    if (!lobby) return;
    await setParkourLobbyMap(lobby.id, mapId, rnd);
  }, [lobby]);

  const handleHostStart = useCallback(async () => {
    if (!lobby) return;
    setLobbyBusy(true);
    const seed = Math.floor(Math.random() * 2_000_000_000) + 1;
    const res = await startParkourLobbyRun(lobby.id, seed);
    setLobbyBusy(false);
    if (res.ok && res.activeMapId) {
      // Claim this run locally BEFORE the broadcast round-trips so handleLobbyUpdate
      // sees the same seed and doesn't beginRun a second time.
      residentRef.current = true;
      activeRunSeedRef.current = seed;
      const m = PARKOUR_MAPS.find((x) => x.id === res.activeMapId);
      if (m) beginRun(resolveMap(m, config), true);
    } else {
      sound.error();
    }
  }, [lobby, config, beginRun, sound]);

  const handleInvite = useCallback(async (friendId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!lobby) return { ok: false, error: "Keine Lobby." };
    const res = await inviteFriendToParkour(lobby.id, friendId);
    if (res.ok) sound.win(); else sound.error();
    return res;
  }, [lobby, sound]);

  const selectedMap = useMemo(() => resolveMap(PARKOUR_MAPS.find((m) => m.id === selectedId) ?? PARKOUR_MAPS[0], config), [selectedId, config]);

  // ── Master gate ──
  if (!config.enabled && !isAdmin) {
    return <GateScreen message="Parkour ist derzeit deaktiviert." />;
  }
  if (config.adminOnly && !isAdmin) {
    return <GateScreen message="Parkour ist gerade nur für Admins verfügbar (Soft-Launch)." />;
  }

  // ════════════════════════════════ SPECTATING ════════════════════════════════
  if (view === "spectating" && spectateMap) {
    const followName = spectateTargetId ? (spectateViews.find((v) => v.id === spectateTargetId)?.name ?? null) : null;
    return (
      <div className={isMobile ? "fixed inset-0 z-40 bg-black" : "flex h-dvh flex-col"}>
        {!isMobile && <TopBar credits={credits} streakDays={streakDays} inventoryCount={inventoryCount} isAdmin={isAdmin} isModerator={isModerator} />}
        <div ref={canvasWrapRef} className={`bg-black ${isMobile ? "absolute inset-0" : "relative min-h-0 flex-1"}`}>

          {/* Top-left: back to lobby + spectator badge + map */}
          <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2">
            <button onClick={handleLeaveSpectate} onMouseEnter={sound.hover}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-sm text-zinc-200 backdrop-blur transition-colors hover:border-white/30">
              <ArrowLeft className="h-4 w-4" /> Zur Lobby
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/20 px-3 py-1.5 text-sm font-bold text-fuchsia-100 backdrop-blur">
              <Eye className="h-4 w-4" /> Zuschauermodus
            </span>
            <span className="rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-sm font-bold text-zinc-100 backdrop-blur">
              {spectateMap.name}
            </span>
          </div>

          {/* Currently watching */}
          {followName && (
            <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-white/15 bg-black/60 px-4 py-2 backdrop-blur">
              <span className="text-sm text-zinc-300">Kamera folgt <span className="font-bold text-white">{followName}</span></span>
            </div>
          )}

          {/* Right: who to watch */}
          <div className="absolute top-16 right-3 z-20 flex w-52 flex-col gap-2 rounded-xl border border-white/10 bg-black/50 p-2 backdrop-blur">
            <div className="flex items-center gap-1.5 px-1 text-xs font-bold text-fuchsia-300"><Eye className="h-3.5 w-3.5" /> Kamera</div>
            <button onClick={() => { setSpectateTargetId(null); sound.click(); }}
              className={`rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-colors ${spectateTargetId === null ? "bg-fuchsia-500/25 text-fuchsia-100" : "text-zinc-300 hover:bg-white/5"}`}>
              🎥 Übersicht (Auto-Orbit)
            </button>
            {spectateViews.length === 0 ? (
              <p className="px-1 py-1 text-[11px] text-zinc-500">Warte auf Läufer…</p>
            ) : spectateViews.map((v) => (
              <button key={v.id} onClick={() => { setSpectateTargetId(v.id); sound.click(); }}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-colors ${spectateTargetId === v.id ? "bg-fuchsia-500/25 text-fuchsia-100" : "text-zinc-300 hover:bg-white/5"}`}>
                <span className="flex-1 truncate">{v.name}</span>
                {v.finished && <span title="Im Ziel">🏁</span>}
              </button>
            ))}
          </div>

          <Canvas dpr={isMobile ? CANVAS_DPR_MOBILE : CANVAS_DPR} camera={CANVAS_CAMERA} className="absolute inset-0">
            <Suspense fallback={null}>
              <ParkourSpectatorScene
                key={spectateMap.id}
                selfId={userId}
                map={spectateMap}
                ghostsRef={spectateGhostsRef}
                targetId={spectateTargetId}
                cameraControls={cameraControls}
                onViewsChange={setSpectateViews}
              />
              <Preload all />
            </Suspense>
          </Canvas>
        </div>
      </div>
    );
  }

  // ════════════════════════════ PLAYING / FINISHED ════════════════════════════
  if (view === "playing" || view === "finished") {
    const map = activeMap!;
    const totalCp = map.checkpoints.length;
    const reachedCp = Math.max(0, (progressRef.current.current ?? -1) + 1);
    return (
      <div className={isMobile ? "fixed inset-0 z-40 bg-black" : "flex h-dvh flex-col"}>
        {!isMobile && <TopBar credits={credits} streakDays={streakDays} inventoryCount={inventoryCount} isAdmin={isAdmin} isModerator={isModerator} />}
        <div ref={canvasWrapRef} className={`bg-black ${isMobile ? "absolute inset-0" : "relative min-h-0 flex-1"}`}>

          {/* Top-left: back + map name */}
          <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
            <button onClick={handleExitRun} onMouseEnter={sound.hover}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-sm text-zinc-200 backdrop-blur transition-colors hover:border-white/30">
              <ArrowLeft className="h-4 w-4" /> Menü
            </button>
            <span className="rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-sm font-bold text-zinc-100 backdrop-blur">
              {map.name}
            </span>
          </div>

          {/* Top-center: timer + checkpoints */}
          <div className="pointer-events-none absolute top-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5">
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/60 px-4 py-2 backdrop-blur">
              <Timer className="h-5 w-5 text-cyan-300" />
              <span className="font-mono text-2xl font-black tabular-nums text-white"><RunTimer startMsRef={startMsRef} /></span>
            </div>
            {totalCp > 0 && (
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1 backdrop-blur">
                <Flag className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-zinc-200">{reachedCp}/{totalCp} Checkpoints</span>
              </div>
            )}
          </div>

          {/* Hazard-hit red flash (you got shoved) */}
          {view === "playing" && hazardFlash && (
            <div className="pointer-events-none absolute inset-0 z-[12]" style={{ boxShadow: "inset 0 0 130px 34px rgba(239,68,68,0.55)" }} />
          )}

          {/* Checkpoint toast */}
          {checkpointToast !== null && (
            <div className="pointer-events-none absolute top-1/3 left-1/2 z-30 -translate-x-1/2 animate-[float-up_1.5s_ease-out_forwards] text-center">
              <div className="text-4xl font-black text-emerald-300 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">CHECKPOINT!</div>
            </div>
          )}

          {/* Right column: lobby roster (MP) + live in-run leaderboard (Zeit/Tode) */}
          {view === "playing" && (
            <div className="absolute top-16 right-3 z-20 flex w-52 flex-col gap-2">
              {multiplayer && lobby && (
                <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2 backdrop-blur">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300"><Users className="h-3.5 w-3.5" /> Lobby</div>
                  {lobby.members.map((m) => (
                    <div key={m.userId} className="flex items-center gap-2 text-xs">
                      <span className={`h-1.5 w-1.5 rounded-full ${onlineIds.has(m.userId) ? "bg-emerald-400" : "bg-zinc-600"}`} />
                      <span className="text-zinc-300">{m.username}</span>
                      {m.bestTimeMs != null && <span className="ml-auto font-mono text-emerald-300">{formatParkourTime(m.bestTimeMs)}</span>}
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-xl border border-white/10 bg-black/50 backdrop-blur">
                <button onClick={() => setSideLbOpen((o) => !o)} className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-300">
                  <Trophy className="h-3.5 w-3.5" /> Bestenliste
                  <span className="ml-auto text-zinc-500">{sideLbOpen ? "▾" : "▸"}</span>
                </button>
                {sideLbOpen && (
                  <div className="px-2 pb-2">
                    <div className="mb-1.5 flex gap-1">
                      {(["td", "time", "deaths"] as const).map((s) => (
                        <button key={s} onClick={() => setSideLbSort(s)}
                          className={`flex-1 rounded-md px-2 py-0.5 text-[10px] font-bold transition-colors ${sideLbSort === s ? "bg-amber-500/20 text-amber-200" : "text-zinc-500 hover:text-zinc-300"}`}>
                          {s === "td" ? "T/D" : s === "time" ? "Zeit" : "Tode"}
                        </button>
                      ))}
                    </div>
                    {sideLb.length === 0 ? (
                      <p className="px-1 py-2 text-[10px] text-zinc-600">Noch keine Zeiten.</p>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {sideLb.map((e) => {
                          const self = e.userId === userId;
                          return (
                            <div key={e.userId} className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] ${self ? "bg-amber-500/15 ring-1 ring-inset ring-amber-500/25" : ""}`}>
                              <span className="w-4 text-zinc-600">{e.rank}</span>
                              <span className="flex-1 truncate text-zinc-300">{e.username}</span>
                              <div className="flex flex-col items-end leading-tight">
                                <span className="font-mono font-bold text-amber-300" title="T/D-Score (Zeit + Todes-Strafe)">{formatParkourTime(e.tdMs)}</span>
                                <span className="font-mono text-[9px] text-zinc-500">{formatParkourTime(e.bestTimeMs)} · ☠{e.deaths}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Click-to-play overlay (desktop) */}
          {view === "playing" && !cameraControls.locked && !isMobile && (
            <button onClick={() => { sound.click(); cameraControls.requestLock(); }}
              className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-black/40 text-center backdrop-blur-[2px]">
              <span className="flex items-center gap-2 rounded-full border border-purple-400/50 bg-purple-500/20 px-5 py-2.5 text-base font-bold text-purple-100 shadow-[0_0_24px_rgba(168,85,247,0.4)]">
                <MousePointerClick className="h-5 w-5" /> Klicken zum Spielen
              </span>
              <span className="text-xs text-zinc-400">Maus = Blick · WASD = Laufen · Leertaste = Springen (Doppelsprung!) · Shift = Sprint · Esc = Pause</span>
            </button>
          )}

          {/* Mobile controls */}
          {view === "playing" && isMobile && <MobileControls cameraState={cameraControls.state} />}

          {/* Finish screen */}
          {view === "finished" && (
            <FinishScreen
              map={map} timeMs={finalMs} deaths={deathsRef.current} result={finishResult} submitting={submitting}
              onRetry={handleRetry} onExit={handleExitRun}
              onSpectate={multiplayer && lobby?.status === "in_run" ? handleSpectateCurrent : undefined}
            />
          )}

          <Canvas dpr={isMobile ? CANVAS_DPR_MOBILE : CANVAS_DPR} camera={CANVAS_CAMERA} className="absolute inset-0">
            <Suspense fallback={null}>
              <ParkourScene
                userId={userId} username={username} map={map}
                equippedByCategory={equippedByCategory} gender={gender}
                cameraControls={cameraControls} running={running && view === "playing"}
                mobileMode={isMobile} resetSignal={resetSignal} multiplayer={multiplayer}
                progressRef={progressRef}
                onFinish={handleFinish} onCheckpoint={handleCheckpoint} onFall={handleFall} onFirstMove={handleFirstMove} onHazardHit={handleHazardHit}
              />
              <Preload all />
            </Suspense>
          </Canvas>
        </div>
      </div>
    );
  }

  // ════════════════════════════════ MENU ════════════════════════════════
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar credits={credits} streakDays={streakDays} inventoryCount={inventoryCount} isAdmin={isAdmin} isModerator={isModerator} />
      {/* Lobby lifecycle banner (host closed, kicked, join failed) */}
      {lobbyToast && (
        <div className="fixed top-20 left-1/2 z-50 -translate-x-1/2 animate-[float-up_0.3s_ease-out] rounded-xl border border-amber-400/40 bg-amber-500/15 px-5 py-2.5 text-sm font-semibold text-amber-200 shadow-lg backdrop-blur">
          {lobbyToast}
        </div>
      )}
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-black text-white">
              <Zap className="h-8 w-8 text-purple-400" /> Parkour
            </h1>
            <p className="mt-1 text-sm text-zinc-400">4 wahnsinnige Maps · millisekunden-genaue Bestenlisten · Solo &amp; Multiplayer-Lobbys</p>
          </div>
          <Link href="/" onMouseEnter={sound.hover} onClick={sound.click}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-300 hover:border-white/30">
            <ArrowLeft className="h-4 w-4" /> Zurück
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* Left: map picker + play controls */}
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              {PARKOUR_MAPS.map((m) => {
                const disabled = !isMapEnabled(m.id, config);
                const best = bests[m.id];
                const medal = best != null ? medalFor(best, m.medals) : null;
                return (
                  <button
                    key={m.id}
                    disabled={disabled}
                    onMouseEnter={sound.hover}
                    onClick={() => { setSelectedId(m.id); setRandomizer(false); sound.click(); }}
                    className={`relative overflow-hidden rounded-2xl border p-4 text-left transition-all ${
                      disabled ? "cursor-not-allowed border-white/5 opacity-40"
                        : selectedId === m.id && !randomizer
                          ? "border-purple-400/70 bg-purple-500/10 shadow-[0_0_24px_rgba(168,85,247,0.25)]"
                          : "border-white/10 bg-black/30 hover:border-white/25"
                    }`}
                    style={{ background: selectedId === m.id && !randomizer ? undefined : `linear-gradient(135deg, ${m.theme.fog}66, transparent)` }}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-lg font-black text-white">{m.name}</span>
                      <span className={`text-xs font-bold ${DIFF_COLOR[m.difficulty]}`}>{m.difficulty}</span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-zinc-400">{m.tagline}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-zinc-500">{m.checkpoints.length} Checkpoints</span>
                      {best != null ? (
                        <span className="flex items-center gap-1 font-mono text-sm font-bold text-emerald-300">
                          {medal && <span title={MEDAL_META[medal].label}>{MEDAL_META[medal].icon}</span>}
                          {formatParkourTime(best)}
                        </span>
                      ) : <span className="text-xs text-zinc-600">Noch keine Zeit</span>}
                    </div>
                    {disabled && <span className="absolute top-2 right-2 rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">AUS</span>}
                  </button>
                );
              })}
            </div>

            {/* Play row */}
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
              <button onClick={() => { setRandomizer((r) => !r); sound.click(); }} onMouseEnter={sound.hover}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors ${
                  randomizer ? "border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-200" : "border-white/15 bg-black/40 text-zinc-300 hover:border-white/30"
                }`}>
                <Shuffle className="h-4 w-4" /> Randomizer {randomizer ? "AN" : "AUS"}
              </button>
              <button onClick={launchSingle} onMouseEnter={sound.hover}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-black text-white shadow-[0_0_20px_rgba(147,51,234,0.45)] transition-colors hover:bg-purple-500">
                <Play className="h-4 w-4" /> {randomizer ? "Zufalls-Map spielen" : `${selectedMap.name} spielen`}
              </button>
              <span className="ml-auto text-xs text-zinc-500">
                Belohnung: <span className="font-bold text-amber-300">{selectedMap.rewardCredits} CR</span> + <span className="font-bold text-cyan-300">{selectedMap.rewardXp} XP</span>
                {selectedMap.bestBonusCredits > 0 && <> · Bestzeit-Bonus <span className="font-bold text-emerald-300">+{selectedMap.bestBonusCredits} CR</span></>}
              </span>
            </div>

            {/* Lobby */}
            <LobbyPanel
              lobby={lobby} isHost={isHost} userId={userId} onlineIds={onlineIds}
              friends={friends} busy={lobbyBusy} inviteOpen={inviteOpen} setInviteOpen={setInviteOpen}
              onCreate={handleCreateLobby} onLeave={handleLeaveLobby} onStart={handleHostStart}
              onSetMap={handleHostSetMap} onInvite={handleInvite} selectedId={selectedId} randomizer={randomizer}
              config={config} onSpectate={handleSpectateCurrent}
            />
          </div>

          {/* Right: leaderboard + medals */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-bold text-zinc-100"><Trophy className="h-5 w-5 text-amber-400" /> Bestenliste · {selectedMap.name}</h2>
                <button onClick={() => loadLeaderboard(selectedId)} className="rounded-full p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300">
                  <RotateCcw className={`h-4 w-4 ${lbLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
              {lbLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-purple-400" /></div>
              ) : leaderboard.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-600">Noch keine Zeiten — sei der Erste!</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {leaderboard.map((e) => {
                    const self = e.userId === userId;
                    return (
                      <div key={e.userId} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${self ? "bg-purple-500/15 ring-1 ring-inset ring-purple-500/25" : e.rank <= 3 ? "bg-white/[0.03]" : ""}`}>
                        <span className="flex w-6 justify-center">
                          {e.rank === 1 ? <Crown className="h-4 w-4 text-amber-400" /> : e.rank <= 3 ? <Medal className="h-4 w-4 text-zinc-300" /> : <span className="text-xs font-bold text-zinc-600">#{e.rank}</span>}
                        </span>
                        <span className="flex-1 truncate text-sm">
                          <StyledUsername name={e.username} styleKey={e.nameStyleKey} userId={e.userId} size="sm" />
                          {self && <span className="ml-1 text-purple-400">(Du)</span>}
                        </span>
                        <div className="flex flex-col items-end leading-tight">
                          <span className="font-mono text-sm font-bold tabular-nums text-amber-300" title="T/D-Score: Zeit + Todes-Strafe">{formatParkourTime(e.tdMs)}</span>
                          <span className="font-mono text-[10px] text-zinc-500">{formatParkourTime(e.bestTimeMs)} · ☠{e.deaths}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Medal targets */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <h3 className="mb-2 text-sm font-bold text-zinc-200">Medaillen-Ziele · {selectedMap.name}</h3>
              <div className="grid grid-cols-2 gap-2">
                {(["diamond", "gold", "silver", "bronze"] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/30 px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: MEDAL_META[k].color }}>{MEDAL_META[k].icon} {MEDAL_META[k].label}</span>
                    <span className="font-mono text-xs text-zinc-300">{formatParkourTime(selectedMap.medals[k])}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** The live run clock. Writes the time straight into its own DOM node via rAF —
 * NO React state, so it never re-renders (not even itself). Zero React work per
 * frame → nothing to hitch the run. */
function RunTimer({ startMsRef }: { startMsRef: React.RefObject<number | null> }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = spanRef.current;
      if (el) el.textContent = formatParkourTime(startMsRef.current !== null ? performance.now() - startMsRef.current : 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startMsRef]);
  return <span ref={spanRef}>0:00.000</span>;
}

function GateScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-black px-6 text-center">
      <Zap className="h-14 w-14 text-purple-400/60" />
      <p className="max-w-md text-lg font-bold text-zinc-200">{message}</p>
      <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-500">
        <Home className="h-4 w-4" /> Zur Startseite
      </Link>
    </div>
  );
}

function FinishScreen({
  map, timeMs, deaths, result, submitting, onRetry, onExit, onSpectate,
}: {
  map: ParkourMap; timeMs: number; deaths: number; result: ParkourSubmitResult | null; submitting: boolean;
  onRetry: () => void; onExit: () => void;
  /** MP only: watch the rest of the race instead of retrying/leaving. */
  onSpectate?: () => void;
}) {
  const medal = medalFor(timeMs, map.medals);
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-black/85 px-6 text-center backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2">
        <Flag className="h-12 w-12 text-emerald-400" />
        <h2 className="text-4xl font-black text-emerald-300">Geschafft!</h2>
        <span className="text-sm text-zinc-400">{map.name}</span>
      </div>
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/50 px-6 py-4">
        <Timer className="h-6 w-6 text-cyan-300" />
        <span className="font-mono text-4xl font-black tabular-nums text-white">{formatParkourTime(timeMs)}</span>
        {medal && <span className="text-3xl" title={MEDAL_META[medal].label}>{MEDAL_META[medal].icon}</span>}
      </div>
      <div className="-mt-2 flex items-center gap-1.5 text-sm text-red-300/90">
        <span>☠</span> {deaths} {deaths === 1 ? "Tod" : "Tode"}
      </div>

      {submitting ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Wird gespeichert…</div>
      ) : result?.success ? (
        <div className="flex flex-col items-center gap-1.5">
          {result.isNewRecord && <span className="rounded-full bg-amber-500/20 px-4 py-1 text-sm font-black text-amber-300">🏆 NEUE BESTZEIT!</span>}
          <span className="text-sm text-zinc-300">Rang <span className="font-bold text-white">#{result.rank}</span></span>
          {(result.creditsAwarded ?? 0) > 0 || (result.xpAwarded ?? 0) > 0 ? (
            <span className="text-sm">
              {(result.creditsAwarded ?? 0) > 0 && <span className="font-bold text-amber-300">+{result.creditsAwarded} CR</span>}
              {(result.xpAwarded ?? 0) > 0 && <span className="ml-2 font-bold text-cyan-300">+{result.xpAwarded} XP</span>}
            </span>
          ) : result.rewardCapped ? (
            <span className="text-xs text-zinc-500">Tägliches Belohnungs-Limit erreicht — Zeit zählt trotzdem für die Bestenliste.</span>
          ) : null}
        </div>
      ) : result?.error ? (
        <span className="text-sm text-red-400">{result.error}</span>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button onClick={onRetry} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-base font-bold text-white shadow-[0_0_20px_rgba(147,51,234,0.5)] hover:bg-purple-500">
          <RotateCcw className="h-5 w-5" /> Nochmal
        </button>
        {onSpectate && (
          <button onClick={onSpectate} className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/15 px-6 py-3 text-base font-semibold text-fuchsia-100 hover:bg-fuchsia-500/25">
            <Eye className="h-5 w-5" /> Zuschauen
          </button>
        )}
        <button onClick={onExit} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-base font-semibold text-zinc-200 hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" /> Menü
        </button>
      </div>
    </div>
  );
}

function LobbyPanel({
  lobby, isHost, userId, onlineIds, friends, busy, inviteOpen, setInviteOpen,
  onCreate, onLeave, onStart, onSetMap, onInvite, selectedId, randomizer, config, onSpectate,
}: {
  lobby: ParkourLobbyState | null; isHost: boolean; userId: string; onlineIds: Set<string>;
  friends: ParkourFriend[]; busy: boolean; inviteOpen: boolean; setInviteOpen: (v: boolean) => void;
  onCreate: () => void; onLeave: () => void; onStart: () => void;
  onSetMap: (mapId: string, rnd: boolean) => void; onInvite: (friendId: string) => Promise<{ ok: boolean; error?: string }>;
  selectedId: string; randomizer: boolean; config: ParkourConfig; onSpectate: () => void;
}) {
  const memberIds = new Set(lobby?.members.map((m) => m.userId));
  // Per-friend invite state + a transient confirmation message, so a player can't
  // spam-invite (button locks after sending) and always sees it went through.
  const [inviteState, setInviteState] = useState<Record<string, "sending" | "sent" | "error">>({});
  const [inviteMsg, setInviteMsg] = useState<{ text: string; ok: boolean } | null>(null);
  async function doInvite(friendId: string) {
    if (inviteState[friendId] === "sending" || inviteState[friendId] === "sent") return;
    setInviteState((s) => ({ ...s, [friendId]: "sending" }));
    const res = await onInvite(friendId);
    setInviteState((s) => ({ ...s, [friendId]: res.ok ? "sent" : "error" }));
    setInviteMsg({ text: res.ok ? "Einladung gesendet ✓" : (res.error ?? "Einladung fehlgeschlagen."), ok: res.ok });
    setTimeout(() => setInviteMsg(null), 3500);
  }
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-zinc-100"><Users className="h-5 w-5 text-purple-400" /> Multiplayer-Lobby</h2>
      {!lobby ? (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm text-zinc-400">Erstelle eine Lobby und lade bis zu {config.maxLobbySize} Freunde zum Race ein — der Host bestimmt Map oder Randomizer.</p>
          <button onClick={onCreate} disabled={busy} onMouseEnter={undefined}
            className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-fuchsia-500 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Lobby erstellen
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="rounded bg-white/5 px-2 py-0.5 font-mono">{lobby.randomizer ? "🎲 Randomizer" : (PARKOUR_MAPS.find((m) => m.id === lobby.mapId)?.name ?? lobby.mapId)}</span>
            <span>· {lobby.members.length}/{lobby.maxPlayers} Spieler</span>
            {lobby.status === "in_run" && <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300">Läuft</span>}
          </div>
          <div className="flex flex-col gap-1">
            {lobby.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-2 rounded-lg bg-black/30 px-2.5 py-1.5 text-sm">
                <span className={`h-1.5 w-1.5 rounded-full ${onlineIds.has(m.userId) || m.userId === userId ? "bg-emerald-400" : "bg-zinc-600"}`} />
                <span className="text-zinc-200">{m.username}</span>
                {m.isHost && <span className="rounded bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-300">HOST</span>}
                {m.bestTimeMs != null && <span className="ml-auto font-mono text-xs text-emerald-300">{formatParkourTime(m.bestTimeMs)}</span>}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isHost && (
              <>
                <button onClick={() => onSetMap(randomizer ? "random" : selectedId, randomizer)}
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-white/30">
                  Map = {randomizer ? "🎲 Randomizer" : (PARKOUR_MAPS.find((m) => m.id === selectedId)?.name)} übernehmen
                </button>
                <button onClick={onStart} disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {lobby.status === "in_run" ? "Neu starten" : "Rennen starten"}
                </button>
              </>
            )}
            {lobby.status === "in_run" && (
              <button onClick={onSpectate} className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/15 px-3 py-1.5 text-xs font-semibold text-fuchsia-200 hover:bg-fuchsia-500/25">
                <Eye className="h-3.5 w-3.5" /> Zuschauen
              </button>
            )}
            <button onClick={() => setInviteOpen(!inviteOpen)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-white/30">
              <UserPlus className="h-3.5 w-3.5" /> Freunde einladen
            </button>
            <button onClick={onLeave} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10">
              <LogOut className="h-3.5 w-3.5" /> {isHost ? "Lobby schließen" : "Verlassen"}
            </button>
          </div>

          {inviteOpen && (
            <div className="rounded-xl border border-white/10 bg-black/40 p-3">
              {inviteMsg && (
                <div className={`mb-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${inviteMsg.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                  {inviteMsg.text}
                </div>
              )}
              {friends.length === 0 ? (
                <p className="text-xs text-zinc-500">Keine Freunde gefunden. Füge über <Link href="/friends" className="text-purple-400 underline">/friends</Link> welche hinzu.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {friends.map((f) => {
                    const st = inviteState[f.userId];
                    const isMember = memberIds.has(f.userId);
                    const locked = isMember || st === "sending" || st === "sent";
                    const label = isMember ? "Dabei"
                      : st === "sending" ? "Sende…"
                      : st === "sent" ? "Eingeladen ✓"
                      : st === "error" ? "Erneut"
                      : "Einladen";
                    return (
                      <div key={f.userId} className="flex items-center gap-2 text-sm">
                        <StyledUsername name={f.username} styleKey={f.nameStyleKey} userId={f.userId} size="sm" />
                        <button
                          disabled={locked}
                          onClick={() => doInvite(f.userId)}
                          className={`ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold text-white transition-colors disabled:cursor-default ${
                            st === "sent" ? "bg-emerald-600/70" : st === "error" ? "bg-amber-600 hover:bg-amber-500" : "bg-purple-600 hover:bg-purple-500"
                          } ${isMember ? "opacity-40" : ""}`}
                        >
                          {st === "sending" && <Loader2 className="h-3 w-3 animate-spin" />}
                          {label}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
