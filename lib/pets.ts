/**
 * The 3D World's fixed pet-species roster — code defaults, DB overrides
 * (same "code defaults, DB overrides, merge by id" pattern as
 * lib/monsters.ts). Species ids mirror the exact keyword detection
 * components/world/item-variants.tsx's `PetVariant` already uses to pick a
 * pet's *shape* (Hund/Katze/Phönix/Drache/Schatten|Geist) — `getPetSpeciesId`
 * below must stay in sync with that function's matching order, since this
 * is "which stat row applies to this equipped pet item", not a separate
 * classification.
 */

export type PetRarity = "normal" | "selten" | "mythisch" | "ultra";
export const PET_RARITIES: PetRarity[] = ["normal", "selten", "mythisch", "ultra"];

export interface PetRarityStats {
  damage: number;
  aggroRadius: number;
  attackSpeed: number;
  moveSpeed: number;
}

export interface PetTypeConfig {
  id: string;
  name: string;
  /** Damage dealt per attack against a monster in range. */
  damage: number;
  /** Radius (world units, around the pet's own current position — not the
   * owner's) within which it actively seeks out and attacks monsters. */
  aggroRadius: number;
  /** Seconds between attacks once a monster is in range. */
  attackSpeed: number;
  /** Movement speed while actively chasing a target — independent from its
   * cosmetic wander speed (components/world/character-model.tsx's
   * PET_GROUND_SPEED/PET_FLY_SPEED), since "hunting something down" should
   * read as more urgent than idle wandering. */
  moveSpeed: number;
  enabled: boolean;
  /** Per-rarity stat overrides — keyed by rarity string. If a key is missing,
   * the computed default (base stats × PET_RARITY_MULTIPLIERS) applies. */
  rarityStats: Record<PetRarity, PetRarityStats>;
}

export const PET_TYPE_IDS = ["dog", "cat", "phoenix", "dragon", "ghost", "generic"];

/**
 * Rarity scaling multipliers applied to base species stats when no explicit
 * DB override exists. Normal = 1× (baseline). Higher rarities reward the
 * player for having a rarer pet — more damage, bigger aggro radius, and
 * faster attack cadence at the cost of slightly lower move speed (the pet
 * is heavier/more powerful, not faster on its feet).
 *
 * attackSpeed is a *cooldown* (seconds) — lower = faster attacks, so we
 * multiply by a fraction < 1 for higher rarities.
 */
export const PET_RARITY_MULTIPLIERS: Record<PetRarity, {
  dmgMul: number;
  aggroMul: number;
  spdMul: number;
  moveMul: number;
}> = {
  normal:   { dmgMul: 1.00, aggroMul: 1.00, spdMul: 1.00,  moveMul: 1.00 },
  selten:   { dmgMul: 1.30, aggroMul: 1.10, spdMul: 0.88,  moveMul: 1.05 },
  mythisch: { dmgMul: 1.75, aggroMul: 1.22, spdMul: 0.72,  moveMul: 1.10 },
  ultra:    { dmgMul: 2.50, aggroMul: 1.40, spdMul: 0.55,  moveMul: 1.18 },
};

/** German labels for rarity tiers — used in admin UI. */
export const PET_RARITY_LABELS: Record<PetRarity, string> = {
  normal:   "Normal",
  selten:   "Selten",
  mythisch: "Mythisch",
  ultra:    "Ultra",
};

/** Computes the default per-rarity stats for one species from its base stats
 * + the universal multiplier table — no DB required. */
export function defaultRarityStats(base: Omit<PetTypeConfig, "rarityStats" | "enabled">): Record<PetRarity, PetRarityStats> {
  const result = {} as Record<PetRarity, PetRarityStats>;
  for (const rarity of PET_RARITIES) {
    const m = PET_RARITY_MULTIPLIERS[rarity];
    result[rarity] = {
      damage:      Math.max(1, Math.round(base.damage * m.dmgMul)),
      aggroRadius: parseFloat((base.aggroRadius * m.aggroMul).toFixed(1)),
      attackSpeed: parseFloat((base.attackSpeed * m.spdMul).toFixed(2)),
      moveSpeed:   parseFloat((base.moveSpeed * m.moveMul).toFixed(1)),
    };
  }
  return result;
}

/**
 * Balanced as a meaningful PvE assist, not a primary damage source — even
 * the strongest species roughly matches a bare-fisted player's per-hit
 * damage (lib/combat.ts' FIST_DAMAGE = 8) at a slower attack tempo than the
 * player's own ATTACK_COOLDOWN, so a pet noticeably speeds up a fight
 * without trivializing it or out-damaging an actually-equipped weapon.
 */
function makePetType(base: Omit<PetTypeConfig, "rarityStats">): PetTypeConfig {
  return { ...base, rarityStats: defaultRarityStats(base) };
}

export const DEFAULT_PET_TYPES: PetTypeConfig[] = [
  makePetType({ id: "dog",     name: "Hund",              damage: 4, aggroRadius: 5,   attackSpeed: 1.0, moveSpeed: 3.4, enabled: true }),
  makePetType({ id: "cat",     name: "Katze",             damage: 3, aggroRadius: 4.5, attackSpeed: 0.8, moveSpeed: 3.8, enabled: true }),
  makePetType({ id: "phoenix", name: "Phönix",            damage: 6, aggroRadius: 6,   attackSpeed: 1.3, moveSpeed: 4.2, enabled: true }),
  makePetType({ id: "dragon",  name: "Drache",            damage: 8, aggroRadius: 6.5, attackSpeed: 1.5, moveSpeed: 4.0, enabled: true }),
  makePetType({ id: "ghost",   name: "Geist",             damage: 5, aggroRadius: 5.5, attackSpeed: 1.1, moveSpeed: 3.6, enabled: true }),
  makePetType({ id: "generic", name: "Sonstiges Haustier",damage: 3, aggroRadius: 4,   attackSpeed: 1.2, moveSpeed: 3.0, enabled: true }),
];

/** Same keyword precedence as item-variants.tsx's `PetVariant` — a name
 * matching none of the specific species falls back to `"generic"`, the
 * same bucket that function's hash-fallback shapes use. */
export function getPetSpeciesId(name: string): string {
  if (/Hund/.test(name)) return "dog";
  if (/Katze/.test(name)) return "cat";
  if (/Phönix/.test(name)) return "phoenix";
  if (/Drache/.test(name)) return "dragon";
  if (/Schatten|Geist/.test(name)) return "ghost";
  return "generic";
}

/** Resolves the effective combat stats for a pet given its species config
 * and the equipped item's rarity. Falls back to base stats for unknown
 * rarity strings (e.g. rarity not set on older items). */
export function resolvePetStatsForRarity(
  config: PetTypeConfig,
  rarity: string
): PetRarityStats {
  const r = rarity as PetRarity;
  if (config.rarityStats[r]) return config.rarityStats[r];
  // Rarity not in PET_RARITIES — fall back to base stats (normal tier).
  return { damage: config.damage, aggroRadius: config.aggroRadius, attackSpeed: config.attackSpeed, moveSpeed: config.moveSpeed };
}

/** Combat stats for display in the UI — resolves species and optionally
 * rarity from the item. Pass `configs` (from PetConfigContext) to show
 * DB-overridden values; omit to fall back to code defaults. */
export function getPetStatsForDisplay(
  name: string,
  configs?: PetTypeConfig[],
  rarity?: string
): { damage: number; aggroRadius: number; attackSpeed: number } | null {
  const id = getPetSpeciesId(name);
  const source = configs ?? DEFAULT_PET_TYPES;
  const config = source.find((p) => p.id === id);
  if (!config) return null;
  if (rarity) {
    const stats = resolvePetStatsForRarity(config, rarity);
    return { damage: stats.damage, aggroRadius: stats.aggroRadius, attackSpeed: stats.attackSpeed };
  }
  return { damage: config.damage, aggroRadius: config.aggroRadius, attackSpeed: config.attackSpeed };
}
