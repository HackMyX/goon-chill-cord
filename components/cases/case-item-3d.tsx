"use client";

// Lightweight 3D item view for the case-opening flow (reel slots, win reveal,
// batch grid, pool gallery). Renders into the single shared <View.Port/> Canvas
// mounted in cases-shell — so dozens can coexist on one WebGL context.
//
// Unlike the shop's ItemIsolatedPreview, this deliberately does NOT mount an
// OrbitControls per slot (49 reel slots × OrbitControls would be far too heavy
// and pointless during a fast spin). Rotation is a cheap useFrame on a group,
// and drei's <View> scissor-culls every slot that is off-screen, so a long reel
// costs only what is actually visible.

import { Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as THREE from "three";
import { Coins, Sparkles } from "lucide-react";
import { useFrame } from "@react-three/fiber";
import { View, PerspectiveCamera, ContactShadows } from "@react-three/drei";
import {
  ItemSceneContent,
  ItemLights,
  getCam,
  type ItemForPreview,
} from "@/components/shop/shop-character-view";
import { StyledUsername } from "@/components/ui/styled-username";
import { BadgePill } from "@/components/ui/badge-pill";
import type { PreviewSubject } from "@/components/ui/universal-preview-modal";
import { RARITY_HEX } from "@/lib/rarity-colors";
import type { Rarity } from "@/lib/cases";

export type { ItemForPreview };

/** Static camera aimed once at the item's type-specific target (no controls). */
function CameraRig({ cfg }: { cfg: ReturnType<typeof getCam> }) {
  const camRef = useRef<THREE.PerspectiveCamera>(null);
  useEffect(() => {
    camRef.current?.lookAt(cfg.target[0], cfg.target[1], cfg.target[2]);
  }, [cfg]);
  return (
    <PerspectiveCamera ref={camRef} makeDefault position={cfg.pos} fov={cfg.fov} />
  );
}

/** Gentle y-rotation — disabled while the reel is whizzing past to save cost. */
function AutoSpin({
  enabled,
  speed = 0.55,
  children,
}: {
  enabled: boolean;
  speed?: number;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (enabled && ref.current) ref.current.rotation.y += dt * speed;
  });
  return <group ref={ref}>{children}</group>;
}

export interface CaseItem3DProps {
  item: ItemForPreview;
  /** Stable, unique render-slot index for the drei View tunnel. */
  viewIndex: number;
  /** drei culls automatically; this also fully stops the scene when false. */
  visible?: boolean;
  /** Whether the item slowly rotates (off for fast-moving reel filler). */
  rotate?: boolean;
  /** Rotation speed multiplier. */
  rotateSpeed?: number;
  /** Soft contact shadow under the item (hero/reveal only — costs a render). */
  shadow?: boolean;
  gender?: "m" | "w";
}

export function CaseItem3D({
  item,
  viewIndex,
  visible = true,
  rotate = true,
  rotateSpeed,
  shadow = false,
  gender = "m",
}: CaseItem3DProps) {
  const cfg = getCam(item.type);

  return (
    <View
      index={viewIndex}
      visible={visible}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <CameraRig cfg={cfg} />
      <ItemLights />
      <Suspense fallback={null}>
        <AutoSpin enabled={rotate} speed={rotateSpeed}>
          <ItemSceneContent item={item} gender={gender} />
        </AutoSpin>
        {shadow && (
          <ContactShadows
            position={[0, -0.6, 0]}
            opacity={0.28}
            scale={3}
            blur={2.4}
            far={2}
          />
        )}
      </Suspense>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-item drop heroes (DOM) + unified CaseDropView
// ─────────────────────────────────────────────────────────────────────────────

function rarityHex(r?: string): string {
  return RARITY_HEX[(r as Rarity)] ?? "#a855f7";
}

/** Compact DOM hero for a non-item drop (name style, ability, badge, credits). */
function NonItemHero({ subject }: { subject: Exclude<PreviewSubject, { kind: "item" }> }) {
  switch (subject.kind) {
    case "name_style":
      return (
        <StyledUsername
          name={subject.displayName ?? "DeinName"}
          styleKey={subject.styleKey}
          size="md"
          staticMode={false}
        />
      );
    case "ability": {
      const hex = rarityHex(subject.rarity);
      return (
        <div
          className="flex h-[58px] w-[58px] items-center justify-center rounded-2xl border-2 text-3xl"
          style={{ borderColor: `${hex}66`, background: `radial-gradient(circle, ${hex}22 0%, transparent 70%)` }}
        >
          {subject.icon ?? "⚡"}
        </div>
      );
    }
    case "badge":
      return <BadgePill badgeKey={subject.badgeKey} label={subject.badgeText} size="sm" />;
    case "credits":
      return (
        <div className="flex flex-col items-center gap-0.5">
          <Coins className="h-7 w-7 text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.7)]" />
          <span className="text-xs font-black tabular-nums text-amber-200">
            {subject.amount.toLocaleString("de-DE")}
          </span>
        </div>
      );
    case "xp_boost":
      return (
        <div className="flex flex-col items-center gap-0.5 text-sky-300">
          <Sparkles className="h-7 w-7 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]" />
          <span className="text-xs font-black">+{subject.days}</span>
        </div>
      );
    case "random_item":
      return <span className="text-3xl">🎲</span>;
    case "generic":
      return <span className="text-3xl">{subject.icon}</span>;
  }
}

export interface CaseDropViewProps {
  subject: PreviewSubject;
  viewIndex: number;
  visible?: boolean;
  rotate?: boolean;
  rotateSpeed?: number;
  shadow?: boolean;
  lazy?: boolean;
  fallbackColor?: string;
}

/**
 * Unified drop renderer used everywhere in the case flow. Items render as real
 * 3D (into the shared Canvas); non-item drops render as a centered DOM hero
 * (the shared Canvas is transparent where no 3D View is drawn, so they show
 * through cleanly at the same z-layer).
 */
export function CaseDropView({
  subject,
  viewIndex,
  visible = true,
  rotate = true,
  rotateSpeed,
  shadow = false,
  lazy = false,
  fallbackColor = "#7c3aed",
}: CaseDropViewProps) {
  if (subject.kind === "item") {
    return lazy ? (
      <LazyCaseItem3D
        item={subject.item}
        viewIndex={viewIndex}
        rotate={rotate}
        rotateSpeed={rotateSpeed}
        fallbackColor={fallbackColor}
      />
    ) : (
      <CaseItem3D
        item={subject.item}
        viewIndex={viewIndex}
        visible={visible}
        rotate={rotate}
        rotateSpeed={rotateSpeed}
        shadow={shadow}
      />
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center p-1 text-center">
      <NonItemHero subject={subject} />
    </div>
  );
}

/**
 * Pool-gallery variant: only mounts the (relatively heavy) 3D View once the
 * card scrolls near the viewport, so a 100-item pool doesn't spin up 100 scene
 * graphs at once. Until then it shows a soft rarity-tinted placeholder.
 */
export function LazyCaseItem3D({
  fallbackColor = "#7c3aed",
  ...props
}: CaseItem3DProps & { fallbackColor?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShow(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="absolute inset-0">
      {show ? (
        <CaseItem3D {...props} />
      ) : (
        <div
          className="absolute inset-0 animate-pulse rounded-md"
          style={{
            background: `radial-gradient(circle at 50% 45%, ${fallbackColor}33 0%, transparent 70%)`,
          }}
        />
      )}
    </div>
  );
}
