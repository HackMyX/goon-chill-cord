// Client-sichere Bonus-Game-Konstanten (KEINE Server-Imports), damit sowohl
// Server (rewards-grant) als auch Client (Bonus-Karte/Dock/Editor) sie nutzen
// können. rewards-grant re-exportiert sie für Rückwärtskompatibilität.

export const BONUS_GAMES = ["plinko", "snake", "don"] as const;
export type BonusGame = (typeof BONUS_GAMES)[number];

export const BONUS_GAME_LABELS: Record<BonusGame, string> = {
  plinko: "Plinko-Bälle",
  snake: "Snake-Spiele",
  don: "DON-Spins",
};

export function isBonusGame(v: unknown): v is BonusGame {
  return typeof v === "string" && (BONUS_GAMES as readonly string[]).includes(v);
}
