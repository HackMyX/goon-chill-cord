import type { Rarity } from "@/lib/cases";

/**
 * Single source of truth for "how hard does this hit" — shared by the
 * World's attack logic (components/world/player.tsx) and every place a
 * weapon's damage gets displayed (admin editor, wardrobe, shop). An
 * item's `damage` column is the admin-set authority; everything else
 * here is just the unarmed fallback and display helpers around it.
 */

/** Punching with bare fists — the floor every weapon must beat to be worth
 * equipping at all. Always available, never admin-configurable (there's
 * no "fist" row in the items table to edit). Calibrated against
 * lib/monsters.ts' weakest enemy (Skelett, 28 HP): 4 fist hits kill it
 * (4 × 8 = 32 ≥ 28) at the fixed ATTACK_COOLDOWN below, so a totally
 * unequipped player can still fight, just slowly — every weapon tier in
 * SUGGESTED_DAMAGE_BY_RARITY is a clear, felt upgrade from there. */
export const FIST_DAMAGE = 8;

/** The only dbType actually rendered as a held weapon in the 3D world/
 * wardrobe (components/world/character-model.tsx reads
 * `equippedByCategory.weapon_cosmetic`). A legacy bare "weapon" type used
 * to be accepted here too — removed along with the dead catalogue rows it
 * only ever produced (scripts/remove-legacy-rpg-items.mjs): allowing the
 * admin panel to keep creating new items of a type with zero 3D render
 * path was the exact trap that produced "two Flammenschwerter" in the
 * first place (one real `weapon_cosmetic`, one invisible `weapon`). */
export function isWeaponType(type: string): boolean {
  return type === "weapon_cosmetic";
}

/** Suggested default when an admin creates a new weapon and hasn't typed a
 * damage value yet — editable immediately afterward, never silently
 * enforced. Rarer items suggest harder hits, same progression shape as
 * the case-opening reward curve elsewhere in this app. Roughly 2×/4×/7×/12×
 * FIST_DAMAGE — each tier is a clearly felt step up, not a rounding error:
 * a Normal weapon roughly halves fight time against any lib/monsters.ts
 * enemy, an Ultra weapon drops even the toughest one (90 HP) in a single
 * hit. */
export const SUGGESTED_DAMAGE_BY_RARITY: Record<Rarity, number> = {
  normal: 15,
  selten: 30,
  mythisch: 55,
  ultra: 100,
};

// --- Player combat stats -----------------------------------------------
// Shared by components/world/player.tsx (the actual physics/regen) and
// components/world/world-shell.tsx (the HP/Stamina HUD bars) so both read
// from one balanced source instead of two copies that could drift apart.

export const PLAYER_MAX_HP = 100;
export const PLAYER_MAX_STAMINA = 100;

/** Stamina only ever drains from sprinting (continuous, per second) or
 * jumping (a flat cost per jump) — explicitly never from attacking, per
 * design: a fight shouldn't also exhaust you out of being able to run
 * away from it. */
export const STAMINA_SPRINT_DRAIN_PER_SEC = 16;
export const STAMINA_JUMP_COST = 20;
export const STAMINA_REGEN_PER_SEC = 12;
/** Hysteresis: sprint can drain stamina all the way to 0, but can't be
 * *re-engaged* until it's regenerated back up past this floor — without
 * this, sitting exactly at the drain/regen breakeven point would flicker
 * sprint on/off every frame instead of cleanly cutting out. */
export const STAMINA_MIN_TO_START_SPRINT = 15;
/** Below this, Space simply does nothing (no half-height "tired hop") —
 * cleaner than letting stamina go negative. */
export const STAMINA_MIN_TO_JUMP = STAMINA_JUMP_COST;

/** Slow passive regen so a fight's damage isn't permanent for the rest of
 * the session, but only once you've actually disengaged — otherwise
 * trading hits with an enemy would net-heal through the fight itself. */
export const HP_REGEN_PER_SEC = 3;
export const HP_REGEN_DELAY_AFTER_HIT_SEC = 4;
/** Grace window after a respawn so a fresh spawn can't be immediately
 * re-hit by whatever was already standing on the spawn point. */
export const RESPAWN_INVULNERABLE_SEC = 1.5;

/** Melee range — generous enough to not feel finicky, small enough that
 * "am I in range" is an obvious, readable circle around the player (see
 * the ring visual in player.tsx), not an invisible guess.
 *
 * Deliberately bigger than every lib/monsters.ts variant's `attackRange`
 * (max 1.8) by a full player-width-and-then-some, and the player's own
 * move speed (4.5, 8.1 sprinting) is 1.8-5× every variant's `moveSpeed`
 * (max 2.5) — both gaps exist specifically so "hit it, then back off
 * before it reaches you" (kiting) is a real, comfortably-timed option,
 * not a frame-perfect trick. Don't shrink this below the monster
 * attackRange ceiling without re-checking that gap. */
export const ATTACK_RANGE = 2.7;
/** Half-angle of the forward hit cone, radians (~60° each side) — kept only
 * for the ground-ring visual's "anything in range at all" check in
 * player.tsx; the actual hit/miss decision uses `capsuleHitTest` below, not
 * this angle, as of the accuracy fix it documents. */
export const ATTACK_CONE_HALF_ANGLE = 1.05;
/** Fixed cadence for every weapon (and bare fists) — see FIST_DAMAGE's
 * doc comment for how this and the damage numbers were balanced together. */
export const ATTACK_COOLDOWN = 0.45;

/** Effective radius of "something standing roughly where you're aiming",
 * world units — the half-width a punch/swing is forgiving of. */
export const ATTACK_HIT_RADIUS = 0.55;

/**
 * Sphere-cast-along-a-ray hit test, done in plain 2D trig (no three.js
 * dependency, so the same function can be reused server-side for PvP
 * validation later without dragging in a 3D math library): forms a
 * `range`-long, `hitRadius`-wide capsule extending from `(originX, originZ)`
 * in direction `heading` (radians, same sin/cos-forward convention as every
 * other heading in this app), and reports whether `(targetX, targetZ)`
 * falls inside it.
 *
 * Replaces the previous flat angle-cone test
 * (`Math.abs(angleDelta(...)) > ATTACK_CONE_HALF_ANGLE`), which had a real
 * accuracy bug: an angular cone's *linear* width at distance `d` is
 * `d * sin(angle)` — shrinking toward zero as `d` shrinks, meaning a
 * monster standing right in front of the player but a few degrees off
 * dead-center (e.g. mid-chase, not perfectly squared up) could whiff a
 * swing it was clearly standing inside. A fixed-radius capsule has the
 * same forgiving width at every distance, which is what "I should always
 * be able to hit something I'm standing next to and facing roughly at"
 * actually requires.
 */
export function capsuleHitTest(
  originX: number,
  originZ: number,
  heading: number,
  targetX: number,
  targetZ: number,
  range: number,
  hitRadius: number = ATTACK_HIT_RADIUS
): boolean {
  const toX = targetX - originX;
  const toZ = targetZ - originZ;
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const forwardDist = toX * forwardX + toZ * forwardZ;
  if (forwardDist < -hitRadius || forwardDist > range + hitRadius) return false;
  const distSq = toX * toX + toZ * toZ;
  const lateralDistSq = Math.max(0, distSq - forwardDist * forwardDist);
  return lateralDistSq <= hitRadius * hitRadius;
}

/** Sprinting/airborne attacks hit harder — a deliberate, felt reward for
 * committing to momentum instead of standing still trading hits, the way a
 * charging or jumping attack reads in most third-person action games.
 * Stacked multiplicatively (a sprint-jump-attack is rare but should feel
 * like the biggest hit available) and applied on top of whatever
 * `getEquippedDamage` already returned, never replacing it. */
const SPRINT_DAMAGE_MULTIPLIER = 1.2;
const AIRBORNE_DAMAGE_MULTIPLIER = 1.35;

export function momentumMultiplier(sprinting: boolean, airborne: boolean): number {
  let mult = 1;
  if (sprinting) mult *= SPRINT_DAMAGE_MULTIPLIER;
  if (airborne) mult *= AIRBORNE_DAMAGE_MULTIPLIER;
  return mult;
}

// --- Armor / perks / shields ---------------------------------------------
// Every item's stat fields (lib/rarity-colors.ts EquippedItem, lib/actions/
// admin.ts ItemInput) — armor on outfits, perks on amulets/rings, an
// absorb pool + cooldown on shields. None of this reads/writes
// CombatSharedState directly (components/world/combat-types.ts already
// depends on this file, so importing that type back here would be
// circular) — every function below takes either a plain
// equippedByCategory map or a small structurally-typed combat-state shape,
// satisfied by `combatRef.current` without either file needing to import
// the other's types.

interface ArmorSource {
  armor?: number | null;
}

/** Slots that can carry armor — kept here (not lib/equipment-slots.ts'
 * `EquipmentSlot` groups) since this is specifically "which *dbTypes*
 * reduce incoming damage", a combat concept, not a paint-order one. */
const ARMOR_SLOTS = ["jacket", "pants", "hat", "shoes"] as const;

export function getTotalArmor(equippedByCategory: Record<string, ArmorSource | undefined>): number {
  return ARMOR_SLOTS.reduce((sum, slot) => sum + (equippedByCategory[slot]?.armor ?? 0), 0);
}

/** Whether `type` is one of the dbTypes the admin item editor should show
 * an armor-points field for. */
export function isArmorType(type: string): boolean {
  return (ARMOR_SLOTS as readonly string[]).includes(type);
}

export type PerkType = "none" | "speed_boost" | "jump_boost" | "hp_regen_boost";

interface PerkSource {
  perk_type?: PerkType | null;
  perk_magnitude?: number | null;
}

/** Slots that can carry a perk. */
const PERK_SLOTS = ["amulet", "ring"] as const;

/** Multiplier (around 1.0) for whichever stat `type` boosts — amulet and
 * ring stack multiplicatively if both happen to carry the same perk type,
 * so equipping both a +15% and a +10% speed item is a real +26.5%
 * (1.15 × 1.10), not just the better of the two. Returns exactly 1 (no
 * effect) if nothing equipped carries this perk. */
export function getPerkMultiplier(equippedByCategory: Record<string, PerkSource | undefined>, type: PerkType): number {
  let mult = 1;
  for (const slot of PERK_SLOTS) {
    const item = equippedByCategory[slot];
    if (item?.perk_type === type) mult *= 1 + (item.perk_magnitude ?? 0);
  }
  return mult;
}

/** Whether `type` is one of the dbTypes the admin item editor should show
 * the perk-type/perk-magnitude fields for. */
export function isPerkType(type: string): boolean {
  return (PERK_SLOTS as readonly string[]).includes(type);
}

/** Whether `type` is the dbType the admin item editor should show the
 * shield-HP/regen-cooldown fields for (the legacy bare "shield" type from
 * lib/cases.ts ALL_ITEM_TYPES has no 3D slot, only "shield_cosmetic" does —
 * same distinction isWeaponType already draws between "weapon"/"weapon_cosmetic"). */
export function isShieldType(type: string): boolean {
  return type === "shield_cosmetic";
}

interface DamageableCombatState {
  hp: number;
  armor: number;
  invulnerable: boolean;
  shieldHpRemaining: number;
  shieldRegenCooldown: number;
  shieldRegenCooldownDuration: number;
}

/**
 * Single chokepoint every source of incoming damage to the *local* player
 * must go through — monster melee (components/world/monster.tsx) and PvP
 * (components/world/player.tsx's subscribeToWorldPvpDamage handler) both
 * call this instead of subtracting from `hp` directly, so armor/shield
 * apply identically regardless of who's attacking. Order: invulnerability
 * blocks everything outright, then armor reduces the raw number (never
 * below 1 — armor can soften a hit but never make the player literally
 * unkillable from any source), then a depleted shield absorbs what's left
 * before it ever touches `hp`. Mutates `combat` in place (same imperative-
 * ref style as the rest of this app's per-frame combat state) and returns
 * nothing — callers already read `combat.hp` themselves afterward (e.g.
 * Player.tsx's hp-regen-timer reset, which compares against last frame's
 * value).
 */
export function applyIncomingDamage(combat: DamageableCombatState, rawDamage: number): void {
  if (combat.invulnerable) return;
  let dmg = Math.max(1, rawDamage - combat.armor);
  if (combat.shieldHpRemaining > 0) {
    const absorbed = Math.min(combat.shieldHpRemaining, dmg);
    combat.shieldHpRemaining -= absorbed;
    dmg -= absorbed;
    if (combat.shieldHpRemaining <= 0) combat.shieldRegenCooldown = combat.shieldRegenCooldownDuration;
  }
  combat.hp = Math.max(0, combat.hp - dmg);
}

export interface DamageSource {
  /** `null`/`undefined` = this item has no damage stat at all (every
   * non-weapon cosmetic, or a weapon row an admin hasn't priced yet —
   * those still fall back to fist damage, not 0, so equipping them never
   * makes a player hit *weaker* than bare-handed). */
  damage?: number | null;
}

/** What a punch with whatever's currently in the weapon slot actually
 * deals. Equipping a damage-bearing item always takes over from the bare
 * fist — that's the whole point of equipping it — and never equipping
 * anything (or equipping a weapon skin with no damage set) means you're
 * still just punching. */
export function getEquippedDamage(weapon: DamageSource | undefined | null): number {
  if (!weapon || weapon.damage === null || weapon.damage === undefined) return FIST_DAMAGE;
  return Math.max(FIST_DAMAGE, Math.floor(weapon.damage));
}

/** Display label for damage badges — same "⚔" glyph everywhere a weapon's
 * power is shown, so a player learns to recognize it at a glance instead
 * of every surface inventing its own wording. */
export function formatDamage(damage: number): string {
  return `⚔ ${damage} DMG`;
}
