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

// ── Credits & Items (vorher in jeder Surface inline dupliziert) ───────────────

export async function grantCredits(
  admin: Admin,
  userId: string,
  amount: number,
  _opts?: { source?: string },
): Promise<{ ok: boolean; summary: string }> {
  const amt = Math.floor(amount);
  if (!amt) return { ok: true, summary: "" };
  const { error } = await admin.rpc("increment_credits", { user_id: userId, amount: amt });
  if (error) {
    // Fallback, falls die RPC fehlt.
    const { data: p } = await admin.from("profiles").select("credits").eq("id", userId).single();
    if (p) await admin.from("profiles").update({ credits: (p.credits as number) + amt }).eq("id", userId);
  }
  return { ok: true, summary: `${amt.toLocaleString("de-DE")} CR` };
}

export async function grantItem(
  admin: Admin,
  userId: string,
  opts: { itemId?: string; rarity?: string; quantity?: number },
): Promise<{ ok: boolean; error?: string; summary: string }> {
  let itemId = opts.itemId;
  let name = "Item";
  if (!itemId && opts.rarity) {
    // Zufälliges Item der gewünschten Seltenheit.
    const { data: items } = await admin.from("items").select("id, name").eq("rarity", opts.rarity).limit(100);
    const pool = (items ?? []) as { id: string; name: string }[];
    if (pool.length > 0) { const pick = pool[Math.floor(Math.random() * pool.length)]; itemId = pick.id; name = pick.name ?? name; }
  } else if (itemId) {
    const { data: it } = await admin.from("items").select("name").eq("id", itemId).maybeSingle();
    name = (it?.name as string) ?? name;
  }
  if (!itemId) return { ok: false, error: "Kein passendes Item gefunden.", summary: "" };
  const qty = Math.max(1, Math.floor(opts.quantity ?? 1));
  const rows = Array.from({ length: qty }, () => ({ user_id: userId, item_id: itemId }));
  const { error } = await admin.from("inventory").insert(rows);
  if (error) return { ok: false, error: "Item konnte nicht vergeben werden.", summary: "" };
  return { ok: true, summary: qty > 1 ? `${qty}× ${name}` : name };
}

// ── Zentraler Reward-Dispatcher ───────────────────────────────────────────────
// Eine kanonische Belohnung, die JEDE Surface (Battle Pass, Level-Road, Daily
// Quests, Streak, Shop, Gutschein-Codes, Admin-Vergabe) verwenden kann.
// ⚠️ AGENTS: Neue Reward-Typen IMMER hier ergänzen, damit sie ÜBERALL nutzbar sind.

export type RewardSpecType =
  | "credits" | "xp" | "item" | "random_item"
  | "ability" | "name_style" | "badge" | "case_voucher" | "game_bonus";

export interface RewardSpec {
  type: RewardSpecType;
  /** credits-/xp-Betrag, game_bonus-Anzahl, item-Stückzahl. */
  amount?: number;
  itemId?: string;
  itemRarity?: string;          // random_item / item ohne festes itemId
  abilityKey?: string;
  styleKey?: string;
  badgeKey?: string;
  voucherMode?: "tier" | "rarity";
  voucherTierId?: string;
  voucherRarityFloor?: Rarity;
  bonusGame?: BonusGame;
  durationHours?: number;
}

export async function grantReward(
  admin: Admin,
  userId: string,
  spec: RewardSpec,
  source = "reward",
): Promise<{ ok: boolean; error?: string; summary: string }> {
  switch (spec.type) {
    case "credits":
      return grantCredits(admin, userId, spec.amount ?? 0, { source });
    case "xp": {
      const amt = Math.floor(spec.amount ?? 0);
      if (amt > 0) {
        try { const m = await import("@/lib/actions/level-system"); await m.awardXp(userId, amt, source); } catch { /* non-fatal */ }
      }
      return { ok: true, summary: `${amt} XP` };
    }
    case "item":
      return grantItem(admin, userId, { itemId: spec.itemId, rarity: spec.itemRarity, quantity: spec.amount });
    case "random_item":
      return grantItem(admin, userId, { rarity: spec.itemRarity, quantity: spec.amount });
    case "ability":
      return grantAbility(admin, userId, { abilityKey: spec.abilityKey ?? "", durationHours: spec.durationHours, source });
    case "name_style":
      return grantNameStyle(admin, userId, { styleKey: spec.styleKey ?? "", source });
    case "badge":
      return grantBadge(admin, userId, { badgeKey: spec.badgeKey ?? "" });
    case "case_voucher":
      return grantCaseVoucher(admin, userId, { mode: spec.voucherMode ?? "rarity", tierId: spec.voucherTierId, rarityFloor: spec.voucherRarityFloor, durationHours: spec.durationHours, source });
    case "game_bonus":
      return grantGameBonus(admin, userId, { game: spec.bonusGame ?? "plinko", amount: spec.amount ?? 1, durationHours: spec.durationHours, source });
    default:
      return { ok: false, error: "Unbekannter Reward-Typ.", summary: "" };
  }
}

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

// ── Ability / name-style / badge (shared by shop + battle pass + level) ───────

export async function grantAbility(
  admin: Admin,
  userId: string,
  opts: { abilityKey: string; durationHours?: number; source?: string; sourceDetail?: string },
): Promise<{ ok: boolean; error?: string; summary: string }> {
  if (!opts.abilityKey) return { ok: false, error: "Keine Fähigkeit.", summary: "" };
  const { data: def } = await admin.from("ability_definitions").select("name").eq("key", opts.abilityKey).maybeSingle();
  if (!def) return { ok: false, error: "Fähigkeit existiert nicht.", summary: "" };
  // Skip if already owned (abilities aren't stackable).
  const { data: owned } = await admin.from("user_abilities").select("id").eq("user_id", userId).eq("ability_key", opts.abilityKey).maybeSingle();
  if (!owned) {
    const { error } = await admin.from("user_abilities").insert({
      user_id: userId,
      ability_key: opts.abilityKey,
      source: opts.source ?? "grant",
      source_detail: opts.sourceDetail ?? null,
      expires_at: expiryFromHours(opts.durationHours),
    });
    if (error) return { ok: false, error: "Fähigkeit konnte nicht vergeben werden.", summary: "" };
  }
  return { ok: true, summary: `Fähigkeit: ${(def.name as string) ?? opts.abilityKey}` };
}

export async function grantNameStyle(
  admin: Admin,
  userId: string,
  opts: { styleKey: string; source?: string },
): Promise<{ ok: boolean; error?: string; summary: string }> {
  if (!opts.styleKey) return { ok: false, error: "Kein Name-Style.", summary: "" };
  try {
    const { ensureStyleInDb } = await import("@/lib/actions/name-styles");
    await ensureStyleInDb(opts.styleKey, admin);
  } catch {
    return { ok: false, error: "Name-Style konnte nicht angelegt werden.", summary: "" };
  }
  const { error } = await admin.from("user_name_styles")
    .upsert({ user_id: userId, style_key: opts.styleKey, source: opts.source ?? "grant" }, { onConflict: "user_id,style_key", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Name-Style konnte nicht vergeben werden.", summary: "" };
  try { const m = await import("@/lib/actions/badges"); void m.checkAndAwardNameStyleBadges(userId); } catch { /* non-fatal */ }
  return { ok: true, summary: `Name-Style: ${opts.styleKey}` };
}

export async function grantBadge(
  admin: Admin,
  userId: string,
  opts: { badgeKey: string },
): Promise<{ ok: boolean; error?: string; summary: string }> {
  if (!opts.badgeKey) return { ok: false, error: "Kein Badge.", summary: "" };
  const { data: def } = await admin.from("badge_definitions").select("label").eq("key", opts.badgeKey).maybeSingle();
  if (!def) return { ok: false, error: "Badge existiert nicht.", summary: "" };
  const { error } = await admin.from("user_badges")
    .upsert({ user_id: userId, badge_key: opts.badgeKey }, { onConflict: "user_id,badge_key", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Badge konnte nicht vergeben werden.", summary: "" };
  try { const m = await import("@/lib/actions/prio-badges"); await m.recomputeAutoPrioBadges(userId); } catch { /* non-fatal */ }
  return { ok: true, summary: `Badge: ${(def.label as string) ?? opts.badgeKey}` };
}
