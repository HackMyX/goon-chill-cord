"use client";

// Universal Preview Engine — renders a full-screen overlay modal for every
// previewable object type on the platform: items (3D), name styles, badges,
// abilities, credits, XP boosts, random items, and generic fallbacks.

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Zap } from "lucide-react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { CharacterModel } from "@/components/world/character-model";
import { ItemStatBadges } from "@/components/items/item-stat-badges";
import { RarityBadge } from "@/components/dashboard/rarity-badge";
import { BadgePill } from "@/components/ui/badge-pill";
import { StyledUsername } from "@/components/ui/styled-username";
import { getBadgeStyle } from "@/lib/badges";
import type { EquippedItem } from "@/lib/rarity-colors";
import type { Rarity } from "@/lib/cases";
import { DEFAULT_PREVIEW_CONFIG, type PreviewConfig } from "@/lib/preview-config-types";
import { RewardHero3D } from "@/components/battlepass/bp-reward-3d";

/** Shared 3D hero shell — renders a reward as a real rotating 3D model (eigene
 *  Canvas, wie ItemHero). Damit zeigen Shop/Level-Road/Daily/Streak echtes 3D. */
function Reward3DHero({
  rewardType, rarity = "selten", game, creditsAmount, accent = "#7c3aed", overlay,
}: {
  rewardType: string; rarity?: string; game?: string; creditsAmount?: number; accent?: string; overlay?: ReactNode;
}) {
  return (
    <div className="relative h-full w-full bg-black/50">
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, ${accent}1f 0%, transparent 70%)` }} />
      <RewardHero3D rewardType={rewardType} rarity={rarity} game={game} creditsAmount={creditsAmount} />
      {overlay && <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center">{overlay}</div>}
    </div>
  );
}

// ─── PreviewSubject discriminated union ──────────────────────────────────────

export type PreviewSubject =
  | {
      kind: "item";
      item: {
        id: string;
        name: string;
        rarity: Rarity;
        type: string;
        damage?: number | null;
        armor?: number | null;
        perk_type?: string | null;
        perk_magnitude?: number | null;
        shield_hp?: number | null;
        shield_regen_cooldown_sec?: number | null;
      };
      gender?: "m" | "w";
    }
  | { kind: "name_style"; styleKey: string; displayName?: string }
  | { kind: "badge"; badgeKey: string; badgeText?: string; description?: string }
  | {
      kind: "ability";
      abilityKey: string;
      name: string;
      description?: string;
      category?: string;
      rarity?: string;
      icon?: string;
      effectValue?: number;
    }
  | { kind: "credits"; amount: number }
  | { kind: "xp_boost"; days: number }
  | { kind: "random_item"; rarity?: string; icon?: string }
  | { kind: "case_voucher"; mode: "tier" | "rarity"; label?: string; tierLabel?: string; rarityFloor?: string; durationHours?: number }
  | { kind: "game_bonus"; game: "plinko" | "snake" | "don"; amount: number; label?: string; durationHours?: number }
  | { kind: "generic"; icon: string; name: string; description?: string; accent?: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<string, string> = {
  normal:   "#94a3b8",
  selten:   "#a78bfa",
  mythisch: "#f59e0b",
  ultra:    "#e879f9",
};

const ITEM_DESCRIPTIONS: Record<string, string> = {
  pet:             "Dein treuer Begleiter folgt dir in der Welt und greift automatisch Gegner in seiner Reichweite an.",
  weapon_cosmetic: "Erhöht deinen Waffenschaden bei jedem Treffer im Kampf.",
  jacket:          "Jacken bieten Rüstungspunkte, die eingehenden Schaden Punkt für Punkt reduzieren.",
  pants:           "Beinschutz mit Rüstungspunkten.",
  shoes:           "Schuhe mit Rüstungsbonus — schützen deine Füße und stapeln sich mit anderen Teilen.",
  hat:             "Kopfschutz mit Rüstungspunkten.",
  shield_cosmetic: "Eine Energieblase, die Schaden absorbiert, bevor deine HP sinken.",
  ring:            "Passiver Ring mit Spezialbonus — Tempo, Sprungkraft oder HP-Regeneration.",
  ring2:           "Zweiter Ringslot — passiver Bonus.",
  amulet:          "Amulett mit passivem Bonus. Kombiniert mit Ringen entstehen sehr starke Effekte.",
  aura:            "Magische Aura rund um deinen Charakter — in der Welt für alle sichtbar.",
  trail:           "Leuchtende Spur beim Laufen — rein kosmetisch, aber spektakulär.",
  face:            "Maske oder Gesichtsschutz — verändert das Aussehen deines Charakters.",
  hair:            "Frisur für deinen Charakter — in der Welt und der Garderobe sichtbar.",
};

function getRarityColor(rarity?: string | null): string {
  return RARITY_COLORS[rarity ?? "normal"] ?? "#94a3b8";
}

// ─── Hero visuals ─────────────────────────────────────────────────────────────

function ItemHero({
  subject,
  config,
}: {
  subject: Extract<PreviewSubject, { kind: "item" }>;
  config: PreviewConfig;
}) {
  const { item, gender = "m" } = subject;
  const rc = getRarityColor(item.rarity);

  const equipped: Record<string, EquippedItem | undefined> = {
    [item.type]: {
      id: item.id,
      name: item.name,
      rarity: item.rarity,
      damage: item.damage,
      armor: item.armor,
      perk_type: item.perk_type as EquippedItem["perk_type"],
      perk_magnitude: item.perk_magnitude,
      shield_hp: item.shield_hp,
      shield_regen_cooldown_sec: item.shield_regen_cooldown_sec,
    },
  };

  return (
    <div className="relative h-full w-full">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 65%, ${rc}18 0%, transparent 65%)` }}
      />
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ position: [0, 1.6, config.item3dCameraDistance], fov: config.item3dCameraFov }}
      >
        <Suspense fallback={null}>
          <color attach="background" args={["#08050f"]} />
          <ambientLight intensity={0.6} color="#a78bfa" />
          <directionalLight position={[3, 5, 3]} intensity={1.1} castShadow />
          <pointLight position={[-3, 2, -2]} intensity={10} color="#8b5cf6" />
          <group position={[0, -1.3, 0]}>
            <CharacterModel equippedByCategory={equipped} gender={gender} />
          </group>
          <ContactShadows position={[0, -1.3, 0]} opacity={0.5} scale={4} blur={2} far={3} />
          <OrbitControls
            target={[0, 0.1, 0]}
            enablePan={false}
            minDistance={1.6}
            maxDistance={5}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 1.9}
            autoRotate={config.item3dAutoRotate}
            autoRotateSpeed={config.item3dRotationSpeed}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

function NameStyleHero({
  subject,
  config,
}: {
  subject: Extract<PreviewSubject, { kind: "name_style" }>;
  config: PreviewConfig;
}) {
  const name = subject.displayName ?? "DeinName";
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-8 bg-black/60">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-blue-900/10" />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-8"
        animate={config.nameStyleGlowPulse ? { opacity: [0.85, 1, 0.85] } : {}}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <StyledUsername
          name={name}
          styleKey={subject.styleKey}
          size={config.nameStyleSize as "lg" | "xl" | "hero"}
          staticMode={false}
        />
        <div className="flex flex-col items-center gap-1.5 opacity-50">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Im Chat & in der Welt</p>
          <StyledUsername name={name} styleKey={subject.styleKey} size="md" staticMode={false} />
        </div>
      </motion.div>

      {config.particleEffectsEnabled && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {[...Array(10)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-1 w-1 rounded-full bg-purple-400/70"
              style={{ left: `${8 + i * 9}%`, top: `${15 + (i % 4) * 20}%` }}
              animate={{ y: [0, -35, 0], opacity: [0, 0.9, 0] }}
              transition={{ duration: 2 + i * 0.35, repeat: Infinity, delay: i * 0.28, ease: "easeInOut" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BadgeHero({
  subject,
  config,
}: {
  subject: Extract<PreviewSubject, { kind: "badge" }>;
  config: PreviewConfig;
}) {
  const style = getBadgeStyle(subject.badgeKey);
  const glow = config.badgeGlowEnabled ? config.badgeGlowIntensity / 100 : 0;

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-8 bg-black/50">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 50%, ${style.bg} 0%, transparent 68%)` }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-6"
        animate={
          config.badgeGlowEnabled
            ? {
                filter: [
                  `drop-shadow(0 0 ${glow * 18}px ${style.glow})`,
                  `drop-shadow(0 0 ${glow * 40}px ${style.glow})`,
                  `drop-shadow(0 0 ${glow * 18}px ${style.glow})`,
                ],
              }
            : {}
        }
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Hero badge — oversized */}
        <span
          className="inline-flex items-center rounded-xl px-7 py-3.5 text-2xl font-black leading-none"
          style={{
            background: style.bg,
            color: style.text,
            border: `2px solid ${style.border}`,
            boxShadow: config.badgeGlowEnabled
              ? `0 0 ${glow * 32}px ${style.glow}, 0 0 ${glow * 64}px ${style.glow}50`
              : "none",
          }}
        >
          {subject.badgeText ?? subject.badgeKey}
        </span>

        {/* Smaller "live" example */}
        <div className="flex items-center gap-2 opacity-55">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Im Chat & Profil</p>
          <BadgePill badgeKey={subject.badgeKey} label={subject.badgeText} size="sm" />
        </div>
      </motion.div>

      {config.particleEffectsEnabled && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {[...Array(7)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full"
              style={{ left: `${12 + i * 13}%`, bottom: `${8 + (i % 3) * 18}%`, background: style.text }}
              animate={{ y: [0, -42, 0], opacity: [0, 0.85, 0], scale: [0.5, 1.6, 0.5] }}
              transition={{ duration: 2.4 + i * 0.28, repeat: Infinity, delay: i * 0.45, ease: "easeInOut" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AbilityHero({
  subject,
  config,
}: {
  subject: Extract<PreviewSubject, { kind: "ability" }>;
  config: PreviewConfig;
}) {
  const rc = getRarityColor(subject.rarity);
  void config;
  return (
    <Reward3DHero
      rewardType="ability"
      rarity={subject.rarity ?? "selten"}
      accent={rc}
      overlay={subject.category ? (
        <span
          className="rounded-full border px-3 py-0.5 text-[10px] font-black uppercase tracking-widest"
          style={{ borderColor: `${rc}40`, color: rc, background: `${rc}15` }}
        >
          {subject.category}
        </span>
      ) : undefined}
    />
  );
}

function CreditsHero({
  subject,
  config,
}: {
  subject: Extract<PreviewSubject, { kind: "credits" }>;
  config: PreviewConfig;
}) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-black/50">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 38%, rgba(245,158,11,0.15) 0%, transparent 68%)" }}
      />
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="relative flex items-center justify-center" style={{ height: 112 }}>
          {config.particleEffectsEnabled ? (
            <>
              {[...Array(4)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: 64 + i * 10,
                    height: 64 + i * 10,
                    background: `radial-gradient(circle at 32% 32%, #fde68a, #f59e0b, #78350f)`,
                    boxShadow: `0 0 ${14 + i * 10}px rgba(245,158,11,${0.3 + i * 0.07})`,
                    bottom: i * 5,
                    zIndex: 4 - i,
                  }}
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2 + i * 0.4, repeat: Infinity, delay: i * 0.35, ease: "easeInOut" }}
                />
              ))}
              <span className="relative z-10 mt-6 text-3xl">💰</span>
            </>
          ) : (
            <span className="text-5xl">💰</span>
          )}
        </div>
        <div className="text-center" style={{ marginTop: config.particleEffectsEnabled ? 24 : 0 }}>
          <p className="text-4xl font-black tabular-nums text-amber-300">
            {subject.amount.toLocaleString("de-DE")}
          </p>
          <p className="mt-1 text-sm font-bold text-amber-400/60">Credits</p>
        </div>
      </div>
    </div>
  );
}

function XpBoostHero({ subject }: { subject: Extract<PreviewSubject, { kind: "xp_boost" }> }) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-black/50">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 38%, rgba(56,189,248,0.18) 0%, transparent 70%)" }}
      />
      <div className="relative z-10 flex flex-col items-center gap-6">
        <motion.div
          className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-sky-400/60"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.2) 0%, transparent 70%)" }}
          animate={{
            boxShadow: [
              "0 0 30px rgba(56,189,248,0.3)",
              "0 0 80px rgba(56,189,248,0.7)",
              "0 0 30px rgba(56,189,248,0.3)",
            ],
          }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <Zap className="h-14 w-14 text-sky-400" />
        </motion.div>
        <div className="text-center">
          <p className="text-5xl font-black tabular-nums text-sky-300">+{subject.days}</p>
          <p className="mt-1 text-sm font-bold text-sky-400/60">
            {subject.days === 1 ? "Fortschrittstag" : "Fortschrittstage"}
          </p>
        </div>
      </div>
    </div>
  );
}

function RandomItemHero({ subject }: { subject: Extract<PreviewSubject, { kind: "random_item" }> }) {
  const rc = getRarityColor(subject.rarity);
  return (
    <Reward3DHero
      rewardType="random_item"
      rarity={subject.rarity ?? "selten"}
      accent={rc}
      overlay={subject.rarity ? (
        <span className="rounded-full px-3 py-0.5 text-xs font-black uppercase tracking-widest"
          style={{ background: `${rc}20`, color: rc, border: `1px solid ${rc}40` }}>
          {subject.rarity}
        </span>
      ) : undefined}
    />
  );
}

function GenericHero({ subject }: { subject: Extract<PreviewSubject, { kind: "generic" }> }) {
  const accent = subject.accent ?? "#a78bfa";
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-black/50">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 40%, ${accent}12 0%, transparent 70%)` }}
      />
      <motion.span
        className="relative z-10 text-7xl"
        animate={{ scale: [1, 1.08, 1], rotate: [0, 4, -4, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      >
        {subject.icon}
      </motion.span>
    </div>
  );
}

const VOUCHER_GAME_INFO: Record<"plinko" | "snake" | "don", { label: string; emoji: string; color: string }> = {
  plinko: { label: "Plinko-Bälle", emoji: "🔵", color: "#8b5cf6" },
  snake:  { label: "Snake-Spiele", emoji: "🐍", color: "#22c55e" },
  don:    { label: "DON-Spins",    emoji: "🎲", color: "#f59e0b" },
};

function CaseVoucherHero({ subject }: { subject: Extract<PreviewSubject, { kind: "case_voucher" }> }) {
  const col = subject.rarityFloor ? getRarityColor(subject.rarityFloor) : "#e879f9";
  return (
    <Reward3DHero
      rewardType="case_voucher"
      rarity={subject.rarityFloor ?? "selten"}
      accent={col}
      overlay={
        <span className="rounded-full px-3 py-0.5 text-xs font-black uppercase tracking-widest"
          style={{ background: `${col}20`, color: col, border: `1px solid ${col}40` }}>
          {subject.mode === "rarity" ? `mind. ${subject.rarityFloor ?? "?"}` : (subject.tierLabel ?? "Gratis-Case")}
        </span>
      }
    />
  );
}

function GameBonusHero({ subject }: { subject: Extract<PreviewSubject, { kind: "game_bonus" }> }) {
  const info = VOUCHER_GAME_INFO[subject.game];
  return (
    <Reward3DHero
      rewardType="game_bonus"
      game={subject.game}
      accent={info.color}
      overlay={
        <span className="rounded-full px-3 py-1 text-sm font-black"
          style={{ background: `${info.color}20`, color: info.color, border: `1px solid ${info.color}40` }}>
          +{subject.amount} {subject.label || info.label}
        </span>
      }
    />
  );
}

// ─── Hero router ──────────────────────────────────────────────────────────────

function PreviewHero({
  subject,
  config,
}: {
  subject: PreviewSubject;
  config: PreviewConfig;
}) {
  switch (subject.kind) {
    case "item":        return <ItemHero subject={subject} config={config} />;
    case "name_style":  return <NameStyleHero subject={subject} config={config} />;
    case "badge":       return <BadgeHero subject={subject} config={config} />;
    case "ability":     return <AbilityHero subject={subject} config={config} />;
    case "credits":     return <CreditsHero subject={subject} config={config} />;
    case "xp_boost":    return <XpBoostHero subject={subject} />;
    case "random_item": return <RandomItemHero subject={subject} />;
    case "case_voucher":return <CaseVoucherHero subject={subject} />;
    case "game_bonus":  return <GameBonusHero subject={subject} />;
    case "generic":     return <GenericHero subject={subject} />;
  }
}

// ─── Info section ─────────────────────────────────────────────────────────────

function PreviewInfo({ subject }: { subject: PreviewSubject }) {
  if (subject.kind === "item") {
    const { item } = subject;
    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <p className="text-sm font-bold text-zinc-100">{item.name}</p>
          <RarityBadge rarity={item.rarity} />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <ItemStatBadges
            damage={item.damage}
            armor={item.armor}
            perk_type={item.perk_type}
            perk_magnitude={item.perk_magnitude}
            shield_hp={item.shield_hp}
            shield_regen_cooldown_sec={item.shield_regen_cooldown_sec}
            itemName={item.name}
            itemType={item.type}
          />
        </div>
        <p className="text-center text-[11px] leading-relaxed text-zinc-400">
          {ITEM_DESCRIPTIONS[item.type] ?? "Kosmetisches Item für deinen Charakter."}
        </p>
        <p className="text-center text-[10px] text-zinc-600">Solo-Vorschau — alle anderen Slots sind leer.</p>
      </div>
    );
  }

  if (subject.kind === "name_style") {
    return (
      <div className="space-y-1.5 text-center">
        <p className="text-sm font-bold text-zinc-100">Name Style</p>
        <p className="font-mono text-xs text-zinc-400">{subject.styleKey}</p>
      </div>
    );
  }

  if (subject.kind === "badge") {
    return (
      <div className="space-y-2 text-center">
        <p className="text-sm font-bold text-zinc-100">
          Badge: {subject.badgeText ?? subject.badgeKey}
        </p>
        {subject.description && (
          <p className="text-[11px] leading-relaxed text-zinc-400">{subject.description}</p>
        )}
      </div>
    );
  }

  if (subject.kind === "ability") {
    return (
      <div className="space-y-2 text-center">
        <p className="text-sm font-bold text-zinc-100">{subject.name}</p>
        {subject.description && (
          <p className="text-[11px] leading-relaxed text-zinc-400">{subject.description}</p>
        )}
        {subject.effectValue != null && (
          <p className="text-xs font-semibold text-purple-300">
            Effekt: +{Math.round(subject.effectValue * 100)}%
          </p>
        )}
      </div>
    );
  }

  if (subject.kind === "credits") {
    return (
      <p className="text-center text-[11px] text-zinc-500">
        Credits werden sofort deinem Konto gutgeschrieben.
      </p>
    );
  }

  if (subject.kind === "xp_boost") {
    return (
      <p className="text-center text-[11px] text-zinc-500">
        Zusätzliche Fortschrittstage für deinen aktiven Battle Pass.
      </p>
    );
  }

  if (subject.kind === "random_item") {
    return (
      <p className="text-center text-[11px] text-zinc-500">
        Ein zufällig ausgewähltes Item aus dem entsprechenden Rarity-Pool.
      </p>
    );
  }

  if (subject.kind === "case_voucher") {
    return (
      <div className="space-y-1.5 text-center">
        <p className="text-sm font-bold text-zinc-100">{subject.label || "Case-Gutschein"}</p>
        <p className="text-[11px] leading-relaxed text-zinc-400">
          {subject.mode === "rarity"
            ? `Öffne ein beliebiges Case gratis — garantiert mindestens ${subject.rarityFloor ?? "?"}.`
            : `Öffne ${subject.tierLabel ?? "dieses Case"} einmal gratis.`}
          {subject.durationHours ? ` Läuft in ${subject.durationHours}h ab.` : ""}
        </p>
      </div>
    );
  }

  if (subject.kind === "game_bonus") {
    const info = VOUCHER_GAME_INFO[subject.game];
    return (
      <p className="text-center text-[11px] text-zinc-500">
        +{subject.amount} extra {info.label} — werden automatisch genutzt, sobald dein Limit erreicht ist.
        {subject.durationHours ? ` Läuft in ${subject.durationHours}h ab.` : ""}
      </p>
    );
  }

  if (subject.kind === "generic") {
    return (
      <div className="space-y-1.5 text-center">
        <p className="text-sm font-bold text-zinc-100">{subject.name}</p>
        {subject.description && (
          <p className="text-[11px] leading-relaxed text-zinc-400">{subject.description}</p>
        )}
      </div>
    );
  }

  return null;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export interface UniversalPreviewModalProps {
  subject: PreviewSubject;
  onClose: () => void;
  previewConfig?: PreviewConfig;
}

export function UniversalPreviewModal({
  subject,
  onClose,
  previewConfig,
}: UniversalPreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  const config = previewConfig ?? DEFAULT_PREVIEW_CONFIG;

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="universal-preview-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[300] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.84)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.88, y: 28 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ type: "spring", damping: 22, stiffness: 300 }}
          className="relative w-full"
          style={{ maxWidth: "min(94vw, 480px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute -right-3 -top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-zinc-300 transition-colors hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Card */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_28px_80px_rgba(0,0,0,0.75)]">
            {/* Hero */}
            <div className="relative h-72 w-full overflow-hidden bg-[#08050f]">
              <PreviewHero subject={subject} config={config} />
            </div>

            {/* Info */}
            <div className="space-y-3 border-t border-white/[0.06] bg-[#0b0814] px-4 py-4">
              <PreviewInfo subject={subject} />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
