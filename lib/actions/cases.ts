"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findCaseTier, pickRarity, RARITY_LABELS, type CaseExtraDrop } from "@/lib/cases";
import { getCaseConfig } from "@/lib/cases-config";
import { notifyUser } from "@/lib/notifications-internal";
import { broadcastSystemWin } from "@/lib/actions/global-chat";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Attempt a bonus name-style drop after a case open.
 * Returns the style key if won, null otherwise.
 * Never throws — always best-effort.
 */
async function tryDropNameStyle(
  userId: string,
  rarity: string,
  supabase: SupabaseClient
): Promise<string | null> {
  try {
    // 1. Check rarity config for drop probability
    const { data: rarityConf } = await supabase
      .from("name_style_rarity_config")
      .select("case_drop_enabled, case_drop_weight")
      .eq("rarity", rarity)
      .single();

    if (!rarityConf?.case_drop_enabled || !rarityConf.case_drop_weight) return null;

    // 2. Roll against the probability
    if (Math.random() * 100 >= rarityConf.case_drop_weight) return null;

    // 3. Find eligible styles for this rarity
    const { data: styles } = await supabase
      .from("name_styles")
      .select("key")
      .eq("can_win_from_case", true)
      .eq("rarity", rarity)
      .limit(200);

    if (!styles || styles.length === 0) return null;

    // 4. Pick a random one the user doesn't already own
    const { data: owned } = await supabase
      .from("user_name_styles")
      .select("style_key")
      .eq("user_id", userId);

    const ownedKeys = new Set((owned ?? []).map((r) => r.style_key));
    const eligible = styles.filter((s) => !ownedKeys.has(s.key));
    if (eligible.length === 0) return null;

    const picked = eligible[Math.floor(Math.random() * eligible.length)];

    // 5. Grant the style (ensure FK target exists first)
    const { ensureStyleInDb } = await import("@/lib/actions/name-styles");
    await ensureStyleInDb(picked.key);
    const { error } = await supabase.from("user_name_styles").insert({
      user_id: userId,
      style_key: picked.key,
      source: "won",
    });

    if (error) return null;
    return picked.key;
  } catch {
    return null;
  }
}

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

/** A resolved case result — either a catalogue item or a configurable extra drop. */
export type WonDrop =
  | { kind: "item"; rarity: string; name: string; item: WonItem }
  | { kind: "credits"; rarity: string; name: string; amount: number }
  | { kind: "name_style"; rarity: string; name: string; styleKey: string }
  | { kind: "ability"; rarity: string; name: string; abilityKey: string; icon?: string }
  | { kind: "badge"; rarity: string; name: string; badgeKey: string; badgeText: string };

export interface OpenCaseResult {
  success: boolean;
  error?: string;
  /** Present for item drops (backward compat). */
  item?: WonItem;
  /** Present for every drop kind (item + non-item). */
  drop?: WonDrop;
  newCredits?: number;
}

/**
 * Picks an extra (non-item) drop for the rolled rarity, or null if the roll
 * landed on the item pool. Items each count as 1 ticket; each extra drop adds
 * `weight` tickets to its rarity bucket.
 */
function pickExtraDrop(
  extras: CaseExtraDrop[],
  rolledRarity: string,
  itemPoolSize: number,
): CaseExtraDrop | null {
  const bucket = extras.filter((d) => d.rarity === rolledRarity && d.weight > 0);
  const extraWeight = bucket.reduce((s, d) => s + d.weight, 0);
  if (extraWeight <= 0) return null;
  // If the pool has no items, extras get the whole bucket.
  const total = itemPoolSize + extraWeight;
  const roll = Math.random() * total;
  if (roll < itemPoolSize) return null;
  let r = roll - itemPoolSize;
  for (const d of bucket) {
    if (r < d.weight) return d;
    r -= d.weight;
  }
  return bucket[bucket.length - 1] ?? null;
}

/**
 * Grants a non-item drop using the service-role client. Mirrors the Battle-Pass
 * reward-grant logic exactly so behaviour is consistent across the app.
 * Returns the WonDrop on success, or an error string.
 */
async function grantExtraDrop(
  admin: SupabaseClient,
  userId: string,
  drop: CaseExtraDrop,
  sourceLabel: string,
): Promise<{ ok: true; won: WonDrop } | { ok: false; error: string }> {
  switch (drop.kind) {
    case "credits": {
      const amount = drop.amount ?? 0;
      if (amount <= 0) return { ok: false, error: "Credits-Drop ohne Betrag." };
      const { data: prof } = await admin.from("profiles").select("credits").eq("id", userId).single();
      if (!prof) return { ok: false, error: "Profil nicht gefunden." };
      const { error } = await admin.from("profiles").update({ credits: (prof.credits as number) + amount }).eq("id", userId);
      if (error) return { ok: false, error: "Credits-Gutschrift fehlgeschlagen." };
      return { ok: true, won: { kind: "credits", rarity: drop.rarity, name: drop.label || `${amount.toLocaleString("de-DE")} Credits`, amount } };
    }
    case "name_style": {
      const styleKey = drop.styleKey;
      if (!styleKey) return { ok: false, error: "Name-Style-Drop ohne Style." };
      const { data: owned } = await admin
        .from("user_name_styles").select("id").eq("user_id", userId).eq("style_key", styleKey).maybeSingle();
      if (!owned) {
        try {
          const { ensureStyleInDb } = await import("@/lib/actions/name-styles");
          await ensureStyleInDb(styleKey, admin); // may throw if the style is unknown
        } catch {
          return { ok: false, error: "Name-Style konnte nicht angelegt werden." };
        }
        const { error } = await admin.from("user_name_styles").insert({ user_id: userId, style_key: styleKey, source: "won" });
        if (error) return { ok: false, error: "Name-Style konnte nicht vergeben werden." };
      }
      return { ok: true, won: { kind: "name_style", rarity: drop.rarity, name: drop.label || styleKey, styleKey } };
    }
    case "ability": {
      const abilityKey = drop.abilityKey;
      if (!abilityKey) return { ok: false, error: "Fähigkeits-Drop ohne Fähigkeit." };
      const { data: def } = await admin
        .from("ability_definitions").select("name, icon").eq("key", abilityKey).maybeSingle();
      const { data: owned } = await admin
        .from("user_abilities").select("id").eq("user_id", userId).eq("ability_key", abilityKey).maybeSingle();
      if (!owned) {
        const { error } = await admin.from("user_abilities").insert({
          user_id: userId, ability_key: abilityKey, source: "case", source_detail: sourceLabel,
        });
        if (error) return { ok: false, error: "Fähigkeit konnte nicht vergeben werden." };
      }
      return {
        ok: true,
        won: { kind: "ability", rarity: drop.rarity, name: drop.label || (def?.name as string) || abilityKey, abilityKey, icon: (def?.icon as string) ?? undefined },
      };
    }
    case "badge": {
      const badgeKey = drop.badgeKey;
      if (!badgeKey) return { ok: false, error: "Badge-Drop ohne Badge." };
      const { error } = await admin.from("user_badges").upsert(
        { user_id: userId, badge_key: badgeKey },
        { onConflict: "user_id,badge_key", ignoreDuplicates: true },
      );
      if (error) return { ok: false, error: "Badge konnte nicht vergeben werden." };
      return { ok: true, won: { kind: "badge", rarity: drop.rarity, name: drop.label || drop.badgeText || badgeKey, badgeKey, badgeText: drop.badgeText || badgeKey } };
    }
  }
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

  // Item pool resolution (priority order):
  // 1. perRarityItemIds[rarity] — specific items for this exact rarity (new, preferred)
  // 2. itemIds — legacy global pin list (all rarities)
  // 3. itemTypes — category-based pool (default)
  const perRarityPin = tier.perRarityItemIds?.[rolledRarity];
  const usePerRarityPin = Array.isArray(perRarityPin) && perRarityPin.length > 0;
  const useGlobalPin = !usePerRarityPin && !!(tier.itemIds && tier.itemIds.length > 0);
  const itemTypes = tier.itemTypes ?? group.itemTypes;
  const FULL_SELECT = "id, name, rarity, type, image_url, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec";

  let { data: pool, error: poolError } = usePerRarityPin
    ? await supabase
        .from("items")
        .select(FULL_SELECT)
        .in("id", perRarityPin!)
        .eq("rarity", rolledRarity)
        .limit(500)
    : useGlobalPin
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
    const retry = usePerRarityPin
      ? await supabase
          .from("items")
          .select("id, name, rarity, type, image_url")
          .in("id", perRarityPin!)
          .eq("rarity", rolledRarity)
          .limit(500)
      : useGlobalPin
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
    const fallback = usePerRarityPin
      ? await supabase.from("items").select(FULL_SELECT).in("id", perRarityPin!).limit(500)
      : useGlobalPin
      ? await supabase.from("items").select(FULL_SELECT).in("id", tier.itemIds!).limit(500)
      : await supabase.from("items").select(FULL_SELECT).in("type", itemTypes).limit(500);
    pool = fallback.data;
    poolError = fallback.error;
  }

  if (poolError || !pool || pool.length === 0) {
    return {
      success: false,
      error: "Für dieses Case sind aktuell keine Items hinterlegt.",
    };
  }

  // Decide whether this open lands on the item pool or a configured extra drop.
  const chosenExtra = pickExtraDrop(tier.extraDrops ?? [], rolledRarity, pool.length);
  const wonItem = chosenExtra ? null : pool[Math.floor(Math.random() * pool.length)];
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

  // Grant the won thing. On ANY failure, roll the credit deduction back so the
  // player never pays for nothing.
  let won: WonDrop;
  if (chosenExtra) {
    const granted = await grantExtraDrop(createAdminClient(), user.id, chosenExtra, tier.label);
    if (!granted.ok) {
      await supabase
        .from("profiles")
        .update({ credits: profile.credits, cases_opened: profile.cases_opened })
        .eq("id", user.id);
      return { success: false, error: granted.error };
    }
    won = granted.won;
  } else {
    const { error: inventoryError } = await supabase
      .from("inventory")
      .insert({ user_id: user.id, item_id: wonItem!.id });

    if (inventoryError) {
      // Roll back the credit deduction since the item was never granted.
      await supabase
        .from("profiles")
        .update({ credits: profile.credits, cases_opened: profile.cases_opened })
        .eq("id", user.id);
      return { success: false, error: "Item konnte nicht vergeben werden." };
    }
    won = { kind: "item", rarity: wonItem!.rarity, name: wonItem!.name, item: wonItem! };
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
        kind: won.kind,
        wonItemId: won.kind === "item" ? won.item.id : null,
        wonItemName: won.name,
        rarity: won.rarity,
        newCredits: updatedRows[0].credits,
      },
    });
  } catch {
    // audit_logs table may not exist yet — never let logging break the flow.
  }

  revalidatePath("/");

  // Award XP for case opening — fire-and-forget
  try {
    const { awardXp, getXpConfig } = await import("@/lib/actions/level-system");
    const xpCfg = await getXpConfig();
    void awardXp(user.id, xpCfg.sources.case_open ?? 30, "case_open", tier.label);
  } catch { /* non-fatal */ }

  try {
    const { incrementBpQuestProgress } = await import("@/lib/actions/bp-quests");
    void incrementBpQuestProgress(user.id, "case_open", 1);
  } catch { /* non-fatal */ }

  try {
    const { incrementDailyQuestProgress } = await import("@/lib/actions/daily-quests");
    void incrementDailyQuestProgress("case_open", 1);
  } catch { /* non-fatal */ }

  // ── Name style bonus drop ─────────────────────────────────────────────────
  // Only runs if this tier has name styles enabled AND the rarity config says drop is active.
  let wonStyleKey: string | null = null;
  if (tier.nameStylesEligible) {
    wonStyleKey = await tryDropNameStyle(user.id, won.rarity, supabase);
  }

  // Every case open gets a notification — full drop history.
  const rarityLabel = RARITY_LABELS[won.rarity as keyof typeof RARITY_LABELS] ?? won.rarity;
  const dropLink =
    won.kind === "name_style" ? "/profil"
    : won.kind === "badge" ? "/profil"
    : won.kind === "credits" ? "/"
    : "/garderobe"; // item, ability
  await notifyUser({
    userId: user.id,
    type: "case_opened",
    title:
      won.rarity === "mythisch" || won.rarity === "ultra"
        ? `${rarityLabel}-Drop!`
        : "Case geöffnet",
    message: `Du hast „${won.name}" (${rarityLabel}) gezogen!${wonStyleKey ? ` + Name-Style Bonus!` : ""}`,
    link: dropLink,
  });

  if (wonStyleKey) {
    await notifyUser({
      userId: user.id,
      type: "case_opened",
      title: "🎨 Name-Style gewonnen!",
      message: `Bonus-Drop: Name-Style „${wonStyleKey}" wurde deiner Sammlung hinzugefügt!`,
      link: "/profil",
    });
  }

  // Broadcast ultra/mythisch wins globally
  if (won.rarity === "ultra" || won.rarity === "mythisch") {
    const { data: p } = await (await import("@/lib/supabase/server")).createClient()
      .then((c) => c.from("profiles").select("username").eq("id", user.id).single());
    await broadcastSystemWin({
      username: p?.username ?? "Jemand",
      itemName: won.name,
      rarity: won.rarity,
      caseName: tier.label,
    });
  }

  return {
    success: true,
    drop: won,
    item: won.kind === "item" ? won.item : undefined,
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
  /** Item-kind drops only (backward compat). */
  items?: WonItem[];
  /** Every drop kind in roll order. */
  drops?: WonDrop[];
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

  // Load full item pool once for all N rolls.
  // Respects perRarityItemIds if set, otherwise falls back to legacy itemIds then itemTypes.
  const batchItemTypes = tier.itemTypes ?? group.itemTypes;
  const FULL_SELECT = "id, name, rarity, type, image_url, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec";
  const hasGlobalPin = !!(tier.itemIds && tier.itemIds.length > 0);
  const { data: fullPool } = hasGlobalPin
    ? await supabase.from("items").select(FULL_SELECT).in("id", tier.itemIds!).limit(500)
    : await supabase.from("items").select(FULL_SELECT).in("type", batchItemTypes).limit(500);

  if (!fullPool || fullPool.length === 0) {
    return { success: false, error: "Keine Items im Pool gefunden." };
  }

  // Roll N drops — each is either a pool item (per-rarity pin aware) or a
  // configured extra drop competing in the same rarity bucket.
  type BatchPick = { kind: "item"; item: WonItem } | { kind: "extra"; drop: CaseExtraDrop };
  const picks: BatchPick[] = [];
  for (let i = 0; i < safeCount; i++) {
    const rarity = pickRarity(tier.rarityWeights);
    const rPin = tier.perRarityItemIds?.[rarity];
    const useRPin = Array.isArray(rPin) && rPin.length > 0;
    const draw = useRPin
      ? fullPool.filter((it) => it.rarity === rarity && rPin!.includes(it.id))
      : fullPool.filter((it) => it.rarity === rarity);
    const finalDraw = draw.length > 0 ? draw : fullPool;
    const extra = pickExtraDrop(tier.extraDrops ?? [], rarity, finalDraw.length);
    if (extra) picks.push({ kind: "extra", drop: extra });
    else picks.push({ kind: "item", item: finalDraw[Math.floor(Math.random() * finalDraw.length)] as WonItem });
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

  // Grant: items in one batch insert, extras individually (best-effort), then
  // assemble the ordered drop list for the result UI.
  const admin = createAdminClient();
  const itemPicks = picks.filter((p): p is { kind: "item"; item: WonItem } => p.kind === "item");
  if (itemPicks.length > 0) {
    await supabase.from("inventory").insert(itemPicks.map((p) => ({ user_id: user.id, item_id: p.item.id })));
  }
  const drops: WonDrop[] = [];
  for (const p of picks) {
    if (p.kind === "item") {
      drops.push({ kind: "item", rarity: p.item.rarity, name: p.item.name, item: p.item });
    } else {
      const granted = await grantExtraDrop(admin, user.id, p.drop, tier.label);
      if (granted.ok) drops.push(granted.won);
    }
  }
  const wonItems: WonItem[] = drops
    .filter((d): d is Extract<WonDrop, { kind: "item" }> => d.kind === "item")
    .map((d) => d.item);

  // Audit — best-effort
  try {
    await createAdminClient().from("audit_logs").insert({
      user_id: user.id,
      action: "case_batch_open",
      payload: { tierId: tier.id, count: safeCount, totalCost, wonItemIds: wonItems.map((i) => i.id) },
    });
  } catch { /* ignore */ }

  revalidatePath("/");

  // Award XP for batch case opening — fire-and-forget
  try {
    const { awardXp, getXpConfig } = await import("@/lib/actions/level-system");
    const xpCfg = await getXpConfig();
    void awardXp(user.id, (xpCfg.sources.case_open ?? 30) * safeCount, "case_open", `${safeCount}× ${tier.label}`);
  } catch { /* non-fatal */ }

  // ── Batch name style drops ───────────────────────────────────────────────
  // For each rolled rarity, attempt a name style drop (best-effort).
  let batchStylesWon = 0;
  if (tier.nameStylesEligible) {
    for (const d of drops) {
      const styleKey = await tryDropNameStyle(user.id, d.rarity, supabase);
      if (styleKey) batchStylesWon++;
    }
  }

  // Single summary notification for batch opens
  const bestRarity = (["ultra", "mythisch", "selten", "normal"] as const).find(
    (r) => drops.some((d) => d.rarity === r)
  ) ?? "normal";
  const bestLabel = RARITY_LABELS[bestRarity];
  await notifyUser({
    userId: user.id,
    type: "case_opened",
    title: bestRarity === "ultra" || bestRarity === "mythisch" ? `${bestLabel}-Drop in Batch!` : `${safeCount}× Case geöffnet`,
    message: `Du hast ${safeCount}× Cases geöffnet. Bestes: „${drops.find((d) => d.rarity === bestRarity)?.name ?? "Unbekannt"}" (${bestLabel}).${batchStylesWon > 0 ? ` + ${batchStylesWon}× Name-Style Bonus!` : ""}`,
    link: "/garderobe",
  });

  // Broadcast ultra/mythisch wins from batch
  if (bestRarity === "ultra" || bestRarity === "mythisch") {
    const best = drops.find((d) => d.rarity === bestRarity);
    const { data: p } = await (await import("@/lib/supabase/server")).createClient()
      .then((c) => c.from("profiles").select("username").eq("id", user.id).single());
    await broadcastSystemWin({
      username: p?.username ?? "Jemand",
      itemName: best?.name ?? "Unbekanntes Item",
      rarity: bestRarity,
      caseName: tier.label,
    });
  }

  return {
    success: true,
    drops,
    items: wonItems,
    newCredits: updated[0].credits,
    openedCount: safeCount,
  };
}
