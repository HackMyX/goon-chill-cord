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
import type { ReactNode, RefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { View, PerspectiveCamera, ContactShadows } from "@react-three/drei";
import {
  ItemSceneContent,
  ItemLights,
  getCam,
  type ItemForPreview,
  type CamCfg,
} from "@/components/shop/shop-character-view";
import { CharacterModel } from "@/components/world/character-model";
import { BpRewardView3D, ClipToCarousel } from "@/components/battlepass/bp-reward-3d";
import type { PreviewSubject } from "@/components/ui/universal-preview-modal";
import type { EquippedItem } from "@/lib/rarity-colors";

export type { ItemForPreview };

// ── Character-mode framing (worn items rendered on a body) ───────────────────

const CHAR_GROUP_Y = -0.95;
const CHAR_CAM: Record<string, CamCfg> = {
  hat:    { pos: [0, 0.95, 1.9], target: [0, 0.92, 0], fov: 32 },
  hair:   { pos: [0, 0.95, 1.9], target: [0, 0.92, 0], fov: 32 },
  face:   { pos: [0, 0.9, 1.7],  target: [0, 0.9, 0],  fov: 30 },
  jacket: { pos: [0, 0.45, 2.4], target: [0, 0.4, 0],  fov: 34 },
  pants:  { pos: [0, -0.25, 2.3], target: [0, -0.35, 0], fov: 34 },
  shoes:  { pos: [0, -0.5, 2.0], target: [0, -0.75, 0], fov: 34 },
};
const CHAR_CAM_DEFAULT: CamCfg = { pos: [0, 0.35, 3.1], target: [0, 0.3, 0], fov: 34 };

function getCharCam(type: string): CamCfg {
  return CHAR_CAM[type] ?? CHAR_CAM_DEFAULT;
}

function toEquipped(item: ItemForPreview): EquippedItem {
  return {
    id: item.id,
    name: item.name,
    rarity: item.rarity as EquippedItem["rarity"],
    damage: item.damage,
    armor: item.armor,
    perk_type: item.perk_type as EquippedItem["perk_type"],
    perk_magnitude: item.perk_magnitude,
    shield_hp: item.shield_hp,
    shield_regen_cooldown_sec: item.shield_regen_cooldown_sec,
  };
}

/** Renders a worn item on an otherwise-empty character so it reads correctly
 * (e.g. hair needs a head). Gender-aware per the viewing player. */
function CharacterPreviewScene({ item, gender }: { item: ItemForPreview; gender: "m" | "w" }) {
  const equipped: Record<string, EquippedItem | undefined> = { [item.type]: toEquipped(item) };
  return (
    <group position={[0, CHAR_GROUP_Y, 0]}>
      <CharacterModel equippedByCategory={equipped} gender={gender} />
    </group>
  );
}

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
  /** Render the item worn on a character body (hair/face/clothes read better). */
  character?: boolean;
  /** Camera zoom multiplier (>1 = closer/bigger). */
  scale?: number;
  /** When set, this View is rendered INSIDE a dedicated <Canvas> and scissors to
   *  this tracked DOM box — physically clipped to the canvas framebuffer (the
   *  box-clipped reel). When absent it uses the shared full-viewport canvas. */
  track?: RefObject<HTMLElement | null>;
  /** Carousel clip refs (BP season-road): hide the model per-frame once its tile
   *  clips the rail → no fly-out, zero lag. Absent elsewhere = no clipping. */
  clipTileRef?: RefObject<HTMLElement | null>;
  clipRootRef?: RefObject<HTMLElement | null>;
}

export function CaseItem3D({
  item,
  viewIndex,
  visible = true,
  rotate = true,
  rotateSpeed,
  shadow = false,
  gender = "m",
  character = false,
  scale = 1,
  track,
  clipTileRef,
  clipRootRef,
}: CaseItem3DProps) {
  const baseCfg = character ? getCharCam(item.type) : getCam(item.type);
  const z = Math.max(0.4, scale || 1);
  const cfg: CamCfg = {
    ...baseCfg,
    pos: [baseCfg.pos[0] / z, baseCfg.pos[1], baseCfg.pos[2] / z],
  };

  return (
    <View
      index={viewIndex}
      visible={visible}
      track={track as RefObject<HTMLElement> | undefined}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <CameraRig cfg={cfg} />
      <ItemLights />
      <Suspense fallback={null}>
        <ClipToCarousel tileRef={clipTileRef} rootRef={clipRootRef}>
          <AutoSpin enabled={rotate} speed={rotateSpeed}>
            {character ? (
              <CharacterPreviewScene item={item} gender={gender} />
            ) : (
              <ItemSceneContent item={item} gender={gender} />
            )}
          </AutoSpin>
          {shadow && !character && (
            <ContactShadows
              position={[0, -0.6, 0]}
              opacity={0.28}
              scale={3}
              blur={2.4}
              far={2}
            />
          )}
        </ClipToCarousel>
      </Suspense>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-item drops → real 3D geometry (reuses the Battle-Pass fallback meshes) +
// unified CaseDropView + a generic lazy-mount wrapper.
// ─────────────────────────────────────────────────────────────────────────────

/** Maps a non-item PreviewSubject to the Battle-Pass reward geometry props. */
function subjectToReward(subject: Exclude<PreviewSubject, { kind: "item" }>): {
  rewardType: string; rarity: string; creditsAmount?: number; game?: string;
} {
  switch (subject.kind) {
    case "credits":     return { rewardType: "credits", rarity: "mythisch", creditsAmount: subject.amount };
    case "name_style":  return { rewardType: "name_style", rarity: "selten" };
    case "ability":     return { rewardType: "ability", rarity: subject.rarity ?? "mythisch" };
    case "badge":       return { rewardType: "badge", rarity: "mythisch" };
    case "xp_boost":    return { rewardType: "xp_boost", rarity: "selten" };
    case "random_item": return { rewardType: "random_item", rarity: subject.rarity ?? "normal" };
    case "case_voucher": return { rewardType: "case_voucher", rarity: subject.rarityFloor ?? "selten" };
    case "game_bonus":  return { rewardType: "game_bonus", rarity: "selten", game: subject.game };
    case "generic":     return { rewardType: "default", rarity: "normal" };
  }
}

/** Generic on-screen-only mount wrapper for pool cards (caps live 3D scenes,
 *  clips to the scroll container — nothing renders outside it). */
function LazyView({
  rootRef, fallbackColor = "#7c3aed", children,
}: {
  rootRef?: RefObject<Element | null>;
  fallbackColor?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) setShow(e.isIntersecting); },
      { root: rootRef?.current ?? null, rootMargin: "0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootRef]);
  return (
    <div ref={ref} className="absolute inset-0">
      {show ? children : (
        <div className="absolute inset-0 rounded-md" style={{ background: `radial-gradient(circle at 50% 45%, ${fallbackColor}22 0%, transparent 70%)` }} />
      )}
    </div>
  );
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
  gender?: "m" | "w";
  /** Render worn items on a character body. */
  character?: boolean;
  /** Camera zoom multiplier. */
  scale?: number;
  /** Scroll container for lazy intersection clipping (pool popup). */
  rootRef?: RefObject<Element | null>;
  /** Tracked DOM box for the in-canvas (box-clipped reel) render path. */
  track?: RefObject<HTMLElement | null>;
  /** Carousel clip refs (BP season-road) — per-frame hide once the tile clips. */
  clipTileRef?: RefObject<HTMLElement | null>;
  clipRootRef?: RefObject<HTMLElement | null>;
}

/**
 * Unified drop renderer used everywhere in the case flow. Catalogue items render
 * via ItemSceneContent / CharacterModel; every NON-item drop renders as a real
 * spinning 3D geometry from the Battle-Pass set (coin, orb, trophy, bolt, gem)
 * so the roulette is 100% gap-free and consistent. All render into the shared
 * <View.Port/> canvas.
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
  gender = "m",
  character = false,
  scale = 1,
  rootRef,
  track,
  clipTileRef,
  clipRootRef,
}: CaseDropViewProps) {
  let node: ReactNode;
  if (subject.kind === "item") {
    node = (
      <CaseItem3D
        item={subject.item}
        viewIndex={viewIndex}
        visible={visible}
        rotate={rotate}
        rotateSpeed={rotateSpeed}
        shadow={shadow}
        gender={gender}
        character={character}
        scale={scale}
        track={track}
        clipTileRef={clipTileRef}
        clipRootRef={clipRootRef}
      />
    );
  } else {
    const r = subjectToReward(subject);
    node = (
      <BpRewardView3D
        rewardType={r.rewardType}
        rarity={r.rarity}
        creditsAmount={r.creditsAmount}
        game={r.game}
        viewIndex={viewIndex}
        visible={visible}
        track={track}
        clipTileRef={clipTileRef}
        clipRootRef={clipRootRef}
      />
    );
  }
  return lazy ? <LazyView rootRef={rootRef} fallbackColor={fallbackColor}>{node}</LazyView> : node;
}
