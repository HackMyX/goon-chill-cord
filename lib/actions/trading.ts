"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications-internal";
import { logDebugEvent } from "@/lib/debug-log-server";
import type { Rarity } from "@/lib/cases";

/** Plain `console.error`, not lib/debug.ts's `debugError` — that helper is
 * guarded with `if (typeof window === "undefined") return`, i.e. it's a
 * deliberate no-op on the server. These calls run inside "use server"
 * actions, so a `debugError` here would silently log nothing; this is
 * what actually shows up in the `next dev` terminal. */
function logServerError(scope: string, message: string, detail?: string) {
  console.error(`[${scope}] ${message}`, detail ?? "");
  void logDebugEvent({ scope, message, detail });
}

export interface TradeItemSummary {
  id: string;
  name: string;
  rarity: Rarity;
  type: string;
  damage?: number | null;
  armor?: number | null;
  perk_type?: string | null;
  perk_magnitude?: number | null;
  shield_hp?: number | null;
  shield_regen_cooldown_sec?: number | null;
}

export interface TradeOffer {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  offeredItems: TradeItemSummary[];
  requestedItems: TradeItemSummary[];
  offeredCredits: number;
  requestedCredits: number;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
}

export interface TradingActionResult {
  success: boolean;
  error?: string;
}

const MAX_PENDING_TRADES_PER_PAIR = 3;

export interface OwnedItemSummary {
  inventoryId: string;
  name: string;
  rarity: Rarity;
  type: string;
  damage?: number | null;
  armor?: number | null;
  perk_type?: string | null;
  perk_magnitude?: number | null;
  shield_hp?: number | null;
  shield_regen_cooldown_sec?: number | null;
}

/** Fetched on demand when the player picker selects someone — not joined
 * upfront for every player on the page, since that'd mean loading every
 * registered user's full inventory just to render a picker list. */
export async function getPlayerInventoryForTrade(
  targetUserId: string
): Promise<OwnedItemSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("inventory")
    .select("id, item:items(id, name, rarity, type, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec)")
    .eq("user_id", targetUserId);

  return (data ?? [])
    .filter((row) => row.item)
    .map((row) => {
      const item = row.item as unknown as { name: string; rarity: Rarity; type: string; damage?: number | null; armor?: number | null; perk_type?: string | null; perk_magnitude?: number | null; shield_hp?: number | null; shield_regen_cooldown_sec?: number | null };
      return { inventoryId: row.id, name: item.name, rarity: item.rarity, type: item.type, damage: item.damage, armor: item.armor, perk_type: item.perk_type, perk_magnitude: item.perk_magnitude, shield_hp: item.shield_hp, shield_regen_cooldown_sec: item.shield_regen_cooldown_sec };
    });
}

/**
 * Creates a pending trade offer. Both item lists are validated against
 * *current* ownership at creation time — the real correctness-critical
 * re-check happens again in respondToTrade() at accept time, since
 * ownership can change between offer and response (e.g. the sender sells
 * the offered item elsewhere in the meantime).
 *
 * Everything here runs on the service-role client, not the regular
 * RLS-bound one — `trades` is a brand-new table with no RLS policies of
 * its own, so a regular `authenticated`-role client has no defined access
 * to it at all and every query against it would silently fail. Ownership
 * is still fully checked (against the *caller's own* id, taken from their
 * verified session) before anything is written, so this isn't bypassing
 * any actual authorization — it's just not relying on RLS for a table
 * that was never configured to use it.
 */
export async function createTradeOffer(input: {
  receiverId: string;
  offeredItemIds: string[];
  requestedItemIds: string[];
  offeredCredits: number;
  requestedCredits: number;
}): Promise<TradingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  if (input.receiverId === user.id) {
    return { success: false, error: "Du kannst keinen Trade mit dir selbst starten." };
  }
  if (
    input.offeredItemIds.length === 0 &&
    input.requestedItemIds.length === 0 &&
    input.offeredCredits <= 0 &&
    input.requestedCredits <= 0
  ) {
    return { success: false, error: "Der Trade ist leer — biete oder fordere mindestens etwas an." };
  }
  if (input.offeredCredits < 0 || input.requestedCredits < 0) {
    return { success: false, error: "Ungültiger Credits-Betrag." };
  }

  const admin = createAdminClient();

  const { data: receiverProfile } = await admin
    .from("profiles")
    .select("accepts_trades")
    .eq("id", input.receiverId)
    .single();
  if (receiverProfile && receiverProfile.accepts_trades === false) {
    return { success: false, error: "Dieser Spieler nimmt aktuell keine Trade-Anfragen an." };
  }

  const { count: pendingCount, error: pendingError } = await admin
    .from("trades")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("sender_id", user.id)
    .eq("receiver_id", input.receiverId);
  if (pendingError) logServerError("Trading", "pending-count query failed", pendingError.message);

  if ((pendingCount ?? 0) >= MAX_PENDING_TRADES_PER_PAIR) {
    return {
      success: false,
      error: "Du hast bereits zu viele offene Trades mit diesem Spieler.",
    };
  }

  if (input.offeredItemIds.length > 0) {
    const { data: ownedItems } = await admin
      .from("inventory")
      .select("id")
      .eq("user_id", user.id)
      .in("id", input.offeredItemIds);
    if (!ownedItems || ownedItems.length !== input.offeredItemIds.length) {
      return { success: false, error: "Eines der angebotenen Items gehört dir nicht (mehr)." };
    }
  }
  if (input.offeredCredits > 0) {
    const { data: profile } = await admin
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();
    if (!profile || profile.credits < input.offeredCredits) {
      return { success: false, error: "Nicht genug Credits für dieses Angebot." };
    }
  }

  const { error } = await admin.from("trades").insert({
    sender_id: user.id,
    receiver_id: input.receiverId,
    offered_item_ids: input.offeredItemIds,
    requested_item_ids: input.requestedItemIds,
    offered_credits: input.offeredCredits,
    requested_credits: input.requestedCredits,
    status: "pending",
  });

  if (error) {
    logServerError("Trading", "createTradeOffer insert failed", error.message);
    return { success: false, error: "Trade konnte nicht erstellt werden." };
  }

  const { data: senderProfile } = await admin
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();
  await notifyUser({
    userId: input.receiverId,
    type: "trade_offer",
    title: "Neue Trade-Anfrage",
    message: `${senderProfile?.username ?? "Ein Spieler"} hat dir einen Trade angeboten.`,
    link: "/trading",
  });

  revalidatePath("/trading");
  return { success: true };
}

export async function cancelTrade(tradeId: string): Promise<TradingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();
  const { data: trade, error } = await admin
    .from("trades")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", tradeId)
    .eq("sender_id", user.id)
    .eq("status", "pending")
    .select("receiver_id")
    .single();

  if (error || !trade) {
    if (error) logServerError("Trading", "cancelTrade failed", error.message);
    return { success: false, error: "Trade konnte nicht abgebrochen werden." };
  }

  const { data: senderProfile } = await admin.from("profiles").select("username").eq("id", user.id).single();
  await notifyUser({
    userId: trade.receiver_id,
    type: "trade_cancelled",
    title: "Trade zurückgezogen",
    message: `${senderProfile?.username ?? "Ein Spieler"} hat seine Trade-Anfrage an dich zurückgezogen.`,
    link: "/trading",
  });

  revalidatePath("/trading");
  return { success: true };
}

/**
 * Accept/decline a trade offered *to* the current user. Acceptance is the
 * one truly destructive/transactional path here: both item lists are
 * re-validated against live ownership (not just trusted from when the
 * offer was created), then inventory rows are reassigned and credits
 * moved both ways. Runs entirely on the service-role client for the same
 * "trades has no RLS policies" reason as createTradeOffer above — and
 * additionally because this step touches *two different users'* rows,
 * which a regular per-user client could never do regardless.
 */
export async function respondToTrade(
  tradeId: string,
  accept: boolean
): Promise<TradingActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const admin = createAdminClient();

  const { data: trade, error: tradeError } = await admin
    .from("trades")
    .select("*")
    .eq("id", tradeId)
    .eq("receiver_id", user.id)
    .eq("status", "pending")
    .single();

  if (tradeError || !trade) {
    if (tradeError) logServerError("Trading", "respondToTrade lookup failed", tradeError.message);
    return { success: false, error: "Trade nicht gefunden oder nicht mehr offen." };
  }

  const { data: receiverProfileForNotice } = await admin
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  if (!accept) {
    await admin
      .from("trades")
      .update({ status: "declined", resolved_at: new Date().toISOString() })
      .eq("id", tradeId);
    await notifyUser({
      userId: trade.sender_id,
      type: "trade_declined",
      title: "Trade abgelehnt",
      message: `${receiverProfileForNotice?.username ?? "Ein Spieler"} hat deinen Trade abgelehnt.`,
      link: "/trading",
    });
    revalidatePath("/trading");
    return { success: true };
  }

  // Re-validate ownership *now*, not at offer-creation time.
  if (trade.offered_item_ids.length > 0) {
    const { data: rows } = await admin
      .from("inventory")
      .select("id")
      .eq("user_id", trade.sender_id)
      .in("id", trade.offered_item_ids);
    if (!rows || rows.length !== trade.offered_item_ids.length) {
      return { success: false, error: "Der Anbieter besitzt eines der Items nicht mehr." };
    }
  }
  if (trade.requested_item_ids.length > 0) {
    const { data: rows } = await admin
      .from("inventory")
      .select("id")
      .eq("user_id", user.id)
      .in("id", trade.requested_item_ids);
    if (!rows || rows.length !== trade.requested_item_ids.length) {
      return { success: false, error: "Du besitzt eines der angeforderten Items nicht mehr." };
    }
  }

  const [{ data: senderProfile }, { data: receiverProfile }] = await Promise.all([
    admin.from("profiles").select("credits, username").eq("id", trade.sender_id).single(),
    admin.from("profiles").select("credits").eq("id", user.id).single(),
  ]);

  if (!senderProfile || !receiverProfile) {
    return { success: false, error: "Profile konnten nicht geladen werden." };
  }
  if (senderProfile.credits < trade.offered_credits) {
    return { success: false, error: "Der Anbieter hat nicht mehr genug Credits." };
  }
  if (receiverProfile.credits < trade.requested_credits) {
    return { success: false, error: "Du hast nicht genug Credits für diesen Trade." };
  }

  // Item ownership swap — reassign inventory.user_id both ways.
  if (trade.offered_item_ids.length > 0) {
    const { error } = await admin
      .from("inventory")
      .update({ user_id: user.id, equipped: false })
      .in("id", trade.offered_item_ids);
    if (error) return { success: false, error: "Item-Transfer fehlgeschlagen." };
  }
  if (trade.requested_item_ids.length > 0) {
    const { error } = await admin
      .from("inventory")
      .update({ user_id: trade.sender_id, equipped: false })
      .in("id", trade.requested_item_ids);
    if (error) return { success: false, error: "Item-Transfer fehlgeschlagen." };
  }

  // Credits swap.
  const netForSender = trade.requested_credits - trade.offered_credits;
  const netForReceiver = -netForSender;
  await admin
    .from("profiles")
    .update({ credits: senderProfile.credits + netForSender })
    .eq("id", trade.sender_id);
  await admin
    .from("profiles")
    .update({ credits: receiverProfile.credits + netForReceiver })
    .eq("id", user.id);

  await admin
    .from("trades")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", tradeId);

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "trade_accepted",
      payload: {
        tradeId,
        senderId: trade.sender_id,
        senderUsername: (senderProfile as unknown as { username?: string })?.username ?? null,
        receiverId: user.id,
        receiverUsername: receiverProfileForNotice?.username ?? null,
      },
    });
  } catch {
    // best-effort
  }

  await notifyUser({
    userId: trade.sender_id,
    type: "trade_accepted",
    title: "Trade angenommen!",
    message: `${receiverProfileForNotice?.username ?? "Ein Spieler"} hat deinen Trade angenommen.`,
    link: "/trading",
  });

  revalidatePath("/trading");
  revalidatePath("/garderobe");
  revalidatePath("/");
  return { success: true };
}
