/**
 * Single source of truth for the 3D World's size — read by the ground/sky
 * (components/world/scene.tsx, environment.tsx) to know how big to render
 * the playable area, and by the player controller
 * (components/world/player.tsx) to know where to stop them. Keeping both
 * in sync with one constant is the whole point: changing this number alone
 * grows or shrinks the entire world consistently.
 */
export const WORLD_RADIUS = 78;
