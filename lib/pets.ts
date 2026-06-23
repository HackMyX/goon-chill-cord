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
}

export const PET_TYPE_IDS = ["dog", "cat", "phoenix", "dragon", "ghost", "generic"];

/**
 * Balanced as a meaningful PvE assist, not a primary damage source — even
 * the strongest species roughly matches a bare-fisted player's per-hit
 * damage (lib/combat.ts' FIST_DAMAGE = 8) at a slower attack tempo than the
 * player's own ATTACK_COOLDOWN, so a pet noticeably speeds up a fight
 * without trivializing it or out-damaging an actually-equipped weapon.
 */
export const DEFAULT_PET_TYPES: PetTypeConfig[] = [
  { id: "dog", name: "Hund", damage: 4, aggroRadius: 5, attackSpeed: 1.0, moveSpeed: 3.4, enabled: true },
  { id: "cat", name: "Katze", damage: 3, aggroRadius: 4.5, attackSpeed: 0.8, moveSpeed: 3.8, enabled: true },
  { id: "phoenix", name: "Phönix", damage: 6, aggroRadius: 6, attackSpeed: 1.3, moveSpeed: 4.2, enabled: true },
  { id: "dragon", name: "Drache", damage: 8, aggroRadius: 6.5, attackSpeed: 1.5, moveSpeed: 4, enabled: true },
  { id: "ghost", name: "Geist", damage: 5, aggroRadius: 5.5, attackSpeed: 1.1, moveSpeed: 3.6, enabled: true },
  { id: "generic", name: "Sonstiges Haustier", damage: 3, aggroRadius: 4, attackSpeed: 1.2, moveSpeed: 3, enabled: true },
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

/** Combat stats for display in the UI — resolves species from the item name
 * so callers can show damage/aggroRadius/attackSpeed without needing the
 * full DB-overridden config (uses code defaults, which are the same values
 * shown in the admin panel before any override). */
export function getPetStatsForDisplay(name: string): { damage: number; aggroRadius: number; attackSpeed: number } | null {
  const id = getPetSpeciesId(name);
  const config = DEFAULT_PET_TYPES.find((p) => p.id === id);
  if (!config) return null;
  return { damage: config.damage, aggroRadius: config.aggroRadius, attackSpeed: config.attackSpeed };
}
