"use client";

// Fixed, hand-placed coordinates rather than Math.random() at render time —
// the scene re-renders whenever equipped items change, and randomizing tree
// positions on every render would make them visibly jump around.
const TREE_SPOTS: [x: number, z: number, scale: number, hue: number][] = [
  [-9, -6, 1.1, 0],
  [-11, 2, 0.9, 1],
  [-7, 9, 1.3, 0],
  [8, -8, 1, 1],
  [11, -2, 1.2, 0],
  [9, 7, 0.95, 1],
  [-14, -10, 1.4, 0],
  [13, 11, 1.1, 1],
  [-3, -14, 1, 0],
  [4, 13, 1.25, 1],
];

const TRUNK_COLOR = "#3b2a1d";
const FOLIAGE_COLORS = ["#143d2b", "#1d4a35"];

function PineTree({ x, z, scale, hue }: { x: number; z: number; scale: number; hue: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 1.2, 8]} />
        <meshStandardMaterial color={TRUNK_COLOR} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <coneGeometry args={[0.85, 1.4, 8]} />
        <meshStandardMaterial color={FOLIAGE_COLORS[hue]} />
      </mesh>
      <mesh position={[0, 2.3, 0]}>
        <coneGeometry args={[0.6, 1.1, 8]} />
        <meshStandardMaterial color={FOLIAGE_COLORS[hue]} />
      </mesh>
      <mesh position={[0, 2.9, 0]}>
        <coneGeometry args={[0.38, 0.85, 8]} />
        <meshStandardMaterial color={FOLIAGE_COLORS[hue]} />
      </mesh>
    </group>
  );
}

const GRASS_SPOTS: [x: number, z: number][] = [
  [-2, -3], [2.5, -2.2], [-3.4, 2.8], [3.6, 3.4], [-1.2, 5.2],
  [4.8, -4.6], [-5.2, -1.4], [1.6, 6.4], [-4.6, 5.8], [5.8, 1.2],
];

function GrassTuft({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 0.4, -0.4, 0.8, -0.8].map((offset, i) => (
        <mesh key={i} position={[offset * 0.3, 0.1, offset * 0.2]} rotation={[0, offset, 0.15]}>
          <coneGeometry args={[0.05, 0.22, 5]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#2f6b3f" : "#3a8050"} />
        </mesh>
      ))}
    </group>
  );
}

/** Minimal scenery for the spawn area — low-poly pine trees ringing the
 * clear walking area, plus small grass tufts scattered closer in. Kept
 * outside the ~10-unit radius the player actually walks in so nothing
 * blocks movement; this is explicitly a "standard world" first pass, not
 * the final environment design. */
export function Environment() {
  return (
    <>
      {TREE_SPOTS.map(([x, z, scale, hue], i) => (
        <PineTree key={i} x={x} z={z} scale={scale} hue={hue} />
      ))}
      {GRASS_SPOTS.map(([x, z], i) => (
        <GrassTuft key={i} x={x} z={z} />
      ))}
    </>
  );
}
