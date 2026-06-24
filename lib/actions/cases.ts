"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findCaseTier, pickRarity, RARITY_LABELS } from "@/lib/cases";
import { getCaseConfig } from "@/lib/cases-config";
import { notifyUser } from "@/lib/notifications-internal";
import { broadcastSystemWin } from "@/lib/actions/global-chat";

export interface WonItem {
  id: string;
  name: string;
  rarity: string;
  type: string;
  image_url: string | null;
  damage: number | null;
  armor: number | null;
  perk_type: string | null;
  perk_magnitude: number | null;
  shield_hp: number | null;
  shield_regen_cooldown_sec: number | null;
}

export interface OpenCaseResult {
  success: boolean;
  error?: string;
  item?: WonItem;
  newCredits?: number;
}

export async function openCase(tierId: string): Promise<OpenCaseResult> {
  const caseGroups = await getCaseConfig();
  const found = findCaseTier(tierId, caseGroups);
  if (!found) {
    return { success: false, error: "Unbekanntes Case." };
  }
  const { group, tier } = found;

  if (tier.enabled === false) {
    return { success: false, error: "Dieses Case ist aktuell deaktiviert." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Du musst eingeloggt sein." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("credits, cases_opened")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, error: "Profil konnte nicht geladen werden." };
  }

  if (profile.credits < tier.price) {
    return { success: false, error: "Nicht genug Credits für dieses Case." };
  }

  const rolledRarity = pickRarity(tier.rarityWeights);

  // Item pool resolution:
  // 1. itemIds (specific items pinned via admin) — highest priority
  // 2. itemTypes (category filter set via admin) — falls back to group default
  const useSpecificItems = tier.itemIds && tier.itemIds.length > 0;
  const itemTypes = tier.itemTypes ?? group.itemTypes;
  const FULL_SELECT = "id, name, rarity, type, image_url, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec";

  let { data: pool, error: poolError } = useSpecificItems
    ? await supabase
        .from("items")
        .select(FULL_SELECT)
        .in("id", tier.itemIds!)
        .eq("rarity", rolledRarity)
        .limit(500)
    : await supabase
        .from("items")
        .select(FULL_SELECT)
        .eq("rarity", rolledRarity)
        .in("type", itemTypes)
        .limit(500);

  // Fallback if stat columns haven't been migrated yet — still open the case.
  if (poolError) {
    const retry = useSpecificItems
      ? await supabase
          .from("items")
          .select("id, name, rarity, type, image_url")
          .in("id", tier.itemIds!)
          .eq("rarity", rolledRarity)
          .limit(500)
      : await supabase
          .from("items")
          .select("id, name, rarity, type, image_url")
          .eq("rarity", rolledRarity)
          .in("type", itemTypes)
          .limit(500);
    pool = (retry.data ?? []).map((row) => ({
      ...row,
      damage: null, armor: null, perk_type: null,
      perk_magnitude: null, shield_hp: null, shield_regen_cooldown_sec: null,
    }));
    poolError = retry.error;
  }

  // Fallback: rolled rarity has no matching items in the pool — broaden to
  // any rarity so the case never hard-errors while the catalogue is filling up.
  if (!poolError && (!pool || pool.length === 0)) {
    const fallback = useSpecificItems
      ? await supabase
          .from("items")
          .select(FULL_SELECT)
          .in("id", tier.itemIds!)
          .limit(500)
      : await supabase
          .from("items")
          .select(FULL_SELECT)
          .in("type", itemTypes)
          .limit(500);
    pool = fallback.data;
    poolError = fallback.error;
  }

  if (poolError || !pool || pool.length === 0) {
    return {
      success: false,
      error: "Für dieses Case sind aktuell keine Items hinterlegt.",
    };
  }

  const wonItem = pool[Math.floor(Math.random() * pool.length)];
  const newCredits = profile.credits - tier.price;

  // Guard against a race where credits changed between the read above and
  // this write (e.g. a double click) by re-checking the balance atomically.
  const { data: updatedRows, error: updateError } = await supabase
    .from("profiles")
    .update({
      credits: newCredits,
      cases_opened: profile.cases_opened + 1,
    })
    .eq("id", user.id)
    .gte("credits", tier.price)
    .select("credits");

  if (updateError || !updatedRows || updatedRows.length === 0) {
    return { success: false, error: "Nicht genug Credits für dieses Case." };
  }

  const { error: inventoryError } = await supabase
    .from("inventory")
    .insert({ user_id: user.id, item_id: wonItem.id });

  if (inventoryError) {
    // Roll back the credit deduction since the item was never granted.
    await supabase
      .from("profiles")
      .update({ credits: profile.credits, cases_opened: profile.cases_opened })
      .eq("id", user.id);
    return { success: false, error: "Item konnte nicht vergeben werden." };
  }

  // Audit trail — best-effort via the service-role client (so a user can't
  // tamper with their own log) and never blocks/fails the case-open itself.
  try {
    await createAdminClient().from("audit_logs").insert({
      user_id: user.id,
      action: "case_open",
      payload: {
        tierId: tier.id,
        groupId: group.id,
        price: tier.price,
        wonItemId: wonItem.id,
        wonItemName: wonItem.name,
        rarity: wonItem.rarity,
        newCredits: updatedRows[0].credits,
      },
    });
  } catch {
    // audit_logs table may not exist yet — never let logging break the flow.
  }

  revalidatePath("/");

  // Every case open gets a notification now — full, accurate history of
  // every drop, not just the rare highlights.
  const rarityLabel = RARITY_LABELS[wonItem.rarity as keyof typeof RARITY_LABELS] ?? wonItem.rarity;
  await notifyUser({
    userId: user.id,
    type: "case_opened",
    title:
      wonItem.rarity === "mythisch" || wonItem.rarity === "ultra"
        ? `${rarityLabel}-Drop!`
        : "Case geöffnet",
    message: `Du hast „${wonItem.name}" (${rarityLabel}) gezogen!`,
    link: "/garderobe",
  });

  // Broadcast ultra/mythisch wins globally
  if (wonItem.rarity === "ultra" || wonItem.rarity === "mythisch") {
    const { data: p } = await (await import("@/lib/supabase/server")).createClient()
      .then((c) => c.from("profiles").select("username").eq("id", user.id).single());
    await broadcastSystemWin({
      username: p?.username ?? "Jemand",
      itemName: wonItem.name,
      rarity: wonItem.rarity,
      caseName: tier.label,
    });
  }

  return {
    success: true,
    item: wonItem,
    newCredits: updatedRows[0].credits,
  };
}

// ---------------------------------------------------------------------------
// Skip-fee: charge credits when the player clicks "Sofort anzeigen"
// ---------------------------------------------------------------------------

export interface ChargeSkipFeeResult {
  success: boolean;
  error?: string;
  newCredits?: number;
}

export async function chargeSkipFee(tierId: string): Promise<ChargeSkipFeeResult> {
  const caseGroups = await getCaseConfig();
  const found = findCaseTier(tierId, caseGroups);
  if (!found) return { success: false, error: "Unbekanntes Case." };
  const { tier } = found;
  const cost = tier.previewCost ?? 0;
  if (cost <= 0) return { success: true }; // free — no DB round-trip needed

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const { data: current } = await supabase
    .from("profiles").select("credits").eq("id", user.id).single();
  if (!current || current.credits < cost) {
    return { success: false, error: "Nicht genug Credits für Sofort-Anzeige." };
  }

  const { data: rows, error } = await supabase
    .from("profiles")
    .update({ credits: current.credits - cost })
    .eq("id", user.id)
    .gte("credits", cost)
    .select("credits");

  if (error || !rows || rows.length === 0) {
    return { success: false, error: "Nicht genug Credits für Sofort-Anzeige." };
  }
  return { success: true, newCredits: rows[0].credits };
}

// ---------------------------------------------------------------------------
// Batch open: open N cases of the same tier atomically
// ---------------------------------------------------------------------------

export interface OpenCaseBatchResult {
  success: boolean;
  error?: string;
  items?: WonItem[];
  newCredits?: number;
  openedCount?: number;
}

export async function openCaseBatch(tierId: string, count: number): Promise<OpenCaseBatchResult> {
  const safeCount = Math.max(2, Math.min(10, Math.round(count)));
  const caseGroups = await getCaseConfig();
  const found = findCaseTier(tierId, caseGroups);
  if (!found) return { success: false, error: "Unbekanntes Case." };
  const { group, tier } = found;

  if (tier.enabled === false) return { success: false, error: "Dieses Case ist deaktiviert." };
  const maxAllowed = tier.multiOpenMax ?? 10;
  if (safeCount > maxAllowed) {
    return { success: false, error: `Maximal ${maxAllowed} Cases gleichzeitig erlaubt.` };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const { data: profile } = await supabase
    .from("profiles").select("credits, cases_opened").eq("id", user.id).single();
  if (!profile) return { success: false, error: "Profil nicht gefunden." };

  const totalCost = tier.price * safeCount;
  if (profile.credits < totalCost) {
    return { success: false, error: `Nicht genug Credits (benötigt: ${totalCost.toLocaleString("de-DE")}).` };
  }

  // Load item pool once, reuse for all N rolls
  const useSpecificItems = tier.itemIds && tier.itemIds.length > 0;
  const itemTypes = tier.itemTypes ?? group.itemTypes;
  const FULL_SELECT = "id, name, rarity, type, image_url, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec";
  const { data: fullPool } = useSpecificItems
    ? await supabase.from("items").select(FULL_SELECT).in("id", tier.itemIds!).limit(500)
    : await supabase.from("items").select(FULL_SELECT).in("type", itemTypes).limit(500);

  if (!fullPool || fullPool.length === 0) {
    return { success: false, error: "Keine Items im Pool gefunden." };
  }

  // Roll N items, each filtered by rolled rarity, with fallback to any rarity
  const wonItems: WonItem[] = [];
  for (let i = 0; i < safeCount; i++) {
    const rarity = pickRarity(tier.rarityWeights);
    const rarityPool = fullPool.filter((it) => it.rarity === rarity);
    const draw = rarityPool.length > 0 ? rarityPool : fullPool;
    wonItems.push(draw[Math.floor(Math.random() * draw.length)] as WonItem);
  }

  // Atomic deduction: gte guard prevents double-spend
  const { data: updated, error: updateErr } = await supabase
    .from("profiles")
    .update({ credits: profile.credits - totalCost, cases_opened: profile.cases_opened + safeCount })
    .eq("id", user.id)
    .gte("credits", totalCost)
    .select("credits");

  if (updateErr || !updated || updated.length === 0) {
    return { success: false, error: "Credits konnten nicht abgezogen werden." };
  }

  // Grant all items to inventory in one batch insert
  await supabase.from("inventory").insert(
    wonItems.map((item) => ({ user_id: user.id, item_id: item.id }))
  );

  // Audit — best-effort
  try {
    await createAdminClient().from("audit_logs").insert({
      user_id: user.id,
      action: "case_batch_open",
      payload: { tierId: tier.id, count: safeCount, totalCost, wonItemIds: wonItems.map((i) => i.id) },
    });
  } catch { /* ignore */ }

  revalidatePath("/");

  // Single summary notification for batch opens
  const bestRarity = (["ultra", "mythisch", "selten", "normal"] as const).find(
    (r) => wonItems.some((i) => i.rarity === r)
  ) ?? "normal";
  const bestLabel = RARITY_LABELS[bestRarity];
  await notifyUser({
    userId: user.id,
    type: "case_opened",
    title: bestRarity === "ultra" || bestRarity === "mythisch" ? `${bestLabel}-Drop in Batch!` : `${safeCount}× Case geöffnet`,
    message: `Du hast ${safeCount}× Cases geöffnet. Bestes Item: „${wonItems.find((i) => i.rarity === bestRarity)?.name ?? "Unbekannt"}" (${bestLabel}).`,
    link: "/garderobe",
  });

  // Broadcast ultra/mythisch wins from batch
  if (bestRarity === "ultra" || bestRarity === "mythisch") {
    const bestItem = wonItems.find((i) => i.rarity === bestRarity);
    const { data: p } = await (await import("@/lib/supabase/server")).createClient()
      .then((c) => c.from("profiles").select("username").eq("id", user.id).single());
    await broadcastSystemWin({
      username: p?.username ?? "Jemand",
      itemName: bestItem?.name ?? "Unbekanntes Item",
      rarity: bestRarity,
      caseName: tier.label,
    });
  }

  return {
    success: true,
    items: wonItems,
    newCredits: updated[0].credits,
    openedCount: safeCount,
  };
}
