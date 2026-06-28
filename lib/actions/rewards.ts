"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaseConfig } from "@/lib/cases-config";
import { findCaseTier } from "@/lib/cases";
import {
  getGameBonusRemaining, isBonusGame, BONUS_GAMES, BONUS_GAME_LABELS, type BonusGame,
} from "@/lib/rewards-grant";

/**
 * Read side of the reward-voucher system: the player's "wallet" of unredeemed
 * case tokens + active game-bonus pools, plus the list of cases a rarity-mode
 * token can be spent on. The actual case open runs through openCase(tierId,
 * tokenId) (lib/actions/cases.ts) — this file is purely for display + pickers.
 */

export interface CaseTokenView {
  id: string;
  mode: "tier" | "rarity";
  tierId: string | null;
  tierLabel: string | null;
  groupTitle: string | null;
  rarityFloor: string | null;
  label: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface GameBonusView {
  game: BonusGame;
  gameLabel: string;
  remaining: number;
  nextExpiry: string | null;
}

export interface OpenableCaseView {
  tierId: string;
  label: string;
  groupTitle: string;
  price: number;
}

export async function getMyRewardWallet(): Promise<{ caseTokens: CaseTokenView[]; gameBonuses: GameBonusView[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { caseTokens: [], gameBonuses: [] };
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const [{ data: tokens }, { data: bonusRows }] = await Promise.all([
    admin.from("case_tokens")
      .select("id, mode, tier_id, rarity_floor, label, expires_at, created_at")
      .eq("user_id", user.id).is("redeemed_at", null)
      .order("created_at", { ascending: false }),
    admin.from("game_bonus_allowances")
      .select("game, amount, used, expires_at")
      .eq("user_id", user.id),
  ]);

  // Case tokens — resolve case labels for tier-mode tokens (lazy-load config once).
  let groups: Awaited<ReturnType<typeof getCaseConfig>> | null = null;
  const caseTokens: CaseTokenView[] = [];
  for (const t of (tokens ?? []) as Record<string, unknown>[]) {
    const expiresAt = (t.expires_at as string | null) ?? null;
    if (expiresAt && expiresAt < nowIso) continue;
    let tierLabel: string | null = null;
    let groupTitle: string | null = null;
    if ((t.mode as string) === "tier" && t.tier_id) {
      if (!groups) groups = await getCaseConfig();
      const found = findCaseTier(t.tier_id as string, groups);
      if (found) { tierLabel = found.tier.label; groupTitle = found.group.title; }
    }
    caseTokens.push({
      id: t.id as string,
      mode: (t.mode as "tier" | "rarity"),
      tierId: (t.tier_id as string | null) ?? null,
      tierLabel,
      groupTitle,
      rarityFloor: (t.rarity_floor as string | null) ?? null,
      label: (t.label as string | null) ?? null,
      expiresAt,
      createdAt: t.created_at as string,
    });
  }

  // Game bonuses — aggregate active remaining per game.
  const byGame = new Map<BonusGame, { remaining: number; nextExpiry: string | null }>();
  for (const r of (bonusRows ?? []) as { game: string; amount: number; used: number; expires_at: string | null }[]) {
    if (!isBonusGame(r.game)) continue;
    if (r.expires_at && r.expires_at < nowIso) continue;
    const rem = Math.max(0, (r.amount ?? 0) - (r.used ?? 0));
    if (rem <= 0) continue;
    const cur = byGame.get(r.game) ?? { remaining: 0, nextExpiry: null };
    cur.remaining += rem;
    if (r.expires_at && (!cur.nextExpiry || r.expires_at < cur.nextExpiry)) cur.nextExpiry = r.expires_at;
    byGame.set(r.game, cur);
  }
  const gameBonuses: GameBonusView[] = [];
  for (const g of BONUS_GAMES) {
    const v = byGame.get(g);
    if (v && v.remaining > 0) gameBonuses.push({ game: g, gameLabel: BONUS_GAME_LABELS[g], remaining: v.remaining, nextExpiry: v.nextExpiry });
  }

  return { caseTokens, gameBonuses };
}

/** Enabled cases a rarity-mode token may be spent on (auto-includes new cases). */
export async function getOpenableCases(): Promise<OpenableCaseView[]> {
  // getCaseConfig() already returns only enabled groups; skip disabled tiers.
  const groups = await getCaseConfig();
  const out: OpenableCaseView[] = [];
  for (const g of groups) {
    for (const t of g.tiers) {
      if (t.enabled === false) continue;
      out.push({ tierId: t.id, label: t.label, groupTitle: g.title, price: t.price });
    }
  }
  return out;
}

/** Remaining extra plays for a game (drives the in-game bonus badge). */
export async function getMyGameBonusRemaining(game: string): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isBonusGame(game)) return 0;
  return getGameBonusRemaining(createAdminClient(), user.id, game);
}
