/**
 * The player's base movement speed — extracted out of components/world/
 * player.tsx (which used to declare these as private local constants) so
 * lib/character-config.ts can import a real, single source of truth for
 * the admin-configurable default instead of re-typing the number a second
 * time. player.tsx still does all the actual per-frame movement math;
 * this file only holds the two starting numbers.
 */
export const PLAYER_WALK_SPEED = 4.5;
/** Multiplier on `PLAYER_WALK_SPEED` while sprinting (stamina-gated, see
 * lib/combat.ts' STAMINA_SPRINT_DRAIN_PER_SEC). */
export const PLAYER_SPRINT_MULTIPLIER = 1.8;
