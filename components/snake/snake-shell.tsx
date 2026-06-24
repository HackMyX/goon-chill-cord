"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Zap, Crown, Trophy, Medal, Star, Coins, Skull,
  RotateCcw, ChevronDown, ShieldAlert, Sparkles, Gift, Flame,
  ChevronUp,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { useSoundManager } from "@/lib/sound-manager";
import { submitSnakeScore } from "@/lib/actions/snake";
import type { SnakeConfig, SnakeMode, SnakeModeConfig, SnakeGrindConfig } from "@/lib/snake-config";
import type { SnakeLeaderboardEntry } from "@/lib/actions/snake";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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
  prevSnake: Pos[];
  apple: Pos;
  goldenApple: Pos | null;
  goldenAppleMovesLeft: number;
  dir: Dir;
  nextDir: Dir;
  score: number;
  creditsEarned: number;
  phase: Phase;
  mode: SnakeMode;
  particles: Particle[];
  ambientParticles: Particle[];
  floatingTexts: FloatingText[];
  bonusFlashFrames: number;
  comboMultLeft: number;
  frameCount: number;
  deathFlashFrames: number;
  lastMoveTime: number;
  // Grind-only
  shrinkCount: number;
  applesUntilShrink: number;
  shrinkFlashFrames: number;
  speedTrails: { x: number; y: number; alpha: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual themes
// ─────────────────────────────────────────────────────────────────────────────

interface ModeTheme {
  bg: string;
  gridColor: string;
  snakeHead: string;
  snakeTail: string;
  snakeGlow: string;
  appleColor: string;
  appleGlow: string;
  goldenColor: string;
  ambientColors: string[];
  particleColors: string[];
  cornerGlow1: string;
  cornerGlow2: string;
  borderColor: string;
}

const THEMES: Record<SnakeMode, ModeTheme> = {
  x1: {
    bg: "#030a06",
    gridColor: "rgba(16,185,129,0.045)",
    snakeHead: "#34d399",
    snakeTail: "#064e3b",
    snakeGlow: "#10b981",
    appleColor: "#ef4444",
    appleGlow: "#ef4444",
    goldenColor: "#fbbf24",
    ambientColors: ["rgba(16,185,129,0.55)", "rgba(5,150,105,0.45)", "rgba(52,211,153,0.35)"],
    particleColors: ["#34d399", "#6ee7b7", "#10b981", "#ffffff"],
    cornerGlow1: "rgba(16,185,129,0.06)",
    cornerGlow2: "rgba(6,182,212,0.04)",
    borderColor: "#10b981",
  },
  x2: {
    bg: "#020510",
    gridColor: "rgba(6,182,212,0.055)",
    snakeHead: "#22d3ee",
    snakeTail: "#0c4a6e",
    snakeGlow: "#06b6d4",
    appleColor: "#eab308",
    appleGlow: "#fbbf24",
    goldenColor: "#f59e0b",
    ambientColors: ["rgba(6,182,212,0.55)", "rgba(14,165,233,0.45)", "rgba(34,211,238,0.35)"],
    particleColors: ["#22d3ee", "#67e8f9", "#06b6d4", "#ffffff", "#fbbf24"],
    cornerGlow1: "rgba(6,182,212,0.08)",
    cornerGlow2: "rgba(139,92,246,0.05)",
    borderColor: "#06b6d4",
  },
  grind: {
    bg: "#080503",
    gridColor: "rgba(120,53,15,0.07)",
    snakeHead: "#fbbf24",
    snakeTail: "#92400e",
    snakeGlow: "#f59e0b",
    appleColor: "#c084fc",
    appleGlow: "#a855f7",
    goldenColor: "#f97316",
    ambientColors: ["rgba(245,158,11,0.45)", "rgba(217,119,6,0.35)", "rgba(251,191,36,0.25)"],
    particleColors: ["#fbbf24", "#f97316", "#ef4444", "#ffffff", "#c084fc"],
    cornerGlow1: "rgba(245,158,11,0.07)",
    cornerGlow2: "rgba(239,68,68,0.04)",
    borderColor: "#f59e0b",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function posEq(a: Pos, b: Pos) { return a.x === b.x && a.y === b.y; }

function randomPos(boardSize: number, exclude: Pos[], minX = 0, maxX?: number, minY = 0, maxY?: number): Pos {
  const mx = maxX ?? boardSize - 1;
  const my = maxY ?? boardSize - 1;
  let pos: Pos;
  let attempts = 0;
  do {
    pos = {
      x: minX + Math.floor(Math.random() * (mx - minX + 1)),
      y: minY + Math.floor(Math.random() * (my - minY + 1)),
    };
    attempts++;
  } while (exclude.some((e) => posEq(e, pos)) && attempts < 500);
  return pos;
}

const OPP: Record<Dir, Dir> = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };
const DIR_MAP: Record<string, Dir> = {
  ArrowUp: "UP", KeyW: "UP", ArrowDown: "DOWN", KeyS: "DOWN",
  ArrowLeft: "LEFT", KeyA: "LEFT", ArrowRight: "RIGHT", KeyD: "RIGHT",
};

function getSpeedMs(score: number, modeCfg: SnakeModeConfig): number {
  return Math.max(modeCfg.minSpeedMs, modeCfg.initialSpeedMs - score * modeCfg.speedIncreasePerApple);
}

function lerpColor(c1: string, c2: string, t: number): string {
  const h = (s: string) => ({ r: parseInt(s.slice(1, 3), 16), g: parseInt(s.slice(3, 5), 16), b: parseInt(s.slice(5, 7), 16) });
  const a = h(c1), b = h(c2);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bv = Math.round(a.b + (b.b - a.b) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bv.toString(16).padStart(2, "0")}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Catmull-Rom spline path
function catmullRomPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas rendering
// ─────────────────────────────────────────────────────────────────────────────

function drawFrame(
  canvas: HTMLCanvasElement,
  g: GameState,
  modeCfg: SnakeModeConfig,
  now: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const BOARD = modeCfg.boardSize;
  const cell = W / BOARD;
  const t = g.frameCount;
  const theme = THEMES[g.mode];

  // Smooth movement progress (0→1 within current tick)
  const speedMs = getSpeedMs(g.score, modeCfg);
  const tickProgress = g.phase === "playing"
    ? Math.min(1, (now - g.lastMoveTime) / speedMs)
    : 1;

  // Lerped snake positions in pixel space
  const renderPx: { x: number; y: number }[] = g.snake.map((seg, i) => {
    const prev = g.prevSnake[i];
    if (!prev) return { x: (seg.x + 0.5) * cell, y: (seg.y + 0.5) * cell };
    const dx = seg.x - prev.x;
    const dy = seg.y - prev.y;
    // Skip interpolation on wrap-around jumps
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      return { x: (seg.x + 0.5) * cell, y: (seg.y + 0.5) * cell };
    }
    return {
      x: (prev.x + dx * tickProgress + 0.5) * cell,
      y: (prev.y + dy * tickProgress + 0.5) * cell,
    };
  });

  // ── Background ─────────────────────────────────────────────────────────────
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, W);

  // ── Grind: dead zone cells ─────────────────────────────────────────────────
  if (g.mode === "grind" && g.shrinkCount > 0) {
    const sc = g.shrinkCount;
    // Dead zone fill
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    // top strip
    ctx.fillRect(0, 0, W, sc * cell);
    // bottom strip
    ctx.fillRect(0, (BOARD - sc) * cell, W, sc * cell);
    // left strip
    ctx.fillRect(0, sc * cell, sc * cell, (BOARD - 2 * sc) * cell);
    // right strip
    ctx.fillRect((BOARD - sc) * cell, sc * cell, sc * cell, (BOARD - 2 * sc) * cell);

    // Stone crack texture in dead zone — seeded hash, O(32) not O(N²)
    ctx.strokeStyle = "rgba(120,53,15,0.28)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 32; i++) {
      const sx = Math.abs(Math.sin((i * 6271 + sc * 3141) * 0.00017)) ;
      const sy = Math.abs(Math.sin((i * 3917 + sc * 2718) * 0.00023));
      const lx = Math.sin((i * 1571 + sc * 1414) * 0.00031) * 0.12;
      const ly = Math.sin((i * 2239 + sc * 1618) * 0.00019) * 0.09;
      const ci = Math.floor(sx * BOARD), cj = Math.floor(sy * BOARD);
      if (ci < sc || ci >= BOARD - sc || cj < sc || cj >= BOARD - sc) {
        ctx.beginPath();
        ctx.moveTo(sx * W, sy * W);
        ctx.lineTo(sx * W + lx * W, sy * W + ly * W);
        ctx.stroke();
      }
    }
  }

  // ── Grid lines ─────────────────────────────────────────────────────────────
  ctx.strokeStyle = theme.gridColor;
  ctx.lineWidth = 0.5;
  if (g.mode === "x2") {
    // Scanline effect: alternating rows slightly brighter
    for (let i = 0; i <= BOARD; i++) {
      ctx.globalAlpha = i % 2 === 0 ? 1 : 0.4;
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(W, i * cell); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, W); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else {
    for (let i = 0; i <= BOARD; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, W); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(W, i * cell); ctx.stroke();
    }
  }

  // ── Corner glow ────────────────────────────────────────────────────────────
  const pulse = 0.04 + Math.sin(t * 0.015) * 0.025;
  const drawCornerGlow = (cx: number, cy: number, baseColor: string, alpha: number) => {
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.45);
    gr.addColorStop(0, baseColor.replace(/[\d.]+\)$/, `${alpha})`));
    gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, W);
  };
  drawCornerGlow(0, 0, theme.cornerGlow1, pulse);
  drawCornerGlow(W, W, theme.cornerGlow2, pulse * 0.6);

  // ── Grind: danger zone border ───────────────────────────────────────────────
  if (g.mode === "grind") {
    const sc = g.shrinkCount;
    const danger = g.applesUntilShrink <= 3 && (g.phase === "playing");
    const grindCfg = modeCfg as SnakeGrindConfig;
    const arenaMin = sc;
    const arenaMax = BOARD - 1 - sc;

    // Shrink flash overlay
    if (g.shrinkFlashFrames > 0) {
      const alpha = (g.shrinkFlashFrames / 45) * 0.5;
      ctx.fillStyle = `rgba(239,68,68,${alpha})`;
      ctx.fillRect(0, 0, W, W);
    }

    // Danger ring pulsing
    if (danger || g.shrinkFlashFrames > 0) {
      const pAlpha = danger ? 0.3 + Math.sin(t * 0.2) * 0.25 : (g.shrinkFlashFrames / 45) * 0.9;
      const bx = arenaMin * cell;
      const by = arenaMin * cell;
      const bw = (arenaMax - arenaMin + 1) * cell;
      const bh = bw;
      ctx.strokeStyle = `rgba(239,68,68,${pAlpha})`;
      ctx.lineWidth = cell * 0.4;
      ctx.strokeRect(bx - cell * 0.2, by - cell * 0.2, bw + cell * 0.4, bh + cell * 0.4);
    } else if (g.phase === "playing") {
      // Normal amber arena border
      const aPulse = 0.2 + Math.sin(t * 0.04) * 0.08;
      ctx.strokeStyle = hexToRgba(theme.borderColor, aPulse);
      ctx.lineWidth = cell * 0.25;
      const bx = arenaMin * cell, by = arenaMin * cell;
      const bw = (arenaMax - arenaMin + 1) * cell;
      ctx.strokeRect(bx, by, bw, bw);
    }

    // Show "next shrink at" counter if close
    if (danger && g.phase === "playing") {
      const pulseT = 0.7 + Math.sin(t * 0.25) * 0.3;
      ctx.globalAlpha = pulseT;
      ctx.fillStyle = "#ef4444";
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 8;
      ctx.font = `900 ${cell * 1.0}px "Geist Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillText(`⚠ SHRINK IN ${g.applesUntilShrink}`, W / 2, cell * (arenaMin - 0.5));
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }
  }

  // ── Ambient particles ──────────────────────────────────────────────────────
  for (const p of g.ambientParticles) {
    ctx.globalAlpha = p.life * 0.5;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── x2 speed trails ────────────────────────────────────────────────────────
  if (g.mode === "x2" && g.speedTrails.length > 0) {
    for (const tr of g.speedTrails) {
      ctx.globalAlpha = tr.alpha * 0.4;
      ctx.fillStyle = theme.snakeHead;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, cell * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Bonus flash ─────────────────────────────────────────────────────────────
  if (g.bonusFlashFrames > 0) {
    const alpha = (g.bonusFlashFrames / 40) * 0.35;
    ctx.fillStyle = `rgba(251,191,36,${alpha})`;
    ctx.fillRect(0, 0, W, W);
  }

  // ── Death flash ─────────────────────────────────────────────────────────────
  if (g.deathFlashFrames > 0) {
    const alpha = (g.deathFlashFrames / 30) * 0.55;
    ctx.fillStyle = `rgba(239,68,68,${alpha})`;
    ctx.fillRect(0, 0, W, W);
  }

  // ── Golden apple ────────────────────────────────────────────────────────────
  if (g.goldenApple) {
    const gx = g.goldenApple.x * cell + cell / 2;
    const gy = g.goldenApple.y * cell + cell / 2;
    const sparkCount = 6;
    const sparkR = cell * 0.72 + Math.sin(t * 0.09) * cell * 0.12;
    for (let i = 0; i < sparkCount; i++) {
      const angle = (i / sparkCount) * Math.PI * 2 + t * 0.06;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = theme.goldenColor;
      ctx.shadowColor = theme.goldenColor;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(gx + Math.cos(angle) * sparkR, gy + Math.sin(angle) * sparkR, cell * 0.065, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, cell * 1.5);
    gg.addColorStop(0, hexToRgba(theme.goldenColor, 0.5));
    gg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gg;
    ctx.fillRect(g.goldenApple.x * cell - cell, g.goldenApple.y * cell - cell, cell * 3, cell * 3);
    const glScale = 1 + Math.sin(t * 0.1) * 0.1;
    ctx.save();
    ctx.translate(gx, gy); ctx.scale(glScale, glScale);
    ctx.fillStyle = theme.goldenColor;
    ctx.shadowColor = theme.goldenColor; ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, cell * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(-cell * 0.1, -cell * 0.12, cell * 0.12, cell * 0.07, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Regular apple ───────────────────────────────────────────────────────────
  {
    const ax = g.apple.x * cell + cell / 2;
    const ay = g.apple.y * cell + cell / 2;
    const pulseR = cell * (0.5 + Math.sin(t * 0.07) * 0.06);
    const gr = ctx.createRadialGradient(ax, ay, 0, ax, ay, pulseR * 2.8);
    gr.addColorStop(0, hexToRgba(theme.appleColor, 0.4));
    gr.addColorStop(0.5, hexToRgba(theme.appleColor, 0.1));
    gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(g.apple.x * cell - cell, g.apple.y * cell - cell, cell * 3, cell * 3);
    ctx.shadowColor = theme.appleGlow;
    ctx.shadowBlur = 10 + Math.sin(t * 0.07) * 5;
    ctx.fillStyle = theme.appleColor;
    ctx.beginPath();
    ctx.arc(ax, ay, cell * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Shine
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.ellipse(ax - cell * 0.12, ay - cell * 0.16, cell * 0.11, cell * 0.07, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // Stem
    if (cell > 10) {
      ctx.strokeStyle = hexToRgba(theme.appleColor, 0.6);
      ctx.lineWidth = Math.max(1, cell * 0.06);
      ctx.beginPath();
      ctx.moveTo(ax, ay - cell * 0.36);
      ctx.quadraticCurveTo(ax + cell * 0.12, ay - cell * 0.52, ax + cell * 0.08, ay - cell * 0.48);
      ctx.stroke();
    }
  }

  // ── Snake ───────────────────────────────────────────────────────────────────
  if (renderPx.length >= 2) {
    const N = renderPx.length;

    // Pass 1: Glow aura (wide blur)
    ctx.save();
    ctx.shadowColor = theme.snakeGlow;
    ctx.shadowBlur = cell * 0.9;
    ctx.strokeStyle = hexToRgba(theme.snakeHead, 0.3);
    ctx.lineWidth = cell * 0.62;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    catmullRomPath(ctx, renderPx);
    ctx.stroke();
    ctx.restore();

    // Pass 2: Body segments (tail to head, gradient)
    for (let i = N - 1; i >= 0; i--) {
      const tRatio = 1 - i / (N - 1);
      const segColor = lerpColor(theme.snakeTail, theme.snakeHead, tRatio * tRatio);
      const segAlpha = 0.45 + 0.55 * tRatio;
      const segW = cell * (0.2 + 0.42 * tRatio);
      const p = renderPx[i];
      ctx.globalAlpha = segAlpha;
      ctx.fillStyle = segColor;
      if (i === 0) { ctx.shadowColor = theme.snakeGlow; ctx.shadowBlur = cell * 0.6; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, segW / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    // Pass 3: Scale texture (rings on body segments)
    if (cell > 9) {
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = Math.max(0.5, cell * 0.06);
      for (let i = N - 1; i >= 1; i--) {
        const tRatio = 1 - i / (N - 1);
        if (tRatio < 0.25) continue;
        const p = renderPx[i];
        const segW = cell * (0.2 + 0.42 * tRatio);
        ctx.globalAlpha = 0.12 * tRatio;
        ctx.beginPath();
        ctx.arc(p.x, p.y, segW * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Pass 4: Head (special shape + eyes)
    const headPx = renderPx[0];
    const headColor = theme.snakeHead;
    const headR = cell * 0.44;

    ctx.save();
    ctx.shadowColor = theme.snakeGlow;
    ctx.shadowBlur = cell * 0.8;
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.arc(headPx.x, headPx.y, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Head highlight
    ctx.fillStyle = hexToRgba("#ffffff", 0.3);
    ctx.beginPath();
    ctx.ellipse(headPx.x - headR * 0.25, headPx.y - headR * 0.28, headR * 0.28, headR * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    const dir = g.dir;
    const eo = cell * 0.2;
    const ed = cell * 0.22;
    let ex1: number, ey1: number, ex2: number, ey2: number;
    if (dir === "RIGHT")  { ex1 = headPx.x + ed; ey1 = headPx.y - eo; ex2 = headPx.x + ed; ey2 = headPx.y + eo; }
    else if (dir === "LEFT")  { ex1 = headPx.x - ed; ey1 = headPx.y - eo; ex2 = headPx.x - ed; ey2 = headPx.y + eo; }
    else if (dir === "DOWN")  { ex1 = headPx.x - eo; ey1 = headPx.y + ed; ex2 = headPx.x + eo; ey2 = headPx.y + ed; }
    else                      { ex1 = headPx.x - eo; ey1 = headPx.y - ed; ex2 = headPx.x + eo; ey2 = headPx.y - ed; }
    const eyeR = Math.max(1.5, cell * 0.085);
    ctx.fillStyle = "#050a08";
    ctx.beginPath(); ctx.arc(ex1, ey1, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex2, ey2, eyeR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath(); ctx.arc(ex1 + eyeR * 0.35, ey1 - eyeR * 0.35, eyeR * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex2 + eyeR * 0.35, ey2 - eyeR * 0.35, eyeR * 0.38, 0, Math.PI * 2); ctx.fill();

    // Forked tongue (flickering)
    if (t % 40 < 16) {
      const tongueDir = (dir === "RIGHT" ? 1 : dir === "LEFT" ? -1 : 0);
      const tongueDirY = (dir === "DOWN" ? 1 : dir === "UP" ? -1 : 0);
      const tx1 = headPx.x + tongueDir * headR;
      const ty1 = headPx.y + tongueDirY * headR;
      const tlen = cell * 0.35;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = Math.max(0.8, cell * 0.055);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tx1, ty1);
      ctx.lineTo(tx1 + tongueDir * tlen * 0.6 + tongueDirY * tlen * 0.5, ty1 + tongueDirY * tlen * 0.6 - tongueDir * tlen * 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx1, ty1);
      ctx.lineTo(tx1 + tongueDir * tlen * 0.6 - tongueDirY * tlen * 0.5, ty1 + tongueDirY * tlen * 0.6 + tongueDir * tlen * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  } else if (renderPx.length === 1) {
    // Tiny snake (length 1) — just draw the head
    const p = renderPx[0];
    ctx.fillStyle = theme.snakeHead;
    ctx.shadowColor = theme.snakeGlow; ctx.shadowBlur = cell * 0.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, cell * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ── Game particles ──────────────────────────────────────────────────────────
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

  // ── Floating texts ───────────────────────────────────────────────────────────
  for (const ft of g.floatingTexts) {
    ctx.globalAlpha = ft.life;
    ctx.fillStyle = ft.color;
    ctx.shadowColor = ft.color; ctx.shadowBlur = 6;
    ctx.font = `900 ${ft.size}px "Geist Mono", monospace`;
    ctx.textAlign = "center";
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1; ctx.textAlign = "left";

  // ── Combo banner strip ───────────────────────────────────────────────────────
  if (g.comboMultLeft > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, W, cell * 0.95);
    ctx.fillStyle = "#fbbf24";
    ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 10;
    ctx.font = `700 ${Math.max(10, cell * 0.5)}px "Geist Sans", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`⚡ 2× COMBO — ${g.comboMultLeft} Äpfel`, W / 2, cell * 0.63);
    ctx.shadowBlur = 0; ctx.textAlign = "left";
  }

  // ── Idle vignette ────────────────────────────────────────────────────────────
  if (g.phase === "idle") {
    const vig = ctx.createRadialGradient(W / 2, W / 2, W * 0.2, W / 2, W / 2, W * 0.85);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, W);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Particle helpers
// ─────────────────────────────────────────────────────────────────────────────

function spawnAppleBurst(g: GameState, cx: number, cy: number, isGolden: boolean, theme: ModeTheme) {
  const count = isGolden ? 20 : 12;
  const colors = isGolden ? [theme.goldenColor, "#ffffff", theme.appleColor] : theme.particleColors;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const speed = (isGolden ? 3.5 : 2.5) + Math.random() * (isGolden ? 3 : 2);
    g.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 1, decay: 0.025 + Math.random() * 0.02,
      r: (isGolden ? 3.5 : 2.5) + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      glow: isGolden,
    });
  }
}

function spawnBonusBurst(g: GameState, cx: number, cy: number, theme: ModeTheme) {
  const colors = [...theme.particleColors, "#ffffff"];
  for (let i = 0; i < 35; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 6;
    g.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 1, decay: 0.013 + Math.random() * 0.015,
      r: 2 + Math.random() * 4, color: colors[Math.floor(Math.random() * colors.length)],
      glow: true,
    });
  }
}

function spawnShrinkBurst(g: GameState, W: number, theme: ModeTheme) {
  for (let i = 0; i < 50; i++) {
    const edge = Math.floor(Math.random() * 4);
    const pos = Math.random() * W;
    const x = edge === 0 ? pos : edge === 1 ? pos : edge === 2 ? 0 : W;
    const y = edge === 0 ? 0 : edge === 1 ? W : pos;
    const angle = Math.atan2(W / 2 - y, W / 2 - x);
    g.particles.push({
      x, y, vx: Math.cos(angle) * (2 + Math.random() * 4), vy: Math.sin(angle) * (2 + Math.random() * 4),
      life: 1, decay: 0.018 + Math.random() * 0.02,
      r: 2 + Math.random() * 3, color: "#ef4444", glow: true,
    });
  }
}

function initAmbientParticles(W: number, mode: SnakeMode): Particle[] {
  const theme = THEMES[mode];
  const result: Particle[] = [];
  for (let i = 0; i < 28; i++) {
    const color = theme.ambientColors[Math.floor(Math.random() * theme.ambientColors.length)];
    result.push({
      x: Math.random() * W, y: Math.random() * W,
      vx: (Math.random() - 0.5) * (mode === "x2" ? 0.6 : 0.25),
      vy: mode === "grind" ? -(0.1 + Math.random() * 0.3) : (Math.random() - 0.5) * 0.3,
      life: Math.random(), decay: 0,
      r: 1 + Math.random() * 1.8,
      color,
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard component
// ─────────────────────────────────────────────────────────────────────────────

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-4 w-4 text-amber-400" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-zinc-300" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-amber-600" />;
  return <span className="w-4 text-center text-xs font-bold text-zinc-500">#{rank}</span>;
}

function Leaderboard({ entries, myBest, userId, mode }: {
  entries: SnakeLeaderboardEntry[]; myBest: number; userId: string; mode: SnakeMode;
}) {
  const myRank = entries.findIndex((e) => e.userId === userId) + 1;
  const modeColor = mode === "x2" ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-300"
    : mode === "grind" ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
    : "border-emerald-400/30 bg-emerald-500/10 text-emerald-300";
  const modeLabel = mode === "grind" ? "🔥 Grind" : mode === "x2" ? "⚡ x2" : "🌿 Classic";
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#080712]">
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <Crown className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-bold text-zinc-100">Highscores</span>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${modeColor}`}>{modeLabel}</span>
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

// ─────────────────────────────────────────────────────────────────────────────
// Mode selector card
// ─────────────────────────────────────────────────────────────────────────────

function ModeCard({
  mode, selected, disabled, onClick, modeCfg,
}: {
  mode: SnakeMode;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  modeCfg: SnakeModeConfig | SnakeGrindConfig;
}) {
  const meta: Record<SnakeMode, { label: string; emoji: string; desc: string; gradient: string; ring: string; badge: string }> = {
    x1: {
      label: "Classic", emoji: "🌿",
      desc: `${modeCfg.boardSize}×${modeCfg.boardSize} Feld · ${modeCfg.creditsPerApple} CR/Apfel · ${modeCfg.wallWrap ? "Wand = Wrap" : "Wand = Tod"}`,
      gradient: "from-emerald-900/60 to-emerald-950/80",
      ring: "ring-emerald-500/40",
      badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    },
    x2: {
      label: "Turbo", emoji: "⚡",
      desc: `${modeCfg.boardSize}×${modeCfg.boardSize} Feld · ${modeCfg.creditsPerApple} CR/Apfel · Schneller`,
      gradient: "from-cyan-900/60 to-cyan-950/80",
      ring: "ring-cyan-500/40",
      badge: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    },
    grind: {
      label: "Grind", emoji: "🔥",
      desc: `${modeCfg.boardSize}×${modeCfg.boardSize} Colosseum · Wände schließen sich · ${(modeCfg as SnakeGrindConfig).shrinkEveryN} Äpfel/Shrink`,
      gradient: "from-amber-900/60 to-amber-950/80",
      ring: "ring-amber-500/40",
      badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    },
  };
  const m = meta[mode];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col gap-2 overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 active:scale-95 ${
        selected
          ? `border-white/20 bg-gradient-to-br ${m.gradient} ring-2 ${m.ring}`
          : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {selected && (
        <div className="absolute inset-0 -translate-x-full animate-[mine-shimmer_3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      )}
      <div className="flex items-center gap-2">
        <span className="text-2xl">{m.emoji}</span>
        <span className="text-base font-extrabold text-zinc-50">{m.label}</span>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${m.badge}`}>
          {mode.toUpperCase()}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">{m.desc}</p>
      {mode === "grind" && (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1">
          <Flame className="h-3 w-3 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-300">Wände schließen sich mit jedem Apfel!</span>
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface SnakeShellProps {
  userId: string; credits: number; streakDays: number; username: string;
  isAdmin: boolean; isModerator: boolean; config: SnakeConfig;
  leaderboardX1: SnakeLeaderboardEntry[];
  leaderboardX2: SnakeLeaderboardEntry[];
  leaderboardGrind: SnakeLeaderboardEntry[];
  myBestX1: number; myBestX2: number; myBestGrind: number;
  dailyCrEarned: number;
}

export function SnakeShell({
  userId, credits: initialCredits, streakDays, isAdmin, isModerator,
  config, leaderboardX1, leaderboardX2, leaderboardGrind,
  myBestX1, myBestX2, myBestGrind, dailyCrEarned: initDaily,
}: SnakeShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  const [activeMode, setActiveMode] = useState<SnakeMode>("x1");
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [creditsEarned, setCreditsEarned] = useState(0);
  const [lbTab, setLbTab] = useState<SnakeMode>("x1");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ creditsAwarded: number; isNewRecord: boolean; previousBest: number } | null>(null);
  const [dailyCr, setDailyCr] = useState(initDaily);
  const [bonusBannerText, setBonusBannerText] = useState<string | null>(null);
  const [scorePopKey, setScorePopKey] = useState(0);
  const [comboActive, setComboActive] = useState(false);
  const [shrinkWarning, setShrinkWarning] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>({
    snake: [], prevSnake: [], apple: { x: 5, y: 5 }, goldenApple: null, goldenAppleMovesLeft: 0,
    dir: "RIGHT", nextDir: "RIGHT", score: 0, creditsEarned: 0,
    phase: "idle", mode: "x1",
    particles: [], ambientParticles: [], floatingTexts: [],
    bonusFlashFrames: 0, comboMultLeft: 0, frameCount: 0,
    deathFlashFrames: 0, lastMoveTime: 0,
    shrinkCount: 0, applesUntilShrink: 10, shrinkFlashFrames: 0,
    speedTrails: [],
  });
  const activeModeRef = useRef<SnakeMode>("x1");
  const rafRef = useRef<number>(0);
  const configRef = useRef(config);
  const router = useRouter();
  const sound = useSoundManager();

  // Keep configRef current so the RAF loop always sees the latest config
  configRef.current = config;

  // Canvas size depends on mode
  const CANVAS_SIZE = activeMode === "grind" ? 640 : 560;

  // Re-init ambient particles whenever mode changes (idle screen atmosphere)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    gameRef.current.ambientParticles = initAmbientParticles(canvas.width, activeMode);
  }, [activeMode]);

  // RAF game loop — mount-only, reads configRef/gameRef to avoid stale closures
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function getModeCfgLocal(mode: SnakeMode): SnakeModeConfig | SnakeGrindConfig {
      const cfg = configRef.current;
      return mode === "grind" ? cfg.grind : mode === "x2" ? cfg.x2 : cfg.x1;
    }

    function doEndGame(g: GameState) {
      g.phase = "dead";
      g.deathFlashFrames = 30;
      setPhase("dead");
      setShrinkWarning(false);
      const finalScore = g.score;
      const finalCredits = g.creditsEarned;
      const finalMode = g.mode;
      if (finalScore === 0) return;
      setSubmitting(true);
      submitSnakeScore(finalScore, finalCredits, finalMode).then((res) => {
        setSubmitting(false);
        if (res.success) {
          setCredits((prev) => res.newCredits ?? prev);
          setDailyCr((prev) => prev + (res.creditsAwarded ?? 0));
          setLastResult({ creditsAwarded: res.creditsAwarded ?? 0, isNewRecord: res.isNewRecord ?? false, previousBest: res.previousBest ?? 0 });
          router.refresh();
        }
      });
    }

    function doTick(g: GameState, modeCfg: SnakeModeConfig | SnakeGrindConfig, W: number, cell: number, theme: ModeTheme, now: number) {
      const BOARD = modeCfg.boardSize;
      g.prevSnake = g.snake.map((s) => ({ ...s }));
      g.dir = g.nextDir;
      const head = g.snake[0];
      let nx = head.x + (g.dir === "RIGHT" ? 1 : g.dir === "LEFT" ? -1 : 0);
      let ny = head.y + (g.dir === "DOWN" ? 1 : g.dir === "UP" ? -1 : 0);

      if (g.mode === "grind") {
        const arenaMin = g.shrinkCount, arenaMax = BOARD - 1 - g.shrinkCount;
        if (nx < arenaMin || nx > arenaMax || ny < arenaMin || ny > arenaMax) { doEndGame(g); return; }
      } else if (modeCfg.wallWrap) {
        nx = ((nx % BOARD) + BOARD) % BOARD;
        ny = ((ny % BOARD) + BOARD) % BOARD;
      } else if (nx < 0 || nx >= BOARD || ny < 0 || ny >= BOARD) {
        doEndGame(g); return;
      }

      const newHead: Pos = { x: nx, y: ny };
      if (g.snake.slice(0, -1).some((s) => posEq(s, newHead))) { doEndGame(g); return; }

      const ateApple = posEq(newHead, g.apple);
      const ateGolden = g.goldenApple !== null && posEq(newHead, g.goldenApple);

      if (ateApple || ateGolden) {
        g.score++;
        let crBase = modeCfg.creditsPerApple;
        const goldenPos = g.goldenApple ? { ...g.goldenApple } : null;
        if (ateGolden) { crBase = Math.round(crBase * modeCfg.goldenAppleCrMultiplier); g.goldenApple = null; }
        if (g.comboMultLeft > 0) { crBase *= 2; g.comboMultLeft--; if (g.comboMultLeft === 0) setComboActive(false); }
        g.creditsEarned += crBase;

        const eatPos = ateGolden && goldenPos ? goldenPos : g.apple;
        const px = (eatPos.x + 0.5) * cell, py = (eatPos.y + 0.5) * cell;
        if (modeCfg.particlesEnabled) spawnAppleBurst(g, px, py, ateGolden, theme);
        g.floatingTexts.push({ x: px, y: py - cell * 0.3, vy: -1.2, text: `+${crBase} CR`, life: 1, decay: 0.022, color: ateGolden ? theme.goldenColor : "#34d399", size: Math.max(9, cell * 0.45) });

        if (modeCfg.bonusEveryN > 0 && g.score % modeCfg.bonusEveryN === 0) {
          g.creditsEarned += modeCfg.bonusCrFlat;
          g.bonusFlashFrames = 40;
          if (modeCfg.bonusMultiplierApples > 0) { g.comboMultLeft = modeCfg.bonusMultiplierApples; setComboActive(true); }
          if (modeCfg.particlesEnabled) spawnBonusBurst(g, W / 2, W / 2, theme);
          g.floatingTexts.push({ x: W / 2, y: W * 0.35, vy: -0.5, text: `BONUS! +${modeCfg.bonusCrFlat}`, life: 1, decay: 0.011, color: "#fbbf24", size: Math.max(12, cell * 0.65) });
          setBonusBannerText(`🎉 BONUS! +${modeCfg.bonusCrFlat} CR${modeCfg.bonusMultiplierApples > 0 ? ` + 2× für ${modeCfg.bonusMultiplierApples} Äpfel` : ""}`);
          setTimeout(() => setBonusBannerText(null), 2800);
        }

        if (g.mode === "grind") {
          const grindCfg = modeCfg as unknown as SnakeGrindConfig;
          g.applesUntilShrink--;
          setShrinkWarning(g.applesUntilShrink <= 3 && g.applesUntilShrink > 0);
          if (g.applesUntilShrink <= 0) {
            const nMin = g.shrinkCount + 1, nMax = BOARD - 2 - g.shrinkCount;
            if (nMin >= nMax || (nMax - nMin + 1) < grindCfg.minBoardSize) { doEndGame(g); return; }
            g.shrinkCount++;
            g.applesUntilShrink = grindCfg.shrinkEveryN;
            g.shrinkFlashFrames = 45;
            g.creditsEarned += grindCfg.bonusCrPerShrink;
            setShrinkWarning(false);
            if (modeCfg.particlesEnabled) spawnShrinkBurst(g, W, theme);
            g.floatingTexts.push({ x: W / 2, y: W / 2 - cell * 2, vy: -0.7, text: `⚠ SHRINK! +${grindCfg.bonusCrPerShrink} CR`, life: 1, decay: 0.010, color: "#ef4444", size: Math.max(12, cell * 0.7) });
            const aMin2 = g.shrinkCount, aMax2 = BOARD - 1 - g.shrinkCount;
            if (g.snake.some((s) => s.x < aMin2 || s.x > aMax2 || s.y < aMin2 || s.y > aMax2)) { doEndGame(g); return; }
          }
          const aMin = g.shrinkCount, aMax = BOARD - 1 - g.shrinkCount;
          if (g.apple.x < aMin || g.apple.x > aMax || g.apple.y < aMin || g.apple.y > aMax) {
            g.apple = randomPos(BOARD, [newHead, ...g.snake], aMin, aMax, aMin, aMax);
          }
        }

        if (g.phase !== "playing") return;

        if (modeCfg.goldenAppleEnabled && !g.goldenApple
          && g.score % Math.max(1, Math.floor(modeCfg.bonusEveryN / 2)) === 0
          && g.score % modeCfg.bonusEveryN !== 0) {
          const gMin = g.mode === "grind" ? g.shrinkCount : 0;
          const gMax = g.mode === "grind" ? BOARD - 1 - g.shrinkCount : BOARD - 1;
          g.goldenApple = randomPos(BOARD, [...g.snake, g.apple], gMin, gMax, gMin, gMax);
          g.goldenAppleMovesLeft = modeCfg.goldenAppleLifeApples;
        }

        g.snake = [newHead, ...g.snake];
        const aMin = g.mode === "grind" ? g.shrinkCount : 0;
        const aMax = g.mode === "grind" ? BOARD - 1 - g.shrinkCount : BOARD - 1;
        g.apple = randomPos(BOARD, [newHead, ...g.snake, ...(g.goldenApple ? [g.goldenApple] : [])], aMin, aMax, aMin, aMax);
        setScore(g.score);
        setCreditsEarned(g.creditsEarned);
        setScorePopKey((k) => k + 1);
      } else {
        g.snake = [newHead, ...g.snake.slice(0, -1)];
        if (g.goldenApple) { g.goldenAppleMovesLeft--; if (g.goldenAppleMovesLeft <= 0) g.goldenApple = null; }
      }
      g.lastMoveTime = now;
    }

    const loop = (now: number) => {
      const g = gameRef.current;
      const mode = g.mode;
      const modeCfg = getModeCfgLocal(mode);
      const W = canvas.width;
      const cell = W / modeCfg.boardSize;
      const theme = THEMES[mode];

      for (const p of g.ambientParticles) {
        p.x += p.vx; p.y += p.vy;
        p.life = 0.3 + 0.7 * Math.abs(Math.sin(g.frameCount * 0.018 + p.r * 10));
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0) { p.y = W; } else if (p.y > W) { p.y = 0; }
      }
      g.particles = g.particles.filter((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.life -= p.decay; return p.life > 0; });
      g.floatingTexts = g.floatingTexts.filter((ft) => { ft.y += ft.vy; ft.life -= ft.decay; return ft.life > 0; });

      if (mode === "x2" && g.phase === "playing") {
        const h = g.snake[0];
        if (h) g.speedTrails.push({ x: (h.x + 0.5) * cell, y: (h.y + 0.5) * cell, alpha: 0.6 });
        g.speedTrails = g.speedTrails.map((tr) => ({ ...tr, alpha: tr.alpha - 0.06 })).filter((tr) => tr.alpha > 0).slice(-12);
      }

      if (g.bonusFlashFrames > 0) g.bonusFlashFrames--;
      if (g.deathFlashFrames > 0) g.deathFlashFrames--;
      if (g.shrinkFlashFrames > 0) g.shrinkFlashFrames--;

      if (g.phase === "playing") {
        const speedMs = getSpeedMs(g.score, modeCfg);
        if (now - g.lastMoveTime >= speedMs) {
          doTick(g, modeCfg, W, cell, theme, now);
        }
      }

      drawFrame(canvas, g, modeCfg, now);
      g.frameCount++;
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount-only: reads configRef for fresh config, gameRef for mutable state

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

  // Touch swipe support
  useEffect(() => {
    let touchStartX = 0, touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (gameRef.current.phase !== "playing") return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      let d: Dir;
      if (Math.abs(dx) > Math.abs(dy)) d = dx > 0 ? "RIGHT" : "LEFT";
      else d = dy > 0 ? "DOWN" : "UP";
      if (d !== OPP[gameRef.current.dir]) gameRef.current.nextDir = d;
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  function startGame() {
    const mode = activeModeRef.current;
    const cfg = configRef.current;
    const modeCfg = mode === "grind" ? cfg.grind : mode === "x2" ? cfg.x2 : cfg.x1;
    const BOARD = modeCfg.boardSize;
    const startX = Math.floor(BOARD / 2);
    const startY = Math.floor(BOARD / 2);

    // For grind, start inside the arena (no shrink yet)
    const initSnake: Pos[] = Array.from({ length: modeCfg.startLength }, (_, i) => ({ x: startX - i, y: startY }));
    const initApple = randomPos(BOARD, initSnake);

    const g = gameRef.current;
    g.snake = initSnake;
    g.prevSnake = [...initSnake];
    g.apple = initApple;
    g.goldenApple = null;
    g.goldenAppleMovesLeft = 0;
    g.dir = "RIGHT"; g.nextDir = "RIGHT";
    g.score = 0; g.creditsEarned = 0;
    g.phase = "playing"; g.mode = mode;
    g.particles = []; g.floatingTexts = [];
    g.bonusFlashFrames = 0; g.comboMultLeft = 0;
    g.deathFlashFrames = 0; g.lastMoveTime = performance.now();
    g.shrinkCount = 0;
    g.applesUntilShrink = (modeCfg as SnakeGrindConfig).shrinkEveryN ?? 10;
    g.shrinkFlashFrames = 0;
    g.speedTrails = [];
    g.ambientParticles = initAmbientParticles(canvasRef.current?.width ?? 560, mode);

    setScore(0); setCreditsEarned(0); setPhase("playing");
    setLastResult(null); setBonusBannerText(null); setComboActive(false); setShrinkWarning(false);
    sound.click();
  }

  const modeCfg = activeMode === "grind" ? config.grind : activeMode === "x2" ? config.x2 : config.x1;
  const dailyLimitReached = modeCfg.dailyCrLimit !== null && dailyCr >= modeCfg.dailyCrLimit;
  const dailyRemaining = modeCfg.dailyCrLimit !== null ? Math.max(0, modeCfg.dailyCrLimit - dailyCr) : null;

  const lbEntries = lbTab === "grind" ? leaderboardGrind : lbTab === "x2" ? leaderboardX2 : leaderboardX1;
  const myBest = lbTab === "grind" ? myBestGrind : lbTab === "x2" ? myBestX2 : myBestX1;

  const modeRingColor = activeMode === "grind" ? "shadow-[0_0_40px_rgba(245,158,11,0.12)]"
    : activeMode === "x2" ? "shadow-[0_0_40px_rgba(6,182,212,0.12)]"
    : "shadow-[0_0_40px_rgba(16,185,129,0.1)]";

  const modeBorderColor = activeMode === "grind" ? "border-amber-500/25"
    : activeMode === "x2" ? "border-cyan-500/25"
    : "border-emerald-500/20";

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
              <span className="text-lg font-extrabold tracking-tight text-zinc-50">{config.sectionTitle}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 sm:flex">
              <Coins className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-300">{modeCfg.creditsPerApple} CR / Apfel</span>
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

      {/* Shrink warning banner */}
      {shrinkWarning && phase === "playing" && (
        <div className="relative overflow-hidden border-b border-red-500/30 bg-red-500/10 py-1.5 text-center text-xs font-extrabold text-red-400"
          style={{ animation: "snake-banner-in 0.3s ease forwards" }}>
          ⚠ ACHTUNG — Wände schließen sich in {gameRef.current.applesUntilShrink} Apfel{gameRef.current.applesUntilShrink !== 1 ? "n" : ""}!
        </div>
      )}

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
          {/* Mode selector (only when idle/dead) */}
          {phase !== "playing" && (
            <div className="grid grid-cols-3 gap-2">
              {(["x1", "x2", "grind"] as SnakeMode[]).map((m) => (
                <ModeCard
                  key={m}
                  mode={m}
                  selected={activeMode === m}
                  disabled={false}
                  modeCfg={config[m === "grind" ? "grind" : m === "x2" ? "x2" : "x1"]}
                  onClick={() => {
                    setActiveMode(m);
                    activeModeRef.current = m;
                    setLbTab(m);
                    sound.click();
                  }}
                />
              ))}
            </div>
          )}

          {/* HUD */}
          <div className={`flex items-stretch gap-3 rounded-xl border ${modeBorderColor} bg-[#080712] px-4 py-3`}>
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
            {modeCfg.bonusEveryN > 0 && phase === "playing" && (
              <>
                <div className="w-px bg-white/8" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Nächster Bonus</p>
                  <p className="text-sm font-bold text-amber-400">
                    {score === 0 ? `Apfel ${modeCfg.bonusEveryN}` :
                      score % modeCfg.bonusEveryN === 0 ? "JETZT!" :
                      `Apfel ${Math.ceil(score / modeCfg.bonusEveryN) * modeCfg.bonusEveryN}`}
                  </p>
                </div>
              </>
            )}
            {activeMode === "grind" && phase === "playing" && (
              <>
                <div className="w-px bg-white/8" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Shrink in</p>
                  <p className={`text-sm font-bold ${gameRef.current.applesUntilShrink <= 3 ? "text-red-400 animate-pulse" : "text-amber-400"}`}>
                    {gameRef.current.applesUntilShrink} Äpfel
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
          <div className={`relative overflow-hidden rounded-2xl border ${modeBorderColor} ${modeRingColor}`}>
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="block aspect-square w-full"
            />

            {/* Idle overlay */}
            {phase === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/65 backdrop-blur-[2px]">
                <div className="text-7xl drop-shadow-[0_0_30px_rgba(52,211,153,0.8)]">🐍</div>
                <div className="text-center">
                  <h2 className="text-3xl font-extrabold text-zinc-50">{config.sectionTitle}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{config.sectionSubtitle}</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-xs">
                  <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-bold text-emerald-300">
                    <Coins className="h-3 w-3" />{modeCfg.creditsPerApple} CR/Apfel
                  </span>
                  {modeCfg.bonusEveryN > 0 && (
                    <span className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 font-bold text-amber-300">
                      <Gift className="h-3 w-3" />Bonus alle {modeCfg.bonusEveryN} Äpfel
                    </span>
                  )}
                  {modeCfg.goldenAppleEnabled && (
                    <span className="flex items-center gap-1 rounded-full border border-yellow-400/30 bg-yellow-500/10 px-3 py-1 font-bold text-yellow-300">
                      <Star className="h-3 w-3" />Goldener Apfel ×{modeCfg.goldenAppleCrMultiplier}
                    </span>
                  )}
                  {activeMode === "grind" && (
                    <span className="flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 font-bold text-red-300">
                      <Flame className="h-3 w-3" />Shrink alle {(modeCfg as SnakeGrindConfig).shrinkEveryN} Äpfel
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-600">← → ↑ ↓ oder WASD · Swipe auf Handy</p>
                {dailyLimitReached ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-3 text-sm font-bold text-red-400">Tageslimit erreicht</div>
                ) : (
                  <button onClick={startGame} onMouseEnter={sound.hover}
                    className={`group relative overflow-hidden rounded-2xl px-12 py-4 text-xl font-extrabold shadow-lg transition-all active:scale-95 ${
                      activeMode === "grind" ? "bg-amber-500 text-black shadow-amber-500/30 hover:bg-amber-400 hover:shadow-amber-400/60"
                      : activeMode === "x2" ? "bg-cyan-500 text-black shadow-cyan-500/30 hover:bg-cyan-400 hover:shadow-cyan-400/60"
                      : "bg-emerald-600 text-white shadow-emerald-500/30 hover:bg-emerald-500 hover:shadow-emerald-400/60"
                    }`}>
                    <div className="absolute inset-0 -translate-x-full animate-[mine-shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                    {activeMode === "grind" ? <span className="flex items-center gap-2"><Flame className="h-6 w-6" />Grind starten</span>
                     : activeMode === "x2" ? <span className="flex items-center gap-2"><Zap className="h-6 w-6" />Turbo starten</span>
                     : "Spielen"}
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
                    {score} Äpfel · {creditsEarned.toLocaleString("de-DE")} CR
                  </p>
                  {activeMode === "grind" && gameRef.current.shrinkCount > 0 && (
                    <p className="mt-0.5 text-sm text-amber-400">{gameRef.current.shrinkCount}× Shrink überlebt!</p>
                  )}
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
                      <Coins className="h-5 w-5" />+{lastResult.creditsAwarded.toLocaleString("de-DE")} CR
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
              {activeMode === "grind"
                ? `🔥 Grind: Wände schließen sich alle ${(modeCfg as SnakeGrindConfig).shrinkEveryN} Äpfel`
                : activeMode === "x2"
                ? `⚡ Turbo: ${modeCfg.wallWrap ? "Wrap" : "Wand = Tod"}`
                : `🌿 Classic: ${modeCfg.wallWrap ? "Wand = Wrap" : "Wand = Tod"}`}
              {modeCfg.bonusEveryN > 0 ? ` · Bonus alle ${modeCfg.bonusEveryN} Äpfel` : ""}
            </span>
          </div>
        </div>

        {/* Leaderboard sidebar */}
        <div className="hidden w-52 flex-col gap-3 lg:flex">
          <div className="flex rounded-xl border border-white/8 bg-[#080712] p-1">
            {(["x1", "x2", "grind"] as SnakeMode[]).map((m) => (
              <button key={m} onClick={() => { setLbTab(m); sound.click(); }} onMouseEnter={sound.hover}
                className={`flex flex-1 items-center justify-center rounded-lg py-1.5 text-[10px] font-bold transition-colors ${
                  lbTab === m
                    ? m === "grind" ? "bg-amber-500/20 text-amber-300"
                    : m === "x2" ? "bg-cyan-500/20 text-cyan-300"
                    : "bg-emerald-500/20 text-emerald-300"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}>
                {m === "grind" ? "🔥" : m === "x2" ? "⚡" : "🌿"}{m}
              </button>
            ))}
          </div>
          <Leaderboard entries={lbEntries} myBest={myBest} userId={userId} mode={lbTab} />
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
          <div className="flex gap-1 border-t border-white/8 p-2">
            {(["x1", "x2", "grind"] as SnakeMode[]).map((m) => (
              <button key={m} onClick={() => setLbTab(m)}
                className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold ${lbTab === m ? "bg-purple-500/20 text-purple-200" : "text-zinc-500"}`}>
                {m === "grind" ? "🔥 Grind" : m === "x2" ? "⚡ x2" : "🌿 x1"}
              </button>
            ))}
          </div>
          <Leaderboard entries={lbEntries} myBest={myBest} userId={userId} mode={lbTab} />
        </details>
      </div>
    </div>
  );
}
