"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Canvas } from "@react-three/fiber";
import { Preload } from "@react-three/drei";
import * as THREE from "three";
import {
  ArrowLeft, MousePointerClick, Timer, Flag, RotateCcw, Trophy, Crown, Medal,
  Users, Shuffle, Play, Loader2, LogOut, UserPlus, Home, Zap,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { ParkourScene } from "@/components/parkour/parkour-scene";
import type { CheckpointProgressRef } from "@/components/parkour/parkour-geometry";
import { MobileControls } from "@/components/world/mobile-controls";
import { useCameraControls } from "@/components/world/use-camera-controls";
import { useSoundManager } from "@/lib/sound-manager";
import { useLiveConfig } from "@/lib/use-live-config";
import { StyledUsername } from "@/components/ui/styled-username";
import {
  PARKOUR_MAPS, resolveMap, isMapEnabled, formatParkourTime, medalFor,
  type ParkourConfig, type ParkourMap,
} from "@/lib/parkour-config";
import {
  getParkourConfig, submitParkourRun, getParkourLeaderboard, type ParkourLeaderboardEntry, type ParkourSubmitResult,
  createParkourLobby, joinParkourLobby, leaveParkourLobby, getParkourLobby, setParkourLobbyMap,
  startParkourLobbyRun, reportParkourLobbyTime, inviteFriendToParkour, type ParkourLobbyState,
} from "@/lib/actions/parkour";
import { joinParkourRoom, subscribeToParkourRoster } from "@/lib/parkour-realtime";
import type { EquippedItem } from "@/lib/rarity-colors";

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
  isAdmin?: boolean;
  isModerator?: boolean;
}

const CANVAS_DPR: [number, number] = [1, 2];
const CANVAS_DPR_MOBILE: [number, number] = [1, 1.5];
const CANVAS_SHADOWS = { type: THREE.PCFShadowMap } as const;
const CANVAS_CAMERA = { position: [0, 4, 8] as [number, number, number], fov: 60 };

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
    config: initialConfig, myBests: initialBests, friends, initialLobby, isAdmin = false, isModerator = false,
  } = props;

  const [config, setConfig] = useState(initialConfig);
  useLiveConfig("parkour-config-live", getParkourConfig, setConfig);
  const [bests, setBests] = useState(initialBests);
  const [credits] = useState(initialCredits);
  const sound = useSoundManager();

  const enabledMaps = useMemo(() => PARKOUR_MAPS.filter((m) => isMapEnabled(m.id, config)), [config]);
  const [selectedId, setSelectedId] = useState(enabledMaps[0]?.id ?? PARKOUR_MAPS[0].id);
  const [randomizer, setRandomizer] = useState(false);

  // view: menu → playing → finished (playing renders the Canvas)
  const [view, setView] = useState<"menu" | "playing" | "finished">("menu");
  const [activeMap, setActiveMap] = useState<ParkourMap | null>(null);
  const [multiplayer, setMultiplayer] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  // Lobby
  const [lobby, setLobby] = useState<ParkourLobbyState | null>(initialLobby);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [inviteOpen, setInviteOpen] = useState(false);

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

  // Timer
  const startMsRef = useRef<number | null>(null);
  const [displayMs, setDisplayMs] = useState(0);
  const [running, setRunning] = useState(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // ── Lobby realtime: presence roster + config-change refetch ──
  useLiveConfig(
    lobby ? `parkour-lobby:${lobby.id}` : "parkour-lobby:none",
    async () => (lobby ? await getParkourLobby(lobby.id) : null),
    (fresh) => {
      if (!fresh) return;
      setLobby(fresh);
      // Members auto-launch when the host starts the run.
      if (fresh.status === "in_run" && fresh.activeMapId && view === "menu") {
        const m = PARKOUR_MAPS.find((x) => x.id === fresh.activeMapId);
        if (m) beginRun(resolveMap(m, config), true);
      }
    }
  );
  useEffect(() => {
    if (!lobby) return;
    const untrack = joinParkourRoom(lobby.id, userId);
    const unsub = subscribeToParkourRoster(setOnlineIds);
    return () => { untrack(); unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby?.id, userId]);

  // Arrived via an invite deep-link (?lobby=…) but not yet a member → join it.
  useEffect(() => {
    if (!initialLobby) return;
    if (initialLobby.members.some((m) => m.userId === userId)) return;
    void joinParkourLobby(initialLobby.id).then(async () => {
      const fresh = await getParkourLobby(initialLobby.id);
      if (fresh) setLobby(fresh);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Run lifecycle ──
  const beginRun = useCallback((map: ParkourMap, mp: boolean) => {
    progressRef.current.current = -1;
    startMsRef.current = null;
    setDisplayMs(0);
    setRunning(true);
    setActiveMap(map);
    setMultiplayer(mp);
    setFinishResult(null);
    setResetSignal((s) => s + 1);
    setView("playing");
    sound.click();
  }, [sound]);

  const handleFirstMove = useCallback(() => {
    if (startMsRef.current === null) {
      startMsRef.current = performance.now();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        if (startMsRef.current !== null) setDisplayMs(performance.now() - startMsRef.current);
      }, 47);
    }
  }, []);

  const handleCheckpoint = useCallback((index: number) => {
    sound.win();
    setCheckpointToast(index);
    setTimeout(() => setCheckpointToast(null), 1500);
  }, [sound]);

  const handleFall = useCallback(() => { sound.error(); }, [sound]);

  const handleFinish = useCallback(async () => {
    if (!activeMap) return;
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    const finalMs = startMsRef.current !== null ? performance.now() - startMsRef.current : 0;
    setDisplayMs(finalMs);
    setRunning(false);
    setView("finished");
    sound.ultraWin();
    cameraControls.releaseLock();
    setSubmitting(true);
    const res = await submitParkourRun(activeMap.id, Math.max(1, Math.round(finalMs)));
    setFinishResult(res);
    setSubmitting(false);
    if (res.success && res.timeMs) {
      setBests((b) => ({ ...b, [activeMap.id]: res.isNewRecord ? res.timeMs! : Math.min(b[activeMap.id] ?? Infinity, res.timeMs!) }));
      if (multiplayer && lobby) void reportParkourLobbyTime(lobby.id, res.timeMs);
    }
  }, [activeMap, sound, cameraControls, multiplayer, lobby]);

  const handleRetry = useCallback(() => {
    if (!activeMap) return;
    progressRef.current.current = -1;
    startMsRef.current = null;
    setDisplayMs(0);
    setFinishResult(null);
    setRunning(true);
    setResetSignal((s) => s + 1);
    setView("playing");
    sound.click();
  }, [activeMap, sound]);

  const handleExitRun = useCallback(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    setRunning(false);
    setView("menu");
    setActiveMap(null);
    cameraControls.releaseLock();
    void loadLeaderboard(selectedId);
    sound.click();
  }, [cameraControls, loadLeaderboard, selectedId, sound]);

  useEffect(() => () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); }, []);

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
    if (!lobby) return;
    await leaveParkourLobby(lobby.id);
    setLobby(null);
    setOnlineIds(new Set());
    sound.click();
  }, [lobby, sound]);

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
      const m = PARKOUR_MAPS.find((x) => x.id === res.activeMapId);
      if (m) beginRun(resolveMap(m, config), true);
    }
  }, [lobby, config, beginRun]);

  const handleInvite = useCallback(async (friendId: string) => {
    if (!lobby) return;
    const res = await inviteFriendToParkour(lobby.id, friendId);
    if (res.ok) sound.win(); else sound.error();
  }, [lobby, sound]);

  const selectedMap = useMemo(() => resolveMap(PARKOUR_MAPS.find((m) => m.id === selectedId) ?? PARKOUR_MAPS[0], config), [selectedId, config]);

  // ── Master gate ──
  if (!config.enabled && !isAdmin) {
    return <GateScreen message="Parkour ist derzeit deaktiviert." />;
  }
  if (config.adminOnly && !isAdmin) {
    return <GateScreen message="Parkour ist gerade nur für Admins verfügbar (Soft-Launch)." />;
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
              <span className="font-mono text-2xl font-black tabular-nums text-white">{formatParkourTime(displayMs)}</span>
            </div>
            {totalCp > 0 && (
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1 backdrop-blur">
                <Flag className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-zinc-200">{reachedCp}/{totalCp} Checkpoints</span>
              </div>
            )}
          </div>

          {/* Checkpoint toast */}
          {checkpointToast !== null && (
            <div className="pointer-events-none absolute top-1/3 left-1/2 z-30 -translate-x-1/2 animate-[float-up_1.5s_ease-out_forwards] text-center">
              <div className="text-4xl font-black text-emerald-300 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">CHECKPOINT!</div>
            </div>
          )}

          {/* Multiplayer roster */}
          {multiplayer && lobby && (
            <div className="absolute top-16 right-3 z-20 flex flex-col gap-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2 backdrop-blur">
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
              map={map} timeMs={displayMs} result={finishResult} submitting={submitting}
              onRetry={handleRetry} onExit={handleExitRun}
            />
          )}

          <Canvas shadows={CANVAS_SHADOWS} dpr={isMobile ? CANVAS_DPR_MOBILE : CANVAS_DPR} camera={CANVAS_CAMERA} className="absolute inset-0">
            <Suspense fallback={null}>
              <ParkourScene
                userId={userId} username={username} map={map}
                equippedByCategory={equippedByCategory} gender={gender}
                cameraControls={cameraControls} running={running && view === "playing"}
                mobileMode={isMobile} resetSignal={resetSignal} multiplayer={multiplayer}
                progressRef={progressRef}
                onFinish={handleFinish} onCheckpoint={handleCheckpoint} onFall={handleFall} onFirstMove={handleFirstMove}
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
              config={config}
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
                        <span className="font-mono text-sm font-bold tabular-nums text-emerald-300">{formatParkourTime(e.bestTimeMs)}</span>
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
  map, timeMs, result, submitting, onRetry, onExit,
}: {
  map: ParkourMap; timeMs: number; result: ParkourSubmitResult | null; submitting: boolean;
  onRetry: () => void; onExit: () => void;
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

      <div className="flex items-center gap-3">
        <button onClick={onRetry} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-base font-bold text-white shadow-[0_0_20px_rgba(147,51,234,0.5)] hover:bg-purple-500">
          <RotateCcw className="h-5 w-5" /> Nochmal
        </button>
        <button onClick={onExit} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-base font-semibold text-zinc-200 hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" /> Menü
        </button>
      </div>
    </div>
  );
}

function LobbyPanel({
  lobby, isHost, userId, onlineIds, friends, busy, inviteOpen, setInviteOpen,
  onCreate, onLeave, onStart, onSetMap, onInvite, selectedId, randomizer, config,
}: {
  lobby: ParkourLobbyState | null; isHost: boolean; userId: string; onlineIds: Set<string>;
  friends: ParkourFriend[]; busy: boolean; inviteOpen: boolean; setInviteOpen: (v: boolean) => void;
  onCreate: () => void; onLeave: () => void; onStart: () => void;
  onSetMap: (mapId: string, rnd: boolean) => void; onInvite: (friendId: string) => void;
  selectedId: string; randomizer: boolean; config: ParkourConfig;
}) {
  const memberIds = new Set(lobby?.members.map((m) => m.userId));
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
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Rennen starten
                </button>
              </>
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
              {friends.length === 0 ? (
                <p className="text-xs text-zinc-500">Keine Freunde gefunden. Füge über <Link href="/friends" className="text-purple-400 underline">/friends</Link> welche hinzu.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {friends.map((f) => (
                    <div key={f.userId} className="flex items-center gap-2 text-sm">
                      <StyledUsername name={f.username} styleKey={f.nameStyleKey} userId={f.userId} size="sm" />
                      <button disabled={memberIds.has(f.userId)} onClick={() => onInvite(f.userId)}
                        className="ml-auto rounded-md bg-purple-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-40">
                        {memberIds.has(f.userId) ? "Dabei" : "Einladen"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
