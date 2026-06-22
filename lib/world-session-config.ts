/**
 * 3D World session-level admin settings — same "code defaults, DB
 * overrides" shape as lib/kill-streak.ts/lib/streak.ts. Covers things that
 * previously had no admin surface at all: the Disconnect button's
 * countdown duration, and two master kill-switches surfaced in the admin
 * Games tab (components/admin/games-tab.tsx).
 */
export interface WorldSessionConfig {
  /** Seconds the Disconnect button's countdown runs before the kill-streak
   * is actually committed — see world-shell.tsx's handleDisconnect doc
   * comment for why this exists at all (surviving the full countdown,
   * not just clicking the button, is what secures the streak). */
  disconnectCountdownSec: number;
  /** Master kill-switch — when false, /world redirects away with a notice
   * instead of loading (app/world/page.tsx). */
  worldEnabled: boolean;
  /** When false, PvP hits are rejected server-side (lib/actions/pvp.ts)
   * without dealing damage — monsters/everything else in the World is
   * unaffected, this only toggles player-vs-player melee. */
  pvpEnabled: boolean;
}

export const DEFAULT_WORLD_SESSION_CONFIG: WorldSessionConfig = {
  disconnectCountdownSec: 10,
  worldEnabled: true,
  pvpEnabled: true,
};
