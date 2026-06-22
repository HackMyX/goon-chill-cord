import * as THREE from "three";

/**
 * Mutated in place every frame by Player.tsx and read every frame by
 * MonstersField.tsx/Monster.tsx (and vice versa for `hp`) — a single
 * shared ref object instead of prop-drilled React state, since this data
 * changes up to 60×/sec and neither side should trigger a React
 * re-render just to tell the other "the player moved" or "you got hit".
 * Owned by Scene.tsx, passed to both as the same ref.
 */
export interface CombatSharedState {
  playerPos: THREE.Vector3;
  /** Player's body heading, radians — same convention as Player.tsx's
   * `g.rotation.y` (sin/cos forward). Monsters don't currently use this
   * (they just chase the position), kept for completeness/future use. */
  playerHeading: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  /** Monsters skip dealing damage while this is true — see
   * RESPAWN_INVULNERABLE_SEC in lib/combat.ts. */
  invulnerable: boolean;
  /** Flat damage reduction summed from equipped jacket/pants/hat/shoes —
   * set once at creation from the session's equipped items (they never
   * change mid-World-session, re-equipping requires the Garderobe), read by
   * lib/combat.ts's `applyIncomingDamage`. */
  armor: number;
  /** Current/max absorb pool from an equipped functioning shield_cosmetic
   * item (0/0 if none equipped or the equipped one is purely decorative) —
   * depleted before `hp` by `applyIncomingDamage`, refilled to `shieldMaxHp`
   * once `shieldRegenCooldown` counts down to 0 after breaking. */
  shieldHpRemaining: number;
  shieldMaxHp: number;
  shieldRegenCooldown: number;
  shieldRegenCooldownDuration: number;
  /** True from the instant `hp` hits 0 until the death-screen's Respawn
   * button actually triggers the reset (components/world/player.tsx no
   * longer auto-respawns the instant hp hits 0 — see its death-screen
   * doc comment) — gates movement/jump/attack input the same way
   * `locked` already does, so a "dead" player can't keep fighting/moving
   * while the overlay is up. */
  dead: boolean;
}

export interface CombatSharedStateInit {
  armor?: number;
  shieldMaxHp?: number;
  shieldRegenCooldownDuration?: number;
  /** Admin-configured (lib/character-config.ts) — scene.tsx passes these
   * through from the loaded CharacterConfig instead of this file hardcoding
   * lib/combat.ts's bare constants directly. */
  maxHp?: number;
  maxStamina?: number;
}

export function createCombatSharedState(init?: CombatSharedStateInit): CombatSharedState {
  const shieldMaxHp = init?.shieldMaxHp ?? 0;
  const maxHp = init?.maxHp ?? 100;
  const maxStamina = init?.maxStamina ?? 100;
  return {
    playerPos: new THREE.Vector3(0, 0, 0),
    playerHeading: 0,
    hp: maxHp,
    maxHp,
    stamina: maxStamina,
    maxStamina,
    invulnerable: false,
    armor: init?.armor ?? 0,
    shieldHpRemaining: shieldMaxHp,
    shieldMaxHp,
    shieldRegenCooldown: 0,
    shieldRegenCooldownDuration: init?.shieldRegenCooldownDuration ?? 0,
    dead: false,
  };
}

/**
 * Imperative pub/sub registry: each mounted `<Monster>` pushes one handle
 * on mount and removes it on unmount (components/world/monster.tsx), and
 * Player.tsx's attack scan reads this array every time a swing lands —
 * no React state involved on either side, so neither the registry nor an
 * attack ever causes a re-render of anything outside the one Monster
 * that actually got hit (which manages its own health-bar/popup state
 * locally).
 */
export interface MonsterHandle {
  id: string;
  typeId: string;
  getPosition: () => THREE.Vector3;
  isAlive: () => boolean;
  /** Current health — read by MonstersField to include in monster_sync
   * broadcasts so remote players can display accurate health bars. */
  getHp: () => number;
  /** Returns the amount actually dealt (0 if already dead) — lets the
   * caller decide whether to play a "hit" vs "no-op" reaction. */
  takeDamage: (amount: number) => number;
  /** This monster's own melee hit-test radius (lib/combat.ts
   * `ATTACK_HIT_RADIUS` scaled by its `lib/monsters.ts` `scale` —
   * monster.tsx sets it once at spawn) — Player.tsx's attack scan passes
   * this into `capsuleHitTest` *instead of* the flat default, so a visually
   * huge variant (Dämonenfürst, scale 1.6) isn't hit-tested as if it were
   * the same point-sized target as a tiny one (Slime, scale 0.85). */
  hitRadius: number;
}

export type MonsterRegistry = React.RefObject<MonsterHandle[]>;

/**
 * Same imperative pub/sub idea as `MonsterHandle`, for PvP: each mounted
 * `<RemotePlayerAvatar>` (components/world/remote-players.tsx) pushes one
 * handle on mount/removes it on unmount, so Player.tsx's attack scan can
 * also consider other *players* as melee targets, not just monsters.
 * `getPosition` returns that avatar's current *rendered* (lerped/
 * interpolated) position — close enough to its real position for a melee
 * range check, and exactly "where the attacker visually sees them standing",
 * which is what lib/actions/pvp.ts's server-side validation is itself
 * checking the attacker's claim against. There is no `takeDamage` here on
 * purpose: unlike a monster, a remote player's HP is never touched
 * directly by another client — only that player's own Player.tsx may
 * mutate its own `combatRef.current.hp`, after receiving a server-broadcast
 * "pvp_damage" event (see lib/world-realtime.ts) that it itself can't fake.
 */
export interface RemotePlayerHandle {
  id: string;
  getPosition: () => THREE.Vector3;
}

export type RemotePlayerRegistry = React.RefObject<RemotePlayerHandle[]>;
