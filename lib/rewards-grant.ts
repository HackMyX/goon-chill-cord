import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Rarity } from "@/lib/cases";
import { RARITY_LABELS } from "@/lib/cases";

/**
 * Central granter for the two cross-cutting reward kinds that can be embedded in
 * EVERY reward system (voucher codes, admin grant, and — Phase 2 — battle pass,
 * streak, daily quests, level). Keeping the actual DB writes here means each of
 * those switch-statements just calls one function instead of re-implementing the
 * logic (and the bugs) five times.
 *
 *  - case_voucher  → a free case-open token (case_tokens row)
 *  - game_bonus    → a consumable pool of extra plays at a rate-limited game
 *                    (game_bonus_allowances row), spent one at a time when the
 *                    player is over their normal hourly/daily cap.
 */

type Admin = ReturnType<typeof createAdminClient>;

// ── Game bonus ───────────────────────────────────────────────────────────────

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

function expiryFromHours(durationHours?: number): string | null {
  const h = Math.max(0, Math.floor(durationHours ?? 0));
  return h > 0 ? new Date(Date.now() + h * 3_600_000).toISOString() : null;
}

export async function grantGameBonus(
  admin: Admin,
  userId: string,
  opts: { game: BonusGame; amount: number; durationHours?: number; source?: string; label?: string },
): Promise<{ ok: boolean; error?: string; summary: string }> {
  const amount = Math.max(1, Math.floor(opts.amount));
  if (!isBonusGame(opts.game)) return { ok: false, error: "Unbekanntes Spiel für Bonus.", summary: "" };
  const { error } = await admin.from("game_bonus_allowances").insert({
    user_id: userId,
    game: opts.game,
    amount,
    label: opts.label ?? null,
    source: opts.source ?? "voucher",
    expires_at: expiryFromHours(opts.durationHours),
  });
  if (error) return { ok: false, error: "Bonus konnte nicht vergeben werden.", summary: "" };
  const dur = (opts.durationHours ?? 0) > 0 ? ` (${Math.floor(opts.durationHours!)}h)` : "";
  return { ok: true, summary: `+${amount} ${BONUS_GAME_LABELS[opts.game]}${dur}` };
}

/** Remaining (unspent, unexpired) extra plays for a game across all the user's bonuses. */
export async function getGameBonusRemaining(admin: Admin, userId: string, game: BonusGame): Promise<number> {
  const { data } = await admin
    .from("game_bonus_allowances")
    .select("amount, used, expires_at")
    .eq("user_id", userId)
    .eq("game", game);
  const now = Date.now();
  let remaining = 0;
  for (const r of (data ?? []) as { amount: number; used: number; expires_at: string | null }[]) {
    if (r.expires_at && new Date(r.expires_at).getTime() <= now) continue;
    remaining += Math.max(0, (r.amount ?? 0) - (r.used ?? 0));
  }
  return remaining;
}

/** Atomically spend ONE extra play (oldest-expiring first). Returns true if one was available. */
export async function consumeGameBonus(admin: Admin, userId: string, game: BonusGame): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("consume_game_bonus", { p_user_id: userId, p_game: game });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

// ── Case voucher ─────────────────────────────────────────────────────────────

export interface CaseVoucherSpec {
  mode: "tier" | "rarity";
  tierId?: string;        // mode='tier'
  rarityFloor?: Rarity;   // mode='rarity'
  durationHours?: number;
  source?: string;
  label?: string;
}

export async function grantCaseVoucher(
  admin: Admin,
  userId: string,
  spec: CaseVoucherSpec,
): Promise<{ ok: boolean; error?: string; summary: string }> {
  if (spec.mode === "tier") {
    if (!spec.tierId) return { ok: false, error: "Case-Gutschein ohne Case.", summary: "" };
  } else if (spec.mode === "rarity") {
    if (!spec.rarityFloor) return { ok: false, error: "Case-Gutschein ohne Seltenheitsstufe.", summary: "" };
  } else {
    return { ok: false, error: "Ungültiger Case-Gutschein-Modus.", summary: "" };
  }
  const { error } = await admin.from("case_tokens").insert({
    user_id: userId,
    mode: spec.mode,
    tier_id: spec.mode === "tier" ? spec.tierId : null,
    rarity_floor: spec.mode === "rarity" ? spec.rarityFloor : null,
    label: spec.label ?? null,
    source: spec.source ?? "voucher",
    expires_at: expiryFromHours(spec.durationHours),
  });
  if (error) return { ok: false, error: "Case-Gutschein konnte nicht vergeben werden.", summary: "" };
  const dur = (spec.durationHours ?? 0) > 0 ? ` (${Math.floor(spec.durationHours!)}h)` : "";
  const what = spec.mode === "tier"
    ? "Gratis-Case"
    : `Gratis-Case (mind. ${RARITY_LABELS[spec.rarityFloor!] ?? spec.rarityFloor})`;
  return { ok: true, summary: `🎟️ ${what}${dur}` };
}
