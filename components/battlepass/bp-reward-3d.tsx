"use client";

import { Suspense, useRef, useMemo } from "react";
import type { RefObject, ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { View, PerspectiveCamera, ContactShadows } from "@react-three/drei";

// ── Shared lights ─────────────────────────────────────────────────────────────

function BpLights({ color = "#7c3aed" }: { color?: string }) {
  return (
    <>
      <ambientLight intensity={0.8} color="#c4b5fd" />
      <directionalLight position={[2, 5, 3]} intensity={1.6} color="#ffffff" />
      <pointLight position={[-2, 2, -1]} intensity={12} color={color} />
      <pointLight position={[1.5, 3, 2]} intensity={4} color="#ede9fe" />
    </>
  );
}

// ── Spinning disc / coin ──────────────────────────────────────────────────────

// 5-point star shape, built once — embossed on the coin face.
function useStarShape(outer = 0.24, inner = 0.11, spikes = 5) {
  return useMemo(() => {
    const s = new THREE.Shape();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath();
    return s;
  }, [outer, inner, spikes]);
}

function SpinningCoin({ amount = 0 }: { amount?: number }) {
  const ref = useRef<THREE.Group>(null);
  const star = useStarShape();
  // Gentle tilt-wobble that NEVER turns fully edge-on (which made the old thin
  // disc read as a cross/sword). The face stays toward the camera — premium look.
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.rotation.y = Math.sin(t * 0.9) * 0.55;
    ref.current.rotation.z = Math.cos(t * 0.65) * 0.07;
    ref.current.position.y = Math.sin(t * 1.2) * 0.06;
  });

  const gold = "#fbbf24";
  const goldDeep = "#b45309";
  const goldEmissive = "#f59e0b";
  const rim = "#fffbeb";

  // A single thick, premium coin facing the camera (face in the XY plane, so the
  // cylinder is rotated to stand upright with its round face toward Z).
  function Coin({ y = 0, r = 0.62, h = 0.16, dim = 1, withFace = true }: { y?: number; r?: number; h?: number; dim?: number; withFace?: boolean }) {
    return (
      <group position={[0, y, 0]}>
        {/* Body */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[r, r, h, 48]} />
          <meshStandardMaterial color={gold} emissive={goldEmissive} emissiveIntensity={0.3 * dim} metalness={1} roughness={0.18} />
        </mesh>
        {/* Edge bevel ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, h * 0.5, 10, 48]} />
          <meshStandardMaterial color={goldDeep} emissive={goldEmissive} emissiveIntensity={0.2 * dim} metalness={1} roughness={0.28} />
        </mesh>
        {withFace && (
          <>
            {/* Raised rim on the face */}
            <mesh position={[0, 0, h * 0.5 + 0.001]}>
              <torusGeometry args={[r * 0.82, 0.045, 14, 48]} />
              <meshStandardMaterial color={rim} emissive="#fcd34d" emissiveIntensity={0.55} metalness={1} roughness={0.07} />
            </mesh>
            {/* Embossed star */}
            <mesh position={[0, 0, h * 0.5 + 0.001]}>
              <extrudeGeometry args={[star, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 }]} />
              <meshStandardMaterial color={rim} emissive="#fde68a" emissiveIntensity={0.7} metalness={1} roughness={0.1} />
            </mesh>
          </>
        )}
      </group>
    );
  }

  return (
    <group ref={ref} rotation={[0.16, 0, 0]}>
      <Coin y={0} />
      {/* Stacked coins below for bigger amounts — chunky, no embossing */}
      {amount > 500 && <Coin y={-0.2} r={0.58} h={0.14} dim={0.7} withFace={false} />}
      {amount >= 2000 && <Coin y={-0.37} r={0.55} h={0.14} dim={0.5} withFace={false} />}
      {amount >= 5000 && <Coin y={-0.53} r={0.52} h={0.14} dim={0.35} withFace={false} />}
    </group>
  );
}

// ── Spinning dice ─────────────────────────────────────────────────────────────

const DOT_POSITIONS: Record<number, [number, number, number][]> = {
  1: [[0, 0, 0.52]],
  2: [[-0.15, 0.15, 0.52], [0.15, -0.15, 0.52]],
  3: [[-0.15, 0.15, 0.52], [0, 0, 0.52], [0.15, -0.15, 0.52]],
  4: [[-0.15, 0.15, 0.52], [0.15, 0.15, 0.52], [-0.15, -0.15, 0.52], [0.15, -0.15, 0.52]],
  5: [[-0.15, 0.15, 0.52], [0.15, 0.15, 0.52], [0, 0, 0.52], [-0.15, -0.15, 0.52], [0.15, -0.15, 0.52]],
  6: [[-0.15, 0.18, 0.52], [0.15, 0.18, 0.52], [-0.15, 0, 0.52], [0.15, 0, 0.52], [-0.15, -0.18, 0.52], [0.15, -0.18, 0.52]],
};

function DiceDots({ face, rotation }: { face: number; rotation: [number, number, number] }) {
  const dots = DOT_POSITIONS[face] ?? [];
  return (
    <group rotation={rotation}>
      {dots.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.055, 8, 8]} />
          <meshStandardMaterial color="#1e1b4b" emissive="#1e1b4b" />
        </mesh>
      ))}
    </group>
  );
}

function SpinningDice({ rarityColor = "#7c3aed" }: { rarityColor?: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 1.2;
    ref.current.rotation.x = clock.elapsedTime * 0.7;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.0) * 0.07;
  });
  const c = new THREE.Color(rarityColor);
  return (
    <group ref={ref}>
      <mesh>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.35} metalness={0.25} roughness={0.5} />
      </mesh>
      {/* Rounded edges via inner slightly smaller box — visual only */}
      <DiceDots face={1} rotation={[0, 0, 0]} />
      <DiceDots face={6} rotation={[Math.PI, 0, 0]} />
      <DiceDots face={2} rotation={[0, Math.PI / 2, 0]} />
      <DiceDots face={5} rotation={[0, -Math.PI / 2, 0]} />
      <DiceDots face={3} rotation={[-Math.PI / 2, 0, 0]} />
      <DiceDots face={4} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

// ── Trophy ─────────────────────────────────────────────────────────────────────

function SpinningTrophy() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 1.1;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.3) * 0.07;
  });
  const gold = new THREE.Color("#f59e0b");
  const goldEmissive = new THREE.Color("#d97706");
  return (
    <group ref={ref}>
      {/* Cup body */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.35, 0.25, 0.55, 24]} />
        <meshStandardMaterial color={gold} emissive={goldEmissive} emissiveIntensity={0.55} metalness={0.95} roughness={0.08} />
      </mesh>
      {/* Cup rim */}
      <mesh position={[0, 0.5, 0]}>
        <torusGeometry args={[0.35, 0.05, 8, 24]} />
        <meshStandardMaterial color="#fef3c7" metalness={1} roughness={0.05} />
      </mesh>
      {/* Stem */}
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.35, 12]} />
        <meshStandardMaterial color={gold} emissive={goldEmissive} emissiveIntensity={0.4} metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Base */}
      <mesh position={[0, -0.38, 0]}>
        <cylinderGeometry args={[0.28, 0.32, 0.1, 24]} />
        <meshStandardMaterial color={gold} emissive={goldEmissive} emissiveIntensity={0.35} metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Handles */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.43, 0.22, 0]} rotation={[0, 0, side * Math.PI * 0.15]}>
          <torusGeometry args={[0.14, 0.04, 8, 16, Math.PI]} />
          <meshStandardMaterial color={gold} emissive={goldEmissive} emissiveIntensity={0.5} metalness={0.95} roughness={0.08} />
        </mesh>
      ))}
    </group>
  );
}

// ── XP Boost lightning bolt ──────────────────────────────────────────────────

function SpinningBolt() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 1.6;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.8) * 0.07;
    const pulse = 0.5 + Math.abs(Math.sin(clock.elapsedTime * 2.5)) * 0.5;
    ref.current.scale.setScalar(0.92 + pulse * 0.08);
  });
  const blue = new THREE.Color("#38bdf8");
  const blueE = new THREE.Color("#0ea5e9");

  // Simple bolt shape using two angled cylinders
  return (
    <group ref={ref}>
      {/* Top segment */}
      <mesh position={[0.12, 0.28, 0]} rotation={[0, 0, -Math.PI * 0.18]}>
        <boxGeometry args={[0.18, 0.5, 0.14]} />
        <meshStandardMaterial color={blue} emissive={blueE} emissiveIntensity={0.8} metalness={0.3} roughness={0.3} />
      </mesh>
      {/* Bottom segment */}
      <mesh position={[-0.12, -0.22, 0]} rotation={[0, 0, -Math.PI * 0.18]}>
        <boxGeometry args={[0.18, 0.5, 0.14]} />
        <meshStandardMaterial color={blue} emissive={blueE} emissiveIntensity={0.8} metalness={0.3} roughness={0.3} />
      </mesh>
      {/* Middle connector */}
      <mesh position={[0, 0.05, 0]} rotation={[0, 0, Math.PI * 0.12]}>
        <boxGeometry args={[0.32, 0.2, 0.14]} />
        <meshStandardMaterial color={blue} emissive={blueE} emissiveIntensity={0.9} metalness={0.3} roughness={0.3} />
      </mesh>
      {/* Glow orb */}
      <mesh>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshStandardMaterial color={blue} emissive={blueE} emissiveIntensity={0.2} transparent opacity={0.08} />
      </mesh>
    </group>
  );
}

// ── Name-style spinning rings ─────────────────────────────────────────────────

function SpinningStyleOrb() {
  const ref = useRef<THREE.Group>(null);
  const r1 = useRef<THREE.Mesh>(null);
  const r2 = useRef<THREE.Mesh>(null);
  const r3 = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.1) * 0.07;
    if (r1.current) r1.current.rotation.y = clock.elapsedTime * 2.0;
    if (r2.current) r2.current.rotation.z = clock.elapsedTime * 1.5;
    if (r3.current) r3.current.rotation.x = clock.elapsedTime * 1.0;
  });

  const colors = ["#a78bfa", "#f472b6", "#34d399", "#f59e0b"];
  return (
    <group ref={ref}>
      {/* Central sphere */}
      <mesh>
        <sphereGeometry args={[0.28, 20, 20]} />
        <meshStandardMaterial color="#7c3aed" emissive="#6d28d9" emissiveIntensity={0.6} metalness={0.6} roughness={0.2} />
      </mesh>
      {/* Orbit ring 1 */}
      <mesh ref={r1}>
        <torusGeometry args={[0.52, 0.035, 8, 40]} />
        <meshStandardMaterial color={colors[0]} emissive={colors[0]} emissiveIntensity={0.7} />
      </mesh>
      {/* Orbit ring 2 */}
      <mesh ref={r2} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.52, 0.035, 8, 40]} />
        <meshStandardMaterial color={colors[1]} emissive={colors[1]} emissiveIntensity={0.7} />
      </mesh>
      {/* Orbit ring 3 */}
      <mesh ref={r3} rotation={[Math.PI / 4, Math.PI / 4, 0]}>
        <torusGeometry args={[0.52, 0.035, 8, 40]} />
        <meshStandardMaterial color={colors[2]} emissive={colors[2]} emissiveIntensity={0.7} />
      </mesh>
      {/* Orbiting dots */}
      {colors.map((col, i) => {
        const angle = (i / colors.length) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(angle) * 0.52, Math.sin(angle) * 0.52, 0]}>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshStandardMaterial color={col} emissive={col} emissiveIntensity={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

// ── Generic ability orb ───────────────────────────────────────────────────────

function SpinningAbilityOrb() {
  const ref = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.3) * 0.07;
    ref.current.rotation.y = clock.elapsedTime * 0.8;
    if (ring.current) ring.current.rotation.z = clock.elapsedTime * 2.2;
    const pulse = 0.7 + Math.abs(Math.sin(clock.elapsedTime * 1.8)) * 0.3;
    ref.current.scale.setScalar(pulse);
  });
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.38, 20, 20]} />
        <meshStandardMaterial color="#8b5cf6" emissive="#7c3aed" emissiveIntensity={0.7} transparent opacity={0.9} metalness={0.4} roughness={0.2} />
      </mesh>
      <mesh ref={ring}>
        <torusGeometry args={[0.58, 0.05, 8, 32]} />
        <meshStandardMaterial color="#c4b5fd" emissive="#a78bfa" emissiveIntensity={0.8} />
      </mesh>
      {/* Inner core */}
      <mesh>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial color="#ede9fe" emissive="#ddd6fe" emissiveIntensity={1.0} />
      </mesh>
    </group>
  );
}

// ── Fallback gem ──────────────────────────────────────────────────────────────

function SpinningGem({ color = "#7c3aed" }: { color?: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 1.3;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.1) * 0.07;
  });
  const c = new THREE.Color(color);
  return (
    <group ref={ref}>
      <mesh>
        <octahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.5} metalness={0.5} roughness={0.2} transparent opacity={0.92} />
      </mesh>
    </group>
  );
}

// ── Reward type → 3D scene ────────────────────────────────────────────────────

function BpRewardScene({
  rewardType,
  rarity,
  creditsAmount,
}: {
  rewardType: string;
  rarity: string;
  creditsAmount?: number;
}) {
  const rarityColors: Record<string, string> = {
    normal: "#94a3b8",
    selten: "#a78bfa",
    mythisch: "#f59e0b",
    ultra: "#e879f9",
  };
  const rc = rarityColors[rarity] ?? "#7c3aed";

  switch (rewardType) {
    case "credits": return <SpinningCoin amount={creditsAmount} />;
    case "random_item": return <SpinningDice rarityColor={rc} />;
    case "badge": return <SpinningTrophy />;
    case "xp_boost": return <SpinningBolt />;
    case "name_style": return <SpinningStyleOrb />;
    case "ability": return <SpinningAbilityOrb />;
    default: return <SpinningGem color={rc} />;
  }
}

// ── Carousel clip — per-FRAME visibility (no React lag) ───────────────────────

/**
 * Toggles its children's visibility every render frame based on how much of the
 * tracked tile is inside the carousel viewport. Because it runs in the WebGL
 * render loop (useFrame) — NOT via React state / IntersectionObserver — there is
 * ZERO lag: the model is hidden the exact instant the tile would start to clip
 * the carousel edge, so a 3D reward can never poke past / fly out of the rail,
 * yet every sufficiently-visible tile keeps its model. A binary clip (not a
 * partial scissor), tuned so the centred model is fully inside while shown.
 */
export function ClipToCarousel({
  tileRef, rootRef, threshold = 0.82, children,
}: {
  tileRef?: RefObject<HTMLElement | null>;
  rootRef?: RefObject<HTMLElement | null>;
  threshold?: number;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const tile = tileRef?.current;
    const root = rootRef?.current;
    if (!tile || !root) { if (!g.visible) g.visible = true; return; }
    const t = tile.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    const overlap = Math.max(0, Math.min(t.right, r.right) - Math.max(t.left, r.left));
    const vis = t.width > 0 ? overlap >= t.width * threshold : true;
    if (g.visible !== vis) g.visible = vis;
  });
  return <group ref={ref}>{children}</group>;
}

// ── Public component — wrap in a View for BP tiles ────────────────────────────

export function BpRewardView3D({
  rewardType,
  rarity = "normal",
  creditsAmount,
  viewIndex,
  visible = true,
  lightColor,
  track,
  clipTileRef,
  clipRootRef,
}: {
  rewardType: string;
  rarity?: string;
  creditsAmount?: number;
  viewIndex: number;
  visible?: boolean;
  lightColor?: string;
  /** When set, the View is rendered INSIDE a dedicated <Canvas> (CanvasView
   *  path) and scissors to this tracked DOM box — physically clipped to the
   *  canvas framebuffer. Used by the box-clipped reel canvas. */
  track?: RefObject<HTMLElement | null>;
  /** Carousel clip refs: hide the model per-frame once its tile clips the rail. */
  clipTileRef?: RefObject<HTMLElement | null>;
  clipRootRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <View
      index={viewIndex + 1}
      visible={visible}
      track={track as RefObject<HTMLElement> | undefined}
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
    >
      <PerspectiveCamera makeDefault position={[0, 0.15, 2.8]} fov={42} />
      <BpLights color={lightColor} />
      <Suspense fallback={null}>
        <ClipToCarousel tileRef={clipTileRef} rootRef={clipRootRef}>
          <BpRewardScene rewardType={rewardType} rarity={rarity} creditsAmount={creditsAmount} />
          <ContactShadows position={[0, -0.65, 0]} opacity={0.25} scale={3} blur={2.5} far={2} />
        </ClipToCarousel>
      </Suspense>
    </View>
  );
}
