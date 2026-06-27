// Admin-configurable display/sizing for the entire case-opening experience.
// Every visual size lives here so admins can tune the look without code changes.

export interface CaseDisplayConfig {
  /** Width of a single reel slot in px. */
  reelItemWidth: number;
  /** Height of the spin reel in px. */
  reelHeight: number;
  /** 3D zoom inside reel slots (1 = default; >1 = closer/bigger). */
  reelItemScale: number;
  /** 3D zoom for the win-reveal item (1 = default). */
  revealScale: number;
  /** Height (px) of the 3D area on each pool-popup card. */
  poolCardHeight: number;
  /** Minimum column width (px) for the pool grid — controls how many fit per row. */
  poolMinColWidth: number;
  /** Width (px) of each batch-result card. */
  batchCardWidth: number;
  /** Height (px) of the 3D area on each batch card. */
  batchCardHeight: number;
  /** Base auto-rotation speed of 3D items. */
  rotateSpeed: number;
  /** Whether 3D items auto-rotate at all. */
  autoRotate: boolean;
  /** Render worn items (hat/hair/face/jacket/pants/shoes) on a character body so they read correctly. */
  useCharacterForWorn: boolean;
}

export const DEFAULT_CASE_DISPLAY_CONFIG: CaseDisplayConfig = {
  reelItemWidth: 150,
  reelHeight: 200,
  reelItemScale: 1,
  revealScale: 1.15,
  poolCardHeight: 120,
  poolMinColWidth: 150,
  batchCardWidth: 168,
  batchCardHeight: 120,
  rotateSpeed: 0.6,
  autoRotate: true,
  useCharacterForWorn: true,
};

const NUM_BOUNDS: Record<string, [number, number]> = {
  reelItemWidth: [90, 320],
  reelHeight: [120, 420],
  reelItemScale: [0.4, 3],
  revealScale: [0.5, 3],
  poolCardHeight: [70, 260],
  poolMinColWidth: [90, 320],
  batchCardWidth: [110, 320],
  batchCardHeight: [70, 260],
  rotateSpeed: [0, 4],
};

/** Validates/clamps a raw config object, filling any missing fields with defaults. Never throws. */
export function normalizeCaseDisplayConfig(raw: unknown): CaseDisplayConfig {
  const out: CaseDisplayConfig = { ...DEFAULT_CASE_DISPLAY_CONFIG };
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  for (const key of Object.keys(NUM_BOUNDS)) {
    const v = o[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      const [min, max] = NUM_BOUNDS[key];
      (out as unknown as Record<string, number>)[key] = Math.min(max, Math.max(min, v));
    }
  }
  if (typeof o.autoRotate === "boolean") out.autoRotate = o.autoRotate;
  if (typeof o.useCharacterForWorn === "boolean") out.useCharacterForWorn = o.useCharacterForWorn;
  return out;
}

/** Worn item types that look best rendered on a character body (need a head/torso/legs). */
export const WORN_TYPES = new Set(["hat", "hair", "face", "jacket", "pants", "shoes"]);

export function needsCharacter(type: string, cfg: CaseDisplayConfig): boolean {
  return cfg.useCharacterForWorn && WORN_TYPES.has(type);
}
