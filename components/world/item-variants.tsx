"use client";

import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RARITY_HEX, rarityColorFor, type EquippedItem } from "@/lib/rarity-colors";
import type { Rarity } from "@/lib/cases";

/** Deterministic string hash — same item name always picks the same
 * variant, but different item names spread across the available shapes.
 * This is what makes "equip a dog pet" actually look like a dog: every
 * pet item used to render as the exact same sphere, only tinted by
 * rarity. Now the item's *name* (not just its rarity) decides the shape. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function variantIndex(name: string, count: number): number {
  return hashString(name) % count;
}

// --- Rarity FX: universal per-rarity glow/pulse/RGB-cycle wrapper --------
//
// Wraps any solid-mesh variant (hat, jacket, pants, shoes, face, weapon,
// shield, hair, pet) and drives its materials every frame based on rarity,
// without each individual variant having to know or care:
//   normal   -> untouched, exactly the solid rarity color it already had
//   selten   -> a static color-matched glow (emissive = own color, low intensity)
//   mythisch -> a stronger glow that slowly pulses
//   ultra    -> full animated RGB hue-cycle (color *and* glow) + a fast pulse
//               + a small rotating sparkle-particle boost
//
// This is what makes "every Ultra item is animated/RGB" true across all
// ~900 generated items at once, instead of hand-authoring it per item.
function applyRarityMaterial(mat: THREE.Material, rarity: Rarity, t: number) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  if (rarity === "ultra") {
    const hue = (t * 0.18) % 1;
    mat.color.setHSL(hue, 0.85, 0.55);
    mat.emissive.setHSL(hue, 0.9, 0.5);
    mat.emissiveIntensity = 0.7 + Math.sin(t * 7) * 0.35;
  } else if (rarity === "mythisch") {
    mat.emissive.copy(mat.color);
    mat.emissiveIntensity = 0.35 + Math.sin(t * 2.4) * 0.2;
  } else if (rarity === "selten") {
    mat.emissive.copy(mat.color);
    mat.emissiveIntensity = 0.22;
  }
}

/** Shared by every aura/trail particle loop below — when `rarity` is
 * "ultra" each particle gets its own slowly-drifting hue instead of one
 * flat color, so Ultra auras/trails read as animated rainbow effects too,
 * not just oversized normal-tier ones. No-op (returns false) for every
 * other rarity, which already gets its correct static RARITY_HEX color
 * from the JSX `color={color}` prop at mount. */
function applyUltraParticleColor(
  mat: THREE.MeshBasicMaterial,
  rarity: Rarity,
  t: number,
  seed: number
): boolean {
  if (rarity !== "ultra") return false;
  const hue = (((t * 0.3 + seed * 0.09) % 1) + 1) % 1;
  mat.color.setHSL(hue, 1, 0.6);
  return true;
}

function UltraSparkles() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const count = 6;
  const seeds = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ angle: (i / count) * Math.PI * 2, phase: i * 0.9 })),
    [count]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const s = seeds[i];
      const hue = ((t * 0.3 + s.phase * 0.15) % 1 + 1) % 1;
      (m.material as THREE.MeshBasicMaterial).color.setHSL(hue, 1, 0.6);
      m.position.set(
        Math.cos(t * 1.4 + s.angle) * 0.32,
        Math.sin(t * 2.1 + s.phase) * 0.18,
        Math.sin(t * 1.4 + s.angle) * 0.32
      );
    }
  });

  return (
    <group>
      {seeds.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.03, 6, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function RarityFX({ rarity, children }: { rarity: Rarity; children: ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (rarity === "normal" || !groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) applyRarityMaterial(mat, rarity, t);
    });
  });

  return (
    <group ref={groupRef}>
      {children}
      {rarity === "ultra" && <UltraSparkles />}
    </group>
  );
}

// --- Pets: 5 distinct low-poly silhouettes (Dog, Dragon, Phoenix, Ghost, Cat)
//
// Every pet: diagonal gait (Dog/Cat), wing flap (Dragon/Phoenix), ethereal
// float (Ghost). Idle breathing, attack squash/flash, lunge, bank-into-turn
// for flyers. Leg rotation uses Z-axis: rotates in XY plane = forward/backward
// swing relative to the animal's +X facing direction. ✓

const DOG_LEG_HIPS: [number, number, number][] = [
  [0.16, 0.12, 0.08],
  [0.16, 0.12, -0.08],
  [-0.16, 0.12, 0.08],
  [-0.16, 0.12, -0.08],
];

function DogPet({ color, walkClockRef, attackPhaseRef, isMovingRef: _im }: { color: string; walkClockRef?: { current: number }; attackPhaseRef?: { current: number }; isMovingRef?: { current: boolean } }) {
  const tailRef = useRef<THREE.Mesh>(null);
  const legGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const bodyGroupRef = useRef<THREE.Group>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const jawRef = useRef<THREE.Mesh>(null);
  const eyeRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = walkClockRef?.current ?? 0;
    const isMoving = t > 0.01;
    const attack = attackPhaseRef?.current ?? 0;
    const elapsed = clock.elapsedTime;

    // Tail: frantic on attack, fast wag while running, lazy idle sway
    if (tailRef.current) {
      const wagSpeed = attack > 0.1 ? 22 : isMoving ? 10 : 4.5;
      const wagAmp  = attack > 0.1 ? 0.85 : isMoving ? 0.65 : 0.32;
      tailRef.current.rotation.z = 1.0 + Math.sin(elapsed * wagSpeed) * wagAmp;
    }

    // Body: stride bob + idle breathing + squash on bite
    if (bodyGroupRef.current) {
      const bob     = isMoving ? Math.abs(Math.sin(t * 0.5)) * 0.055 : Math.sin(elapsed * 1.6) * 0.007;
      bodyGroupRef.current.position.y = bob;
      const s = 1 + attack * 0.18;
      bodyGroupRef.current.scale.set(s, s, s);
    }

    // Head: nods forward while trotting, snaps up on attack
    if (headGroupRef.current) {
      const nod = isMoving ? Math.sin(t * 1.0) * 0.06 : 0;
      headGroupRef.current.rotation.x = THREE.MathUtils.lerp(headGroupRef.current.rotation.x, nod - attack * 0.12, 0.15);
    }

    // Jaw: drops open when running (panting), snaps wide on attack
    if (jawRef.current) {
      const open = attack > 0.05 ? 0.18 : isMoving ? 0.07 : 0;
      jawRef.current.rotation.x = THREE.MathUtils.lerp(jawRef.current.rotation.x, open, 0.22);
    }

    // Eyes: pulse brighter on attack
    for (const e of eyeRefs.current) {
      if (!e) continue;
      (e.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + attack * 1.2;
    }

    // Legs: diagonal gait — lerp smoothly to rest when stopping
    for (let i = 0; i < legGroupRefs.current.length; i++) {
      const g = legGroupRefs.current[i];
      if (!g) continue;
      const phase = (i === 0 || i === 3) ? t : t + Math.PI;
      const target = isMoving ? Math.sin(phase) * 0.72 : 0;
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, target, isMoving ? 1 : 0.08);
    }
  });

  return (
    <group ref={bodyGroupRef}>
      {/* Body */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[0.44, 0.21, 0.23]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Neck */}
      <mesh position={[0.22, 0.26, 0]}>
        <boxGeometry args={[0.09, 0.11, 0.16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Legs */}
      {DOG_LEG_HIPS.map(([x, y, z], i) => (
        <group key={i} ref={(el) => { legGroupRefs.current[i] = el; }} position={[x, y, z]}>
          <mesh position={[0, -0.07, 0]}>
            <boxGeometry args={[0.057, 0.14, 0.057]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, -0.155, 0.028]}>
            <boxGeometry args={[0.065, 0.04, 0.085]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
      ))}
      {/* Head group — pivots for nodding */}
      <group ref={headGroupRef} position={[0.27, 0.28, 0]}>
        <mesh>
          <sphereGeometry args={[0.14, 14, 14]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Glowing eyes */}
        {[0.085, -0.085].map((z, ei) => (
          <mesh key={z} ref={(el) => { eyeRefs.current[ei] = el; }} position={[0.1, 0.04, z]}>
            <sphereGeometry args={[0.027, 8, 8]} />
            <meshStandardMaterial color="#0a0a1a" emissive="#4040ff" emissiveIntensity={0.5} />
          </mesh>
        ))}
        {/* Upper snout */}
        <mesh position={[0.13, -0.04, 0]}>
          <boxGeometry args={[0.14, 0.08, 0.12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Animated lower jaw */}
        <mesh ref={jawRef} position={[0.13, -0.09, 0]}>
          <boxGeometry args={[0.11, 0.04, 0.1]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Tongue (visible when jaw open) */}
        <mesh position={[0.13, -0.1, 0]}>
          <boxGeometry args={[0.07, 0.012, 0.065]} />
          <meshStandardMaterial color="#f472b6" emissive="#f472b6" emissiveIntensity={0.25} />
        </mesh>
        {/* Nose */}
        <mesh position={[0.14, 0.01, 0]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial color="#1a0808" />
        </mesh>
        {/* Drooping ears */}
        <mesh position={[0.02, 0.1, 0.09]} rotation={[0.7, 0, -0.22]}>
          <boxGeometry args={[0.075, 0.16, 0.024]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0.02, 0.1, -0.09]} rotation={[-0.7, 0, -0.22]}>
          <boxGeometry args={[0.075, 0.16, 0.024]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
      {/* Tail */}
      <mesh ref={tailRef} position={[-0.26, 0.34, 0]} rotation={[0, 0, Math.PI / 4]}>
        <coneGeometry args={[0.038, 0.22, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function DragonPet({ color, walkClockRef: _wc, attackPhaseRef, isMovingRef }: { color: string; walkClockRef?: { current: number }; attackPhaseRef?: { current: number }; isMovingRef?: { current: boolean } }) {
  const wingRefs    = useRef<(THREE.Mesh | null)[]>([]);
  const wingTipRefs = useRef<(THREE.Mesh | null)[]>([]);
  const bodyRef     = useRef<THREE.Mesh>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const tailSeg1Ref = useRef<THREE.Group>(null);
  const tailSeg2Ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t      = clock.elapsedTime;
    const attack = attackPhaseRef?.current ?? 0;
    // Flap faster and fuller when actually flying to a target; gentler hover otherwise
    const isMoving  = isMovingRef?.current ?? false;
    const flapSpeed = isMoving ? 8.0 : 4.2;
    const flapAmp   = isMoving ? 0.70 : 0.50;
    const flap   = Math.sin(t * flapSpeed) * flapAmp;
    const flapBoost = attack * 0.6;

    if (wingRefs.current[0]) { wingRefs.current[0].rotation.x =  1.05 + flap + flapBoost; wingRefs.current[0].rotation.z = 0.28; }
    if (wingRefs.current[1]) { wingRefs.current[1].rotation.x = -1.05 - flap - flapBoost; wingRefs.current[1].rotation.z = 0.28; }
    if (wingTipRefs.current[0]) wingTipRefs.current[0].rotation.x =  1.05 + flap * 1.25 + flapBoost;
    if (wingTipRefs.current[1]) wingTipRefs.current[1].rotation.x = -1.05 - flap * 1.25 - flapBoost;

    // Body glow flares on fire-breath
    if (bodyRef.current)
      (bodyRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.18 + Math.sin(t * 2.1) * 0.11 + attack * 1.5;

    // Head bobs gently, snaps forward on attack
    if (headGroupRef.current) {
      const bob = Math.sin(t * 1.8) * 0.025;
      headGroupRef.current.rotation.x = THREE.MathUtils.lerp(headGroupRef.current.rotation.x, bob - attack * 0.18, 0.1);
    }

    // Tail sways with independent Z + Y oscillation (two-bone snake feel)
    if (tailSeg1Ref.current) {
      tailSeg1Ref.current.rotation.z = Math.sin(t * 0.9 + 0.4) * 0.38;
      tailSeg1Ref.current.rotation.y = Math.sin(t * 0.65) * 0.18;
    }
    if (tailSeg2Ref.current) {
      tailSeg2Ref.current.rotation.z = Math.sin(t * 0.9 + 1.1) * 0.55;
      tailSeg2Ref.current.rotation.y = Math.sin(t * 0.65 + 0.5) * 0.28;
    }
  });

  return (
    <group>
      {/* Main body */}
      <mesh ref={bodyRef} position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.21, 14, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} />
      </mesh>
      {/* Back spine ridge */}
      {[0.05, 0.0, -0.06].map((x, i) => (
        <mesh key={i} position={[x, 0.44, 0]} rotation={[0, 0, x * 0.6]}>
          <coneGeometry args={[0.018, 0.1 - i * 0.018, 4]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
        </mesh>
      ))}
      {/* Head group */}
      <group ref={headGroupRef} position={[0.21, 0.34, 0]}>
        <mesh rotation={[0, 0, 0.35]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Snout */}
        <mesh position={[0.12, 0.04, 0]} rotation={[0, 0, 0.4]}>
          <coneGeometry args={[0.046, 0.15, 6]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Glowing eyes */}
        {[0.085, -0.085].map((z) => (
          <mesh key={z} position={[0.04, 0.06, z]}>
            <sphereGeometry args={[0.027, 8, 8]} />
            <meshStandardMaterial color="#fde047" emissive="#facc15" emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        ))}
        {/* Horn */}
        <mesh position={[0.01, 0.14, 0]} rotation={[0, 0, -0.38]}>
          <coneGeometry args={[0.02, 0.12, 5]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>
        {/* Second smaller horn */}
        <mesh position={[-0.02, 0.12, 0.04]} rotation={[0.1, 0, -0.5]}>
          <coneGeometry args={[0.013, 0.07, 4]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
        </mesh>
      </group>
      {/* Wings */}
      {[1, -1].map((side, si) => (
        <group key={side}>
          <mesh ref={(el) => { wingRefs.current[si] = el; }} position={[0.06, 0.3, side * 0.25]}>
            <boxGeometry args={[0.025, 0.38, 0.30]} />
            <meshStandardMaterial color={color} transparent opacity={0.82} emissive={color} emissiveIntensity={0.22} />
          </mesh>
          <mesh ref={(el) => { wingTipRefs.current[si] = el; }} position={[0.06, 0.3, side * 0.47]}>
            <boxGeometry args={[0.018, 0.24, 0.20]} />
            <meshStandardMaterial color={color} transparent opacity={0.62} emissive={color} emissiveIntensity={0.16} />
          </mesh>
        </group>
      ))}
      {/* Tail — two animated pivot groups chain */}
      <group ref={tailSeg1Ref} position={[-0.18, 0.22, 0]}>
        <mesh position={[0, -0.08, 0]} rotation={[0, 0, 0.5]}>
          <cylinderGeometry args={[0.042, 0.026, 0.22, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <group ref={tailSeg2Ref} position={[-0.15, -0.1, 0]}>
          <mesh rotation={[0, 0, 0.7]}>
            <cylinderGeometry args={[0.026, 0.016, 0.18, 7]} />
            <meshStandardMaterial color={color} />
          </mesh>
          {/* Tail tip spike */}
          <mesh position={[-0.1, -0.05, 0]} rotation={[0, 0, 1.2]}>
            <coneGeometry args={[0.035, 0.14, 5]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** Phoenix — upright flame-body, large swept wings, ember eyes, fanned
 * fire-tail with individually animated feathers. */
function PhoenixPet({ color, walkClockRef: _wc, attackPhaseRef, isMovingRef }: { color: string; walkClockRef?: { current: number }; attackPhaseRef?: { current: number }; isMovingRef?: { current: boolean } }) {
  const wingRefs        = useRef<(THREE.Mesh | null)[]>([]);
  const wingTipRefs     = useRef<(THREE.Mesh | null)[]>([]);
  const bodyRef         = useRef<THREE.Mesh>(null);
  const tailFeatherRefs = useRef<(THREE.Mesh | null)[]>([]);
  const crestRef        = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t      = clock.elapsedTime;
    const attack = attackPhaseRef?.current ?? 0;
    // Phoenix flaps hard and fast when in flight; slower ethereal hover otherwise
    const isMoving  = isMovingRef?.current ?? false;
    const flapSpeed = isMoving ? 10.0 : 5.0;
    const flapAmp   = isMoving ? 0.78 : 0.52;
    const flap   = Math.sin(t * flapSpeed) * flapAmp;
    const spread = attack * 0.65;

    wingRefs.current.forEach((m, i) => {
      if (!m) return;
      const side = i === 0 ? 1 : -1;
      m.rotation.x = 0.18;
      m.rotation.z = side * (1.0 + flap + spread);
    });
    wingTipRefs.current.forEach((m, i) => {
      if (!m) return;
      const side = i === 0 ? 1 : -1;
      m.rotation.x = 0.1;
      m.rotation.z = side * (1.32 + flap * 1.4 + spread * 1.2);
    });

    // Body blazes on attack
    if (bodyRef.current)
      (bodyRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.55 + Math.abs(Math.sin(t * 6.2)) * 0.38 + attack * 1.2;

    // Head crest bobs with flap
    if (crestRef.current)
      crestRef.current.rotation.x = 0.2 + Math.sin(t * 6.2) * 0.12 + attack * 0.3;

    // Each tail feather fans individually with phase offset
    tailFeatherRefs.current.forEach((m, i) => {
      if (!m) return;
      const phase = t * 3.2 + i * 0.45;
      const fanAmp = 0.06 + attack * 0.22;
      m.rotation.z = (i - 2) * 0.36 + Math.sin(phase) * fanAmp;
      (m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9 + Math.sin(phase * 1.5) * 0.3 + attack * 0.8;
    });
  });

  return (
    <group>
      {/* Fire body */}
      <mesh ref={bodyRef} position={[0, 0.28, 0]} scale={[0.88, 1.22, 0.88]}>
        <sphereGeometry args={[0.14, 14, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} toneMapped={false} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.45, 0.06]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>
      {/* Head crest */}
      <mesh ref={crestRef} position={[0, 0.55, 0.04]} rotation={[0.2, 0, 0]}>
        <coneGeometry args={[0.018, 0.14, 5]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.95} toneMapped={false} />
      </mesh>
      {/* Beak */}
      <mesh position={[0, 0.44, 0.17]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.022, 0.1, 6]} />
        <meshStandardMaterial color="#fde68a" emissive="#fbbf24" emissiveIntensity={0.8} toneMapped={false} />
      </mesh>
      {/* Ember eyes */}
      {[0.048, -0.048].map((x) => (
        <mesh key={x} position={[x, 0.46, 0.1]}>
          <sphereGeometry args={[0.021, 8, 8]} />
          <meshStandardMaterial color="#fff" emissive="#ff6600" emissiveIntensity={2.8} toneMapped={false} />
        </mesh>
      ))}
      {/* Wings */}
      {([1, -1] as const).map((side, si) => (
        <group key={side}>
          <mesh ref={(el) => { wingRefs.current[si] = el; }} position={[side * 0.13, 0.32, -0.03]}>
            <coneGeometry args={[0.065, 0.44, 4]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.78} toneMapped={false} />
          </mesh>
          <mesh ref={(el) => { wingTipRefs.current[si] = el; }} position={[side * 0.23, 0.30, -0.04]}>
            <coneGeometry args={[0.038, 0.28, 4]} />
            <meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={0.95} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* Fire tail — 5 individually animated feather-cones */}
      {[-0.07, -0.035, 0, 0.035, 0.07].map((x, i) => (
        <mesh
          key={i}
          ref={(el) => { tailFeatherRefs.current[i] = el; }}
          position={[x, 0.16, -0.18 - Math.abs(x) * 0.5]}
          rotation={[1.35, 0, (i - 2) * 0.36]}
        >
          <coneGeometry args={[0.023, 0.32, 5]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? "#fb923c" : color}
            emissive={i % 2 === 0 ? "#f97316" : color}
            emissiveIntensity={0.9}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Ghost — semi-transparent spectral orb with 5 orbiting soul-orbs, dual
 * counter-rotating rings, animated wispy tendrils, and pulsing opacity. */
function GhostPet({ color, walkClockRef: _wc, attackPhaseRef, isMovingRef: _im }: { color: string; walkClockRef?: { current: number }; attackPhaseRef?: { current: number }; isMovingRef?: { current: boolean } }) {
  const NUM_ORBS = 5;
  const bodyRef      = useRef<THREE.Mesh>(null);
  const glowRef      = useRef<THREE.Mesh>(null);
  const orbitRefs    = useRef<(THREE.Mesh | null)[]>([]);
  const ringRef      = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const tendrilRefs  = useRef<(THREE.Mesh | null)[]>([]);
  const ghostGroupRef = useRef<THREE.Group>(null);
  const eyeRefs      = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t      = clock.elapsedTime;
    const attack = attackPhaseRef?.current ?? 0;

    // Whole ghost slowly rotates around Y and bobs
    if (ghostGroupRef.current) {
      ghostGroupRef.current.rotation.y = t * 0.25;
      ghostGroupRef.current.position.y = Math.sin(t * 1.4) * 0.025;
    }

    // Body pulses opacity
    if (bodyRef.current)
      (bodyRef.current.material as THREE.MeshBasicMaterial).opacity =
        Math.min(1, 0.42 + Math.sin(t * 2.2) * 0.22 + attack * 0.5);

    // Outer glow surges on attack
    if (glowRef.current)
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        Math.min(0.8, 0.16 + Math.sin(t * 2.2 + 0.8) * 0.1 + attack * 0.45);

    // Outer ring spins forward, inner ring counter-rotates
    if (ringRef.current) {
      ringRef.current.rotation.z = t * (0.65 + attack * 8);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        Math.min(0.85, 0.32 + Math.sin(t * 1.5) * 0.15 + attack * 0.45);
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z = -t * (0.9 + attack * 6);
      (innerRingRef.current.material as THREE.MeshBasicMaterial).opacity =
        Math.min(0.7, 0.22 + Math.sin(t * 1.8) * 0.12 + attack * 0.35);
    }

    // Eyes flare on attack
    for (const e of eyeRefs.current) {
      if (!e) continue;
      (e.material as THREE.MeshBasicMaterial).opacity = Math.min(1, 0.9 + attack * 0.1);
    }

    // Soul-orbs orbit, each at different radius/height
    const orbitSpeed = 1.4 + attack * 5.5;
    for (let i = 0; i < orbitRefs.current.length; i++) {
      const m = orbitRefs.current[i];
      if (!m) continue;
      const angle  = t * orbitSpeed + (i / NUM_ORBS) * Math.PI * 2;
      const radius = 0.26 + Math.sin(t * 0.6 + i * 1.3) * 0.04;
      const orbY   = 0.22 + Math.sin(t * 1.9 + i * 1.1) * 0.07 + (i % 2 === 0 ? 0.06 : -0.04);
      m.position.set(Math.cos(angle) * radius, orbY, Math.sin(angle) * radius);
      (m.material as THREE.MeshBasicMaterial).opacity =
        Math.min(1, 0.5 + Math.sin(t * 2.4 + i) * 0.3 + attack * 0.5);
    }

    // Tendrils wave individually like seaweed
    for (let i = 0; i < tendrilRefs.current.length; i++) {
      const m = tendrilRefs.current[i];
      if (!m) continue;
      m.rotation.x = Math.sin(t * 2.1 + i * 1.4) * 0.25;
      m.rotation.z = Math.sin(t * 1.6 + i * 2.0) * 0.18;
    }
  });

  return (
    <group ref={ghostGroupRef}>
      {/* Outer glow shell */}
      <mesh ref={glowRef} position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.27, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} toneMapped={false} />
      </mesh>
      {/* Main body */}
      <mesh ref={bodyRef} position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.19, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} toneMapped={false} />
      </mesh>
      {/* Spectral tendrils — 5 animated wispy cones at the bottom */}
      {[-0.08, -0.04, 0, 0.04, 0.08].map((x, i) => (
        <mesh
          key={i}
          ref={(el) => { tendrilRefs.current[i] = el; }}
          position={[x, 0.07 - i * 0.006, 0]}
          rotation={[Math.PI, 0, x * 0.5]}
        >
          <coneGeometry args={[0.022, 0.11 + i * 0.015, 5]} />
          <meshBasicMaterial color={color} transparent opacity={0.38} toneMapped={false} />
        </mesh>
      ))}
      {/* Eerie eyes */}
      {[0.072, -0.072].map((x, ei) => (
        <mesh key={x} ref={(el) => { eyeRefs.current[ei] = el; }} position={[x, 0.27, 0.14]}>
          <sphereGeometry args={[0.029, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.92} toneMapped={false} />
        </mesh>
      ))}
      {/* Outer ring */}
      <mesh ref={ringRef} position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.31, 0.018, 8, 30]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} toneMapped={false} />
      </mesh>
      {/* Inner counter-rotating ring */}
      <mesh ref={innerRingRef} position={[0, 0.22, 0]} rotation={[Math.PI / 2.5, 0, 0]}>
        <torusGeometry args={[0.20, 0.012, 6, 22]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} toneMapped={false} />
      </mesh>
      {/* 5 orbiting soul orbs */}
      {Array.from({ length: NUM_ORBS }, (_, i) => (
        <mesh key={i} ref={(el) => { orbitRefs.current[i] = el; }}>
          <sphereGeometry args={[0.028 + (i % 2) * 0.01, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

const CAT_LEG_HIPS: [number, number, number][] = [
  [0.11, 0.09, 0.05],
  [0.11, 0.09, -0.05],
  [-0.11, 0.09, 0.05],
  [-0.11, 0.09, -0.05],
];

function CatPet({ color, walkClockRef, attackPhaseRef, isMovingRef: _im }: { color: string; walkClockRef?: { current: number }; attackPhaseRef?: { current: number }; isMovingRef?: { current: boolean } }) {
  const tailGroupRef   = useRef<THREE.Group>(null);
  const tailTipRef     = useRef<THREE.Mesh>(null);
  const legGroupRefs   = useRef<(THREE.Group | null)[]>([]);
  const bodyGroupRef   = useRef<THREE.Group>(null);
  const headGroupRef   = useRef<THREE.Group>(null);
  const whiskerRefs    = useRef<(THREE.Mesh | null)[]>([]);
  const eyeRefs        = useRef<(THREE.Mesh | null)[]>([]);
  const lookTimer      = useRef(0);
  const lookTarget     = useRef(0);

  useFrame(({ clock }, delta) => {
    const t      = walkClockRef?.current ?? 0;
    const isMoving = t > 0.01;
    const attack = attackPhaseRef?.current ?? 0;
    const elapsed = clock.elapsedTime;

    // Tail lashes hard on attack; sways lazily idle; swings while walking
    if (tailGroupRef.current) {
      const amp   = attack > 0.1 ? 1.0 : isMoving ? 0.38 : 0.55;
      const speed = attack > 0.1 ? 15  : isMoving ? 3.8  : 1.8;
      tailGroupRef.current.rotation.z = -0.4 + Math.sin(elapsed * speed) * amp;
    }
    // Tail tip follows with lag and extra curl amplitude
    if (tailTipRef.current) {
      const amp   = attack > 0.1 ? 1.2 : isMoving ? 0.55 : 0.75;
      const speed = attack > 0.1 ? 15  : isMoving ? 3.8  : 1.8;
      tailTipRef.current.rotation.z = 1.1 + Math.sin(elapsed * speed + 0.4) * amp;
    }

    // Body bob + breathing + attack pop
    if (bodyGroupRef.current) {
      bodyGroupRef.current.position.y = isMoving
        ? Math.abs(Math.sin(t * 0.5)) * 0.04
        : Math.sin(elapsed * 1.7) * 0.006;
      const s = 1 + attack * 0.14;
      bodyGroupRef.current.scale.set(s, s, s);
    }

    // Head: idle look-around when not moving
    if (headGroupRef.current) {
      lookTimer.current -= delta;
      if (lookTimer.current <= 0) {
        lookTimer.current = 2.5 + Math.random() * 3;
        lookTarget.current = (Math.random() - 0.5) * 0.6;
      }
      if (!isMoving) {
        headGroupRef.current.rotation.y = THREE.MathUtils.lerp(headGroupRef.current.rotation.y, lookTarget.current, 0.04);
      } else {
        headGroupRef.current.rotation.y = THREE.MathUtils.lerp(headGroupRef.current.rotation.y, 0, 0.1);
      }
    }

    // Eyes dilate on attack (scale x squishes to a slit)
    for (const e of eyeRefs.current) {
      if (!e) continue;
      const pupilX = THREE.MathUtils.lerp((e.scale.x), attack > 0.1 ? 0.3 : 0.8, 0.15);
      e.scale.setX(pupilX);
      (e.material as THREE.MeshStandardMaterial).emissiveIntensity =
        THREE.MathUtils.lerp((e.material as THREE.MeshStandardMaterial).emissiveIntensity, 0.75 + attack * 1.5, 0.15);
    }

    // Whiskers twitch subtly on attack
    for (let i = 0; i < whiskerRefs.current.length; i++) {
      const m = whiskerRefs.current[i];
      if (!m) continue;
      const twitch = attack > 0.05 ? Math.sin(elapsed * 18 + i) * 0.08 : 0;
      m.rotation.z = (i < 4 ? 1 : -1) * (0.06 + twitch);
    }

    // Leg diagonal gait — lerp smoothly to rest when stopping
    for (let i = 0; i < legGroupRefs.current.length; i++) {
      const g = legGroupRefs.current[i];
      if (!g) continue;
      const phase = (i === 0 || i === 3) ? t : t + Math.PI;
      const target = isMoving ? Math.sin(phase) * 0.65 : 0;
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, target, isMoving ? 1 : 0.08);
    }
  });

  return (
    <group ref={bodyGroupRef}>
      {/* Body */}
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[0.34, 0.15, 0.14]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Legs */}
      {CAT_LEG_HIPS.map(([x, y, z], i) => (
        <group key={i} ref={(el) => { legGroupRefs.current[i] = el; }} position={[x, y, z]}>
          <mesh position={[0, -0.065, 0]}>
            <boxGeometry args={[0.038, 0.13, 0.038]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0, -0.14, 0.02]}>
            <boxGeometry args={[0.046, 0.03, 0.055]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
      ))}
      {/* Head group — pivots for look-around */}
      <group ref={headGroupRef} position={[0.2, 0.24, 0]}>
        <mesh>
          <sphereGeometry args={[0.11, 14, 14]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Glowing slit eyes */}
        {[0.052, -0.052].map((z, ei) => (
          <mesh key={z} ref={(el) => { eyeRefs.current[ei] = el; }} position={[0.09, 0.02, z]} scale={[0.8, 1.6, 0.55]}>
            <sphereGeometry args={[0.024, 8, 8]} />
            <meshStandardMaterial color="#84cc16" emissive="#65a30d" emissiveIntensity={0.75} />
          </mesh>
        ))}
        {/* Pointy ears with inner pink */}
        {[0.048, -0.048].map((z, ei) => (
          <group key={ei} position={[0.02, 0.11, z]}>
            <mesh rotation={[0, 0, -0.18]}>
              <coneGeometry args={[0.028, 0.1, 5]} />
              <meshStandardMaterial color={color} />
            </mesh>
            {/* Inner ear */}
            <mesh position={[0, 0.01, Math.sign(z) * 0.002]} rotation={[0, 0, -0.18]} scale={[0.55, 0.7, 0.55]}>
              <coneGeometry args={[0.018, 0.07, 4]} />
              <meshStandardMaterial color="#f9a8d4" emissive="#f472b6" emissiveIntensity={0.2} />
            </mesh>
          </group>
        ))}
        {/* Nose */}
        <mesh position={[0.1, -0.02, 0]}>
          <sphereGeometry args={[0.016, 6, 6]} />
          <meshStandardMaterial color="#e879a0" emissive="#e879a0" emissiveIntensity={0.3} />
        </mesh>
        {/* Whiskers — 4 per side, grouped for twitching */}
        {([1, -1] as const).map((side, si) =>
          [0, 1, 2, 3].map((wi) => (
            <mesh
              key={`${si}-${wi}`}
              ref={(el) => { whiskerRefs.current[si * 4 + wi] = el; }}
              position={[0.07, -0.01 - wi * 0.012, side * 0.06]}
              rotation={[0, side * (0.15 + wi * 0.06), side * 0.06]}
            >
              <boxGeometry args={[0.1 - wi * 0.008, 0.005, 0.004]} />
              <meshStandardMaterial color="#e2e8f0" emissive="#f8fafc" emissiveIntensity={0.15} />
            </mesh>
          ))
        )}
      </group>
      {/* Tail — two-segment curl with animated tip */}
      <group ref={tailGroupRef} position={[-0.17, 0.22, 0]}>
        <mesh>
          <cylinderGeometry args={[0.017, 0.023, 0.26, 7]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh ref={tailTipRef} position={[0, 0.16, 0]} rotation={[0, 0, 1.1]}>
          <cylinderGeometry args={[0.012, 0.017, 0.14, 6]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position={[0.1, 0.22, 0]}>
          <sphereGeometry args={[0.028, 8, 8]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    </group>
  );
}

const PET_VARIANTS = [DogPet, DragonPet, GhostPet, CatPet];

/** True for any pet whose name says it flies — see character-model.tsx's
 * PetCompanion for the actual flight-vs-ground-wander behavior this
 * gates. Only ever called with a pet's own name (never a jacket's), so no
 * need to guard against "Drachenrüstung" et al. */
export function isFlyingPet(name: string): boolean {
  return /Phönix|Drache/.test(name);
}

export function PetVariant({ item, walkClockRef, attackPhaseRef, isMovingRef }: { item: EquippedItem; walkClockRef?: { current: number }; attackPhaseRef?: { current: number }; isMovingRef?: { current: boolean } }) {
  const color = rarityColorFor(item, "#a855f7");
  // The pet's *noun* always wins over the hash fallback — equip something
  // named "... Hund" and it must look like a dog, not whatever shape the
  // hash happened to land on. Only names with no recognized noun (shouldn't
  // happen given the current catalogue, but a future admin-added pet might)
  // fall back to the old hash-based pick. Written as a plain ternary chain
  // (not a helper function returning a component) so the React Compiler can
  // statically see this only ever selects among the fixed components above.
  // Phönix checked *before* Drache/Schatten — "Mini-Phönix" used to match
  // the same /Drache|Phönix/ branch as "Schatten-Drache" and render as an
  // identical DragonPet, which was the "two different items look the
  // same" bug; it now gets its own bird-shaped PhoenixPet instead of
  // reusing either Dragon or Ghost.
  const Variant = /Hund/.test(item.name)
    ? DogPet
    : /Katze/.test(item.name)
      ? CatPet
      : /Phönix/.test(item.name)
        ? PhoenixPet
        : /Drache/.test(item.name)
          ? DragonPet
          : /Schatten|Geist/.test(item.name)
            ? GhostPet
            : PET_VARIANTS[variantIndex(item.name, PET_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} walkClockRef={walkClockRef} attackPhaseRef={attackPhaseRef} isMovingRef={isMovingRef} />
    </RarityFX>
  );
}

// --- Hats: 5 distinct silhouettes, picked by keyword not hash ------------
//
// The entire color-matrix catalogue (scripts/generate-all-items.js
// COLOR_TYPES) names every single hat "... Helm" as its generic trailing
// word — a knit beanie, no brim. The old hash-based pick could land any of
// those on CapHat (a brimmed baseball cap) or TopHat/CrownHat (neither
// remotely a beanie), which is a direct contradiction between the name and
// what's actually rendered — exactly the "Roter Helm that's secretly a top
// hat" bug. BeanieHat is now the only shape a plain catalogue "... Helm"
// name can ever produce; the other shapes are reachable *only* by a name
// that actually says so (a real "Kappe"/"Zylinder"/"Krone", or a curated
// compound "helm" name like "Sternenhelm"), checked in HatVariant below.

function CapHat({ color }: { color: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.62, 0.2, 0.62]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.05, 0.36]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[0.5, 0.04, 0.22]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function BeanieHat({ color }: { color: string }) {
  return (
    <mesh>
      <sphereGeometry args={[0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function TopHat({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.4, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.05, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function CrownHat({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.4, 0.45, 0.06, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <coneGeometry args={[0.32, 0.36, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

/** A real full-coverage helmet — a rounded dome that comes down past the
 * temples plus a brow ridge/visor lip across the front, clearly distinct
 * from every other hat shape (no other variant covers this much of the
 * head, none have a front lip). "Sternenhelm" literally means
 * "star-HELMET" and used to render as a TopHat, which doesn't even
 * resemble a helmet, let alone the plain catalogue beanie. */
function HelmetHat({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, -0.02, 0]}>
        <sphereGeometry args={[0.36, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.55]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.1, 0.3]}>
        <boxGeometry args={[0.5, 0.06, 0.16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} metalness={0.4} />
      </mesh>
    </group>
  );
}

export function HatVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#6d28d9");
  // Keyword-first, hash-last, written as a plain ternary chain (same
  // reasoning as PetVariant above) so the React Compiler can statically
  // see this only ever selects among the fixed components below — a name
  // that actually says what kind of hat it is (Krone/Zylinder/Kappe, or a
  // *fused/compound* "helm" word like "Sternenhelm"/"Voidhelm") always
  // gets the shape that word means, regardless of anything else in the
  // name. The color-matrix catalogue's generic word is now also "Helm"
  // (renamed from "Mütze"), always appearing as its own trailing word
  // preceded by a space ("Roter Helm") — that plain form is excluded from
  // the curated-helmet match below so the entire catalogue doesn't
  // collapse onto one shape just because its generic noun happens to be
  // the same word a few curated uniques use as a name *component*; it
  // falls back to BeanieHat instead, same as the old "Mütze" behavior.
  const isPlainCatalogHelm = /\sHelm$/.test(item.name);
  const Variant = /Kronen?/.test(item.name)
    ? CrownHat
    : /Zylinder/.test(item.name)
      ? TopHat
      : /Kappe/.test(item.name)
        ? CapHat
        : !isPlainCatalogHelm && /helm/i.test(item.name)
          ? HelmetHat
          : BeanieHat;
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} />
    </RarityFX>
  );
}

// --- Faces/masks: 6 distinct looks -----------------------------------------
// These used to be a single flat box each — reads as "a box floating in
// front of the face", not a mask. Every variant below is now built from
// several shaped pieces that actually wrap around the head's contour
// (angled side panels, rounded lenses, a brow ridge, etc).

function VisorFace({ color }: { color: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.48, 0.17, 0.09]} />
        <meshStandardMaterial color="#15151c" />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <boxGeometry args={[0.4, 0.06, 0.02]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      <mesh position={[-0.26, 0, -0.015]} rotation={[0, 0.6, 0]}>
        <boxGeometry args={[0.12, 0.17, 0.07]} />
        <meshStandardMaterial color="#15151c" />
      </mesh>
      <mesh position={[0.26, 0, -0.015]} rotation={[0, -0.6, 0]}>
        <boxGeometry args={[0.12, 0.17, 0.07]} />
        <meshStandardMaterial color="#15151c" />
      </mesh>
    </group>
  );
}

function BandanaFace({ color }: { color: string }) {
  return (
    <group rotation={[0.12, 0, 0]}>
      <mesh>
        <boxGeometry args={[0.46, 0.3, 0.11]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.02, 0.056]}>
        <boxGeometry args={[0.44, 0.018, 0.01]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
      <mesh position={[-0.25, -0.02, -0.07]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.25, -0.02, -0.07]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function GogglesFace({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[-0.13, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.105, 0.105, 0.07, 16]} />
        <meshStandardMaterial color="#1a1a22" emissive={color} emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[-0.13, 0, 0.04]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 0.01, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} toneMapped={false} />
      </mesh>
      <mesh position={[0.13, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.105, 0.105, 0.07, 16]} />
        <meshStandardMaterial color="#1a1a22" emissive={color} emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0.13, 0, 0.04]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 0.01, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} toneMapped={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.5, 0.035, 0.035]} />
        <meshStandardMaterial color="#1a1a22" />
      </mesh>
      <mesh position={[0, 0, -0.18]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 6]} />
        <meshStandardMaterial color="#2a2a30" />
      </mesh>
    </group>
  );
}

function GasmaskFace({ color }: { color: string }) {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.25, 16, 12]} />
        <meshStandardMaterial color="#22252b" />
      </mesh>
      <mesh position={[-0.1, 0.03, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.03, 12]} />
        <meshStandardMaterial color="#0c0c10" emissive={color} emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0.1, 0.03, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.03, 12]} />
        <meshStandardMaterial color="#0c0c10" emissive={color} emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0, -0.12, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.16, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function SkullFace({ color }: { color: string }) {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.23, 14, 12]} />
        <meshStandardMaterial color="#e8e4d8" />
      </mesh>
      <mesh position={[0, -0.13, 0.1]}>
        <boxGeometry args={[0.18, 0.12, 0.16]} />
        <meshStandardMaterial color="#e8e4d8" />
      </mesh>
      <mesh position={[-0.09, 0.02, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.05, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.85} toneMapped={false} />
      </mesh>
      <mesh position={[0.09, 0.02, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.05, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.85} toneMapped={false} />
      </mesh>
    </group>
  );
}

function NinjaFace({ color }: { color: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.46, 0.34, 0.16]} />
        <meshStandardMaterial color="#15151a" />
      </mesh>
      <mesh position={[0, 0.04, 0.085]}>
        <boxGeometry args={[0.42, 0.07, 0.02]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-0.3, -0.02, -0.15]} rotation={[0, 0.5, 0.2]}>
        <boxGeometry args={[0.18, 0.05, 0.05]} />
        <meshStandardMaterial color="#15151a" />
      </mesh>
      <mesh position={[0.3, -0.02, -0.15]} rotation={[0, -0.5, -0.2]}>
        <boxGeometry args={[0.18, 0.05, 0.05]} />
        <meshStandardMaterial color="#15151a" />
      </mesh>
    </group>
  );
}

const FACE_VARIANTS = [VisorFace, BandanaFace, GogglesFace, GasmaskFace, SkullFace, NinjaFace];

/** The bare head used to be a featureless skin-colored cube — no eyes, no
 * mouth, nothing — whenever no mask/face item was equipped, which is most
 * of the time for most players. Rendered in character-model.tsx exactly
 * when `face` is unset, so equipping a real mask still fully replaces it
 * (no double-rendering underneath). */
export function DefaultFace({ skin }: { skin: string }) {
  const shade = "#3a2a1f";
  return (
    <group>
      <mesh position={[-0.12, 0.03, 0]}>
        <boxGeometry args={[0.09, 0.07, 0.03]} />
        <meshStandardMaterial color={shade} />
      </mesh>
      <mesh position={[0.12, 0.03, 0]}>
        <boxGeometry args={[0.09, 0.07, 0.03]} />
        <meshStandardMaterial color={shade} />
      </mesh>
      <mesh position={[0, -0.05, 0.01]}>
        <boxGeometry args={[0.07, 0.07, 0.04]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[0.16, 0.035, 0.02]} />
        <meshStandardMaterial color={shade} />
      </mesh>
    </group>
  );
}

const EXACT_FACE_SHAPE: Record<string, typeof VisorFace> = {
  "Gottes-Maske": SkullFace,
  "Regenbogen-Visier": GogglesFace,
};

export function FaceVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#a855f7");
  const Variant =
    EXACT_FACE_SHAPE[item.name] ?? FACE_VARIANTS[variantIndex(item.name, FACE_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} />
    </RarityFX>
  );
}

// --- Weapons: 4 distinct silhouettes -------------------------------------

// All four weapon variants share the same convention: the grip point is
// at the local origin (y=0) — that's where the parent group in character-
// model.tsx positions the hand — with a short pommel/handle dipping just
// below it and the business end (blade/head/orb) extending straight up
// from there. The previous version centered each mesh ON the grip point,
// so half the weapon poked out behind/below the hand at a diagonal tilt —
// exactly the "looks wrong, not held straight" complaint.

function SwordWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[0.05, 0.14, 0.05]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.08, 0.84, 0.06]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function AxeWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[0.07, 0.72, 0.07]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <mesh position={[0.1, 0.62, 0]}>
        <boxGeometry args={[0.22, 0.22, 0.06]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function HammerWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, 0.34, 0]}>
        <boxGeometry args={[0.06, 0.68, 0.06]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.24, 0.18, 0.18]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function StaffWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.92, 10]} />
        <meshStandardMaterial color="#52525b" />
      </mesh>
      <mesh position={[0, 0.94, 0]}>
        <sphereGeometry args={[0.1, 14, 14]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

// --- The rest of the curated weapon catalogue (lib WEAPON_NAMES/ULTRA_NAMES
// in scripts/generate-all-items.js) each get their *own* shape instead of
// being shoved into whichever of the 4 shapes above the name hash landed
// on — "Dolch" must look like a short dagger, "Glasflasche" like a bottle,
// not a recolored axe.

function PipeWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <mesh position={[0, 0.4, 0]}>
      <cylinderGeometry args={[0.045, 0.045, 0.88, 12]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.25} />
    </mesh>
  );
}

function PlankWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[0.07, 0.12, 0.05]} />
        <meshStandardMaterial color="#5b3a21" />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.5, 0.78, 0.04]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

function BottleWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.5, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={0.3}
          transparent
          opacity={0.65}
        />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.045, 0.07, 0.16, 10]} />
        <meshStandardMaterial color={color} transparent opacity={0.65} />
      </mesh>
    </group>
  );
}

function DaggerWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[0.045, 0.1, 0.045]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.065, 0.38, 0.05]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function HandShieldWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <mesh position={[0, 0.18, 0]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.22, 0.22, 0.06, 16]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.25} />
    </mesh>
  );
}

function MacheteWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[0.05, 0.14, 0.05]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <boxGeometry args={[0.16, 0.6, 0.05]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function ThrowingStarWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <boxGeometry args={[0.32, 0.32, 0.025]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.35} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.32, 0.32, 0.025]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function ButterflyWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, -0.04, 0]}>
        <boxGeometry args={[0.04, 0.08, 0.04]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <mesh position={[0.03, 0.18, 0]} rotation={[0, 0, -0.18]}>
        <boxGeometry args={[0.045, 0.36, 0.03]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[-0.03, 0.18, 0]} rotation={[0, 0, 0.18]}>
        <boxGeometry args={[0.045, 0.36, 0.03]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.35} />
      </mesh>
    </group>
  );
}

function BatWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <mesh position={[0, 0.42, 0]}>
      <cylinderGeometry args={[0.1, 0.035, 0.86, 12]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} />
    </mesh>
  );
}

function ShardWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group position={[0, 0.46, 0]}>
      <mesh position={[0, 0.2, 0]}>
        <coneGeometry args={[0.13, 0.4, 6]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, -0.12, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.13, 0.24, 6]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

// "Rostige Klinge"/"Holzschwert"/"Flammenschwert"/"Voidklinge"/
// "Götterschwert" all used to map to the exact same SwordWeapon mesh —
// five different items rendering as one identical sword. Every one of
// them now gets a genuinely different silhouette below, even though
// they're all still recognizably "sword-class".

function RustyBladeWeapon({ color, emissive }: { color: string; emissive: string }) {
  // A jagged, notched edge (offset stacked boxes) instead of a clean
  // rectangle — reads as chipped/corroded rather than a fresh blade.
  return (
    <group>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[0.05, 0.14, 0.05]} />
        <meshStandardMaterial color="#4a3a2a" />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.07, 0.78, 0.05]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} roughness={1} />
      </mesh>
      {[0.18, 0.4, 0.62].map((y, i) => (
        <mesh key={i} position={[i % 2 === 0 ? 0.045 : -0.045, y, 0]}>
          <boxGeometry args={[0.03, 0.05, 0.05]} />
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function WoodenSwordWeapon({ color, emissive }: { color: string; emissive: string }) {
  // Thick, blocky, matte — a training/toy sword, deliberately chunkier
  // than every metal blade in this list and with a plain wood-tone grip.
  return (
    <group>
      <mesh position={[0, -0.07, 0]}>
        <boxGeometry args={[0.07, 0.16, 0.07]} />
        <meshStandardMaterial color="#6b4a2c" />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.22, 0.04, 0.05]} />
        <meshStandardMaterial color="#6b4a2c" />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.11, 0.72, 0.07]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} roughness={1} />
      </mesh>
    </group>
  );
}

function FlameSwordWeapon({ color, emissive }: { color: string; emissive: string }) {
  // A wavy, flickering silhouette — alternating-offset segments instead of
  // one straight blade — plus a strong emissive glow to sell "on fire".
  const segments = 5;
  return (
    <group>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[0.05, 0.14, 0.05]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      {Array.from({ length: segments }).map((_, i) => (
        <mesh key={i} position={[Math.sin(i * 1.3) * 0.035, 0.1 + i * 0.16, 0]}>
          <boxGeometry args={[0.1 - i * 0.01, 0.18, 0.045]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.9} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function VoidBladeWeapon({ color, emissive }: { color: string; emissive: string }) {
  // Thin, dark, faintly curved blade with a single glowing void-purple
  // core line running down the center — reads as "absence of light" with
  // a seam of energy, not a normal metal sword.
  const segments = 6;
  return (
    <group>
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[0.04, 0.1, 0.04]} />
        <meshStandardMaterial color="#0c0c12" />
      </mesh>
      {Array.from({ length: segments }).map((_, i) => (
        <mesh key={i} position={[i * 0.012, 0.06 + i * 0.115, 0]}>
          <boxGeometry args={[0.045, 0.13, 0.03]} />
          <meshStandardMaterial color="#0c0c12" roughness={0.3} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0.03, 0.42, 0]}>
        <boxGeometry args={[0.012, 0.7, 0.012]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={1} toneMapped={false} />
      </mesh>
    </group>
  );
}

function GodSwordWeapon({ color, emissive }: { color: string; emissive: string }) {
  // Ornate winged crossguard + a glowing core gem in the hilt + the
  // largest blade of the set — meant to immediately read as the most
  // ceremonial/"chosen one" weapon in the catalogue.
  return (
    <group>
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[0.06, 0.18, 0.06]} />
        <meshStandardMaterial color="#d4af37" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={1} toneMapped={false} />
      </mesh>
      <mesh position={[0.16, 0.02, 0]} rotation={[0, 0, -0.4]}>
        <coneGeometry args={[0.04, 0.22, 6]} />
        <meshStandardMaterial color="#d4af37" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-0.16, 0.02, 0]} rotation={[0, 0, 0.4]}>
        <coneGeometry args={[0.04, 0.22, 6]} />
        <meshStandardMaterial color="#d4af37" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.48, 0]}>
        <boxGeometry args={[0.1, 0.92, 0.05]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.45} metalness={0.4} />
      </mesh>
    </group>
  );
}

// "Messer" and "Dolch" both used to map to the same DaggerWeapon mesh —
// kept Dolch as the slim stiletto, gave Messer its own slightly-curved
// utility-knife silhouette so the two no longer look identical.
function CurvedKnifeWeapon({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[0.045, 0.1, 0.045]} />
        <meshStandardMaterial color="#3f3f46" />
      </mesh>
      <mesh position={[0.02, 0.16, 0]} rotation={[0, 0, -0.18]}>
        <boxGeometry args={[0.09, 0.32, 0.04]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

const WEAPON_VARIANTS = [SwordWeapon, AxeWeapon, HammerWeapon, StaffWeapon];

/** Exact match against the curated names in scripts/generate-all-items.js
 * (WEAPON_NAMES + ULTRA_NAMES.weapon_cosmetic) — these are a small, fixed
 * vocabulary, not a color matrix, so a direct lookup is both simpler and
 * more correct than hashing. Anything not in this table (a future
 * admin-added weapon) still falls back to the original hash-based pick. */
const EXACT_WEAPON_SHAPE: Record<string, typeof SwordWeapon> = {
  "Rohr": PipeWeapon,
  "Stahlrohr": PipeWeapon,
  "Holzbrett": PlankWeapon,
  "Rostige Klinge": RustyBladeWeapon,
  "Holzschwert": WoodenSwordWeapon,
  "Messer": CurvedKnifeWeapon,
  "Flammenschwert": FlameSwordWeapon,
  "Glasflasche": BottleWeapon,
  "Dolch": DaggerWeapon,
  "Stahlschild": HandShieldWeapon,
  "Machete": MacheteWeapon,
  "Wurfstern": ThrowingStarWeapon,
  "Butterfly": ButterflyWeapon,
  "Baseballschläger": BatWeapon,
  "Donnerhammer": HammerWeapon,
  "Voidklinge": VoidBladeWeapon,
  "Götterschwert": GodSwordWeapon,
  "Sternensplitter": ShardWeapon,
};

export function WeaponVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#e5e7eb");
  const emissive = rarityColorFor(item, "#000000");
  const Variant =
    EXACT_WEAPON_SHAPE[item.name] ?? WEAPON_VARIANTS[variantIndex(item.name, WEAPON_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} emissive={emissive} />
    </RarityFX>
  );
}

// --- Jackets: 4 distinct torso silhouettes -------------------------------
// All variants are built around the same gender-driven {width, depth} base
// box (so the male/female silhouette difference from BUILD in character-
// model.tsx is always respected), just with different add-ons on top.

function PlainJacket({ color, width, depth }: { color: string; width: number; depth: number }) {
  return (
    <mesh>
      <boxGeometry args={[width, 0.8, depth]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function CollaredJacket({ color, width, depth }: { color: string; width: number; depth: number }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[width, 0.8, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.42, depth * 0.3]}>
        <boxGeometry args={[width * 0.6, 0.12, depth * 0.5]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

function PaddedJacket({ color, width, depth }: { color: string; width: number; depth: number }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[width, 0.8, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[-width / 2, 0.3, 0]}>
        <boxGeometry args={[0.16, 0.22, depth * 1.1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[width / 2, 0.3, 0]}>
        <boxGeometry args={[0.16, 0.22, depth * 1.1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

function LongCoatJacket({ color, width, depth }: { color: string; width: number; depth: number }) {
  // The coat tail used to reach world-y ~0.475 (this group sits at y=1.35
  // in character-model.tsx, pants run from y=0 at the feet to y=1.0 at the
  // hip) — covering essentially the entire upper leg, which is exactly the
  // "you can't see the pants at all anymore" bug. Shortened so the tail
  // bottoms out at world-y ~0.78: still visibly longer than the other
  // jacket variants, but always leaves the lower ~3/4 of the pants/legs
  // showing no matter what's equipped underneath.
  return (
    <group>
      <mesh>
        <boxGeometry args={[width, 0.8, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.34, 0]}>
        <boxGeometry args={[width * 0.9, 0.46, depth * 0.8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

const JACKET_VARIANTS = [PlainJacket, CollaredJacket, PaddedJacket, LongCoatJacket];

/** Female chest silhouette — two slightly-flattened spheres bulging out of
 * the torso's front face (+z). Used both by the bare-torso fallback and by
 * JacketVariant below so the female build reads as female with or without
 * a jacket equipped, instead of being a unisex box either way. */
export function ChestShape({ depth, color }: { depth: number; color: string }) {
  return (
    <group position={[0, 0.16, depth / 2 - 0.02]}>
      <mesh position={[-0.12, 0, 0]} scale={[1, 0.9, 0.75]}>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.12, 0, 0]} scale={[1, 0.9, 0.75]}>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

const EXACT_JACKET_SHAPE: Record<string, typeof PlainJacket> = {
  "Drachenrüstung": PaddedJacket,
  "Phönixmantel": CollaredJacket,
  "Voidjacke": LongCoatJacket,
};

export function JacketVariant({
  item,
  width,
  depth,
  gender,
}: {
  item: EquippedItem;
  width: number;
  depth: number;
  gender: "m" | "w";
}) {
  const color = rarityColorFor(item, "#0e7490");
  const Variant =
    EXACT_JACKET_SHAPE[item.name] ?? JACKET_VARIANTS[variantIndex(item.name, JACKET_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} width={width} depth={depth} />
      {gender === "w" && <ChestShape depth={depth} color={color} />}
    </RarityFX>
  );
}

// --- Pants: 4 distinct leg silhouettes ------------------------------------
// Rendered once per leg (left/right), inside each hip-pivoted group in
// character-model.tsx, so both legs always pick the same variant together.

const SKIN = "#caa472";

// Pants height changed from 1.0 → 0.86, center y from -0.5 → -0.43 (hip-local).
// Previously the pants bottom landed exactly at character-local y=0 (the ground),
// same level as the shoe group, so the legs visually pierced through the feet.
// Now the bottom sits at character-local y=0.14, leaving the shoe clearly visible below.
function SkinnyPants({ color }: { color: string }) {
  return (
    <mesh position={[0, -0.43, 0]}>
      <boxGeometry args={[0.24, 0.86, 0.24]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function BaggyPants({ color }: { color: string }) {
  return (
    <mesh position={[0, -0.43, 0]}>
      <boxGeometry args={[0.34, 0.86, 0.32]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function ShortsPants({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, -0.62, 0]}>
        <boxGeometry args={[0.28, 0.55, 0.28]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Bare-leg section below shorts — was height=0.5 at y=-0.85 which
          put the bottom at character-local y=-0.10, through the floor.
          Shortened so it stops at character-local ≈0.07 (above ground). */}
      <mesh position={[0, -0.79, 0]}>
        <boxGeometry args={[0.22, 0.26, 0.22]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>
    </group>
  );
}

function StripedPants({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, -0.43, 0]}>
        <boxGeometry args={[0.28, 0.86, 0.28]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.15, -0.43, 0]}>
        <boxGeometry args={[0.03, 0.86, 0.29]} />
        <meshStandardMaterial color="#f5f5f5" emissive="#f5f5f5" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

const PANTS_VARIANTS = [SkinnyPants, BaggyPants, ShortsPants, StripedPants];

const EXACT_PANTS_SHAPE: Record<string, typeof SkinnyPants> = {
  "Voidhose": SkinnyPants,
  "Sternenstoff-Hose": BaggyPants,
};

export function PantsVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#1e3a8a");
  const Variant =
    EXACT_PANTS_SHAPE[item.name] ?? PANTS_VARIANTS[variantIndex(item.name, PANTS_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} />
    </RarityFX>
  );
}

// --- Shoes: 4 distinct footwear silhouettes -------------------------------

function SneakerShoe({ color }: { color: string }) {
  return (
    <mesh position={[0, 0.06, 0.08]}>
      <boxGeometry args={[0.3, 0.16, 0.4]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function BootShoe({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.06, 0.06]}>
        <boxGeometry args={[0.32, 0.16, 0.42]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.28, -0.02]}>
        <boxGeometry args={[0.3, 0.32, 0.3]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function CleatShoe({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.06, 0.08]}>
        <boxGeometry args={[0.28, 0.14, 0.4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[-0.1, 0.1].map((dz) => (
        <mesh key={dz} position={[0, -0.02, 0.08 + dz]}>
          <coneGeometry args={[0.025, 0.06, 6]} />
          <meshStandardMaterial color="#2a2a2e" />
        </mesh>
      ))}
    </group>
  );
}

function SandalShoe({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.03, 0.08]}>
        <boxGeometry args={[0.28, 0.05, 0.42]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.1, 0.22]}>
        <boxGeometry args={[0.26, 0.1, 0.04]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

/** No shoes equipped used to mean *nothing* rendered at all — the leg just
 * stopped dead at the ankle with no foot shape, floating above the ground.
 * Rendered in character-model.tsx exactly where a shoe would go, so the
 * silhouette is always complete regardless of what's equipped. */
export function BareFoot({ skin }: { skin: string }) {
  return (
    <mesh position={[0, 0.05, 0.06]}>
      <boxGeometry args={[0.24, 0.12, 0.34]} />
      <meshStandardMaterial color={skin} />
    </mesh>
  );
}

const SHOE_VARIANTS = [SneakerShoe, BootShoe, CleatShoe, SandalShoe];

const EXACT_SHOE_SHAPE: Record<string, typeof SneakerShoe> = {
  "Lichtschritt-Stiefel": BootShoe,
  "Voidtreter": CleatShoe,
};

export function ShoeVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#1e293b");
  const Variant =
    EXACT_SHOE_SHAPE[item.name] ?? SHOE_VARIANTS[variantIndex(item.name, SHOE_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} />
    </RarityFX>
  );
}

// --- Shields: 4 distinct silhouettes (left arm) ---------------------------

function KiteShield({ color, emissive }: { color: string; emissive: string }) {
  return (
    <mesh position={[-0.16, -0.55, 0.05]}>
      <boxGeometry args={[0.06, 0.55, 0.4]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.25} />
    </mesh>
  );
}

function RoundShield({ color, emissive }: { color: string; emissive: string }) {
  return (
    <mesh position={[-0.18, -0.5, 0.05]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.26, 0.26, 0.06, 16]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.25} />
    </mesh>
  );
}

function TowerShield({ color, emissive }: { color: string; emissive: string }) {
  return (
    <mesh position={[-0.18, -0.65, 0.05]}>
      <boxGeometry args={[0.08, 0.85, 0.45]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} />
    </mesh>
  );
}

function BucklerShield({ color, emissive }: { color: string; emissive: string }) {
  return (
    <mesh position={[-0.14, -0.45, 0.05]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.15, 0.15, 0.05, 14]} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.3} />
    </mesh>
  );
}

const SHIELD_VARIANTS = [KiteShield, RoundShield, TowerShield, BucklerShield];

const EXACT_SHIELD_SHAPE: Record<string, typeof KiteShield> = {
  "Voidschild": TowerShield,
  "Drachenschild": KiteShield,
};

const SHIELD_AURA_SMOKE_COUNT = 8;

// CharacterModel's body spans roughly feet-at-y=0 up to the hat anchor at
// y=2.42 — but the *tallest* hat shape, TopHat (its cylinder top sits 0.38
// above its own group origin), actually reaches 2.42 + 0.38 = 2.80, taller
// than the anchor point alone suggests. The previous version of this
// bubble (center 1.25, radius 0.78 × scale (1, 1.75, 1) → top at 2.615)
// still clipped that hat (and most others with any real height) right
// through the crown — exactly the "every helmet should fit inside without
// poking out" guarantee this is supposed to give, not just the bare head.
// Retuned so the top clears 2.80 with real margin (now ~2.90) while the
// bottom still clears the feet, and the horizontal radius leaves room for
// the widest hat brims (CapHat's, ~0.25 half-width) sitting on the
// shoulders — still reads as a body-hugging bubble, just one no equipped
// hat can ever clip through.
const SHIELD_BUBBLE_CENTER_Y = 1.38;
const SHIELD_BUBBLE_RADIUS = 0.8;
const SHIELD_BUBBLE_SCALE = new THREE.Vector3(1.08, 1.9, 1.08);

/**
 * Full-body energy bubble + drifting smoke puffs for a *functioning*
 * shield (item.shield_hp > 0 — lib/combat.ts) — wraps the whole character,
 * not just the arm-mounted `ShieldVariant` prop mesh, since "you have an
 * active damage-absorbing shield" is a whole-body state, not a held item.
 * `stateRef` (Player.tsx's own `combatRef`, structurally compatible —
 * extra fields on it are simply ignored) lets the bubble/smoke fade out
 * as the shield depletes and snap back once it recharges
 * (lib/combat.ts' `applyIncomingDamage`/Player.tsx's regen tick mutate the
 * same ref this reads every frame); omitted entirely for remote
 * avatars/previews, which fall back to a constant full-strength look since
 * there's no live shield state to follow there.
 */
export function ShieldAura({
  item,
  stateRef,
}: {
  item: EquippedItem;
  stateRef?: React.RefObject<{ shieldHpRemaining: number; shieldMaxHp: number }>;
}) {
  const color = rarityColorFor(item, "#22d3ee");
  const bubbleRef = useRef<THREE.Mesh>(null);
  const smokeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const seeds = useMemo(
    () =>
      Array.from({ length: SHIELD_AURA_SMOKE_COUNT }, (_, i) => ({
        angle: (i / SHIELD_AURA_SMOKE_COUNT) * Math.PI * 2,
        phase: i * 0.7,
        heightSeed: (i % 3) * 0.3,
      })),
    []
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const s = stateRef?.current;
    const frac = s ? (s.shieldMaxHp > 0 ? s.shieldHpRemaining / s.shieldMaxHp : 0) : 1;

    if (bubbleRef.current) {
      bubbleRef.current.visible = frac > 0;
      // Pulse multiplies the ellipsoid's baked-in non-uniform shape rather
      // than replacing it with `setScalar` — a uniform setScalar here would
      // collapse the deliberate vertical stretch back into a sphere every
      // frame.
      const pulse = 1 + Math.sin(t * 1.5) * 0.015;
      bubbleRef.current.scale.set(
        SHIELD_BUBBLE_SCALE.x * pulse,
        SHIELD_BUBBLE_SCALE.y * pulse,
        SHIELD_BUBBLE_SCALE.z * pulse
      );
      const mat = bubbleRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.12 * frac + Math.sin(t * 2) * 0.02 * frac;
      mat.color.set(color);
    }
    for (let i = 0; i < smokeRefs.current.length; i++) {
      const mesh = smokeRefs.current[i];
      if (!mesh) continue;
      const seed = seeds[i];
      // Orbit radius/height range widened to match the taller, equally-wide
      // bubble shape above — drifting across its full height (roughly
      // -1.3..1.3 around the group's own origin) instead of only the
      // lower-middle band the old shorter sphere had room for.
      mesh.position.set(
        Math.cos(t * 0.5 + seed.angle) * SHIELD_BUBBLE_RADIUS * 0.85,
        Math.sin(t * 0.8 + seed.phase) * 1.05 + seed.heightSeed,
        Math.sin(t * 0.5 + seed.angle) * SHIELD_BUBBLE_RADIUS * 0.85
      );
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.25 * frac;
      mat.color.set(color);
    }
  });

  return (
    <group position={[0, SHIELD_BUBBLE_CENTER_Y, 0]}>
      <mesh ref={bubbleRef} scale={SHIELD_BUBBLE_SCALE}>
        <sphereGeometry args={[SHIELD_BUBBLE_RADIUS, 24, 18]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          toneMapped={false}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {seeds.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            smokeRefs.current[i] = el;
          }}
        >
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.25} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export function ShieldVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#52525b");
  const emissive = rarityColorFor(item, "#000000");
  const Variant =
    EXACT_SHIELD_SHAPE[item.name] ?? SHIELD_VARIANTS[variantIndex(item.name, SHIELD_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} emissive={emissive} />
    </RarityFX>
  );
}

// --- Rings: worn on the right hand — band + 3 distinct gem cuts -----------
// Equipping a ring/amulet used to do *nothing visible* — the dbType wasn't
// even in CharacterModel's handled set, so it silently vanished into thin
// air (exactly what the debugWarn there was built to catch). These two
// categories now actually render on the body.

function RoundGemRing({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.165, 0.016, 10, 24]} />
        <meshStandardMaterial color="#d4af37" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.19]}>
        <sphereGeometry args={[0.032, 10, 10]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

function SignetRing({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.165, 0.018, 10, 24]} />
        <meshStandardMaterial color="#8a8a92" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.19]}>
        <boxGeometry args={[0.06, 0.06, 0.018]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.55} />
      </mesh>
    </group>
  );
}

function ShardRing({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.165, 0.016, 10, 24]} />
        <meshStandardMaterial color="#b9bdc7" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 0.19]} rotation={[0, 0, Math.PI / 4]}>
        <octahedronGeometry args={[0.04, 0]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.65} />
      </mesh>
    </group>
  );
}

const RING_VARIANTS = [RoundGemRing, SignetRing, ShardRing];

const EXACT_RING_SHAPE: Record<string, typeof RoundGemRing> = {
  "Unendlichkeitsring": SignetRing,
  "Voidring": ShardRing,
  "Sternenring": RoundGemRing,
};

/** Worn on the right hand, just below the weapon grip — visible whether or
 * not a weapon is equipped since it sits on the wrist, not the fist. */
export function RingVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#a855f7");
  const emissive = rarityColorFor(item, "#000000");
  const Variant =
    EXACT_RING_SHAPE[item.name] ?? RING_VARIANTS[variantIndex(item.name, RING_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} emissive={emissive} />
    </RarityFX>
  );
}

// --- Amulets: a chain + pendant on the chest — 3 distinct pendant shapes --

const NECK_CHAIN_LINK_COUNT = 32;
const NECK_CHAIN_RADIUS = 0.34;

/** A real multi-link chain loop, not one big solid torus — `linkCount`
 * small individual link-tori spaced evenly around the neck circle, each
 * one rotated 90° from its neighbor so consecutive links visually
 * interlock the way real chain links alternate orientation. Replaces the
 * single oversized torus every amulet variant used to share, which read
 * as a smooth metal hoop rather than a chain at all. Shared by every
 * pendant shape below so the chain itself is consistent regardless of
 * which pendant is hanging from it. */
function NeckChain({ color = "#7a7a82" }: { color?: string }) {
  const links = useMemo(() => Array.from({ length: NECK_CHAIN_LINK_COUNT }, (_, i) => i), []);
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {links.map((i) => {
        const angle = (i / NECK_CHAIN_LINK_COUNT) * Math.PI * 2;
        const x = Math.cos(angle) * NECK_CHAIN_RADIUS;
        const y = Math.sin(angle) * NECK_CHAIN_RADIUS;
        const altRotation = i % 2 === 0 ? 0 : Math.PI / 2;
        return (
          <mesh key={i} position={[x, y, 0]} rotation={[0, 0, angle + Math.PI / 2 + altRotation]}>
            <torusGeometry args={[0.022, 0.009, 6, 10]} />
            <meshStandardMaterial color={color} metalness={0.65} roughness={0.3} />
          </mesh>
        );
      })}
    </group>
  );
}

function GemPendantAmulet({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <NeckChain />
      <mesh position={[0, -0.14, 0.32]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.1, 0.1, 0.04]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

function CrossPendantAmulet({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <NeckChain />
      <group position={[0, -0.16, 0.32]}>
        <mesh>
          <boxGeometry args={[0.035, 0.16, 0.03]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[0.12, 0.035, 0.03]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.6} />
        </mesh>
      </group>
    </group>
  );
}

function OrbPendantAmulet({ color, emissive }: { color: string; emissive: string }) {
  return (
    <group>
      <NeckChain />
      <mesh position={[0, -0.15, 0.32]}>
        <sphereGeometry args={[0.06, 14, 14]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.8} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

const AMULET_VARIANTS = [GemPendantAmulet, CrossPendantAmulet, OrbPendantAmulet];

const EXACT_AMULET_SHAPE: Record<string, typeof GemPendantAmulet> = {
  "Amulett der Götter": CrossPendantAmulet,
  "Void-Amulett": OrbPendantAmulet,
  "Sternenamulett": GemPendantAmulet,
};

/** Worn around the neck, sitting on top of the chest/jacket — placed in
 * character-model.tsx slightly in front of the torso so it never gets
 * swallowed inside the jacket mesh. */
export function AmuletVariant({ item }: { item: EquippedItem }) {
  const color = rarityColorFor(item, "#a855f7");
  const emissive = rarityColorFor(item, "#000000");
  const Variant =
    EXACT_AMULET_SHAPE[item.name] ?? AMULET_VARIANTS[variantIndex(item.name, AMULET_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} emissive={emissive} />
    </RarityFX>
  );
}

// --- Hair: 4 distinct styles, each gender-adapted -------------------------
// Hair is a single unisex catalogue item now (lib/wardrobe.ts — one "hair"
// dbType, no more hair_m/hair_f) — the exact same item shows up, by the
// same name, regardless of who's wearing it, which is what makes it
// tradeable as one listing. What *does* still differ is purely the
// rendered shape: every style below takes `gender` and adapts its
// proportions (fuller/longer for "w", a bit shorter/blockier for "m"),
// same as a real hairstyle naturally reads differently on different body
// types — never a different item, never a different name.

function ShortHair({ color, gender }: { color: string; gender: "m" | "w" }) {
  const sideLength = gender === "w" ? 0.22 : 0;
  return (
    <group>
      <mesh position={[0, 2.28, -0.05]}>
        <boxGeometry args={[0.58, 0.18, 0.58]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {gender === "w" && (
        <>
          <mesh position={[-0.27, 2.28 - sideLength / 2 - 0.02, 0.05]}>
            <boxGeometry args={[0.08, sideLength, 0.2]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0.27, 2.28 - sideLength / 2 - 0.02, 0.05]}>
            <boxGeometry args={[0.08, sideLength, 0.2]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </>
      )}
    </group>
  );
}

function LongHair({ color, gender }: { color: string; gender: "m" | "w" }) {
  const flowHeight = gender === "w" ? 0.85 : 0.55;
  const flowY = 2.28 - flowHeight / 2 - 0.07;
  return (
    <group>
      <mesh position={[0, 2.28, -0.05]}>
        <boxGeometry args={[0.58, 0.18, 0.58]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, flowY, -0.28]}>
        <boxGeometry args={[gender === "w" ? 0.54 : 0.5, flowHeight, 0.16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function MohawkHair({ color, gender }: { color: string; gender: "m" | "w" }) {
  // Unisex punk style by design — same blocky peak either way, just a hair
  // (pun intended) narrower on the female head to match its slimmer build.
  const width = gender === "w" ? 0.5 : 0.56;
  return (
    <mesh position={[0, 2.42, 0]}>
      <boxGeometry args={[0.12, 0.3, width]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.15} />
    </mesh>
  );
}

function PonytailHair({ color, gender }: { color: string; gender: "m" | "w" }) {
  const tailLength = gender === "w" ? 0.68 : 0.4;
  return (
    <group>
      <mesh position={[0, 2.28, -0.05]}>
        <boxGeometry args={[0.58, 0.18, 0.58]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 2.05 - (tailLength - 0.5) * 0.3, -0.42]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.04, tailLength, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function BuzzcutHair({ color, gender }: { color: string; gender: "m" | "w" }) {
  // A thin, low-profile shell over the scalp — the "shortest" of the
  // styles, barely thicker than the head itself, with a subtle widow's
  // peak notch for "w" so it doesn't read as identical to the male cut.
  return (
    <group>
      <mesh position={[0, 2.26, -0.03]}>
        <boxGeometry args={[0.59, 0.1, 0.6]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {gender === "w" && (
        <mesh position={[0, 2.2, 0.26]}>
          <boxGeometry args={[0.1, 0.06, 0.06]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
    </group>
  );
}

function AfroHair({ color, gender }: { color: string; gender: "m" | "w" }) {
  const radius = gender === "w" ? 0.42 : 0.36;
  return (
    <mesh position={[0, 2.34, -0.02]}>
      <sphereGeometry args={[radius, 14, 12]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function BunHair({ color, gender }: { color: string; gender: "m" | "w" }) {
  // Cap + a rolled-up bun at the back — bigger/higher bun for "w" (classic
  // top-knot/dancer-bun silhouette), small tight one for "m".
  const bunRadius = gender === "w" ? 0.16 : 0.11;
  return (
    <group>
      <mesh position={[0, 2.28, -0.05]}>
        <boxGeometry args={[0.56, 0.16, 0.56]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 2.3 + bunRadius * 0.4, -0.36]}>
        <sphereGeometry args={[bunRadius, 12, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function BraidHair({ color, gender }: { color: string; gender: "m" | "w" }) {
  // Segmented braid (stacked rings give it a woven look instead of a
  // smooth cylinder) — one long braid for "w", a shorter single plait for
  // "m" so it still reads as a deliberate style, not a scaled-down copy.
  const segments = gender === "w" ? 6 : 3;
  return (
    <group>
      <mesh position={[0, 2.28, -0.05]}>
        <boxGeometry args={[0.58, 0.18, 0.58]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <group position={[0, 1.98, -0.4]} rotation={[0.15, 0, 0]}>
        {Array.from({ length: segments }).map((_, i) => (
          <mesh key={i} position={[0, -i * 0.13, 0]}>
            <sphereGeometry args={[0.07 - i * 0.003, 8, 8]} />
            <meshStandardMaterial color={color} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const HAIR_VARIANTS = [
  ShortHair,
  LongHair,
  MohawkHair,
  PonytailHair,
  BuzzcutHair,
  AfroHair,
  BunHair,
  BraidHair,
];

const EXACT_HAIR_SHAPE: Record<string, typeof ShortHair> = {
  "Void-Haare": AfroHair,
  "Sternen-Haare": BraidHair,
};

export function HairVariant({ item, gender }: { item: EquippedItem; gender: "m" | "w" }) {
  const color = rarityColorFor(item, "#404040");
  const Variant =
    EXACT_HAIR_SHAPE[item.name] ?? HAIR_VARIANTS[variantIndex(item.name, HAIR_VARIANTS.length)];
  return (
    <RarityFX rarity={item.rarity}>
      <Variant color={color} gender={gender} />
    </RarityFX>
  );
}

// --- Auras: 4 dramatically different effects ------------------------------

function OrbitAura({ rarity }: { rarity: Rarity }) {
  const groupRef = useRef<THREE.Group>(null);
  const particleRefs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 8;

  useFrame((state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 1.1;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < particleRefs.current.length; i++) {
      const p = particleRefs.current[i];
      if (!p) continue;
      p.position.y = 0.25 + Math.sin(t * 2.4 + i * 1.3) * 0.22;
      applyUltraParticleColor(p.material as THREE.MeshBasicMaterial, rarity, t, i);
    }
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = 0.55;
        return (
          <mesh
            key={i}
            ref={(el) => {
              particleRefs.current[i] = el;
            }}
            position={[Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius]}
          >
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function EmberAura({ rarity }: { rarity: Rarity }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 10;
  // Render-time data (read in JSX below), not a per-frame mutation target —
  // useMemo is the right tool here, not useRef (refs are for values that
  // live *outside* render, e.g. the per-frame mesh mutations in useFrame).
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2,
        radius: 0.2 + (i % 3) * 0.15,
        speed: 0.6 + (i % 4) * 0.15,
        phase: i * 0.7,
      })),
    [count]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const s = seeds[i];
      const cycle = ((t * s.speed + s.phase) % 2) / 2;
      m.position.y = cycle * 2.4;
      m.position.x = Math.cos(s.angle) * s.radius * (1 - cycle * 0.4);
      m.position.z = Math.sin(s.angle) * s.radius * (1 - cycle * 0.4);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.9 * (1 - cycle);
      applyUltraParticleColor(mat, rarity, t, i);
    }
  });

  return (
    <group>
      {seeds.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[Math.cos(s.angle) * s.radius, 0, Math.sin(s.angle) * s.radius]}
        >
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function BladeAura({ rarity }: { rarity: Rarity }) {
  const groupRef = useRef<THREE.Group>(null);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 6;

  useFrame((state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y -= delta * 2.2;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      applyUltraParticleColor(m.material as THREE.MeshBasicMaterial, rarity, t, i);
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.9, 0]}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = 0.65;
        return (
          <mesh
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
            rotation={[0, -angle, Math.PI / 2.3]}
          >
            <boxGeometry args={[0.32, 0.02, 0.09]} />
            <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function DoubleRingAura({ rarity }: { rarity: Rarity }) {
  const ringA = useRef<THREE.Group>(null);
  const ringB = useRef<THREE.Group>(null);
  const meshA = useRef<THREE.Mesh>(null);
  const meshB = useRef<THREE.Mesh>(null);
  const color = RARITY_HEX[rarity];

  useFrame((state, delta) => {
    if (ringA.current) ringA.current.rotation.y += delta * 1.6;
    if (ringB.current) ringB.current.rotation.y -= delta * 1.2;
    const t = state.clock.elapsedTime;
    if (meshA.current) applyUltraParticleColor(meshA.current.material as THREE.MeshBasicMaterial, rarity, t, 0);
    if (meshB.current) applyUltraParticleColor(meshB.current.material as THREE.MeshBasicMaterial, rarity, t, 5);
  });

  return (
    <>
      <group ref={ringA} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh ref={meshA}>
          <torusGeometry args={[0.5, 0.025, 8, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
        </mesh>
      </group>
      <group ref={ringB} position={[0, 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh ref={meshB}>
          <torusGeometry args={[0.38, 0.02, 8, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}

/** A streaking comet tail orbiting the body — a chain of shrinking, fading
 * spheres trailing behind a bright head, sweeping around at shoulder
 * height. This is the "Schweif" (tail) look the ring/orbit/ember/blade
 * variants above didn't cover. */
function CometAura({ rarity }: { rarity: Rarity }) {
  const groupRef = useRef<THREE.Group>(null);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 9;
  const seeds = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ trail: i / count })),
    [count]
  );

  useFrame((state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 1.4;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      applyUltraParticleColor(m.material as THREE.MeshBasicMaterial, rarity, t, i);
    }
  });

  return (
    <group ref={groupRef} position={[0, 1.1, 0]}>
      {seeds.map((s, i) => {
        const angle = -s.trail * 1.1;
        const radius = 0.75 + s.trail * 0.18;
        const scale = 1 - s.trail * 0.85;
        return (
          <mesh
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            position={[Math.cos(angle) * radius, Math.sin(s.trail * 3) * 0.1, Math.sin(angle) * radius]}
            scale={scale}
          >
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.85 * (1 - s.trail * 0.8)}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** A pair of slowly-flapping, segmented wing silhouettes flaring out from
 * the back — glowing feather-like slats instead of a flat plane, so it
 * reads as wings rather than two boards. */
function WingAura({ rarity }: { rarity: Rarity }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const feathersPerWing = 5;
  const seeds = useMemo(
    () =>
      [-1, 1].flatMap((side) =>
        Array.from({ length: feathersPerWing }, (_, i) => ({
          side,
          i,
          spread: (i / (feathersPerWing - 1)) * 0.9 + 0.15,
        }))
      ),
    [feathersPerWing]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flap = Math.sin(t * 1.6) * 0.18;
    for (let idx = 0; idx < refs.current.length; idx++) {
      const m = refs.current[idx];
      if (!m) continue;
      const s = seeds[idx];
      m.rotation.z = s.side * (0.5 + s.spread * 0.5 + flap);
      applyUltraParticleColor(m.material as THREE.MeshBasicMaterial, rarity, t, idx);
    }
  });

  return (
    <group position={[0, 1.5, -0.12]}>
      {seeds.map((s, idx) => (
        <mesh
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          position={[s.side * 0.18, -s.spread * 0.12, -s.spread * 0.1]}
        >
          <boxGeometry args={[0.42 + s.spread * 0.22, 0.05, 0.03]} />
          <meshBasicMaterial color={color} transparent opacity={0.75} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

const AURA_VARIANTS = [OrbitAura, EmberAura, BladeAura, DoubleRingAura, CometAura, WingAura];

const EXACT_AURA_SHAPE: Record<string, typeof OrbitAura> = {
  "Rainbow-Aura": CometAura,
  "Void-Aura": DoubleRingAura,
  "Sternen-Aura": WingAura,
};

export function AuraVariant({ item }: { item: EquippedItem }) {
  const Variant = EXACT_AURA_SHAPE[item.name] ?? AURA_VARIANTS[variantIndex(item.name, AURA_VARIANTS.length)];
  return <Variant rarity={item.rarity} />;
}

// --- Trails: 4 distinct ground-effect styles ------------------------------

function GlowCirclesTrail({ rarity }: { rarity: Rarity }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const segments = [
    { z: -0.4, scale: 0.85, opacity: 0.55 },
    { z: -0.75, scale: 0.65, opacity: 0.38 },
    { z: -1.1, scale: 0.45, opacity: 0.22 },
  ];

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = segments[i].opacity * (0.7 + 0.3 * Math.sin(t * 4 + i));
      applyUltraParticleColor(mat, rarity, t, i);
    }
  });

  return (
    <group position={[0, 0.12, -0.25]}>
      {segments.map((seg, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[0, 0, seg.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.32 * seg.scale, 16]} />
          <meshBasicMaterial color={color} transparent opacity={seg.opacity} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function SparkTrail({ rarity }: { rarity: Rarity }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 8;
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: ((i % 3) - 1) * 0.18,
        z: -0.2 - i * 0.18,
        phase: i * 0.5,
      })),
    [count]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const s = seeds[i];
      m.position.y = 0.05 + Math.abs(Math.sin(t * 3 + s.phase)) * 0.12;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.7 * (0.5 + 0.5 * Math.sin(t * 3 + s.phase));
      applyUltraParticleColor(mat, rarity, t, i);
    }
  });

  return (
    <group>
      {seeds.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[s.x, 0.05, s.z]}
        >
          <sphereGeometry args={[0.035, 6, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function RibbonTrail({ rarity }: { rarity: Rarity }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 6;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      m.position.y = 0.15 + Math.sin(t * 3 + i * 0.8) * 0.06;
      applyUltraParticleColor(m.material as THREE.MeshBasicMaterial, rarity, t, i);
    }
  });

  return (
    <group position={[0, 0, -0.2]}>
      {Array.from({ length: count }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[Math.sin(i * 0.9) * 0.12, 0.15, -i * 0.16]}
          rotation={[0, i * 0.4, 0]}
        >
          <boxGeometry args={[0.18, 0.03, 0.1]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.6 - i * 0.08}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function SmokePuffTrail({ rarity }: { rarity: Rarity }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const color = RARITY_HEX[rarity];
  const count = 5;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < refs.current.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const cycle = (t * 0.6 + i * 0.4) % 2;
      const scale = 0.3 + cycle * 0.5;
      m.scale.setScalar(scale);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.5 - cycle * 0.25);
      applyUltraParticleColor(mat, rarity, t, i);
    }
  });

  return (
    <group position={[0, 0.18, -0.3]}>
      {Array.from({ length: count }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[0, 0, -i * 0.22]}
        >
          <sphereGeometry args={[0.18, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

const TRAIL_VARIANTS = [GlowCirclesTrail, SparkTrail, RibbonTrail, SmokePuffTrail];

const EXACT_TRAIL_SHAPE: Record<string, typeof GlowCirclesTrail> = {
  "RGB-Spur": SparkTrail,
  "Regenbogen-Spur": RibbonTrail,
  "Galaxie-Spur": SmokePuffTrail,
};

export function TrailVariant({ item }: { item: EquippedItem }) {
  const Variant =
    EXACT_TRAIL_SHAPE[item.name] ?? TRAIL_VARIANTS[variantIndex(item.name, TRAIL_VARIANTS.length)];
  return <Variant rarity={item.rarity} />;
}
