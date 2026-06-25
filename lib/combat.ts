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
// Bumped from 100 — feedback was "a bit more stamina would be nice".
// Regen nudged up to match rather than just the pool size alone, so a
// bigger max doesn't only mean "the same regen takes longer to refill
// it" — both the ceiling and the recovery pace are a little more
// generous now. Admin-tunable regardless (lib/character-config.ts).
export const PLAYER_MAX_STAMINA = 130;

/** Stamina only ever drains from sprinting (continuous, per second) —
 * explicitly never from attacking (a fight shouldn't also exhaust you out
 * of being able to run away from it) or, as of this constant's removal,
 * jumping either: jumping used to cost a flat chunk of stamina, but that
 * meant a few hops could eat into the same pool sprinting needs to
 * actually escape something, for a move that's mostly just traversal/
 * dodging, not a real combat or escape tool itself. Jump is unlimited now
 * — see JUMP_COOLDOWN_SEC below for how spam is prevented instead (a
 * cooldown, not a resource cost). */
export const STAMINA_SPRINT_DRAIN_PER_SEC = 16;
export const STAMINA_REGEN_PER_SEC = 14;
/** Hysteresis: sprint can drain stamina all the way to 0, but can't be
 * *re-engaged* until it's regenerated back up past this floor — without
 * this, sitting exactly at the drain/regen breakeven point would flicker
 * sprint on/off every frame instead of cleanly cutting out. */
export const STAMINA_MIN_TO_START_SPRINT = 15;
/** Minimum wait *after landing* before the next jump is allowed, seconds.
 * Applied at touch-down (not at jump-time) in components/world/player.tsx
 * so the felt delay is always exactly this long regardless of how high or
 * how long the jump was (a jump_boost perk would otherwise push the total
 * airtime past the old 1s cooldown, making it expire mid-air and giving
 * zero post-landing delay). 0.4s is short enough to not feel restrictive
 * but clearly perceptible — bunny-hop spam is prevented without making
 * jump rhythm feel sluggish. */
export const JUMP_COOLDOWN_SEC = 0.4;

/** Slow passive regen so a fight's damage isn't permanent for the rest of
 * the session, but only once you've actually disengaged — otherwise
 * trading hits with an enemy would net-heal through the fight itself. */
export const HP_REGEN_PER_SEC = 3;
export const HP_REGEN_DELAY_AFTER_HIT_SEC = 2.5;
/** Grace window after a respawn so a fresh spawn can't be immediately
 * re-hit by whatever was already standing on the spawn point. */
export const RESPAWN_INVULNERABLE_SEC = 1.8;

/** Melee range — generous enough to not feel finicky, small enough that
 * "am I in range" is an obvious, readable circle around the player (see
 * the ring visual in player.tsx), not an invisible guess.
 *
 * Deliberately bigger than every lib/monsters.ts variant's `attackRange`
 * (max 2.0, Dämonenfürst) by a full player-width-and-then-some — land a hit
 * right at max reach and you're never simultaneously inside *their* strike
 * range, so landing the first hit is always the rewarded side of an even
 * fight.
 *
 * Every variant's `moveSpeed` is faster than the player's unsprinted walk
 * (4.5) and slower than sprinting (8.1) — see lib/monsters.ts' doc comment
 * on that array for why kiting now requires the stamina-gated sprint
 * instead of being free at a normal walk. Re-check that relationship (and
 * this constant against the monster `attackRange` ceiling) any time a new
 * variant is added with a higher attackRange, or a moveSpeed outside the
 * (4.5, 8.1) band. */
export const ATTACK_RANGE = 2.7;
/** Half-angle of the forward hit cone, radians (~60° each side, ~120° total)
 * — *actually* drives `capsuleHitTest`'s widening cone below now (it used to
 * be unused dead weight kept only for the ground-ring visual, back when the
 * hit test was a fixed-width lane instead of a true cone). Generous on
 * purpose: "anything roughly in front of me" should mean exactly that, not
 * "anything within a couple of degrees of dead-center" — only the rear ~60°
 * behind the player is excluded. */
export const ATTACK_CONE_HALF_ANGLE = 1.05;
/** Fixed cadence for every weapon (and bare fists) — see FIST_DAMAGE's
 * doc comment for how this and the damage numbers were balanced together. */
export const ATTACK_COOLDOWN = 0.40;

/** Effective radius of "something standing roughly where you're aiming",
 * world units — the minimum half-width a punch/swing is forgiving of,
 * regardless of distance (see `capsuleHitTest`'s point-blank case). */
export const ATTACK_HIT_RADIUS = 0.55;

/**
 * Widening-cone hit test, done in plain 2D trig (no three.js dependency, so
 * the same function can be reused server-side for PvP validation without
 * dragging in a 3D math library): a target at `(targetX, targetZ)` is hit
 * if it's within `range` of `(originX, originZ)` along `heading` (radians,
 * same sin/cos-forward convention as every other heading in this app) and
 * its lateral (sideways) offset from that forward axis is within whichever
 * is bigger of `hitRadius` (a flat minimum, near the player) or
 * `forwardDist * tan(coneHalfAngle)` (a true angular cone, farther out).
 *
 * Earlier history: a flat angle-cone test
 * (`Math.abs(angleDelta(...)) > ATTACK_CONE_HALF_ANGLE`) had a *near-range*
 * accuracy bug — its linear width at distance `d` is `d * sin(angle)`,
 * shrinking toward zero as `d` shrinks, so a monster standing right next to
 * the player but a few degrees off dead-center could whiff a swing it was
 * clearly standing inside. Replacing it with a fixed-width capsule
 * (`hitRadius` alone, no angle at all) fixed that but introduced the
 * opposite bug at *long* range: a fixed 0.55-unit half-width over a
 * 2.7-unit range is only an ~12° cone right at the edge of `ATTACK_RANGE`
 * — so a target standing well inside the visible range ring, just not
 * dead-center, regularly read as "in range" but still whiffed. This
 * function is both at once: `hitRadius` near the player (no more
 * near-range whiffing), widening into a real `coneHalfAngle` cone farther
 * out (no more long-range sliver) — "anything roughly in front of me,
 * within the range I can see" is hittable at every distance, not just
 * near the player or only within a couple of degrees of dead-center.
 */
export function capsuleHitTest(
  originX: number,
  originZ: number,
  heading: number,
  targetX: number,
  targetZ: number,
  range: number,
  hitRadius: number = ATTACK_HIT_RADIUS,
  coneHalfAngle: number = ATTACK_CONE_HALF_ANGLE
): boolean {
  const toX = targetX - originX;
  const toZ = targetZ - originZ;
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const forwardDist = toX * forwardX + toZ * forwardZ;
  if (forwardDist < -hitRadius || forwardDist > range + hitRadius) return false;
  const distSq = toX * toX + toZ * toZ;
  const lateralDistSq = Math.max(0, distSq - forwardDist * forwardDist);
  const allowedLateral = Math.max(hitRadius, forwardDist * Math.tan(coneHalfAngle));
  return lateralDistSq <= allowedLateral * allowedLateral;
}

/** Sprinting/airborne attacks hit harder — a deliberate, felt reward for
 * committing to momentum instead of standing still trading hits, the way a
 * charging or jumping attack reads in most third-person action games.
 * Stacked multiplicatively (a sprint-jump-attack is rare but should feel
 * like the biggest hit available) and applied on top of whatever
 * `getEquippedDamage` already returned, never replacing it. */
export const SPRINT_DAMAGE_MULTIPLIER = 1.25;
export const AIRBORNE_DAMAGE_MULTIPLIER = 1.35;

/** Optional 3rd/4th params let an admin-configured value (lib/character-
 * config.ts) override the module default without every existing caller
 * needing to pass anything — same "parameterized with a default" shape
 * `capsuleHitTest` already uses below. */
export function momentumMultiplier(
  sprinting: boolean,
  airborne: boolean,
  sprintMult: number = SPRINT_DAMAGE_MULTIPLIER,
  airborneMult: number = AIRBORNE_DAMAGE_MULTIPLIER
): number {
  let mult = 1;
  if (sprinting) mult *= sprintMult;
  if (airborne) mult *= airborneMult;
  return mult;
}

/**
 * PvE damage tiers (15/30/55/100, `SUGGESTED_DAMAGE_BY_RARITY`) are
 * calibrated against lib/monsters.ts' per-variant HP pools (30-320),
 * each one specifically sized to absorb a few hits at its intended gear
 * tier. A PvP target has none of that headroom — `PLAYER_MAX_HP` is a
 * flat 100 no matter how a player is geared, armor only ever shaves a
 * handful of points off the top (max 20, `lib/actions/monsters.ts`'
 * rebalance), and momentum stacks multiplicatively on top of weapon tier
 * (`momentumMultiplier`, up to ×1.62). Applied raw, a single sprint-jump
 * hit from an Ultra weapon (100 × 1.62 ≈ 162) would one-shot *any* player
 * outright, armor included — there's no equivalent of "the boss has 320
 * HP so it can take a real fight even from the best gear" for a human
 * target. `PVP_DAMAGE_MULTIPLIER` is the PvP-only correction for that gap:
 * applied *only* in lib/actions/pvp.ts, never to monster damage, so PvE
 * balance is completely untouched. At 0.35, even the single hardest
 * possible hit (162 raw) caps at ~57 — survivable, a real "that hurt" hit,
 * but never an unavoidable instant kill regardless of gear.
 */
export const PVP_DAMAGE_MULTIPLIER = 0.40;

/** Single chokepoint for "how much HP does a landed PvP hit actually cost
 * the target" — lib/actions/pvp.ts' attemptPvpHit rolls this server-side,
 * exactly once, from the attacker's *actually-equipped* weapon row (never
 * a client-claimed number). Kept here, not inlined there, so the PvE
 * momentum math and the PvP-only dampener are visibly the same shape (one
 * wraps the other) instead of two independently-drifting copies. */
export function computePvpDamage(
  baseDmg: number,
  sprinting: boolean,
  airborne: boolean,
  sprintMult: number = SPRINT_DAMAGE_MULTIPLIER,
  airborneMult: number = AIRBORNE_DAMAGE_MULTIPLIER,
  pvpMult: number = PVP_DAMAGE_MULTIPLIER
): number {
  return Math.round(baseDmg * momentumMultiplier(sprinting, airborne, sprintMult, airborneMult) * pvpMult);
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

/** Slots that can carry a perk — amulet + both ring slots (ring = right arm,
 * ring2 = left arm). All three stack multiplicatively, still capped at
 * PERK_MULTIPLIER_CAP so the second ring can't push walking speed past
 * sprint or break the monster-speed balance. */
const PERK_SLOTS = ["amulet", "ring", "ring2"] as const;

/** Hard ceiling on the *combined* multiplier from stacking the same perk
 * type on both amulet and ring at once. Two Ultra items of the same
 * perk_type (35% each, lib/cases.ts' rarity tiers) would otherwise compound
 * to +82% (1.35 × 1.35) uncapped — for `speed_boost` specifically, that
 * pushes the player's *unsprinted* walk speed (4.5) up to ~8.2, almost
 * exactly matching sprint (8.1, player.tsx SPRINT_MULTIPLIER) for free,
 * with no stamina cost. Capped below sprint's own 1.8× multiplier so even
 * the best-case stacked build never matches sprinting outright. At 1.6 a
 * fully-perked walker reaches 4.5 × 1.6 = 7.2 — faster than every monster
 * variant (Geist tops out at 6.3), which is an intentional reward for
 * stacking rare perk items: you can walk away from danger without sprinting,
 * but sprint is still faster, still the burst-escape tool, and the cap
 * still prevents the raw multiplicative overflow that would otherwise push
 * unsprinted speed above sprint itself. Admin-configurable via
 * CharacterConfig.perkMultiplierCap (lib/character-config.ts). */
export const PERK_MULTIPLIER_CAP = 1.6;

/** Multiplier (around 1.0) for whichever stat `type` boosts — amulet and
 * ring stack multiplicatively if both happen to carry the same perk type,
 * so equipping both a +15% and a +10% speed item is a real +26.5%
 * (1.15 × 1.10), not just the better of the two — up to `PERK_MULTIPLIER_
 * CAP` above, past which further stacking simply stops doing anything.
 * Returns exactly 1 (no effect) if nothing equipped carries this perk. */
export function getPerkMultiplier(
  equippedByCategory: Record<string, PerkSource | undefined>,
  type: PerkType,
  cap: number = PERK_MULTIPLIER_CAP
): number {
  let mult = 1;
  for (const slot of PERK_SLOTS) {
    const item = equippedByCategory[slot];
    if (item?.perk_type === type) mult *= 1 + (item.perk_magnitude ?? 0);
  }
  return Math.min(mult, cap);
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
export function getEquippedDamage(weapon: DamageSource | undefined | null, fistDamage: number = FIST_DAMAGE): number {
  if (!weapon || weapon.damage === null || weapon.damage === undefined) return fistDamage;
  return Math.max(fistDamage, Math.floor(weapon.damage));
}

/** Display label for damage badges — same "⚔" glyph everywhere a weapon's
 * power is shown, so a player learns to recognize it at a glance instead
 * of every surface inventing its own wording. `label` defaults to "DMG"
 * but every real call site passes the admin-configured
 * `useSiteConfig().damageLabel` (lib/site-config.ts) instead. */
export function formatDamage(damage: number, label: string = "DMG"): string {
  return `⚔ ${damage} ${label}`;
}
