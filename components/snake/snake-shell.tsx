"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Zap, Crown, Trophy, Medal, Star, Coins, Skull,
  RotateCcw, Play, ChevronDown, ShieldAlert,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { useSoundManager } from "@/lib/sound-manager";
import { submitSnakeScore } from "@/lib/actions/snake";
import type { SnakeConfig } from "@/lib/snake-config";
import type { SnakeLeaderboardEntry } from "@/lib/actions/snake";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";
type Phase = "idle" | "playing" | "dead";

interface Pos { x: number; y: number }

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

function posEq(a: Pos, b: Pos) { return a.x === b.x && a.y === b.y; }

function randomPos(size: number, exclude: Pos[]): Pos {
  let pos: Pos;
  do {
    pos = { x: Math.floor(Math.random() * size), y: Math.floor(Math.random() * size) };
  } while (exclude.some((e) => posEq(e, pos)));
  return pos;
}

function oppDir(d: Dir): Dir {
  return d === "UP" ? "DOWN" : d === "DOWN" ? "UP" : d === "LEFT" ? "RIGHT" : "LEFT";
}

const DIR_MAP: Record<string, Dir> = {
  ArrowUp: "UP", KeyW: "UP",
  ArrowDown: "DOWN", KeyS: "DOWN",
  ArrowLeft: "LEFT", KeyA: "LEFT",
  ArrowRight: "RIGHT", KeyD: "RIGHT",
};

// ---------------------------------------------------------------------------
// Canvas drawing
// ---------------------------------------------------------------------------

function draw(
  canvas: HTMLCanvasElement,
  snake: Pos[],
  apple: Pos,
  boardSize: number,
  phase: Phase,
  score: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const cell = W / boardSize;

  // Background
  ctx.fillStyle = "#06050f";
  ctx.fillRect(0, 0, W, W);

  // Grid lines (subtle)
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= boardSize; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, W); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(W, i * cell); ctx.stroke();
  }

  // Apple glow
  const ax = apple.x * cell + cell / 2;
  const ay = apple.y * cell + cell / 2;
  const grad = ctx.createRadialGradient(ax, ay, 0, ax, ay, cell * 1.2);
  grad.addColorStop(0, "rgba(239,68,68,0.4)");
  grad.addColorStop(1, "rgba(239,68,68,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(apple.x * cell - cell, apple.y * cell - cell, cell * 3, cell * 3);

  // Apple
  ctx.fillStyle = "#ef4444";
  const r = cell * 0.38;
  ctx.beginPath();
  ctx.roundRect(apple.x * cell + cell * 0.12, apple.y * cell + cell * 0.12, cell * 0.76, cell * 0.76, r);
  ctx.fill();
  // Apple shine
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(apple.x * cell + cell * 0.32, apple.y * cell + cell * 0.28, cell * 0.1, cell * 0.07, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // Snake
  snake.forEach((seg, i) => {
    const isHead = i === 0;
    const t = 1 - i / snake.length;

    // Glow for head
    if (isHead) {
      const hx = seg.x * cell + cell / 2;
      const hy = seg.y * cell + cell / 2;
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, cell);
      g.addColorStop(0, "rgba(52,211,153,0.5)");
      g.addColorStop(1, "rgba(52,211,153,0)");
      ctx.fillStyle = g;
      ctx.fillRect(seg.x * cell - cell * 0.5, seg.y * cell - cell * 0.5, cell * 2, cell * 2);
    }

    const pad = isHead ? 0.06 : 0.1;
    const green = Math.round(210 * t + 120 * (1 - t));
    const blue = Math.round(153 * t + 80 * (1 - t));
    ctx.fillStyle = isHead ? `rgb(52,${green},${blue})` : `rgba(34,${green - 30},${blue - 30},${0.7 + 0.3 * t})`;

    const segR = isHead ? cell * 0.38 : cell * 0.32;
    ctx.beginPath();
    ctx.roundRect(
      seg.x * cell + cell * pad,
      seg.y * cell + cell * pad,
      cell * (1 - 2 * pad),
      cell * (1 - 2 * pad),
      segR
    );
    ctx.fill();

    // Head eyes
    if (isHead) {
      ctx.fillStyle = "#030305";
      const eyeR = cell * 0.07;
      const eyeOffX = cell * 0.22;
      const eyeOffY = cell * 0.28;
      ctx.beginPath(); ctx.arc(seg.x * cell + cell * 0.5 - eyeOffX, seg.y * cell + eyeOffY, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(seg.x * cell + cell * 0.5 + eyeOffX, seg.y * cell + eyeOffY, eyeR, 0, Math.PI * 2); ctx.fill();
    }
  });

  // Death overlay
  if (phase === "dead") {
    ctx.fillStyle = "rgba(239,68,68,0.15)";
    ctx.fillRect(0, 0, W, W);
  }
}

// ---------------------------------------------------------------------------
// Leaderboard sidebar
// ---------------------------------------------------------------------------

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-4 w-4 text-amber-400" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-zinc-300" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-amber-600" />;
  return <span className="w-4 text-center text-xs font-bold text-zinc-500">#{rank}</span>;
}

interface LeaderboardProps {
  entries: SnakeLeaderboardEntry[];
  myBest: number;
  userId: string;
  speedMode: "x1" | "x2";
}

function Leaderboard({ entries, myBest, userId, speedMode }: LeaderboardProps) {
  const myRank = entries.findIndex((e) => e.userId === userId) + 1;

  return (
    <div className="flex flex-col rounded-2xl border border-white/8 bg-[#080712] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <Crown className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-bold text-zinc-100">Highscores</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
          speedMode === "x2"
            ? "border border-amber-400/30 bg-amber-500/10 text-amber-300"
            : "border border-purple-400/30 bg-purple-500/10 text-purple-300"
        }`}>
          {speedMode === "x2" ? "⚡ x2" : "x1"}
        </span>
      </div>

      {/* Entries */}
      <div className="flex flex-col">
        {entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-600">Noch keine Scores</div>
        ) : (
          entries.map((entry) => {
            const isSelf = entry.userId === userId;
            const top3 = entry.rank <= 3;
            return (
              <div
                key={entry.userId}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  isSelf
                    ? "bg-purple-500/10 ring-1 ring-inset ring-purple-500/20"
                    : top3
                    ? "bg-white/[0.02]"
                    : "hover:bg-white/[0.02]"
                }`}
              >
                <RankIcon rank={entry.rank} />
                <span className={`flex-1 truncate text-sm ${isSelf ? "font-bold text-purple-200" : "text-zinc-300"}`}>
                  {isSelf ? "Du" : entry.username}
                </span>
                <span className={`font-mono text-sm font-bold ${
                  entry.rank === 1 ? "text-amber-400" : entry.rank <= 3 ? "text-amber-500/80" : "text-zinc-200"
                }`}>
                  {entry.bestScore}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* My best */}
      <div className="border-t border-white/8 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-600">Dein Best</span>
          {myRank > 0 && myRank <= entries.length && (
            <span className="text-[10px] text-zinc-600">#{myRank}</span>
          )}
        </div>
        <div className="mt-1 h-px w-full bg-purple-500/40 rounded" style={{ width: `${Math.min(100, (myBest / (entries[0]?.bestScore || 1)) * 100)}%` }} />
        <p className="mt-1 text-center font-mono text-lg font-extrabold text-zinc-200">{myBest || "—"}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SnakeShellProps {
  userId: string;
  credits: number;
  streakDays: number;
  username: string;
  isAdmin: boolean;
  isModerator: boolean;
  config: SnakeConfig;
  leaderboardX1: SnakeLeaderboardEntry[];
  leaderboardX2: SnakeLeaderboardEntry[];
  myBestX1: number;
  myBestX2: number;
  dailyCrEarned: number;
}

export function SnakeShell({
  userId,
  credits: initialCredits,
  streakDays,
  username,
  isAdmin,
  isModerator,
  config,
  leaderboardX1,
  leaderboardX2,
  myBestX1,
  myBestX2,
  dailyCrEarned: initialDailyCr,
}: SnakeShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  const [speedMode, setSpeedMode] = useState<"x1" | "x2">("x1");
  const [phase, setPhase] = useState<Phase>("idle");
  const [snake, setSnake] = useState<Pos[]>([{ x: 10, y: 10 }]);
  const [apple, setApple] = useState<Pos>({ x: 5, y: 5 });
  const [score, setScore] = useState(0);
  const [creditsEarned, setCreditsEarned] = useState(0);
  const [lbTab, setLbTab] = useState<"x1" | "x2">("x1");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ creditsAwarded: number; isNewRecord: boolean; previousBest: number } | null>(null);
  const [dailyCr, setDailyCr] = useState(initialDailyCr);
  const [showDead, setShowDead] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snakeRef = useRef<Pos[]>([{ x: 10, y: 10 }]);
  const appleRef = useRef<Pos>({ x: 5, y: 5 });
  const dirRef = useRef<Dir>("RIGHT");
  const nextDirRef = useRef<Dir>("RIGHT");
  const scoreRef = useRef(0);
  const creditsEarnedRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const speedModeRef = useRef<"x1" | "x2">("x1");
  const router = useRouter();
  const sound = useSoundManager();

  const BOARD = config.boardSize;
  const CANVAS_SIZE = Math.min(560, typeof window !== "undefined" ? window.innerWidth - 32 : 560);

  // sync refs
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { speedModeRef.current = speedMode; }, [speedMode]);

  // Redraw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas, snake, apple, BOARD, phase, score);
  }, [snake, apple, phase, score, BOARD]);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current !== "playing") return;
      const d = DIR_MAP[e.code];
      if (!d) return;
      e.preventDefault();
      if (d !== oppDir(dirRef.current)) nextDirRef.current = d;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Game loop
  useEffect(() => {
    if (phase !== "playing") return;

    const speedMs = speedModeRef.current === "x2" ? config.x2InitialSpeedMs : config.initialSpeedMs;
    const currentSpeed = Math.max(
      config.minSpeedMs,
      speedMs - scoreRef.current * config.speedIncreasePerApple
    );

    const id = setInterval(() => {
      if (phaseRef.current !== "playing") return;

      dirRef.current = nextDirRef.current;
      const head = snakeRef.current[0];
      let nx = head.x + (dirRef.current === "RIGHT" ? 1 : dirRef.current === "LEFT" ? -1 : 0);
      let ny = head.y + (dirRef.current === "DOWN" ? 1 : dirRef.current === "UP" ? -1 : 0);

      if (config.wallWrap) {
        nx = ((nx % BOARD) + BOARD) % BOARD;
        ny = ((ny % BOARD) + BOARD) % BOARD;
      } else {
        if (nx < 0 || nx >= BOARD || ny < 0 || ny >= BOARD) {
          endGame();
          return;
        }
      }

      const newHead = { x: nx, y: ny };

      // Self collision (skip last cell since tail moves)
      if (snakeRef.current.slice(0, -1).some((s) => posEq(s, newHead))) {
        endGame();
        return;
      }

      const ateApple = posEq(newHead, appleRef.current);
      const newSnake = ateApple
        ? [newHead, ...snakeRef.current]
        : [newHead, ...snakeRef.current.slice(0, -1)];

      if (ateApple) {
        const newScore = scoreRef.current + 1;
        scoreRef.current = newScore;
        setScore(newScore);

        const mode = speedModeRef.current;
        const isX2Active = mode === "x2" && newScore >= config.x2AppleThreshold;
        const crPerApple = isX2Active ? config.creditsPerAppleX2 : config.creditsPerAppleX1;
        creditsEarnedRef.current += crPerApple;
        setCreditsEarned(creditsEarnedRef.current);

        const newApple = randomPos(BOARD, newSnake);
        appleRef.current = newApple;
        setApple(newApple);
      }

      snakeRef.current = newSnake;
      setSnake([...newSnake]);
    }, currentSpeed);

    return () => clearInterval(id);
  }, [phase, score, config, BOARD, speedMode]);

  function endGame() {
    phaseRef.current = "dead";
    setPhase("dead");
    setShowDead(true);

    const finalScore = scoreRef.current;
    const finalCredits = creditsEarnedRef.current;
    const mode = speedModeRef.current;

    if (finalScore === 0) return;

    setSubmitting(true);
    submitSnakeScore(finalScore, finalCredits, mode).then((res) => {
      setSubmitting(false);
      if (res.success) {
        setCredits(res.newCredits ?? credits);
        setDailyCr((prev) => prev + (res.creditsAwarded ?? 0));
        setLastResult({
          creditsAwarded: res.creditsAwarded ?? 0,
          isNewRecord: res.isNewRecord ?? false,
          previousBest: res.previousBest ?? 0,
        });
        router.refresh();
      }
    });
  }

  function startGame() {
    const startPos = { x: Math.floor(BOARD / 2), y: Math.floor(BOARD / 2) };
    const initSnake = [startPos];
    const initApple = randomPos(BOARD, initSnake);

    snakeRef.current = initSnake;
    appleRef.current = initApple;
    dirRef.current = "RIGHT";
    nextDirRef.current = "RIGHT";
    scoreRef.current = 0;
    creditsEarnedRef.current = 0;

    setSnake(initSnake);
    setApple(initApple);
    setScore(0);
    setCreditsEarned(0);
    setLastResult(null);
    setShowDead(false);
    setPhase("playing");
    sound.click();
  }

  const dailyLimitReached = config.dailyCrLimit !== null && dailyCr >= config.dailyCrLimit;
  const dailyRemaining = config.dailyCrLimit !== null ? Math.max(0, config.dailyCrLimit - dailyCr) : null;
  const activeMode = speedMode;

  return (
    <div className="flex min-h-screen flex-col bg-[#030305]">
      <TopBar credits={credits} streakDays={streakDays} isAdmin={isAdmin} isModerator={isModerator} />

      {/* Header bar */}
      <div className="border-b border-white/5 bg-[#06050f]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              onMouseEnter={sound.hover}
              onClick={sound.click}
              className="flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </Link>
            <div className="h-5 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-2xl">🐍</span>
              <span className="text-lg font-extrabold tracking-tight text-zinc-50">Snake</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Speed mode selector */}
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="hidden text-xs sm:block">Geschwindigkeit</span>
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
                <button
                  onClick={() => { setSpeedMode("x1"); setLbTab("x1"); sound.click(); }}
                  disabled={phase === "playing"}
                  className={`rounded px-3 py-1 text-xs font-bold transition-all ${
                    activeMode === "x1"
                      ? "bg-purple-500/30 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.4)]"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  x1
                </button>
                <button
                  onClick={() => { setSpeedMode("x2"); setLbTab("x2"); sound.click(); }}
                  disabled={phase === "playing"}
                  className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-bold transition-all ${
                    activeMode === "x2"
                      ? "bg-amber-500/30 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Zap className="h-3 w-3" /> x2
                </button>
              </div>
            </div>

            {/* CR per apple display */}
            <div className="hidden items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 sm:flex">
              <Coins className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-300">
                {activeMode === "x2"
                  ? `${config.creditsPerAppleX1}–${config.creditsPerAppleX2} CR / Apfel`
                  : `${config.creditsPerAppleX1} CR / Apfel`}
              </span>
            </div>

            {isAdmin && (
              <Link
                href="/admin"
                className="hidden items-center gap-1 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-400/10 sm:flex"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Admin
              </Link>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-5xl flex-1 gap-4 px-4 py-6">
        {/* Game area */}
        <div className="flex flex-1 flex-col gap-3">
          {/* Score bar */}
          <div className="flex items-center gap-4 rounded-xl border border-white/8 bg-[#080712] px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Score</p>
              <p className="text-2xl font-extrabold text-zinc-50">{score}</p>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Verdient</p>
              <p className="flex items-center gap-1 text-xl font-extrabold text-emerald-400">
                +{creditsEarned.toLocaleString("de-DE")}
                <Coins className="h-4 w-4" />
              </p>
            </div>
            {config.dailyCrLimit !== null && (
              <>
                <div className="h-8 w-px bg-white/10" />
                <div className="ml-auto">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Heute noch</p>
                  <p className={`text-sm font-bold ${dailyRemaining === 0 ? "text-red-400" : "text-zinc-300"}`}>
                    {dailyRemaining?.toLocaleString("de-DE")} CR
                  </p>
                </div>
              </>
            )}
            {activeMode === "x2" && score >= config.x2AppleThreshold && (
              <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-bold text-amber-300">2× Modus aktiv</span>
              </div>
            )}
          </div>

          {/* Canvas wrapper */}
          <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#06050f]">
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="block w-full"
            />

            {/* Idle overlay */}
            {phase === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/70 backdrop-blur-sm">
                <div className="text-6xl" style={{ filter: "drop-shadow(0 0 20px rgba(52,211,153,0.6))" }}>🐍</div>
                <div className="text-center">
                  <h2 className="text-2xl font-extrabold text-zinc-50">{config.sectionTitle}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{config.sectionSubtitle}</p>
                </div>

                {activeMode === "x2" && (
                  <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center">
                    <p className="text-sm font-bold text-amber-300">
                      <Zap className="mr-1 inline h-3.5 w-3.5" />x2 Modus aktiv
                    </p>
                    <p className="text-xs text-amber-400/70">
                      Ab dem {config.x2AppleThreshold}. Apfel: doppelte Credits pro Apfel
                    </p>
                  </div>
                )}

                <div className="flex flex-col items-center gap-1 text-center text-xs text-zinc-500">
                  <p>← → ↑ ↓ oder WASD zum Steuern</p>
                  <p className="text-emerald-400/80">
                    {activeMode === "x2"
                      ? `${config.creditsPerAppleX1}–${config.creditsPerAppleX2} Credits pro Apfel`
                      : `${config.creditsPerAppleX1} Credits pro Apfel`}
                    {config.dailyCrLimit === null ? " · kein Limit" : ` · Tageslimit: ${config.dailyCrLimit.toLocaleString("de-DE")} CR`}
                  </p>
                </div>

                {dailyLimitReached ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-3 text-sm font-bold text-red-400">
                    Tageslimit erreicht — morgen wieder!
                  </div>
                ) : (
                  <button
                    onClick={startGame}
                    onMouseEnter={sound.hover}
                    className={`rounded-xl px-10 py-3.5 text-lg font-extrabold shadow-lg transition-all active:scale-95 ${
                      activeMode === "x2"
                        ? "bg-amber-500 text-black shadow-amber-500/30 hover:bg-amber-400 hover:shadow-amber-500/50"
                        : "bg-purple-600 text-white shadow-purple-500/30 hover:bg-purple-500 hover:shadow-purple-500/50"
                    }`}
                  >
                    {activeMode === "x2" ? (
                      <span className="flex items-center gap-2">
                        <Zap className="h-5 w-5" /> Spielen (x2)
                      </span>
                    ) : (
                      "Spielen"
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Dead overlay */}
            {phase === "dead" && showDead && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 backdrop-blur-sm">
                <Skull className="h-12 w-12 text-red-400 drop-shadow-[0_0_16px_rgba(239,68,68,0.8)]" />
                <div className="text-center">
                  <h2 className="text-2xl font-extrabold text-zinc-50">Game Over</h2>
                  <p className="mt-1 text-sm text-zinc-400">Score: {score} Äpfel</p>
                </div>

                {submitting ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
                    Wird gespeichert…
                  </div>
                ) : lastResult && (
                  <div className="flex flex-col items-center gap-2">
                    {lastResult.isNewRecord && (
                      <div className="flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/15 px-4 py-1.5 text-sm font-bold text-amber-300">
                        <Star className="h-4 w-4" />
                        Neuer Rekord! (vorher: {lastResult.previousBest})
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-lg font-bold text-emerald-400">
                      <Coins className="h-5 w-5" />
                      +{lastResult.creditsAwarded.toLocaleString("de-DE")} CR verdient
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={startGame}
                    onMouseEnter={sound.hover}
                    className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_16px_rgba(147,51,234,0.4)] hover:bg-purple-500"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Nochmal
                  </button>
                  <Link
                    href="/"
                    className="flex items-center gap-2 rounded-xl border border-white/15 px-6 py-2.5 text-sm font-semibold text-zinc-300 hover:border-white/30 hover:text-zinc-100"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Zurück
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Footer hints */}
          <div className="flex items-center justify-between text-[11px] text-zinc-600">
            <span>← → ↑ ↓ oder WASD zum Steuern</span>
            <span>
              {activeMode === "x2"
                ? `⚡ x2: ab Apfel ${config.x2AppleThreshold} doppelte Credits · `
                : ""}
              {config.wallWrap ? "Wand = kein Tod" : "Wand = Tod"}
            </span>
          </div>
        </div>

        {/* Leaderboard sidebar */}
        <div className="hidden w-52 flex-col gap-3 lg:flex">
          {/* Tab switcher */}
          <div className="flex rounded-xl border border-white/8 bg-[#080712] p-1">
            {(["x1", "x2"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setLbTab(m); sound.click(); }}
                onMouseEnter={sound.hover}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition-colors ${
                  lbTab === m
                    ? m === "x2"
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-purple-500/20 text-purple-200"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {m === "x2" && <Zap className="h-3 w-3" />}
                {m}
              </button>
            ))}
          </div>

          <Leaderboard
            entries={lbTab === "x1" ? leaderboardX1 : leaderboardX2}
            myBest={lbTab === "x1" ? myBestX1 : myBestX2}
            userId={userId}
            speedMode={lbTab}
          />
        </div>
      </main>

      {/* Mobile leaderboard accordion */}
      <div className="mx-auto w-full max-w-5xl px-4 pb-8 lg:hidden">
        <details className="rounded-2xl border border-white/8 bg-[#080712]">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3">
            <Crown className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-bold text-zinc-200">Highscores</span>
            <ChevronDown className="ml-auto h-4 w-4 text-zinc-500" />
          </summary>
          <div className="flex gap-2 border-t border-white/8 p-3">
            {(["x1", "x2"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setLbTab(m)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors ${
                  lbTab === m
                    ? "bg-purple-500/20 text-purple-200"
                    : "text-zinc-500"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <Leaderboard
            entries={lbTab === "x1" ? leaderboardX1 : leaderboardX2}
            myBest={lbTab === "x1" ? myBestX1 : myBestX2}
            userId={userId}
            speedMode={lbTab}
          />
        </details>
      </div>
    </div>
  );
}
