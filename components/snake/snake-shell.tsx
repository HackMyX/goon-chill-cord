"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Zap, Crown, Trophy, Medal, Star, Coins, Skull,
  RotateCcw, ChevronDown, ShieldAlert, Sparkles, Gift,
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
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; decay: number; r: number; color: string; glow?: boolean;
}
interface FloatingText {
  x: number; y: number; vy: number;
  text: string; life: number; decay: number; color: string; size: number;
}
interface GameState {
  snake: Pos[];
  apple: Pos;
  goldenApple: Pos | null;
  goldenAppleMovesLeft: number;
  dir: Dir;
  nextDir: Dir;
  score: number;
  creditsEarned: number;
  phase: Phase;
  speedMode: "x1" | "x2";
  particles: Particle[];
  ambientParticles: Particle[];
  floatingTexts: FloatingText[];
  bonusFlashFrames: number;
  bonusBannerText: string;
  bonusBannerFrames: number;
  comboMultLeft: number;
  frameCount: number;
  deathFlashFrames: number;
  scorePopFrame: number;
  lastMoveTime: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function posEq(a: Pos, b: Pos) { return a.x === b.x && a.y === b.y; }

function randomPos(size: number, exclude: Pos[]): Pos {
  let pos: Pos;
  do { pos = { x: Math.floor(Math.random() * size), y: Math.floor(Math.random() * size) }; }
  while (exclude.some((e) => posEq(e, pos)));
  return pos;
}

const OPP: Record<Dir, Dir> = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };
const DIR_MAP: Record<string, Dir> = {
  ArrowUp: "UP", KeyW: "UP", ArrowDown: "DOWN", KeyS: "DOWN",
  ArrowLeft: "LEFT", KeyA: "LEFT", ArrowRight: "RIGHT", KeyD: "RIGHT",
};

function getSpeedMs(score: number, mode: "x1" | "x2", cfg: SnakeConfig): number {
  const base = mode === "x2" ? cfg.x2InitialSpeedMs : cfg.initialSpeedMs;
  return Math.max(cfg.minSpeedMs, base - score * cfg.speedIncreasePerApple);
}

// ---------------------------------------------------------------------------
// Canvas draw
// ---------------------------------------------------------------------------

function drawFrame(canvas: HTMLCanvasElement, g: GameState, cfg: SnakeConfig) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const BOARD = cfg.boardSize;
  const cell = W / BOARD;
  const t = g.frameCount;

  // === Background ===
  ctx.fillStyle = "#05040e";
  ctx.fillRect(0, 0, W, W);

  // Grid lines
  ctx.strokeStyle = "rgba(139,92,246,0.06)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= BOARD; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, W); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(W, i * cell); ctx.stroke();
  }

  // Corner ambient glows
  const cornerGlow = (cx: number, cy: number, color: string) => {
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.4);
    gr.addColorStop(0, color);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, W);
  };
  const pulse = 0.04 + Math.sin(t * 0.015) * 0.02;
  cornerGlow(0, 0, `rgba(139,92,246,${pulse})`);
  cornerGlow(W, W, `rgba(6,182,212,${pulse * 0.7})`);

  // === Ambient particles ===
  for (const p of g.ambientParticles) {
    ctx.globalAlpha = p.life * 0.4;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // === Bonus flash overlay ===
  if (g.bonusFlashFrames > 0) {
    const alpha = (g.bonusFlashFrames / 40) * 0.35;
    ctx.fillStyle = `rgba(251,191,36,${alpha})`;
    ctx.fillRect(0, 0, W, W);
  }

  // === Death flash overlay ===
  if (g.deathFlashFrames > 0) {
    const alpha = (g.deathFlashFrames / 30) * 0.5;
    ctx.fillStyle = `rgba(239,68,68,${alpha})`;
    ctx.fillRect(0, 0, W, W);
  }

  // === Golden apple ===
  if (g.goldenApple) {
    const gx = g.goldenApple.x * cell + cell / 2;
    const gy = g.goldenApple.y * cell + cell / 2;
    // Rotating sparkle dots
    const sparkCount = 5;
    const sparkR = cell * 0.7 + Math.sin(t * 0.08) * cell * 0.1;
    for (let i = 0; i < sparkCount; i++) {
      const angle = (i / sparkCount) * Math.PI * 2 + t * 0.05;
      const sx = gx + Math.cos(angle) * sparkR;
      const sy = gy + Math.sin(angle) * sparkR;
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(sx, sy, cell * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Outer glow
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, cell * 1.4);
    gg.addColorStop(0, "rgba(251,191,36,0.5)");
    gg.addColorStop(1, "rgba(251,191,36,0)");
    ctx.fillStyle = gg;
    ctx.fillRect(g.goldenApple.x * cell - cell, g.goldenApple.y * cell - cell, cell * 3, cell * 3);
    // Body
    const glScale = 1 + Math.sin(t * 0.1) * 0.08;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(glScale, glScale);
    ctx.fillStyle = "#f59e0b";
    ctx.shadowColor = "#fbbf24";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    const gr2 = cell * 0.38;
    ctx.roundRect(-cell * 0.38, -cell * 0.38, cell * 0.76, cell * 0.76, gr2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Shine
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.ellipse(-cell * 0.1, -cell * 0.12, cell * 0.11, cell * 0.07, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // === Regular apple ===
  {
    const ax = g.apple.x * cell + cell / 2;
    const ay = g.apple.y * cell + cell / 2;
    const pulseR = cell * (0.5 + Math.sin(t * 0.07) * 0.06);
    // Outer glow ring (pulsing)
    const gr = ctx.createRadialGradient(ax, ay, 0, ax, ay, pulseR * 2.5);
    gr.addColorStop(0, "rgba(239,68,68,0.35)");
    gr.addColorStop(0.5, "rgba(239,68,68,0.1)");
    gr.addColorStop(1, "rgba(239,68,68,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(g.apple.x * cell - cell, g.apple.y * cell - cell, cell * 3, cell * 3);
    // Body
    ctx.shadowColor = "#ef4444";
    ctx.shadowBlur = 8 + Math.sin(t * 0.07) * 4;
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.roundRect(g.apple.x * cell + cell * 0.12, g.apple.y * cell + cell * 0.12, cell * 0.76, cell * 0.76, cell * 0.36);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Shine
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.ellipse(ax - cell * 0.12, ay - cell * 0.16, cell * 0.11, cell * 0.07, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // === Snake ===
  if (g.snake.length > 0) {
    // Draw tail to head (so head is on top)
    for (let i = g.snake.length - 1; i >= 0; i--) {
      const seg = g.snake[i];
      const isHead = i === 0;
      const tRatio = 1 - i / g.snake.length;

      if (isHead) {
        // Head glow
        const hx = seg.x * cell + cell / 2;
        const hy = seg.y * cell + cell / 2;
        const hGlow = ctx.createRadialGradient(hx, hy, 0, hx, hy, cell * 1.2);
        hGlow.addColorStop(0, "rgba(52,211,153,0.45)");
        hGlow.addColorStop(1, "rgba(52,211,153,0)");
        ctx.fillStyle = hGlow;
        ctx.fillRect(seg.x * cell - cell * 0.5, seg.y * cell - cell * 0.5, cell * 2, cell * 2);

        ctx.shadowColor = "#34d399";
        ctx.shadowBlur = 12;
      }

      // Body color: bright cyan head → dark green tail
      const r = Math.round(34 + (20 - 34) * (1 - tRatio));
      const g2 = Math.round(211 - 120 * (1 - tRatio));
      const b = Math.round(153 - 80 * (1 - tRatio));
      const alpha = isHead ? 1 : 0.65 + 0.35 * tRatio;
      ctx.fillStyle = `rgba(${r},${g2},${b},${alpha})`;

      const pad = isHead ? 0.05 : 0.1 + 0.05 * (1 - tRatio);
      const segR = cell * (isHead ? 0.38 : 0.3);
      ctx.beginPath();
      ctx.roundRect(
        seg.x * cell + cell * pad, seg.y * cell + cell * pad,
        cell * (1 - 2 * pad), cell * (1 - 2 * pad), segR
      );
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner highlight on each segment
      if (tRatio > 0.3) {
        ctx.fillStyle = `rgba(255,255,255,${0.07 * tRatio})`;
        ctx.beginPath();
        ctx.roundRect(
          seg.x * cell + cell * (pad + 0.05), seg.y * cell + cell * pad,
          cell * (0.4 - pad * 0.5), cell * (0.3 - pad * 0.5),
          segR * 0.5
        );
        ctx.fill();
      }

      // Eyes on head
      if (isHead) {
        const dir = g.dir;
        let ex1: number, ey1: number, ex2: number, ey2: number;
        const hc = cell / 2;
        const eo = cell * 0.2;
        const ed = cell * 0.25;
        if (dir === "RIGHT")  { ex1 = seg.x*cell+hc+ed; ey1 = seg.y*cell+hc-eo; ex2 = seg.x*cell+hc+ed; ey2 = seg.y*cell+hc+eo; }
        else if (dir === "LEFT")  { ex1 = seg.x*cell+hc-ed; ey1 = seg.y*cell+hc-eo; ex2 = seg.x*cell+hc-ed; ey2 = seg.y*cell+hc+eo; }
        else if (dir === "DOWN")  { ex1 = seg.x*cell+hc-eo; ey1 = seg.y*cell+hc+ed; ex2 = seg.x*cell+hc+eo; ey2 = seg.y*cell+hc+ed; }
        else                      { ex1 = seg.x*cell+hc-eo; ey1 = seg.y*cell+hc-ed; ex2 = seg.x*cell+hc+eo; ey2 = seg.y*cell+hc-ed; }
        ctx.fillStyle = "#030305";
        ctx.beginPath(); ctx.arc(ex1, ey1, cell * 0.07, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex2, ey2, cell * 0.07, 0, Math.PI * 2); ctx.fill();
        // Eye shine
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath(); ctx.arc(ex1 + 0.5, ey1 - 0.5, cell * 0.03, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex2 + 0.5, ey2 - 0.5, cell * 0.03, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // === Game particles ===
  for (const p of g.particles) {
    ctx.globalAlpha = p.life;
    if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 6; }
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  // === Floating texts ===
  for (const ft of g.floatingTexts) {
    ctx.globalAlpha = ft.life;
    ctx.fillStyle = ft.color;
    ctx.shadowColor = ft.color;
    ctx.shadowBlur = 6;
    ctx.font = `900 ${ft.size}px "Geist Mono", monospace`;
    ctx.textAlign = "center";
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  // === Combo multiplier banner (canvas) ===
  if (g.comboMultLeft > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, cell * 0.9);
    ctx.fillStyle = "#fbbf24";
    ctx.shadowColor = "#fbbf24";
    ctx.shadowBlur = 10;
    ctx.font = `700 ${cell * 0.5}px "Geist Sans", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`⚡ 2× COMBO — ${g.comboMultLeft} Äpfel`, W / 2, cell * 0.62);
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
  }

  // === Phase: idle demo snake animation ===
  if (g.phase === "idle") {
    // Vignette
    const vig = ctx.createRadialGradient(W/2, W/2, W*0.2, W/2, W/2, W*0.85);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, W);
  }
}

// Particle burst on apple eat
function spawnAppleBurst(g: GameState, cx: number, cy: number, isGolden: boolean) {
  const count = isGolden ? 20 : 10;
  const colors = isGolden
    ? ["#fbbf24", "#f59e0b", "#fcd34d", "#ffffff"]
    : ["#ef4444", "#f87171", "#fca5a5", "#34d399"];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const speed = (isGolden ? 3 : 2) + Math.random() * (isGolden ? 3 : 2);
    g.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 1, decay: 0.025 + Math.random() * 0.02,
      r: (isGolden ? 3 : 2) + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      glow: isGolden,
    });
  }
}

function spawnBonusBurst(g: GameState, cx: number, cy: number) {
  const colors = ["#fbbf24", "#a78bfa", "#34d399", "#f472b6", "#60a5fa"];
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 5;
    g.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 1, decay: 0.015 + Math.random() * 0.015,
      r: 2 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      glow: true,
    });
  }
}

function initAmbientParticles(W: number): Particle[] {
  const result: Particle[] = [];
  const colors = ["rgba(139,92,246,0.6)", "rgba(6,182,212,0.5)", "rgba(52,211,153,0.4)"];
  for (let i = 0; i < 25; i++) {
    result.push({
      x: Math.random() * W, y: Math.random() * W,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      life: Math.random(), decay: 0,
      r: 1 + Math.random() * 1.5,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-4 w-4 text-amber-400" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-zinc-300" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-amber-600" />;
  return <span className="w-4 text-center text-xs font-bold text-zinc-500">#{rank}</span>;
}

function Leaderboard({ entries, myBest, userId, speedMode }: {
  entries: SnakeLeaderboardEntry[]; myBest: number; userId: string; speedMode: "x1" | "x2";
}) {
  const myRank = entries.findIndex((e) => e.userId === userId) + 1;
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#080712]">
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <Crown className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-bold text-zinc-100">Highscores</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
          speedMode === "x2" ? "border border-amber-400/30 bg-amber-500/10 text-amber-300" : "border border-purple-400/30 bg-purple-500/10 text-purple-300"
        }`}>{speedMode === "x2" ? "⚡ x2" : "x1"}</span>
      </div>
      <div className="flex flex-col">
        {entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-600">Noch keine Scores</div>
        ) : entries.map((entry) => {
          const isSelf = entry.userId === userId;
          return (
            <div key={entry.userId} className={`flex items-center gap-3 px-4 py-2.5 ${isSelf ? "bg-purple-500/10 ring-1 ring-inset ring-purple-500/20" : "hover:bg-white/[0.02]"}`}>
              <RankIcon rank={entry.rank} />
              <span className={`flex-1 truncate text-sm ${isSelf ? "font-bold text-purple-200" : "text-zinc-300"}`}>
                {isSelf ? "Du" : entry.username}
              </span>
              <span className={`font-mono text-sm font-bold ${entry.rank === 1 ? "text-amber-400" : entry.rank <= 3 ? "text-amber-500/80" : "text-zinc-200"}`}>
                {entry.bestScore}
              </span>
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/8 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-600">Dein Best</span>
          {myRank > 0 && <span className="text-[10px] text-zinc-600">#{myRank}</span>}
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/5">
          <div className="h-full rounded-full bg-purple-500/60 transition-all"
            style={{ width: `${Math.min(100, (myBest / (entries[0]?.bestScore || 1)) * 100)}%` }} />
        </div>
        <p className="mt-1 text-center font-mono text-xl font-extrabold text-zinc-100">{myBest || "—"}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SnakeShellProps {
  userId: string; credits: number; streakDays: number; username: string;
  isAdmin: boolean; isModerator: boolean; config: SnakeConfig;
  leaderboardX1: SnakeLeaderboardEntry[]; leaderboardX2: SnakeLeaderboardEntry[];
  myBestX1: number; myBestX2: number; dailyCrEarned: number;
}

export function SnakeShell({
  userId, credits: initialCredits, streakDays, isAdmin, isModerator,
  config, leaderboardX1, leaderboardX2, myBestX1, myBestX2, dailyCrEarned: initDaily,
}: SnakeShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  const [speedMode, setSpeedMode] = useState<"x1" | "x2">("x1");
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [creditsEarned, setCreditsEarned] = useState(0);
  const [lbTab, setLbTab] = useState<"x1" | "x2">("x1");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{creditsAwarded:number;isNewRecord:boolean;previousBest:number}|null>(null);
  const [dailyCr, setDailyCr] = useState(initDaily);
  const [bonusBannerText, setBonusBannerText] = useState<string | null>(null);
  const [scorePopKey, setScorePopKey] = useState(0);
  const [comboActive, setComboActive] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>({
    snake: [], apple: { x: 5, y: 5 }, goldenApple: null, goldenAppleMovesLeft: 0,
    dir: "RIGHT", nextDir: "RIGHT", score: 0, creditsEarned: 0,
    phase: "idle", speedMode: "x1",
    particles: [], ambientParticles: [], floatingTexts: [],
    bonusFlashFrames: 0, bonusBannerText: "", bonusBannerFrames: 0,
    comboMultLeft: 0, frameCount: 0, deathFlashFrames: 0, scorePopFrame: 0,
    lastMoveTime: 0,
  });
  const speedModeRef = useRef<"x1" | "x2">("x1");
  const rafRef = useRef<number>(0);
  const router = useRouter();
  const sound = useSoundManager();

  const BOARD = config.boardSize;

  // Init ambient particles once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    gameRef.current.ambientParticles = initAmbientParticles(canvas.width);
  }, []);

  // RAF game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const loop = (now: number) => {
      const g = gameRef.current;
      const W = canvas.width;
      const cell = W / BOARD;

      // Update ambient particles (wander + twinkle)
      for (const p of g.ambientParticles) {
        p.x += p.vx; p.y += p.vy;
        p.life = 0.4 + 0.6 * Math.abs(Math.sin(g.frameCount * 0.02 + p.r * 10));
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > W) p.vy *= -1;
      }

      // Update game particles
      g.particles = g.particles.filter((p) => {
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.08; // gravity
        p.life -= p.decay;
        return p.life > 0;
      });

      // Update floating texts
      g.floatingTexts = g.floatingTexts.filter((ft) => {
        ft.y += ft.vy; ft.life -= ft.decay; return ft.life > 0;
      });

      // Countdown frame-based timers
      if (g.bonusFlashFrames > 0) g.bonusFlashFrames--;
      if (g.deathFlashFrames > 0) g.deathFlashFrames--;

      // Snake game tick
      if (g.phase === "playing") {
        const speedMs = getSpeedMs(g.score, g.speedMode, config);
        if (now - g.lastMoveTime >= speedMs) {
          g.lastMoveTime = now;
          tick(g, canvas, W, cell);
        }
      }

      drawFrame(canvas, g, config);
      g.frameCount++;
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [BOARD, config]);

  // Snake tick (mutates gameRef.current)
  const tick = useCallback((g: GameState, canvas: HTMLCanvasElement, W: number, cell: number) => {
    g.dir = g.nextDir;
    const head = g.snake[0];
    let nx = head.x + (g.dir === "RIGHT" ? 1 : g.dir === "LEFT" ? -1 : 0);
    let ny = head.y + (g.dir === "DOWN" ? 1 : g.dir === "UP" ? -1 : 0);

    if (config.wallWrap) {
      nx = ((nx % BOARD) + BOARD) % BOARD;
      ny = ((ny % BOARD) + BOARD) % BOARD;
    } else if (nx < 0 || nx >= BOARD || ny < 0 || ny >= BOARD) {
      doEndGame(g, canvas); return;
    }

    const newHead: Pos = { x: nx, y: ny };
    if (g.snake.slice(0, -1).some((s) => posEq(s, newHead))) {
      doEndGame(g, canvas); return;
    }

    const ateApple = posEq(newHead, g.apple);
    const ateGolden = g.goldenApple !== null && posEq(newHead, g.goldenApple);

    if (ateApple || ateGolden) {
      g.score++;

      // Base CR
      let crBase = g.speedMode === "x2" && g.score >= config.x2AppleThreshold
        ? config.creditsPerAppleX2 : config.creditsPerAppleX1;

      if (ateGolden) {
        crBase = Math.round(crBase * config.goldenAppleCrMultiplier);
        g.goldenApple = null;
      }

      // Combo multiplier
      if (g.comboMultLeft > 0) {
        crBase *= 2;
        g.comboMultLeft--;
        if (g.comboMultLeft === 0) setComboActive(false);
      }

      g.creditsEarned += crBase;

      // Particles + floating text
      const px = (ateGolden ? g.goldenApple?.x ?? newHead.x : g.apple.x) * cell + cell / 2;
      const py = (ateGolden ? g.goldenApple?.y ?? newHead.y : g.apple.y) * cell + cell / 2;
      if (config.particlesEnabled) spawnAppleBurst(g, px, py, ateGolden);
      g.floatingTexts.push({
        x: px, y: py - cell * 0.3,
        vy: -1.2, text: `+${crBase} CR`,
        life: 1, decay: 0.022,
        color: ateGolden ? "#fbbf24" : "#34d399",
        size: Math.max(10, cell * 0.45),
      });

      // Bonus milestone
      if (config.bonusEveryN > 0 && g.score % config.bonusEveryN === 0) {
        g.creditsEarned += config.bonusCrFlat;
        g.bonusFlashFrames = 40;
        const bannerText = `🎉 BONUS! +${config.bonusCrFlat} CR${config.bonusMultiplierApples > 0 ? ` + 2× für ${config.bonusMultiplierApples} Äpfel` : ""}`;
        g.bonusBannerText = bannerText;
        g.bonusBannerFrames = 120;
        if (config.bonusMultiplierApples > 0) {
          g.comboMultLeft = config.bonusMultiplierApples;
          setComboActive(true);
        }
        // Big burst in center
        if (config.particlesEnabled) spawnBonusBurst(g, W / 2, W / 2);
        g.floatingTexts.push({
          x: W / 2, y: W * 0.35,
          vy: -0.6, text: `BONUS! +${config.bonusCrFlat}`,
          life: 1, decay: 0.012,
          color: "#fbbf24", size: Math.max(14, cell * 0.65),
        });
        setBonusBannerText(bannerText);
        setTimeout(() => setBonusBannerText(null), 2800);
      }

      // Golden apple spawn (every bonusEveryN/2 apples that aren't already the bonus)
      if (config.goldenAppleEnabled && g.score % Math.max(1, Math.floor(config.bonusEveryN / 2)) === 0
          && g.score % config.bonusEveryN !== 0 && !g.goldenApple) {
        const excluded = [...g.snake, g.apple];
        g.goldenApple = randomPos(BOARD, excluded);
        g.goldenAppleMovesLeft = config.goldenAppleLifeApples;
      }

      // Move snake (grow)
      g.snake = [newHead, ...g.snake];
      // Spawn new regular apple
      g.apple = randomPos(BOARD, [newHead, ...g.snake, ...(g.goldenApple ? [g.goldenApple] : [])]);

      setScore(g.score);
      setCreditsEarned(g.creditsEarned);
      setScorePopKey((k) => k + 1);
    } else {
      // Normal move
      g.snake = [newHead, ...g.snake.slice(0, -1)];

      // Golden apple life countdown
      if (g.goldenApple) {
        g.goldenAppleMovesLeft--;
        if (g.goldenAppleMovesLeft <= 0) g.goldenApple = null;
      }
    }
  }, [config, BOARD, setScore, setCreditsEarned, setScorePopKey, setComboActive, setBonusBannerText]);

  function doEndGame(g: GameState, canvas: HTMLCanvasElement) {
    g.phase = "dead";
    g.deathFlashFrames = 30;
    setPhase("dead");

    const finalScore = g.score;
    const finalCredits = g.creditsEarned;
    const mode = g.speedMode;

    if (finalScore === 0) return;
    setSubmitting(true);
    submitSnakeScore(finalScore, finalCredits, mode).then((res) => {
      setSubmitting(false);
      if (res.success) {
        setCredits(res.newCredits ?? credits);
        setDailyCr((prev) => prev + (res.creditsAwarded ?? 0));
        setLastResult({ creditsAwarded: res.creditsAwarded ?? 0, isNewRecord: res.isNewRecord ?? false, previousBest: res.previousBest ?? 0 });
        router.refresh();
      }
    });
  }

  // Keyboard input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameRef.current.phase !== "playing") return;
      const d = DIR_MAP[e.code];
      if (!d) return;
      e.preventDefault();
      if (d !== OPP[gameRef.current.dir]) gameRef.current.nextDir = d;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function startGame() {
    const mode = speedModeRef.current;
    const startX = Math.floor(BOARD / 2);
    const startY = Math.floor(BOARD / 2);
    const initSnake: Pos[] = Array.from({ length: config.startLength }, (_, i) => ({ x: startX - i, y: startY }));
    const initApple = randomPos(BOARD, initSnake);

    const g = gameRef.current;
    g.snake = initSnake;
    g.apple = initApple;
    g.goldenApple = null;
    g.goldenAppleMovesLeft = 0;
    g.dir = "RIGHT";
    g.nextDir = "RIGHT";
    g.score = 0;
    g.creditsEarned = 0;
    g.phase = "playing";
    g.speedMode = mode;
    g.particles = [];
    g.floatingTexts = [];
    g.bonusFlashFrames = 0;
    g.comboMultLeft = 0;
    g.deathFlashFrames = 0;
    g.scorePopFrame = 0;
    g.lastMoveTime = performance.now();

    setScore(0);
    setCreditsEarned(0);
    setPhase("playing");
    setLastResult(null);
    setBonusBannerText(null);
    setComboActive(false);
    sound.click();
  }

  const dailyLimitReached = config.dailyCrLimit !== null && dailyCr >= config.dailyCrLimit;
  const dailyRemaining = config.dailyCrLimit !== null ? Math.max(0, config.dailyCrLimit - dailyCr) : null;

  const CANVAS_SIZE = 560;

  return (
    <div className="flex min-h-screen flex-col bg-[#030305]">
      <TopBar credits={credits} streakDays={streakDays} isAdmin={isAdmin} isModerator={isModerator} />

      {/* Header */}
      <div className="border-b border-white/5 bg-[#05040e]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" onMouseEnter={sound.hover} onClick={sound.click}
              className="flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300">
              <ArrowLeft className="h-4 w-4" /> Zurück
            </Link>
            <div className="h-5 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-2xl" style={{ filter: "drop-shadow(0 0 8px rgba(52,211,153,0.6))" }}>🐍</span>
              <span className="text-lg font-extrabold tracking-tight text-zinc-50">Snake</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Speed selector */}
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="hidden text-xs sm:block">Geschwindigkeit</span>
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
                {(["x1", "x2"] as const).map((m) => (
                  <button key={m}
                    onClick={() => { setSpeedMode(m); speedModeRef.current = m; setLbTab(m); sound.click(); }}
                    disabled={phase === "playing"}
                    className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-bold transition-all ${
                      speedMode === m
                        ? m === "x2" ? "bg-amber-500/30 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                                      : "bg-purple-500/30 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.4)]"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}>
                    {m === "x2" && <Zap className="h-3 w-3" />}{m}
                  </button>
                ))}
              </div>
            </div>

            {/* CR info */}
            <div className="hidden items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 sm:flex">
              <Coins className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-300">
                {speedMode === "x2" ? `${config.creditsPerAppleX1}–${config.creditsPerAppleX2} CR / Apfel` : `${config.creditsPerAppleX1} CR / Apfel`}
              </span>
            </div>

            {isAdmin && (
              <Link href="/admin"
                className="hidden items-center gap-1 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-400/10 sm:flex">
                <ShieldAlert className="h-3.5 w-3.5" /> Admin
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Bonus banner */}
      {bonusBannerText && (
        <div className="relative overflow-hidden border-b border-amber-400/20 bg-amber-500/10 py-2 text-center text-sm font-extrabold text-amber-300"
          style={{ animation: "snake-banner-in 2.8s ease forwards" }}>
          <div className="absolute inset-0 -translate-x-full animate-[mine-shimmer_1.5s_ease_forwards] bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
          <Sparkles className="mr-2 inline h-4 w-4" />
          {bonusBannerText}
          <Sparkles className="ml-2 inline h-4 w-4" />
        </div>
      )}

      <main className="mx-auto flex w-full max-w-5xl flex-1 gap-4 px-4 py-5">
        {/* Game area */}
        <div className="flex flex-1 flex-col gap-3">
          {/* HUD */}
          <div className="flex items-stretch gap-3 rounded-xl border border-white/8 bg-[#080712] px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Score</p>
              <p className="text-2xl font-extrabold text-zinc-50"
                key={scorePopKey}
                style={{ animation: phase === "playing" ? "score-pop 0.3s ease" : undefined }}>
                {score}
              </p>
            </div>
            <div className="w-px bg-white/8" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Verdient</p>
              <p className="flex items-center gap-1 text-xl font-extrabold text-emerald-400">
                +{creditsEarned.toLocaleString("de-DE")} <Coins className="h-4 w-4" />
              </p>
            </div>
            {config.bonusEveryN > 0 && (
              <>
                <div className="w-px bg-white/8" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Nächster Bonus</p>
                  <p className="text-sm font-bold text-amber-400">
                    {score === 0 ? `Apfel ${config.bonusEveryN}` :
                      score % config.bonusEveryN === 0 ? "JETZT!" :
                      `Apfel ${Math.ceil(score / config.bonusEveryN) * config.bonusEveryN}`}
                  </p>
                </div>
              </>
            )}
            {comboActive && (
              <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs font-extrabold text-amber-300">2× COMBO</span>
              </div>
            )}
            {dailyRemaining !== null && (
              <div className="ml-auto">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Heute noch</p>
                <p className={`text-sm font-bold ${dailyRemaining === 0 ? "text-red-400" : "text-zinc-300"}`}>
                  {dailyRemaining.toLocaleString("de-DE")} CR
                </p>
              </div>
            )}
          </div>

          {/* Canvas */}
          <div className="relative overflow-hidden rounded-2xl border border-white/8 shadow-[0_0_40px_rgba(139,92,246,0.1)]">
            <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="block w-full aspect-square" />

            {/* Idle overlay */}
            {phase === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/65 backdrop-blur-[2px]">
                <div className="text-7xl drop-shadow-[0_0_30px_rgba(52,211,153,0.8)]">🐍</div>
                <div className="text-center">
                  <h2 className="text-3xl font-extrabold text-zinc-50">{config.sectionTitle}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{config.sectionSubtitle}</p>
                </div>

                {/* Info chips */}
                <div className="flex flex-wrap justify-center gap-2 text-xs">
                  <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-bold text-emerald-300">
                    <Coins className="h-3 w-3" />{config.creditsPerAppleX1} CR/Apfel
                  </span>
                  {config.bonusEveryN > 0 && (
                    <span className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 font-bold text-amber-300">
                      <Gift className="h-3 w-3" />Bonus alle {config.bonusEveryN} Äpfel
                    </span>
                  )}
                  {config.goldenAppleEnabled && (
                    <span className="flex items-center gap-1 rounded-full border border-yellow-400/30 bg-yellow-500/10 px-3 py-1 font-bold text-yellow-300">
                      <Star className="h-3 w-3" />Goldener Apfel ×{config.goldenAppleCrMultiplier}
                    </span>
                  )}
                  {speedMode === "x2" && (
                    <span className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 font-bold text-amber-300">
                      <Zap className="h-3 w-3" />ab Apfel {config.x2AppleThreshold}: ×2 CR
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-600">← → ↑ ↓ oder WASD steuern</p>

                {dailyLimitReached ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-3 text-sm font-bold text-red-400">Tageslimit erreicht</div>
                ) : (
                  <button onClick={startGame} onMouseEnter={sound.hover}
                    className={`group relative overflow-hidden rounded-2xl px-12 py-4 text-xl font-extrabold shadow-lg transition-all active:scale-95 ${
                      speedMode === "x2"
                        ? "bg-amber-500 text-black shadow-amber-500/30 hover:bg-amber-400 hover:shadow-amber-400/60"
                        : "bg-purple-600 text-white shadow-purple-500/30 hover:bg-purple-500 hover:shadow-purple-400/60"
                    }`}>
                    <div className="absolute inset-0 -translate-x-full animate-[mine-shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                    {speedMode === "x2" ? <span className="flex items-center gap-2"><Zap className="h-6 w-6" />Spielen (x2)</span> : "Spielen"}
                  </button>
                )}
              </div>
            )}

            {/* Dead overlay */}
            {phase === "dead" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 backdrop-blur-sm">
                <Skull className="h-14 w-14 text-red-400 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)]" />
                <div className="text-center">
                  <h2 className="text-3xl font-extrabold text-zinc-50">Game Over</h2>
                  <p className="mt-1 text-zinc-400">
                    {score} Äpfel · {creditsEarned.toLocaleString("de-DE")} CR verdient
                  </p>
                </div>
                {submitting ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />Wird gespeichert…
                  </div>
                ) : lastResult && (
                  <div className="flex flex-col items-center gap-2">
                    {lastResult.isNewRecord && (
                      <div className="flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/15 px-4 py-1.5 text-sm font-bold text-amber-300">
                        <Star className="h-4 w-4" />Neuer Rekord! (vorher: {lastResult.previousBest})
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-lg font-bold text-emerald-400">
                      <Coins className="h-5 w-5" />+{lastResult.creditsAwarded.toLocaleString("de-DE")} CR auf dein Konto
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={startGame} onMouseEnter={sound.hover}
                    className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_16px_rgba(147,51,234,0.4)] hover:bg-purple-500">
                    <RotateCcw className="h-4 w-4" />Nochmal
                  </button>
                  <Link href="/"
                    className="flex items-center gap-2 rounded-xl border border-white/15 px-6 py-2.5 text-sm font-semibold text-zinc-300 hover:border-white/30">
                    <ArrowLeft className="h-4 w-4" />Zurück
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-[11px] text-zinc-600">
            <span>← → ↑ ↓ oder WASD</span>
            <span>
              {speedMode === "x2" ? `⚡ x2: ab Apfel ${config.x2AppleThreshold} doppelte CR · ` : ""}
              {config.wallWrap ? "Wand = kein Tod" : "Wand = Tod"}
              {config.bonusEveryN > 0 ? ` · Bonus alle ${config.bonusEveryN} Äpfel` : ""}
            </span>
          </div>
        </div>

        {/* Leaderboard sidebar */}
        <div className="hidden w-52 flex-col gap-3 lg:flex">
          <div className="flex rounded-xl border border-white/8 bg-[#080712] p-1">
            {(["x1", "x2"] as const).map((m) => (
              <button key={m} onClick={() => { setLbTab(m); sound.click(); }} onMouseEnter={sound.hover}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition-colors ${
                  lbTab === m ? m === "x2" ? "bg-amber-500/20 text-amber-300" : "bg-purple-500/20 text-purple-200" : "text-zinc-500 hover:text-zinc-300"
                }`}>
                {m === "x2" && <Zap className="h-3 w-3" />}{m}
              </button>
            ))}
          </div>
          <Leaderboard entries={lbTab === "x1" ? leaderboardX1 : leaderboardX2}
            myBest={lbTab === "x1" ? myBestX1 : myBestX2} userId={userId} speedMode={lbTab} />
        </div>
      </main>

      {/* Mobile leaderboard */}
      <div className="mx-auto w-full max-w-5xl px-4 pb-8 lg:hidden">
        <details className="rounded-2xl border border-white/8 bg-[#080712]">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3">
            <Crown className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-bold text-zinc-200">Highscores</span>
            <ChevronDown className="ml-auto h-4 w-4 text-zinc-500" />
          </summary>
          <div className="flex gap-2 border-t border-white/8 p-3">
            {(["x1", "x2"] as const).map((m) => (
              <button key={m} onClick={() => setLbTab(m)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${lbTab === m ? "bg-purple-500/20 text-purple-200" : "text-zinc-500"}`}>{m}</button>
            ))}
          </div>
          <Leaderboard entries={lbTab === "x1" ? leaderboardX1 : leaderboardX2}
            myBest={lbTab === "x1" ? myBestX1 : myBestX2} userId={userId} speedMode={lbTab} />
        </details>
      </div>
    </div>
  );
}
