"use client";

import { useEffect, useRef } from "react";
import type { PlinkoRiskLevel, PlinkoConfig } from "@/lib/plinko-types";

interface Props {
  rows: number;
  riskLevel: PlinkoRiskLevel;
  path: number[] | null;
  bucketIndex: number | null;
  multiplier: number | null;
  betAmount: number;
  isDropping: boolean;
  onAnimationEnd?: () => void;
  config: Pick<PlinkoConfig, "particlesEnabled" | "trailLength" | "glowIntensity" | "animationSpeed">;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; decay: number;
  color: string; size: number;
  type: "spark" | "star" | "ring";
}

interface Star {
  x: number; y: number;
  r: number; brightness: number; speed: number;
  twinkleOffset: number;
}

// ── Pure math helpers (module-level, no closures) ─────────────────────────────

const PAD = 30;
const PIN_R = 5.5;
const BALL_R = 9;
const BUCKET_H = 46;

function getPinPos(row: number, col: number, W: number, H: number, rows: number) {
  const totalH = H - BUCKET_H - PAD * 2;
  const rowH = totalH / Math.max(rows - 1, 1);
  const numPins = row + 2;
  const rowW = W - PAD * 2;
  const spacing = rowW / (numPins - 1 || 1);
  return { x: PAD + spacing * col, y: PAD + rowH * row };
}

function getBucketX(idx: number, W: number, rows: number) {
  const bucketCount = rows + 1;
  const rowW = W - PAD * 2;
  const spacing = rowW / Math.max(bucketCount - 1, 1);
  return PAD + spacing * idx;
}

function getBallAtStep(step: number, W: number, H: number, rows: number, path: number[], bucketIdx: number) {
  if (step <= 0) return { x: W / 2, y: PAD - 18 };
  if (step > rows) return { x: getBucketX(bucketIdx, W, rows), y: H - BUCKET_H - 6 - BALL_R };
  const row = step - 1;
  const numPins = row + 2;
  const rowW = W - PAD * 2;
  const spacing = rowW / (numPins - 1 || 1);
  const col = path[step] ?? 0;
  const totalH = H - BUCKET_H - PAD * 2;
  const rowH = totalH / Math.max(rows - 1, 1);
  return { x: PAD + spacing * col, y: PAD + rowH * row };
}

function multColor(m: number): string {
  if (m >= 15) return "#ff2d2d";
  if (m >= 8)  return "#ff6b00";
  if (m >= 4)  return "#f59e0b";
  if (m >= 2)  return "#10b981";
  if (m >= 1)  return "#6366f1";
  if (m >= 0.5) return "#3b82f6";
  return "#ef4444";
}

function multGlow(m: number): string {
  if (m >= 15) return "rgba(255,45,45,0.95)";
  if (m >= 8)  return "rgba(255,107,0,0.95)";
  if (m >= 4)  return "rgba(245,158,11,0.95)";
  if (m >= 2)  return "rgba(16,185,129,0.95)";
  if (m >= 1)  return "rgba(99,102,241,0.9)";
  if (m >= 0.5) return "rgba(59,130,246,0.9)";
  return "rgba(239,68,68,0.9)";
}

function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function lerpN(a: number, b: number, t: number) { return a + (b - a) * t; }

// ── Component ─────────────────────────────────────────────────────────────────

export function PlinkoBoard({
  rows, riskLevel, path, bucketIndex, multiplier, betAmount, isDropping, onAnimationEnd, config,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<Star[]>([]);
  const trailRef = useRef<Array<{ x: number; y: number; life: number }>>([]);

  // All animation state in a single mutable ref — always fresh inside RAF
  const st = useRef({
    ballX: 0, ballY: 0,
    ballVx: 0, ballVy: 0,     // physics velocity (pixels/frame)
    physicsRow: -1,           // last pin row crossed (-1 = above first row)
    progress: 0,
    phase: "idle" as "idle" | "dropping" | "landed",
    path: [] as number[],
    bucket: 0,
    mult: 1,
    glowBucket: -1,
    landFlash: 0,
    litPins: new Map<string, number>(),
    pinNear: new Map<string, number>(),
    t: 0,
  });

  // Sync props into refs so RAF closure never goes stale
  const configRef = useRef(config);
  const rowsRef = useRef(rows);
  const riskRef = useRef(riskLevel);
  const onEndRef = useRef(onAnimationEnd);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => { riskRef.current = riskLevel; }, [riskLevel]);
  useEffect(() => { onEndRef.current = onAnimationEnd; }, [onAnimationEnd]);

  // Initialize star field
  useEffect(() => {
    starsRef.current = Array.from({ length: 80 }, () => ({
      x: Math.random() * 450,
      y: Math.random() * 540,
      r: 0.4 + Math.random() * 1.8,
      brightness: 0.15 + Math.random() * 0.85,
      speed: 0.04 + Math.random() * 0.12,
      twinkleOffset: Math.random() * Math.PI * 2,
    }));
  }, []);

  // Particle spawners — read from refs so they can be called inside RAF
  const spawnPinHit = (x: number, y: number) => {
    if (!configRef.current.particlesEnabled) return;
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3;
      particlesRef.current.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1, decay: 0.055 + Math.random() * 0.055,
        color: `hsl(${250 + Math.random() * 80}, 90%, ${55 + Math.random() * 30}%)`,
        size: 1.8 + Math.random() * 2.5, type: "spark",
      });
    }
    particlesRef.current.push({
      x, y, vx: 0, vy: 0, life: 1, decay: 0.08,
      color: "rgba(167,139,250,0.7)", size: 1, type: "ring",
    });
  };

  const spawnBucketBurst = (x: number, y: number, col: string, m: number) => {
    if (!configRef.current.particlesEnabled) return;
    const count = m >= 15 ? 60 : m >= 8 ? 45 : m >= 4 ? 30 : m >= 2 ? 20 : 12;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2.5 + Math.random() * (m >= 4 ? 9 : 5);
      particlesRef.current.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2.5,
        life: 1, decay: 0.012 + Math.random() * 0.025,
        color: i % 5 === 0 ? "#ffffff" : col,
        size: m >= 8 ? (4 + Math.random() * 9) : (3 + Math.random() * 5),
        type: i % 4 === 0 ? "star" : "spark",
      });
    }
    for (let i = 0; i < 3; i++) {
      particlesRef.current.push({
        x, y, vx: 0, vy: 0, life: 1, decay: 0.035 - i * 0.008,
        color: col, size: i * 4 + 2, type: "ring",
      });
    }
  };

  // Main RAF loop — stable reference (no deps), reads everything via refs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function draw() {
      const ctx = canvas!.getContext("2d");
      if (!ctx) return;
      const W = canvas!.width;
      const H = canvas!.height;
      const s = st.current;
      const r = rowsRef.current;
      const rl = riskRef.current;
      const cfg = configRef.current;
      const gi = Math.max(0, cfg.glowIntensity ?? 1.8);

      ctx.clearRect(0, 0, W, H);

      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, "#07021a");
      bgGrad.addColorStop(0.45, "#0c0525");
      bgGrad.addColorStop(1, "#05010f");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Nebula blobs
      const nebulas: [number, number, number, number][] = [
        [W * 0.2, H * 0.3, W * 0.45, 0.06],
        [W * 0.8, H * 0.6, W * 0.4, 0.04],
        [W * 0.5, H * 0.1, W * 0.3, 0.03],
      ];
      for (const [cx, cy, cr, alpha] of nebulas) {
        const neb = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
        neb.addColorStop(0, `rgba(120,60,220,${alpha})`);
        neb.addColorStop(1, "transparent");
        ctx.fillStyle = neb;
        ctx.fillRect(0, 0, W, H);
      }

      // Stars (drift downward, twinkle)
      for (const star of starsRef.current) {
        star.y = (star.y + star.speed) % H;
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(s.t * 0.018 + star.twinkleOffset));
        ctx.save();
        ctx.globalAlpha = star.brightness * twinkle;
        const sg = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.r * 1.5);
        sg.addColorStop(0, "#ffffff");
        sg.addColorStop(0.5, "rgba(200,180,255,0.8)");
        sg.addColorStop(1, "transparent");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Subtle grid
      ctx.strokeStyle = "rgba(100,60,180,0.025)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 26) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      const mults = rl.multipliers;
      const bucketCount = r + 1;
      const bw = (W - PAD * 2) / bucketCount * 0.84;

      // Buckets
      for (let i = 0; i < bucketCount; i++) {
        const bx = getBucketX(i, W, r);
        const by = H - BUCKET_H - 5;
        const m = mults[Math.min(i, mults.length - 1)];
        const col = multColor(m);
        const glow = multGlow(m);
        const isLit = s.glowBucket === i;
        const litPulse = isLit ? 1 + 0.15 * Math.sin(s.t * 0.12) : 0;

        ctx.save();
        if (isLit) { ctx.shadowColor = glow; ctx.shadowBlur = 50 * gi * litPulse; }

        const bGrad = ctx.createLinearGradient(bx - bw / 2, by, bx + bw / 2, by + BUCKET_H);
        bGrad.addColorStop(0, col + (isLit ? "cc" : "2e"));
        bGrad.addColorStop(1, col + (isLit ? "66" : "0d"));
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.roundRect(bx - bw / 2, by, bw, BUCKET_H, 8);
        ctx.fill();
        ctx.strokeStyle = col + (isLit ? "ff" : "44");
        ctx.lineWidth = isLit ? 2 : 0.8;
        ctx.stroke();

        if (m >= 2 || isLit) {
          ctx.fillStyle = col + (isLit ? "ff" : "80");
          ctx.fillRect(bx - bw / 2 + 4, by, bw - 8, 2);
        }
        ctx.restore();

        ctx.save();
        const fontSize = Math.max(7, Math.min(12, bw * 0.38)) * (isLit ? 1.1 : 1);
        ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
        ctx.fillStyle = isLit ? "#ffffff" : col;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (isLit) { ctx.shadowColor = col; ctx.shadowBlur = 16 * gi; }
        ctx.fillText(`${m}x`, bx, by + BUCKET_H / 2);
        ctx.restore();
      }

      // Pins
      for (let row = 0; row < r; row++) {
        const numPins = row + 2;
        for (let col = 0; col < numPins; col++) {
          const { x, y } = getPinPos(row, col, W, H, r);
          const key = `${row},${col}`;
          const flashT = s.litPins.get(key) ?? 0;
          const nearT = s.pinNear.get(key) ?? 0;

          ctx.save();
          if (flashT > 0) {
            ctx.shadowColor = "#d8b4fe";
            ctx.shadowBlur = 22 * flashT * gi;
          } else if (nearT > 0) {
            ctx.shadowColor = "#8b5cf6";
            ctx.shadowBlur = 12 * nearT * gi;
          }

          const rr = PIN_R + (flashT > 0 ? 2.5 * flashT : 0) + (nearT * 1.8);
          ctx.beginPath();
          ctx.arc(x, y, rr, 0, Math.PI * 2);

          const pg = ctx.createRadialGradient(x - 1.2, y - 2, 0, x, y, rr);
          if (flashT > 0) {
            pg.addColorStop(0, "#ffffff");
            pg.addColorStop(0.3, "#e9d5ff");
            pg.addColorStop(0.7, "#a855f7");
            pg.addColorStop(1, "#4c1d95");
          } else {
            pg.addColorStop(0, nearT > 0 ? `rgba(160,130,255,${0.6 + nearT * 0.4})` : "rgba(109,40,217,0.8)");
            pg.addColorStop(0.6, nearT > 0 ? `rgba(100,60,200,${0.5 + nearT * 0.4})` : "rgba(60,20,120,0.7)");
            pg.addColorStop(1, "rgba(20,5,40,0.9)");
          }
          ctx.fillStyle = pg;
          ctx.fill();
          ctx.strokeStyle = flashT > 0 ? "rgba(216,180,254,0.9)" : nearT > 0 ? "rgba(139,92,246,0.6)" : "rgba(76,29,149,0.5)";
          ctx.lineWidth = flashT > 0 ? 1.5 : 0.8;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Ball trail
      if (s.phase !== "idle") {
        for (let i = 0; i < trailRef.current.length; i++) {
          const tp = trailRef.current[i];
          const alpha = tp.life * (i / Math.max(trailRef.current.length, 1)) * 0.55;
          if (alpha <= 0.01) continue;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.shadowColor = "#f0abfc";
          ctx.shadowBlur = 10 * gi;
          const tGrad = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, BALL_R * tp.life);
          tGrad.addColorStop(0, "#f5d0fe");
          tGrad.addColorStop(1, "#a21caf");
          ctx.fillStyle = tGrad;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, BALL_R * 0.7 * tp.life, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Ball
      if (s.phase !== "idle") {
        const pulse = 1 + 0.06 * Math.sin(s.t * 0.22);
        ctx.save();
        ctx.shadowColor = "#f0abfc";
        ctx.shadowBlur = (24 + 10 * Math.sin(s.t * 0.18)) * gi;
        const ballGrad = ctx.createRadialGradient(s.ballX - 2.5, s.ballY - 3.5, 0.5, s.ballX, s.ballY, BALL_R * pulse);
        ballGrad.addColorStop(0, "#ffffff");
        ballGrad.addColorStop(0.25, "#fae8ff");
        ballGrad.addColorStop(0.6, "#e879f9");
        ballGrad.addColorStop(0.85, "#c026d3");
        ballGrad.addColorStop(1, "#86198f");
        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(s.ballX, s.ballY, BALL_R * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(s.ballX - 2.2, s.ballY - 3, BALL_R * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Particles
      const parts = particlesRef.current;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        if (p.type !== "ring") {
          p.x += p.vx; p.y += p.vy;
          p.vy += 0.11; p.vx *= 0.97;
        } else {
          p.size += 2.5;
        }
        p.life -= p.decay;
        if (p.life <= 0) { parts.splice(i, 1); continue; }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        if (p.type === "ring") {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2 * p.life;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8 * gi;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1, p.size * 8), 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.type === "star") {
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = p.size * 2.5 * gi;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * 5);
          const sr = p.size * p.life;
          ctx.beginPath();
          for (let j = 0; j < 8; j++) {
            const a = (j * Math.PI) / 4;
            const rr = j % 2 === 0 ? sr : sr * 0.38;
            if (j === 0) ctx.moveTo(rr * Math.cos(a), rr * Math.sin(a));
            else ctx.lineTo(rr * Math.cos(a), rr * Math.sin(a));
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = p.size * 3 * p.life * gi;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Landing flash overlay
      if (s.landFlash > 0) {
        const col = multColor(s.mult);
        ctx.save();
        ctx.fillStyle = col;
        ctx.globalAlpha = (s.landFlash / 30) * 0.18;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        s.landFlash--;
      }

      s.t++;
    }

    function loop() {
      const s = st.current;
      const c = canvasRef.current;
      if (!c) { animRef.current = requestAnimationFrame(loop); return; }
      const W = c.width;
      const H = c.height;
      const r = rowsRef.current;
      const cfg = configRef.current;

      if (s.phase === "dropping") {
        const speedMult = Math.max(0.5, Math.min(2.5, cfg.animationSpeed ?? 1));
        const GRAVITY = 0.18 * speedMult;

        // Physics integration — gravity accelerates ball, air drag slows horizontal
        s.ballVy += GRAVITY;
        s.ballVx *= 0.96;
        s.ballX += s.ballVx;
        s.ballY += s.ballVy;

        // Check if ball crossed into the next pin row
        const nextRow = s.physicsRow + 1;
        if (nextRow < r) {
          const rowY = getPinPos(nextRow, 0, W, H, r).y;
          if (s.ballY >= rowY) {
            s.physicsRow = nextRow;
            // path[nextRow+1] is the column index at this row (path[1]=col@row0, path[2]=col@row1…)
            const col = s.path[nextRow + 1] ?? 0;
            const pin = getPinPos(nextRow, col, W, H, r);

            // Flash the hit pin (no hard snap — ball continues from its actual position)
            const key = `${nextRow},${col}`;
            s.litPins.set(key, 1.0);
            spawnPinHit(pin.x, rowY);
            setTimeout(() => { s.litPins.delete(key); }, 380);

            // Calculate velocity to follow a parabolic arc toward next target
            const isLast = nextRow + 1 >= r;
            const tx = isLast
              ? getBucketX(s.bucket, W, r)
              : getPinPos(nextRow + 1, s.path[nextRow + 2] ?? 0, W, H, r).x;
            const ty = isLast
              ? (H - BUCKET_H - 6 - BALL_R)
              : getPinPos(nextRow + 1, 0, W, H, r).y;

            const dy = ty - s.ballY;
            const vy0 = Math.max(s.ballVy * 0.4, 1.5 * speedMult);
            // Solve dy = vy0*t + 0.5*G*t^2 for t, then vx = dx/t
            const disc = vy0 * vy0 + 2 * GRAVITY * dy;
            const frames = disc > 0
              ? (-vy0 + Math.sqrt(disc)) / GRAVITY
              : Math.sqrt(2 * Math.max(dy, 1) / (GRAVITY + 0.001));
            s.ballVx = (tx - s.ballX) / Math.max(frames, 6);
            s.ballVy = vy0;
          }
        }

        // Check bucket landing zone
        const bucketY = H - BUCKET_H - 6 - BALL_R;
        if (s.ballY >= bucketY) {
          s.phase = "landed";
          s.ballX = getBucketX(s.bucket, W, r);
          s.ballY = bucketY;
          s.glowBucket = s.bucket;
          s.landFlash = 30;
          spawnBucketBurst(s.ballX, s.ballY + BALL_R, multColor(s.mult), s.mult);
          trailRef.current = [];
          onEndRef.current?.();
        } else {
          trailRef.current.unshift({ x: s.ballX, y: s.ballY, life: 1 });
          const maxTr = Math.max(2, Math.min(15, cfg.trailLength ?? 7));
          if (trailRef.current.length > maxTr) trailRef.current.length = maxTr;
          for (let i = 0; i < trailRef.current.length; i++) {
            trailRef.current[i].life -= 0.12 + i * 0.06;
          }
          trailRef.current = trailRef.current.filter((tp) => tp.life > 0.02);

          // Pin proximity glow
          s.pinNear.clear();
          for (const nr of [s.physicsRow, s.physicsRow + 1, s.physicsRow + 2]) {
            if (nr < 0 || nr >= r) continue;
            const numPins = nr + 2;
            for (let col = 0; col < numPins; col++) {
              const { x, y } = getPinPos(nr, col, W, H, r);
              const dist = Math.hypot(x - s.ballX, y - s.ballY);
              if (dist < 50) s.pinNear.set(`${nr},${col}`, Math.max(0, 1 - dist / 50));
            }
          }

          // Decay lit pins
          s.litPins.forEach((v, k) => {
            const nv = v - 0.05;
            if (nv <= 0) s.litPins.delete(k);
            else s.litPins.set(k, nv);
          });
        }
      } else {
        s.pinNear.clear();
        if (s.phase === "idle") trailRef.current = [];
      }

      draw();
      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, []); // stable — all state via refs

  // Trigger drop when path arrives
  useEffect(() => {
    if (!path || !isDropping || path.length === 0) return;
    const s = st.current;
    const c = canvasRef.current;
    s.path = [...path];
    s.bucket = bucketIndex ?? 0;
    s.mult = multiplier ?? 1;
    s.progress = 0;
    s.phase = "dropping";
    s.physicsRow = -1;
    s.ballVx = 0;
    s.ballVy = 0.5;
    s.glowBucket = -1;
    s.litPins.clear();
    s.pinNear.clear();
    s.landFlash = 0;
    trailRef.current = [];
    particlesRef.current = [];
    if (c) {
      const pos = getBallAtStep(0, c.width, c.height, rowsRef.current, path, bucketIndex ?? 0);
      s.ballX = pos.x; s.ballY = pos.y;
    }
  }, [path, isDropping, bucketIndex, multiplier]);

  // Responsive canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ro = new ResizeObserver(() => {
      const availW = Math.floor(container.clientWidth);
      const availH = Math.floor(container.clientHeight);
      // Respect both dimensions: contain the canvas within the container
      let w = availW;
      let h = Math.round(w * 1.22);
      if (availH > 0 && h > availH) {
        h = availH;
        w = Math.round(h / 1.22);
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        for (const star of starsRef.current) {
          star.x = Math.random() * w;
          star.y = Math.random() * h;
        }
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center rounded-2xl">
      <canvas
        ref={canvasRef}
        width={420}
        height={512}
        className="max-h-full max-w-full rounded-2xl border border-purple-500/25"
        style={{ display: "block" }}
      />
    </div>
  );
}
