"use client";

import { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { X, Loader2, ShieldCheck, BadgeCheck, Package, Calendar } from "lucide-react";
import { CharacterModel } from "@/components/world/character-model";
import { RARITY_LABELS, RARITY_ORDER, RARITY_STYLES } from "@/lib/cases";
import { getPublicProfile, type PublicProfile } from "@/lib/actions/community";
import { useSiteConfig } from "@/components/layout/site-config-provider";

interface ProfileModalProps {
  userId: string;
  onClose: () => void;
}

function totalItems(counts: PublicProfile["rarityCounts"]): number {
  return RARITY_ORDER.reduce((sum, r) => sum + counts[r], 0);
}

/** The caller (player-list-shell.tsx) renders this with `key={userId}` —
 * that's deliberate, not decorative: it makes React fully remount the
 * component (fresh `profile`/`error` state) whenever a different player's
 * profile opens, instead of this effect having to manually reset state at
 * the top of its body before firing the new fetch. */
export function ProfileModal({ userId, onClose }: ProfileModalProps) {
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { currencyName } = useSiteConfig();

  useEffect(() => {
    const timeout = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let active = true;
    getPublicProfile(userId).then((res) => {
      if (!active) return;
      if (res.success && res.profile) setProfile(res.profile);
      else setError(res.error ?? "Profil konnte nicht geladen werden.");
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[min(94vw,520px)] rounded-2xl border border-purple-500/30 bg-[#0b0814] shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 rounded-full border border-white/10 bg-[#16121f] p-1.5 text-zinc-300 transition-colors hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>

        {!profile ? (
          <div className="flex h-72 items-center justify-center">
            {error ? (
              <p className="text-sm text-zinc-500">{error}</p>
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-[180px_1fr]">
            <div className="h-56 overflow-hidden rounded-t-2xl border-b border-white/10 bg-[#08050f] sm:h-auto sm:rounded-l-2xl sm:rounded-tr-none sm:border-b-0 sm:border-r">
              {/* Explicit shadow map type, not the bare `shadows` shorthand
                  — see components/world/world-shell.tsx's matching comment
                  for why (the shorthand's default type is deprecated and
                  spams a console warning on every shadow pass). */}
              <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 1.6, 3.4], fov: 42 }}>
                <Suspense fallback={null}>
                  <color attach="background" args={["#08050f"]} />
                  <ambientLight intensity={0.6} color="#a78bfa" />
                  <directionalLight position={[3, 5, 3]} intensity={1.1} castShadow />
                  <pointLight position={[-3, 2, -2]} intensity={10} color="#8b5cf6" />
                  <group position={[0, -1.3, 0]}>
                    <CharacterModel
                      equippedByCategory={profile.equippedByCategory}
                      gender={profile.gender}
                    />
                  </group>
                  <ContactShadows position={[0, -1.3, 0]} opacity={0.5} scale={4} blur={2} far={3} />
                  <OrbitControls
                    target={[0, 0.1, 0]}
                    enablePan={false}
                    minDistance={2}
                    maxDistance={4.5}
                    autoRotate
                    autoRotateSpeed={1.4}
                  />
                </Suspense>
              </Canvas>
            </div>

            <div className="p-5">
              <div className="mb-3 flex items-center gap-3">
                {profile.discordAvatarUrl ? (
                  <Image
                    src={profile.discordAvatarUrl}
                    alt=""
                    width={48}
                    height={48}
                    unoptimized
                    className="h-12 w-12 rounded-full border border-white/10"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-purple-500/20" />
                )}
                <div>
                  <p className="flex items-center gap-1.5 text-lg font-bold text-zinc-100">
                    {profile.username}
                    {profile.verified && (
                      <BadgeCheck className="h-4 w-4 text-blue-400 drop-shadow-[0_0_6px_rgba(59,130,246,0.7)]" aria-label="Verifiziert" />
                    )}
                    {profile.role === "admin" && (
                      <ShieldCheck className="h-4 w-4 text-amber-400" aria-label="Admin" />
                    )}
                  </p>
                  {profile.discordName && (
                    <p className="text-xs text-zinc-500">Discord: {profile.discordName}</p>
                  )}
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Credits</p>
                  <p className="font-bold text-purple-300">
                    {new Intl.NumberFormat("de-DE").format(profile.credits)} {currencyName}
                  </p>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Items</p>
                  <p className="font-bold text-zinc-200">{totalItems(profile.rarityCounts)}</p>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-1.5">
                {RARITY_ORDER.map((rarity) => {
                  const count = profile.rarityCounts[rarity];
                  if (count === 0) return null;
                  const style = RARITY_STYLES[rarity];
                  return (
                    <span
                      key={rarity}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${style.border} ${style.bg} ${style.text}`}
                    >
                      {RARITY_LABELS[rarity]} ×{count}
                    </span>
                  );
                })}
              </div>

              <div className="space-y-1.5 text-xs text-zinc-500">
                <p className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  {profile.casesOpened} Cases geöffnet
                </p>
                <p className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Mitglied seit{" "}
                  {new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
                    new Date(profile.memberSince)
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
