"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BONUS_GAME_LABELS, type BonusGame } from "@/lib/rewards-grant";

/**
 * Aktive Spiel-Boni des eingeloggten Users als „Karten" — für den In-Game-Dock
 * (Button + Popup) und überall, wo aktive Boni visualisiert werden. Eine Zeile
 * pro Bonus-Gutschein = eine Karte (mehrere gleichzeitig möglich).
 */
export interface ActiveBonusCard {
  id: string;
  game: BonusGame;
  gameLabel: string;
  remaining: number;
  total: number;
  used: number;
  expiresAt: string | null;
  source: string | null;
  theme: string | null;
  rarity: string | null;
  title: string | null;
  subtitle: string | null;
}

export async function getActiveBonusCards(game?: BonusGame): Promise<ActiveBonusCard[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  let q = admin
    .from("game_bonus_allowances")
    .select("id, game, amount, used, expires_at, source, card_theme, card_rarity, card_title, card_subtitle")
    .eq("user_id", user.id);
  if (game) q = q.eq("game", game);
  const { data } = await q;

  const now = Date.now();
  const out: ActiveBonusCard[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const expiresAt = (r.expires_at as string | null) ?? null;
    if (expiresAt && new Date(expiresAt).getTime() <= now) continue;
    const total = Number(r.amount ?? 0);
    const used = Number(r.used ?? 0);
    const remaining = Math.max(0, total - used);
    if (remaining <= 0) continue;
    const g = r.game as BonusGame;
    out.push({
      id: String(r.id),
      game: g,
      gameLabel: BONUS_GAME_LABELS[g] ?? String(r.game),
      remaining, total, used,
      expiresAt,
      source: (r.source as string | null) ?? null,
      theme: (r.card_theme as string | null) ?? null,
      rarity: (r.card_rarity as string | null) ?? null,
      title: (r.card_title as string | null) ?? null,
      subtitle: (r.card_subtitle as string | null) ?? null,
    });
  }
  // Bald ablaufende zuerst, dann unbegrenzte.
  out.sort((a, b) => {
    if (a.expiresAt && b.expiresAt) return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    if (a.expiresAt) return -1;
    if (b.expiresAt) return 1;
    return b.remaining - a.remaining;
  });
  return out;
}
