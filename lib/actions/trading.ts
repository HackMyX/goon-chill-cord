"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications-internal";
import type { Rarity } from "@/lib/cases";

export interface TradeItemSummary {
  id: string;
  name: string;
  rarity: Rarity;
  type: string;
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
    .select("id, item:items(id, name, rarity, type)")
    .eq("user_id", targetUserId);

  return (data ?? [])
    .filter((row) => row.item)
    .map((row) => {
      const item = row.item as unknown as { name: string; rarity: Rarity; type: string };
      return { inventoryId: row.id, name: item.name, rarity: item.rarity, type: item.type };
    });
}

/**
 * Creates a pending trade offer. Both item lists are validated against
 * *current* ownership at creation time — the real correctness-critical
 * re-check happens again in respondToTrade() at accept time, since
 * ownership can change between offer and response (e.g. the sender sells
 * the offered item elsewhere in the meantime).
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

  const { count: pendingCount } = await supabase
    .from("trades")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("sender_id", user.id)
    .eq("receiver_id", input.receiverId);

  if ((pendingCount ?? 0) >= MAX_PENDING_TRADES_PER_PAIR) {
    return {
      success: false,
      error: "Du hast bereits zu viele offene Trades mit diesem Spieler.",
    };
  }

  if (input.offeredItemIds.length > 0) {
    const { data: ownedItems } = await supabase
      .from("inventory")
      .select("id")
      .eq("user_id", user.id)
      .in("id", input.offeredItemIds);
    if (!ownedItems || ownedItems.length !== input.offeredItemIds.length) {
      return { success: false, error: "Eines der angebotenen Items gehört dir nicht (mehr)." };
    }
  }
  if (input.offeredCredits > 0) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();
    if (!profile || profile.credits < input.offeredCredits) {
      return { success: false, error: "Nicht genug Credits für dieses Angebot." };
    }
  }

  const { error } = await supabase.from("trades").insert({
    sender_id: user.id,
    receiver_id: input.receiverId,
    offered_item_ids: input.offeredItemIds,
    requested_item_ids: input.requestedItemIds,
    offered_credits: input.offeredCredits,
    requested_credits: input.requestedCredits,
    status: "pending",
  });

  if (error) return { success: false, error: "Trade konnte nicht erstellt werden." };

  const { data: senderProfile } = await supabase
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

  const { error } = await supabase
    .from("trades")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", tradeId)
    .eq("sender_id", user.id)
    .eq("status", "pending");

  if (error) return { success: false, error: "Trade konnte nicht abgebrochen werden." };

  revalidatePath("/trading");
  return { success: true };
}

/**
 * Accept/decline a trade offered *to* the current user. Acceptance is the
 * one truly destructive/transactional path here: both item lists are
 * re-validated against live ownership (not just trusted from when the
 * offer was created), then inventory rows are reassigned and credits
 * moved both ways. Uses the service-role client for the actual transfer
 * since it touches two different users' rows, which RLS would otherwise
 * block a regular user's client from doing to the *other* party.
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

  const { data: trade, error: tradeError } = await supabase
    .from("trades")
    .select("*")
    .eq("id", tradeId)
    .eq("receiver_id", user.id)
    .eq("status", "pending")
    .single();

  if (tradeError || !trade) {
    return { success: false, error: "Trade nicht gefunden oder nicht mehr offen." };
  }

  const { data: receiverProfileForNotice } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  if (!accept) {
    await supabase
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

  const admin = createAdminClient();

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
    admin.from("profiles").select("credits").eq("id", trade.sender_id).single(),
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
      payload: { tradeId, senderId: trade.sender_id, receiverId: user.id },
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
