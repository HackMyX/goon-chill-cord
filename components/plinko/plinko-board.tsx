"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PlinkoRiskLevel } from "@/lib/actions/plinko";

interface Props {
  rows: number;
  riskLevel: PlinkoRiskLevel;
  path: number[] | null;   // from server: path[0..rows] column positions
  bucketIndex: number | null;
  multiplier: number | null;
  isDropping: boolean;
  onAnimationEnd?: () => void;
}

const PIN_R = 5;
const BALL_R = 8;
const PAD = 24;
const BUCKET_H = 40;

function getMultiplierColor(m: number): string {
  if (m >= 5)  return "#f59e0b";
  if (m >= 2)  return "#10b981";
  if (m >= 1)  return "#6366f1";
  if (m >= 0.5) return "#3b82f6";
  return "#ef4444";
}

function getMultiplierGlow(m: number): string {
  if (m >= 5)  return "rgba(245,158,11,0.8)";
  if (m >= 2)  return "rgba(16,185,129,0.8)";
  if (m >= 1)  return "rgba(99,102,241,0.8)";
  if (m >= 0.5) return "rgba(59,130,246,0.8)";
  return "rgba(239,68,68,0.8)";
}

export function PlinkoBoard({ rows, riskLevel, path, bucketIndex, multiplier, isDropping, onAnimationEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const stateRef = useRef({
    ballX: 0, ballY: 0,
    pathStep: 0,
    litPins: new Set<string>(),
    glowBucket: -1,
    t: 0,
    phase: "idle" as "idle" | "dropping" | "landed",
  });
  const [flashMultiplier, setFlashMultiplier] = useState<number | null>(null);

  // Build pin positions
  function getPinPos(row: number, col: number, W: number, H: number) {
    const totalH = H - BUCKET_H - PAD * 2;
    const rowH = totalH / (rows - 1 || 1);
    const numPins = row + 2;
    const rowW = W - PAD * 2;
    const spacing = rowW / (numPins - 1 || 1);
    const x = PAD + spacing * col;
    const y = PAD + rowH * row;
    return { x, y };
  }

  function getBucketX(idx: number, W: number) {
    const bucketCount = rows + 1;
    const rowW = W - PAD * 2;
    const spacing = rowW / (bucketCount - 1 || 1);
    return PAD + spacing * idx;
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const s = stateRef.current;

    ctx.clearRect(0, 0, W, H);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0d0520");
    bg.addColorStop(1, "#080310");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Grid lines (subtle)
    ctx.strokeStyle = "rgba(139,92,246,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const mults = riskLevel.multipliers;
    const bucketCount = rows + 1;

    // Draw buckets
    for (let i = 0; i < bucketCount; i++) {
      const bx = getBucketX(i, W);
      const by = H - BUCKET_H - 4;
      const m = mults[Math.min(i, mults.length - 1)];
      const col = getMultiplierColor(m);
      const isLit = s.glowBucket === i;
      const bw = (W - PAD * 2) / (bucketCount) * 0.85;

      ctx.save();
      if (isLit) {
        ctx.shadowColor = getMultiplierGlow(m);
        ctx.shadowBlur = 28;
      }

      const grad = ctx.createLinearGradient(bx - bw / 2, by, bx + bw / 2, by + BUCKET_H);
      grad.addColorStop(0, col + (isLit ? "ff" : "44"));
      grad.addColorStop(1, col + (isLit ? "88" : "11"));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(bx - bw / 2, by, bw, BUCKET_H, 6);
      ctx.fill();

      ctx.strokeStyle = col + (isLit ? "ff" : "66");
      ctx.lineWidth = isLit ? 2 : 1;
      ctx.stroke();
      ctx.restore();

      // Multiplier text
      ctx.save();
      ctx.font = `bold ${isLit ? 13 : 11}px system-ui`;
      ctx.fillStyle = isLit ? "#ffffff" : col;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (isLit) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
      ctx.fillText(`${m}x`, bx, by + BUCKET_H / 2);
      ctx.restore();
    }

    // Draw pins
    for (let row = 0; row < rows; row++) {
      const numPins = row + 2;
      for (let col = 0; col < numPins; col++) {
        const { x, y } = getPinPos(row, col, W, H);
        const key = `${row},${col}`;
        const lit = s.litPins.has(key);

        ctx.save();
        if (lit) {
          ctx.shadowColor = "#a78bfa";
          ctx.shadowBlur = 16;
        }
        const pulseFactor = lit ? 1 + 0.4 * Math.sin(s.t * 0.3) : 1;
        ctx.beginPath();
        ctx.arc(x, y, PIN_R * pulseFactor, 0, Math.PI * 2);
        const pinGrad = ctx.createRadialGradient(x - 1, y - 1, 0, x, y, PIN_R * pulseFactor);
        pinGrad.addColorStop(0, lit ? "#c4b5fd" : "#6d28d9");
        pinGrad.addColorStop(1, lit ? "#7c3aed" : "#2e1065");
        ctx.fillStyle = pinGrad;
        ctx.fill();
        ctx.strokeStyle = lit ? "#a78bfa" : "#4c1d95";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw ball
    if (s.phase !== "idle") {
      ctx.save();
      ctx.shadowColor = "#f0abfc";
      ctx.shadowBlur = 20 + 10 * Math.sin(s.t * 0.2);

      const ballGrad = ctx.createRadialGradient(s.ballX - 2, s.ballY - 2, 1, s.ballX, s.ballY, BALL_R);
      ballGrad.addColorStop(0, "#fdf4ff");
      ballGrad.addColorStop(0.5, "#e879f9");
      ballGrad.addColorStop(1, "#a21caf");
      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(s.ballX, s.ballY, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Trail
      for (let ti = 1; ti <= 3; ti++) {
        const alpha = (4 - ti) / 12;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#e879f9";
        ctx.beginPath();
        ctx.arc(s.ballX, s.ballY - ti * 4, BALL_R * (1 - ti * 0.2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    s.t += 1;
  }, [rows, riskLevel]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = stateRef.current;

    function loop() {
      draw();
      animRef.current = requestAnimationFrame(loop);
    }
    animRef.current = requestAnimationFrame(loop);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [draw]);

  // Trigger drop animation when path arrives
  useEffect(() => {
    if (!path || !isDropping) return;
    const activePath = path;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;
    const s = stateRef.current;

    s.phase = "dropping";
    s.pathStep = 0;
    s.litPins = new Set();
    s.glowBucket = -1;
    setFlashMultiplier(null);

    const totalH = H - BUCKET_H - PAD * 2;
    const rowH = totalH / (rows - 1 || 1);

    let step = 0;
    const STEP_MS = 180;

    function advance() {
      if (step > rows) {
        // Land in bucket
        s.phase = "landed";
        s.glowBucket = bucketIndex ?? 0;
        s.ballX = getBucketX(bucketIndex ?? 0, W);
        s.ballY = H - BUCKET_H - 4 - BALL_R;
        setFlashMultiplier(multiplier);
        onAnimationEnd?.();
        return;
      }
      if (step === 0) {
        s.ballX = W / 2;
        s.ballY = PAD - 20;
      } else {
        const row = step - 1;
        const numPins = row + 2;
        const rowW = W - PAD * 2;
        const spacing = rowW / (numPins - 1 || 1);
        const col = activePath[step] ?? 0;
        s.ballX = PAD + spacing * col;
        s.ballY = PAD + rowH * row;
        if (step >= 1) {
          const prevRow = step - 1;
          const prevCol = activePath[step - 1] ?? 0;
          s.litPins.add(`${prevRow},${prevCol}`);
          setTimeout(() => s.litPins.delete(`${prevRow},${prevCol}`), STEP_MS * 3);
        }
      }
      step++;
      setTimeout(advance, STEP_MS);
    }
    advance();
  }, [path, isDropping, rows, bucketIndex, multiplier, onAnimationEnd]);

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        width={360}
        height={440}
        className="w-full rounded-2xl border border-purple-500/20"
        style={{ background: "#0d0520", imageRendering: "auto" }}
      />
      {/* Big win flash */}
      {flashMultiplier !== null && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ animation: "plinkoPop 0.5s ease-out forwards" }}
        >
          <div
            className="rounded-2xl border-2 px-8 py-4 text-center backdrop-blur-sm"
            style={{
              borderColor: getMultiplierColor(flashMultiplier),
              background: `${getMultiplierColor(flashMultiplier)}22`,
              boxShadow: `0 0 40px ${getMultiplierGlow(flashMultiplier)}, 0 0 80px ${getMultiplierGlow(flashMultiplier)}44`,
            }}
          >
            <div className="text-4xl font-black" style={{ color: getMultiplierColor(flashMultiplier), textShadow: `0 0 20px ${getMultiplierGlow(flashMultiplier)}` }}>
              {flashMultiplier}x
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes plinkoPop {
          0%   { opacity: 0; transform: scale(0.6); }
          40%  { opacity: 1; transform: scale(1.15); }
          70%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
