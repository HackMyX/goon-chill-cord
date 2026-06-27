"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Coins, Sparkles, Star, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { View } from "@react-three/drei";
import { TopBar } from "@/components/layout/top-bar";
import { CaseOpeningSection } from "@/components/dashboard/case-opening-section";
import { createClient } from "@/lib/supabase/client";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import type { CaseGroup, Rarity, CasePoolEntry } from "@/lib/cases";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";

interface CaseGroupPreview {
  groupId: string;
  poolSize: number;
  previewPool: CasePoolEntry[];
}

interface CasesShellProps {
  initialCredits: number;
  inventoryCount: number;
  streakDays: number;
  caseGroups: CaseGroup[];
  caseGroupPreviews: CaseGroupPreview[];
  isAdmin?: boolean;
  isModerator?: boolean;
}

const RARITY_DEFS = [
  {
    key: "normal" as Rarity,
    label: "Normal",
    description: "Solide Items für den Alltag",
    iconClass: "text-zinc-300",
    border: "border-zinc-500/25",
    bg: "bg-zinc-500/5",
    glow: "shadow-[0_0_20px_rgba(161,161,170,0.08)]",
    hoverGlow: "hover:shadow-[0_0_32px_rgba(161,161,170,0.2)]",
    dotColor: "bg-zinc-400",
    textColor: "text-zinc-300",
    barColor: "bg-zinc-400",
    icon: Star,
    sparkColor: "text-zinc-400",
  },
  {
    key: "selten" as Rarity,
    label: "Selten",
    description: "Seltene Cosmetics & Waffen",
    iconClass: "text-blue-300",
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    glow: "shadow-[0_0_20px_rgba(59,130,246,0.1)]",
    hoverGlow: "hover:shadow-[0_0_32px_rgba(59,130,246,0.25)]",
    dotColor: "bg-blue-400",
    textColor: "text-blue-300",
    barColor: "bg-blue-500",
    icon: Sparkles,
    sparkColor: "text-blue-400",
  },
  {
    key: "mythisch" as Rarity,
    label: "Mythisch",
    description: "Begehrte mythische Ausrüstung",
    iconClass: "text-purple-300",
    border: "border-purple-500/35",
    bg: "bg-purple-500/6",
    glow: "shadow-[0_0_20px_rgba(168,85,247,0.12)]",
    hoverGlow: "hover:shadow-[0_0_36px_rgba(168,85,247,0.3)]",
    dotColor: "bg-purple-400",
    textColor: "text-purple-300",
    barColor: "bg-purple-500",
    icon: Zap,
    sparkColor: "text-purple-400",
  },
  {
    key: "ultra" as Rarity,
    label: "Ultra",
    description: "Extremst seltene RGB-Schätze",
    iconClass: "text-fuchsia-400",
    border: "border-fuchsia-500/40",
    bg: "bg-gradient-to-br from-fuchsia-500/5 to-rose-500/5",
    glow: "shadow-[0_0_24px_rgba(217,70,239,0.15)]",
    hoverGlow: "hover:shadow-[0_0_48px_rgba(217,70,239,0.35)]",
    dotColor: "bg-fuchsia-400",
    textColor: "rainbow-text",
    barColor: "bg-gradient-to-r from-fuchsia-500 via-purple-500 to-rose-500",
    icon: Sparkles,
    sparkColor: "text-fuchsia-400",
    isUltra: true,
  },
];

export function CasesShell({
  initialCredits,
  inventoryCount,
  streakDays,
  caseGroups,
  caseGroupPreviews,
  isAdmin = false,
  isModerator = false,
}: CasesShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setCredits(row.credits);
  });
  // Root for the shared 3D Canvas's eventSource (OrbitControls etc. in modals).
  const casesRootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { currencyName, rarityLabels } = useSiteConfig();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("cases_tiers_live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "case_tiers" }, () => {
        router.refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router]);

  function handleCreditsChange(newCredits: number) {
    setCredits(newCredits);
    router.refresh();
  }

  // Map rarity keys to admin-configured labels
  const resolvedRarities = RARITY_DEFS.map((r) => ({
    ...r,
    label: r.key === "normal" ? rarityLabels.normal
      : r.key === "selten" ? rarityLabels.selten
      : r.key === "mythisch" ? rarityLabels.mythisch
      : rarityLabels.ultra,
  }));

  return (
    <div ref={casesRootRef} className="flex flex-1 flex-col">
      <TopBar
        credits={credits}
        inventoryCount={inventoryCount}
        streakDays={streakDays}
        onCreditsChange={handleCreditsChange}
        isAdmin={isAdmin}
        isModerator={isModerator}
      />

      <main className="flex-1">
        {/* ── HERO ─────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-white/[0.04]">
          {/* Layered atmospheric blobs */}
          <div className="pointer-events-none absolute inset-0">
            <div className="animate-mesh-a absolute -top-20 left-1/2 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-purple-600/14 blur-[120px]" />
            <div className="animate-mesh-b absolute top-0 left-1/4 h-72 w-72 rounded-full bg-fuchsia-600/10 blur-[90px]" />
            <div className="animate-mesh-c absolute top-0 right-1/4 h-64 w-64 rounded-full bg-rose-600/8 blur-[80px]" />
            <div className="animate-mesh-a absolute bottom-0 left-0 h-40 w-full bg-gradient-to-t from-black/50 to-transparent" />
            {/* Subtle grid */}
            <div className="absolute inset-0 opacity-[0.02]"
              style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,0.5) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,0.5) 40px)" }}
            />
            {/* Particles */}
            <div className="animate-particle-a absolute bottom-8 left-[12%] h-1 w-1 rounded-full bg-purple-400/60" />
            <div className="animate-particle-b absolute bottom-6 left-[35%] h-1.5 w-1.5 rounded-full bg-fuchsia-400/50" />
            <div className="animate-particle-c absolute bottom-12 left-[58%] h-1 w-1 rounded-full bg-rose-400/60" />
            <div className="animate-particle-d absolute bottom-5 left-[75%] h-1 w-1 rounded-full bg-indigo-400/50" />
            <div className="animate-particle-e absolute bottom-10 left-[22%] h-0.5 w-0.5 rounded-full bg-purple-300/70" />
            <div className="animate-particle-f absolute bottom-4 left-[88%] h-1.5 w-1.5 rounded-full bg-fuchsia-300/40" />
          </div>

          <div className="relative z-10 mx-auto max-w-3xl px-4 pt-8 pb-8 text-center sm:pt-14 sm:pb-12">
            {/* Ultra RGB badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.7, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              className="mb-6 flex justify-center"
            >
              <div className="ultra-border-animated inline-flex items-center gap-2.5 rounded-full px-5 py-2 text-xs font-black tracking-widest text-white">
                <div className="flex h-full w-full items-center gap-2.5 rounded-full bg-[#0d0c18] px-5 py-2">
                  <Package className="h-4 w-4 animate-crown-bob" />
                  <span className="rainbow-text">CASES</span>
                </div>
              </div>
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
              className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl leading-none"
            >
              <span className="bg-gradient-to-r from-purple-300 via-fuchsia-300 to-rose-300 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(217,70,239,0.5)]">
                Cases öffnen
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.14 }}
              className="mx-auto mt-4 max-w-md text-sm text-zinc-400 leading-relaxed"
            >
              Öffne Cases und gewinne exklusive Cosmetics &amp; Waffen — von {rarityLabels.normal} bis{" "}
              <span className="rainbow-text font-bold">{rarityLabels.ultra} RGB</span>.
            </motion.p>

            {/* Credits pill */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 18, delay: 0.2 }}
              className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-amber-500/30 bg-amber-500/8 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_24px_rgba(245,158,11,0.2)] backdrop-blur-sm"
            >
              <Coins className="h-4 w-4 text-amber-400 animate-stat-pop" />
              <span className="tabular-nums text-amber-200">
                {new Intl.NumberFormat("de-DE").format(credits)}
              </span>
              <span className="text-amber-400/70">{currencyName}</span>
            </motion.div>

            {/* Rarity showcase cards */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.28 }}
              className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-4"
            >
              {resolvedRarities.map((r, i) => (
                <motion.div
                  key={r.key}
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.07, type: "spring", stiffness: 240, damping: 22 }}
                  whileHover={{ y: -4, scale: 1.04 }}
                  className={`relative overflow-hidden rounded-2xl border p-4 text-center transition-all duration-300 ${r.border} ${r.bg} ${r.glow} ${r.hoverGlow} ${r.isUltra ? "ultra-border-animated" : ""}`}
                >
                  {/* Shimmer overlay */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent" />

                  {/* Icon */}
                  <div className="mb-2 flex justify-center">
                    {r.isUltra ? (
                      <Sparkles className="h-7 w-7 text-fuchsia-400 animate-crown-bob drop-shadow-[0_0_12px_rgba(217,70,239,0.8)]" />
                    ) : (
                      <r.icon className={`h-6 w-6 ${r.iconClass} drop-shadow-[0_0_8px_currentColor]`} />
                    )}
                  </div>

                  {/* Label */}
                  <p className={`text-xs font-black uppercase tracking-wider ${r.isUltra ? "rainbow-text" : r.textColor}`}>
                    {r.label}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-600 leading-tight">{r.description}</p>

                  {/* Bottom bar */}
                  <div className={`absolute bottom-0 left-0 right-0 h-[2px] ${r.isUltra ? "" : r.barColor} opacity-60`}>
                    {r.isUltra && (
                      <div className="h-full w-full rainbow-fill" />
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── CASE SECTIONS ────────────────────────────────────────── */}
        {caseGroups.length === 0 ? (
          <div className="mx-auto max-w-2xl px-4 py-20 text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02]">
              <Package className="h-10 w-10 text-zinc-700" />
            </div>
            <p className="text-base font-semibold text-zinc-500">Noch keine Cases konfiguriert.</p>
            <p className="mt-1 text-sm text-zinc-600">Admins können Cases im Admin-Panel einrichten.</p>
          </div>
        ) : (
          <AnimatePresence>
            <div className="pb-10">
              {caseGroups.map((group, i) => {
                const preview = caseGroupPreviews.find((p) => p.groupId === group.id);
                return (
                  <motion.div
                    key={group.id}
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 + i * 0.09, type: "spring", stiffness: 180, damping: 22 }}
                  >
                    <CaseOpeningSection
                      group={group}
                      credits={credits}
                      previewPool={preview?.previewPool ?? []}
                      poolSize={preview?.poolSize ?? 0}
                      onCreditsChange={handleCreditsChange}
                      index={i}
                    />
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        )}
      </main>

      {/* Shared 3D Canvas — one WebGL context for EVERY CaseItem3D on the page
          (reel slots, win reveal, batch grid, pool gallery). alpha + fixed +
          pointer-events:none means it is invisible except where a <View> draws,
          and never blocks clicks. z-[55] keeps the 3D above the dark batch/
          reveal overlays so the won items render on top of them. */}
      <Canvas
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: 55,
        }}
        gl={{ alpha: true, antialias: true }}
        eventSource={casesRootRef as React.RefObject<HTMLElement>}
        onCreated={({ gl, scene }) => {
          const renderer = gl;
          const rootScene = scene;
          return () => {
            rootScene.traverse((obj) => {
              const mesh = obj as import("three").Mesh;
              mesh.geometry?.dispose();
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach((m) => m.dispose());
              } else {
                (mesh.material as import("three").Material | undefined)?.dispose();
              }
            });
            renderer.dispose();
          };
        }}
      >
        <View.Port />
      </Canvas>
    </div>
  );
}
