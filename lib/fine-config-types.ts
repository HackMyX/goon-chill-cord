// Shared types for the Fine-Config system.
// NOT "use server" — imported by both client and server sides.

export interface FineConfig {
  id: string;
  // 3D-Welt: Nametag
  nametagDistanceFactor: number;      // default 7.5  — distanceFactor in Html tag
  nametagHeightOffset: number;        // default 2.52 — Y position of nametag above player
  // 3D-Welt: Multiplayer Sync (page-reload to take effect)
  mpPositionLerpRate: number;         // default 20.0
  mpHeadingTurnRate: number;          // default 16.0
  mpDeadReckoningLookahead: number;   // default 0.15 seconds
  mpAttackSwingDuration: number;      // default 0.38 seconds
  // Treffer-Effekte
  bloodBurstParticleCount: number;    // default 7
  bloodBurstLifetimeMs: number;       // default 500
  slashLifetimeMs: number;            // default 230
  // Chat
  chatMaxHistory: number;             // default 60
  chatMaxMessageLength: number;       // default 500
  chatPollIntervalMs: number;         // default 8000
  // Community
  communityMaxBadgesShown: number;    // default 3
  updatedAt: string | null;
}

export const DEFAULT_FINE_CONFIG: FineConfig = {
  id: "default",
  nametagDistanceFactor: 7.5,
  nametagHeightOffset: 2.52,
  mpPositionLerpRate: 20.0,
  mpHeadingTurnRate: 16.0,
  mpDeadReckoningLookahead: 0.15,
  mpAttackSwingDuration: 0.38,
  bloodBurstParticleCount: 7,
  bloodBurstLifetimeMs: 500,
  slashLifetimeMs: 230,
  chatMaxHistory: 60,
  chatMaxMessageLength: 500,
  chatPollIntervalMs: 8000,
  communityMaxBadgesShown: 3,
  updatedAt: null,
};
