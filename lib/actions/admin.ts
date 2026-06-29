"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, type ProfileRole } from "@/lib/admin";
import { notifyUser } from "@/lib/notifications-internal";
import { getSiteConfig } from "@/lib/actions/site-config";
import { banDevicesForUser, unbanDevicesForUser } from "@/lib/actions/fingerprint";
import type { Rarity, CaseExtraDrop } from "@/lib/cases";
import { roundToNicePrice } from "@/lib/shop";

export interface AdminActionResult {
  success: boolean;
  error?: string;
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", user.id)
    .single();

  if (!isAdmin(profile)) return null;
  return user;
}

async function logAdminAction(userId: string, action: string, payload: unknown) {
  try {
    await createAdminClient().from("audit_logs").insert({ user_id: userId, action, payload });
  } catch {
    // Logging must never block the actual admin action.
  }
}

// ---------------------------------------------------------------------------
// Economy / case tiers
// ---------------------------------------------------------------------------

export interface UpdateCaseTierInput {
  tierId: string;
  price: number;
  rarityWeights: Partial<Record<Rarity, number>>;
  enabled: boolean;
  itemTypes: string[];
  itemIds?: string[] | null;
  /** Per-rarity specific item overrides (null per rarity = use type pool). */
  perRarityItemIds?: Partial<Record<Rarity, string[] | null>> | null;
  groupLabel?: string | null;
  groupSubtitle?: string | null;
  tierSublabel?: string | null;
  /** Credits deducted when clicking "Sofort anzeigen". 0 = free. */
  previewCost?: number;
  /** Max cases openable at once (2–10). */
  multiOpenMax?: number;
  /** Whether this case tier can drop name styles (probability set in Name-Styles tab). */
  nameStylesEligible?: boolean;
  /** Configurable non-item drops (credits / name styles / abilities / badges). */
  extraDrops?: CaseExtraDrop[];
}

export async function updateCaseTier(input: UpdateCaseTierInput): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();

  const basePayload = {
    price: input.price,
    rarity_weights: input.rarityWeights,
    enabled: input.enabled,
    updated_at: new Date().toISOString(),
  };

  // Full payload with all known columns
  let { data, error } = await admin
    .from("case_tiers")
    .update({
      ...basePayload,
      item_types: input.itemTypes,
      item_ids: input.itemIds ?? null,
      per_rarity_item_ids: input.perRarityItemIds ?? null,
      group_label: input.groupLabel ?? null,
      group_subtitle: input.groupSubtitle ?? null,
      tier_sublabel: input.tierSublabel ?? null,
      preview_cost: input.previewCost ?? 0,
      multi_open_max: Math.min(10, Math.max(2, input.multiOpenMax ?? 10)),
      name_styles_eligible: input.nameStylesEligible ?? false,
      extra_drops: input.extraDrops ?? [],
    })
    .eq("id", input.tierId)
    .select("id");

  // Graceful degradation: retry without newer columns if they don't exist yet
  if (error?.message) {
    const newCols = ["per_rarity_item_ids", "name_styles_eligible", "tier_sublabel", "extra_drops"];
    if (newCols.some((c) => error!.message.includes(c))) {
      const retry = await admin
        .from("case_tiers")
        .update({
          ...basePayload,
          item_types: input.itemTypes,
          item_ids: input.itemIds ?? null,
          group_label: input.groupLabel ?? null,
          group_subtitle: input.groupSubtitle ?? null,
          preview_cost: input.previewCost ?? 0,
          multi_open_max: Math.min(10, Math.max(2, input.multiOpenMax ?? 10)),
        })
        .eq("id", input.tierId)
        .select("id");
      data = retry.data;
      error = retry.error;
    }
  }

  if (
    error?.message &&
    (error.message.includes("item_ids") || error.message.includes("group_label") ||
      error.message.includes("group_subtitle") || error.message.includes("preview_cost") ||
      error.message.includes("multi_open_max"))
  ) {
    const retry = await admin
      .from("case_tiers")
      .update({ ...basePayload, item_types: input.itemTypes })
      .eq("id", input.tierId)
      .select("id");
    data = retry.data;
    error = retry.error;
  }

  if (error?.message?.includes("item_types")) {
    const retry = await admin
      .from("case_tiers")
      .update(basePayload)
      .eq("id", input.tierId)
      .select("id");
    data = retry.data;
    error = retry.error;
  }

  if (error || !data || data.length === 0) {
    return {
      success: false,
      error: "Tier nicht gefunden — wurde scripts/seed-case-tiers.mjs schon ausgeführt?",
    };
  }

  await logAdminAction(user.id, "admin_economy_update", input);
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

export async function updateUserCredits(
  targetUserId: string,
  credits: number
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  if (!Number.isFinite(credits) || credits < 0) {
    return { success: false, error: "Ungültiger Wert." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ credits: Math.floor(credits) })
    .eq("id", targetUserId);

  if (error) return { success: false, error: "Update fehlgeschlagen." };

  await logAdminAction(user.id, "admin_set_credits", { targetUserId, credits });
  const { currencyName } = await getSiteConfig();
  await notifyUser({
    userId: targetUserId,
    type: "admin_credits",
    title: "Guthaben geändert",
    message: `Ein Admin hat dein Guthaben auf ${Math.floor(credits).toLocaleString("de-DE")} ${currencyName} gesetzt.`,
    link: "/account",
  });
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

/**
 * Manual gender override for moderation/support — bypasses the player-
 * facing one-way lock entirely (lib/actions/wardrobe.ts updateGender),
 * since this exists specifically for "they misclicked and it's now
 * permanently wrong" support requests where the normal lock is exactly
 * the thing standing in the way.
 */
export async function setUserGender(
  targetUserId: string,
  gender: "m" | "w"
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ gender }).eq("id", targetUserId);

  if (error) return { success: false, error: "Update fehlgeschlagen." };

  await logAdminAction(user.id, "admin_set_gender", { targetUserId, gender });
  await notifyUser({
    userId: targetUserId,
    type: "admin_action",
    title: "Geschlecht geändert",
    message: "Dein Geschlecht wurde vom Support geändert. Schau in die Garderobe.",
    link: "/garderobe",
  });
  revalidatePath("/admin");
  revalidatePath("/garderobe");
  revalidatePath("/world");
  return { success: true };
}

export async function updateUserRole(
  targetUserId: string,
  role: ProfileRole
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();

  // Fetch previous role so we know if the role actually changed
  const { data: prevProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", targetUserId)
    .single();
  const prevRole = prevProfile?.role as string | null;

  const { error } = await admin.from("profiles").update({ role }).eq("id", targetUserId);
  if (error) return { success: false, error: "Update fehlgeschlagen." };

  // Permission-Sync: when assigning moderator role, copy current group defaults
  // into their individual override so admin sees all checkboxes and can fine-tune.
  // When removing moderator role, wipe the override so no stale perms linger.
  if (role === "moderator" && prevRole !== "moderator") {
    const { syncPermissionsOnModRoleAssign } = await import("@/lib/actions/mod");
    void syncPermissionsOnModRoleAssign(targetUserId);
  } else if (role !== "moderator" && prevRole === "moderator") {
    const { clearModPermissionsOverride } = await import("@/lib/actions/mod");
    void clearModPermissionsOverride(targetUserId);
  }

  await logAdminAction(user.id, "admin_set_role", { targetUserId, role });
  await notifyUser({
    userId: targetUserId,
    type: "admin_action",
    title: "Rolle geändert",
    message: `Deine Rolle wurde auf „${role}" geändert.`,
    link: "/account",
  });
  revalidatePath("/admin");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Item catalogue CRUD
// ---------------------------------------------------------------------------

/** Matches lib/combat.ts's `PerkType` — duplicated as a plain string union
 * here rather than imported, since lib/combat.ts has no "use server"
 * marker and importing a server action file into a type-only spot is fine,
 * but keeping the admin input type self-contained avoids any risk of
 * pulling client-side combat constants into this server module's bundle. */
export type ItemPerkType = "none" | "speed_boost" | "jump_boost" | "hp_regen_boost";

export interface ItemInput {
  id?: string;
  name: string;
  rarity: Rarity;
  type: string;
  price_cr: number;
  /** Weapon power (see lib/combat.ts) — `null`/`undefined` clears it, only
   * meaningful for weapon-ish types but accepted for any type since the
   * admin types `type` as free text and there's no hard enum to gate on. */
  damage?: number | null;
  /** Flat damage-reduction points — meaningful for jacket/pants/hat/shoes,
   * see lib/combat.ts's `applyArmorReduction`. */
  armor?: number;
  /** Amulet/ring perk — `"none"` (the default) means no perk at all. */
  perk_type?: ItemPerkType;
  /** Perk strength as a multiplier added on top of 1.0 (e.g. 0.15 = +15%
   * speed/jump/regen) — only meaningful when `perk_type` isn't `"none"`. */
  perk_magnitude?: number;
  /** Shield HP this item's aura absorbs before it breaks and damage starts
   * reaching the player's real HP — 0 means a shield_cosmetic row that's
   * purely decorative, not a functioning shield. */
  shield_hp?: number;
  /** Seconds after breaking before the shield can absorb again. */
  shield_regen_cooldown_sec?: number;
}

export interface UpsertItemResult extends AdminActionResult {
  item?: {
    id: string;
    name: string;
    rarity: Rarity;
    type: string;
    price_cr: number;
    damage: number | null;
    armor: number;
    perk_type: ItemPerkType;
    perk_magnitude: number;
    shield_hp: number;
    shield_regen_cooldown_sec: number;
  };
}

const VALID_PERK_TYPES: ItemPerkType[] = ["none", "speed_boost", "jump_boost", "hp_regen_boost"];

export async function upsertItem(input: ItemInput): Promise<UpsertItemResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  if (!input.name.trim() || !input.type.trim()) {
    return { success: false, error: "Name und Typ sind erforderlich." };
  }
  if (input.damage !== undefined && input.damage !== null && (!Number.isFinite(input.damage) || input.damage < 0)) {
    return { success: false, error: "Ungültiger Schaden." };
  }
  if (input.armor !== undefined && (!Number.isFinite(input.armor) || input.armor < 0)) {
    return { success: false, error: "Ungültige Rüstung." };
  }
  if (input.perk_type !== undefined && !VALID_PERK_TYPES.includes(input.perk_type)) {
    return { success: false, error: "Ungültiger Perk-Typ." };
  }
  if (input.perk_magnitude !== undefined && (!Number.isFinite(input.perk_magnitude) || input.perk_magnitude < 0)) {
    return { success: false, error: "Ungültige Perk-Stärke." };
  }
  if (input.shield_hp !== undefined && (!Number.isFinite(input.shield_hp) || input.shield_hp < 0)) {
    return { success: false, error: "Ungültige Schild-HP." };
  }
  if (
    input.shield_regen_cooldown_sec !== undefined &&
    (!Number.isFinite(input.shield_regen_cooldown_sec) || input.shield_regen_cooldown_sec < 0)
  ) {
    return { success: false, error: "Ungültiger Schild-Cooldown." };
  }

  const admin = createAdminClient();
  const payload = {
    name: input.name.trim(),
    rarity: input.rarity,
    type: input.type.trim(),
    price_cr: Math.max(0, Math.floor(input.price_cr) || 0),
  };
  // Only sent when explicitly provided — same reasoning as the auctions
  // buyout_price field: omitting the key entirely means every item that
  // doesn't set a damage value keeps working even if this migration
  // hasn't run yet, and only an explicit damage value surfaces the
  // column-missing error instead of silently dropping it.
  const damagePayload =
    input.damage === undefined ? {} : { damage: input.damage === null ? null : Math.floor(input.damage) };
  const statsPayload: Record<string, unknown> = {};
  if (input.armor !== undefined) statsPayload.armor = Math.floor(input.armor);
  if (input.perk_type !== undefined) statsPayload.perk_type = input.perk_type;
  if (input.perk_magnitude !== undefined) statsPayload.perk_magnitude = input.perk_magnitude;
  if (input.shield_hp !== undefined) statsPayload.shield_hp = Math.floor(input.shield_hp);
  if (input.shield_regen_cooldown_sec !== undefined) {
    statsPayload.shield_regen_cooldown_sec = Math.floor(input.shield_regen_cooldown_sec);
  }

  const { data, error } = input.id
    ? await admin
        .from("items")
        .update({ ...payload, ...damagePayload, ...statsPayload })
        .eq("id", input.id)
        .select()
        .single()
    : await admin
        .from("items")
        .insert({ ...payload, ...damagePayload, ...statsPayload })
        .select()
        .single();

  if (error || !data) {
    return {
      success: false,
      error:
        Object.keys(damagePayload).length > 0 || Object.keys(statsPayload).length > 0
          ? "Speichern fehlgeschlagen — sind die Item-Stat-Migrationen eingespielt?"
          : "Speichern fehlgeschlagen.",
    };
  }

  await logAdminAction(user.id, input.id ? "admin_item_update" : "admin_item_create", data);
  revalidatePath("/admin");
  revalidatePath("/");
  return {
    success: true,
    item: {
      ...data,
      damage: data.damage ?? null,
      armor: data.armor ?? 0,
      perk_type: (data.perk_type as ItemPerkType) ?? "none",
      perk_magnitude: data.perk_magnitude ?? 0,
      shield_hp: data.shield_hp ?? 0,
      shield_regen_cooldown_sec: data.shield_regen_cooldown_sec ?? 0,
    },
  };
}

export async function deleteItem(itemId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("items").delete().eq("id", itemId);

  if (error) {
    return {
      success: false,
      error: "Löschen fehlgeschlagen — Item evtl. noch im Inventar eines Users.",
    };
  }

  await logAdminAction(user.id, "admin_item_delete", { itemId });
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Per-user detail (inventory management + personal log)
// ---------------------------------------------------------------------------

export interface UserInventoryRow {
  id: string;
  equipped: boolean;
  item: { id: string; name: string; rarity: Rarity; type: string; damage?: number | null; armor?: number | null; perk_type?: string | null; perk_magnitude?: number | null; shield_hp?: number | null; shield_regen_cooldown_sec?: number | null };
}

export interface UserDetail {
  inventory: UserInventoryRow[];
  logs: { id: string; action: string; payload: unknown; created_at: string }[];
  banned: boolean;
  gender: "m" | "w";
  warningCount: number;
  noteCount: number;
  modActions: { id: string; actionType: string; reason: string | null; modUsername: string | null; createdAt: string }[];
}

export interface GetUserDetailResult extends AdminActionResult {
  detail?: UserDetail;
}

export async function getUserDetail(targetUserId: string): Promise<GetUserDetailResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();

  // Fetch inventory, own audit logs, admin-action logs targeting this user,
  // auth record, and profile in parallel. The two audit-log queries are
  // split because PostgREST's .or() with JSONB operators is unreliable —
  // we merge and deduplicate in code instead.
  const [
    { data: inventory },
    { data: logsOwn },
    { data: logsTarget },
    { data: authUser },
    { data: profile },
    { data: modActionRows },
  ] = await Promise.all([
    admin
      .from("inventory")
      .select("id, equipped, item:items(id, name, rarity, type, damage, armor, perk_type, perk_magnitude, shield_hp, shield_regen_cooldown_sec)")
      .eq("user_id", targetUserId)
      .order("obtained_at", { ascending: false }),
    admin
      .from("audit_logs")
      .select("id, action, payload, created_at")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("audit_logs")
      .select("id, action, payload, created_at")
      .filter("payload->>targetUserId", "eq", targetUserId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin.auth.admin.getUserById(targetUserId),
    admin.from("profiles").select("gender").eq("id", targetUserId).single(),
    admin
      .from("mod_actions")
      .select("id, mod_id, action_type, reason, created_at")
      .eq("target_user_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  // Merge own + targeted logs, deduplicate, and sort newest-first
  const seen = new Set<string>();
  const logs = [...(logsOwn ?? []), ...(logsTarget ?? [])]
    .filter((l) => { if (seen.has(l.id)) return false; seen.add(l.id); return true; })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);

  const bannedUntil = authUser?.user?.banned_until;
  const banned = !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();

  // Resolve mod usernames for the mod actions
  const modIds = [...new Set((modActionRows ?? []).map((r) => r.mod_id).filter(Boolean))];
  const { data: modProfiles } = modIds.length
    ? await admin.from("profiles").select("id, username").in("id", modIds)
    : { data: [] };
  const modById = new Map((modProfiles ?? []).map((p) => [p.id, p.username as string]));

  const warningCount = (modActionRows ?? []).filter((r) => r.action_type === "warning").length;
  const noteCount = (modActionRows ?? []).filter((r) => r.action_type === "note").length;
  const modActions = (modActionRows ?? []).map((r) => ({
    id: r.id,
    actionType: r.action_type as string,
    reason: r.reason as string | null,
    modUsername: modById.get(r.mod_id) ?? null,
    createdAt: r.created_at as string,
  }));

  return {
    success: true,
    detail: {
      inventory: (inventory ?? []) as unknown as UserInventoryRow[],
      logs: logs ?? [],
      banned,
      gender: (profile?.gender as "m" | "w") ?? "m",
      warningCount,
      noteCount,
      modActions,
    },
  };
}

export async function searchItems(
  query: string
): Promise<{ id: string; name: string; rarity: Rarity; type: string }[]> {
  const user = await requireAdmin();
  if (!user || !query.trim()) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("items")
    .select("id, name, rarity, type")
    .ilike("name", `%${query.trim()}%`)
    .limit(20);

  return data ?? [];
}

export interface GalleryItem {
  id: string;
  name: string;
  rarity: Rarity;
  type: string;
  damage: number | null;
  armor: number;
  perkType: string;
  perkMagnitude: number;
  shieldHp: number;
}

/** Alle Items mit ihren Stats für die Admin-Vorschau-Galerie (defensiv: liest
 *  Stat-Felder optional, falls eine Migration noch fehlt). */
export async function getAllGalleryItems(): Promise<GalleryItem[]> {
  const user = await requireAdmin();
  if (!user) return [];
  const admin = createAdminClient();
  const { data } = await admin.from("items").select("*").order("name");
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? "Item"),
    rarity: (r.rarity as Rarity) ?? "normal",
    type: String(r.type ?? "item"),
    damage: typeof r.damage === "number" ? r.damage : null,
    armor: typeof r.armor === "number" ? r.armor : 0,
    perkType: typeof r.perk_type === "string" ? r.perk_type : "none",
    perkMagnitude: typeof r.perk_magnitude === "number" ? r.perk_magnitude : 0,
    shieldHp: typeof r.shield_hp === "number" ? r.shield_hp : 0,
  }));
}

export async function grantItemToUser(
  targetUserId: string,
  itemId: string
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("inventory")
    .insert({ user_id: targetUserId, item_id: itemId });

  if (error) return { success: false, error: "Vergeben fehlgeschlagen." };

  const { data: itemRow } = await admin.from("items").select("name").eq("id", itemId).single();
  await logAdminAction(user.id, "admin_grant_item", { targetUserId, itemId });
  await notifyUser({
    userId: targetUserId,
    type: "admin_grant_item",
    title: "Item erhalten",
    message: `Ein Admin hat dir „${itemRow?.name ?? "ein Item"}" ins Inventar gelegt.`,
    link: "/garderobe",
  });
  revalidatePath("/admin");
  return { success: true };
}

/**
 * Grants the user every item in the catalogue they don't already own, in
 * one click — built for testing/QA so an admin can equip-check the entire
 * item set on a real account instead of rolling cases hundreds of times.
 * Skips items already in the user's inventory (no duplicates) and inserts
 * in batches since the catalogue is 900+ rows.
 */
export async function grantAllItemsToUser(targetUserId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();

  const [{ data: allItems, error: itemsError }, { data: owned, error: ownedError }] =
    await Promise.all([
      admin.from("items").select("id"),
      admin.from("inventory").select("item_id").eq("user_id", targetUserId),
    ]);

  if (itemsError || ownedError) {
    return { success: false, error: "Katalog konnte nicht geladen werden." };
  }

  const ownedIds = new Set((owned ?? []).map((row) => row.item_id));
  const missing = (allItems ?? []).filter((item) => !ownedIds.has(item.id));

  if (missing.length === 0) {
    return { success: true };
  }

  const BATCH_SIZE = 500;
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing
      .slice(i, i + BATCH_SIZE)
      .map((item) => ({ user_id: targetUserId, item_id: item.id }));
    const { error } = await admin.from("inventory").insert(batch);
    if (error) return { success: false, error: "Vergeben fehlgeschlagen." };
  }

  await logAdminAction(user.id, "admin_grant_all_items", {
    targetUserId,
    count: missing.length,
  });
  await notifyUser({
    userId: targetUserId,
    type: "admin_grant_item",
    title: "Items erhalten",
    message: `Ein Admin hat dir ${missing.length} fehlende Item${missing.length !== 1 ? "s" : ""} ins Inventar gelegt.`,
    link: "/garderobe",
  });
  revalidatePath("/admin");
  return { success: true };
}

export async function removeUserItem(inventoryId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("inventory")
    .select("user_id, item:items(name)")
    .eq("id", inventoryId)
    .single();

  const { error } = await admin.from("inventory").delete().eq("id", inventoryId);

  if (error) return { success: false, error: "Entfernen fehlgeschlagen." };

  await logAdminAction(user.id, "admin_remove_item", { inventoryId });
  if (row?.user_id) {
    const itemName = (row.item as unknown as { name?: string } | null)?.name ?? "ein Item";
    await notifyUser({
      userId: row.user_id,
      type: "admin_action",
      title: "Item entfernt",
      message: `Ein Admin hat „${itemName}" aus deinem Inventar entfernt.`,
      link: "/garderobe",
    });
  }
  revalidatePath("/admin");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

/**
 * Real ban via Supabase's own auth.admin API (`ban_duration`), not a custom
 * DB flag — GoTrue rejects sign-ins/refreshes for banned users itself, and
 * our server code already treats "no user" as logged-out everywhere.
 */
export async function setUserBanned(
  targetUserId: string,
  banned: boolean
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: banned ? "876000h" : "none",
  });

  if (error) return { success: false, error: "Aktion fehlgeschlagen." };

  // When banning: also ban every device fingerprint this user has ever logged in from.
  // When un-banning: lift all device bans too — the person should be fully restored.
  if (banned) {
    await banDevicesForUser(targetUserId, user.id);
  } else {
    await unbanDevicesForUser(targetUserId);
  }

  await logAdminAction(user.id, "admin_ban_user", { targetUserId, banned });
  await notifyUser({
    userId: targetUserId,
    type: "admin_ban",
    title: banned ? "Account gesperrt" : "Account entsperrt",
    message: banned
      ? "Dein Account wurde gesperrt. Kontaktiere den Support für weitere Informationen."
      : "Deine Sperre wurde aufgehoben. Du kannst dich wieder einloggen.",
  });
  revalidatePath("/admin");
  return { success: true };
}

/**
 * Separate from setUserBanned() on purpose — a full account ban logs the
 * user out entirely (GoTrue rejects their session), which is overkill for
 * "this person spams support tickets". This only hides/blocks the support
 * widget (components/support/ticket-button.tsx) and rejects ticket
 * creation/replies server-side (lib/actions/tickets.ts) — everything else
 * about their account keeps working normally.
 */
export async function setSupportBanned(
  targetUserId: string,
  banned: boolean
): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ support_banned: banned }).eq("id", targetUserId);

  if (error) return { success: false, error: "Aktion fehlgeschlagen." };

  await logAdminAction(user.id, "admin_support_ban", { targetUserId, banned });
  await notifyUser({
    userId: targetUserId,
    type: "admin_action",
    title: banned ? "Support-Zugriff entzogen" : "Support-Zugriff wiederhergestellt",
    message: banned
      ? "Du kannst aktuell keine neuen Support-Tickets mehr erstellen oder beantworten."
      : "Du kannst wieder Support-Tickets erstellen und beantworten.",
  });
  revalidatePath("/admin");
  return { success: true };
}

/**
 * "Force Logout" / "Kick": there's no direct "kill all sessions for this
 * user id" call in the Supabase JS admin API (`auth.signOut` only revokes a
 * session by its own JWT). A short, self-expiring ban achieves the same
 * practical effect: `supabase.auth.getUser()` revalidates against the Auth
 * server on every request (that's why our server code uses it instead of
 * the locally-decoded `getSession()`), so the user is rejected on their very
 * next request and automatically usable again once the 30s window passes.
 */
export async function kickUser(targetUserId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: "30s",
  });

  if (error) return { success: false, error: "Aktion fehlgeschlagen." };

  await logAdminAction(user.id, "admin_kick_user", { targetUserId });
  revalidatePath("/admin");
  return { success: true };
}

export async function wipeUserInventory(targetUserId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("inventory")
    .delete()
    .eq("user_id", targetUserId)
    .select("id");

  if (error) return { success: false, error: "Aktion fehlgeschlagen." };

  await logAdminAction(user.id, "admin_wipe_inventory", {
    targetUserId,
    count: data?.length ?? 0,
  });
  await notifyUser({
    userId: targetUserId,
    type: "admin_action",
    title: "Inventar zurückgesetzt",
    message: "Ein Admin hat dein gesamtes Inventar geleert.",
    link: "/garderobe",
  });
  revalidatePath("/admin");
  return { success: true };
}

/**
 * Permanently deletes a user and ALL their data — auth account, profile,
 * inventory, trades, auctions, tickets, login history, notifications, and
 * device fingerprint bans. After this call the person can re-register with
 * their Discord account and will receive a completely fresh profile with no
 * trace of the previous one. This cannot be undone.
 */
export async function deleteUserCompletely(targetUserId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  if (user.id === targetUserId) {
    return { success: false, error: "Du kannst dich nicht selbst löschen." };
  }

  const admin = createAdminClient();

  // Ticket messages sent by this user (FK child of tickets — must go first)
  await admin.from("ticket_messages").delete().eq("user_id", targetUserId);

  // Messages in tickets *created* by this user (replies from staff, etc.)
  const { data: ownedTickets } = await admin
    .from("tickets")
    .select("id")
    .eq("user_id", targetUserId);
  if (ownedTickets && ownedTickets.length > 0) {
    await admin
      .from("ticket_messages")
      .delete()
      .in("ticket_id", ownedTickets.map((t) => t.id));
  }
  await admin.from("tickets").delete().eq("user_id", targetUserId);

  // Inventory
  await admin.from("inventory").delete().eq("user_id", targetUserId);

  // Notifications
  await admin.from("notifications").delete().eq("user_id", targetUserId);

  // Trades (sender or receiver) — delete trade_items first to avoid FK issues
  try {
    const { data: userTrades } = await admin
      .from("trades")
      .select("id")
      .or(`sender_id.eq.${targetUserId},receiver_id.eq.${targetUserId}`);
    if (userTrades && userTrades.length > 0) {
      await admin
        .from("trade_items")
        .delete()
        .in("trade_id", userTrades.map((t) => t.id));
    }
    await admin
      .from("trades")
      .delete()
      .or(`sender_id.eq.${targetUserId},receiver_id.eq.${targetUserId}`);
  } catch { /* trades table may not exist on this install */ }

  // Auctions — delete bids first, then the auction rows
  try {
    const { data: userAuctions } = await admin
      .from("auctions")
      .select("id")
      .eq("seller_id", targetUserId);
    if (userAuctions && userAuctions.length > 0) {
      await admin
        .from("auction_bids")
        .delete()
        .in("auction_id", userAuctions.map((a) => a.id));
    }
    await admin.from("auction_bids").delete().eq("bidder_id", targetUserId);
    await admin.from("auctions").delete().eq("seller_id", targetUserId);
  } catch { /* auctions table may not exist on this install */ }

  // Audit logs where this user is the actor
  await admin.from("audit_logs").delete().eq("user_id", targetUserId);

  // Login events (also removes any fingerprint associations)
  await admin.from("login_events").delete().eq("user_id", targetUserId);

  // Device bans tied to this user's fingerprints
  await unbanDevicesForUser(targetUserId);

  // Profile must come before auth user deletion
  const { error: profileError } = await admin.from("profiles").delete().eq("id", targetUserId);
  if (profileError) {
    return {
      success: false,
      error: `Profil konnte nicht gelöscht werden: ${profileError.message}`,
    };
  }

  // Auth user — final step, removes the Discord OAuth identity entirely
  const { error: authError } = await admin.auth.admin.deleteUser(targetUserId);
  if (authError) {
    return {
      success: false,
      error: `Auth-Account konnte nicht gelöscht werden: ${authError.message}`,
    };
  }

  await logAdminAction(user.id, "admin_delete_user_completely", { targetUserId });
  revalidatePath("/admin");
  return { success: true };
}

/**
 * Resets a user to their "first login" state — zeroes credits, streak_days,
 * cases_opened, streak_kill_count, and pending_streak_cr, then deletes all
 * inventory rows. The auth account itself is left intact.
 */
// ---------------------------------------------------------------------------
// Bulk item repricing
// ---------------------------------------------------------------------------

const RARITY_BASE_PRICE: Record<Rarity, number> = {
  normal: 5_000,
  selten: 32_000,
  mythisch: 135_000,
  ultra: 560_000,
};

const TYPE_PRICE_MULT: Record<string, number> = {
  weapon_cosmetic: 1.55,
  pet: 1.30,
  shield_cosmetic: 1.20,
  amulet: 1.10,
  ring: 1.10,
  jacket: 1.05,
  hat: 1.00,
  pants: 1.00,
  shoes: 0.95,
  face: 0.90,
  hair: 0.85,
  trail: 0.85,
  aura: 0.90,
};

function computeItemPrice(item: {
  rarity: Rarity;
  type: string;
  damage: number | null;
  armor: number;
  perk_magnitude: number;
  shield_hp: number;
}): number {
  const base = RARITY_BASE_PRICE[item.rarity] ?? RARITY_BASE_PRICE.normal;
  const typeMult = TYPE_PRICE_MULT[item.type] ?? 1.0;
  const typedBase = base * typeMult;

  // Stat bonuses — each capped so no single stat exceeds its own ceiling;
  // combined bonus capped at 35% of typed base.
  const dmg = item.damage ?? 0;
  const dmgBonus   = dmg > 0 ? Math.min(0.25, (dmg / 50) * 0.25) : 0;
  const armBonus   = item.armor       > 0 ? Math.min(0.20, (item.armor   / 30) * 0.20) : 0;
  const perkBonus  = item.perk_magnitude > 0 ? Math.min(0.28, (item.perk_magnitude / 0.40) * 0.28) : 0;
  const shieldBonus = item.shield_hp  > 0 ? Math.min(0.22, (item.shield_hp / 200) * 0.22) : 0;
  const totalBonus = Math.min(0.35, dmgBonus + armBonus + perkBonus + shieldBonus);

  return roundToNicePrice(typedBase * (1 + totalBonus));
}

export interface BulkRepriceResult {
  success: boolean;
  error?: string;
  updated?: number;
}

/**
 * Recomputes every item's `price_cr` using a rarity × type × stat formula —
 * makes Ultra/Mythisch items meaningfully expensive compared to Normal items,
 * and rewards items with high stats over purely cosmetic variants of the same
 * rarity. Safe to re-run at any time; only writes when the computed price
 * differs from what's already stored (avoids unnecessary DB writes).
 */
export async function bulkRepriceItems(): Promise<BulkRepriceResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { data: items, error } = await admin
    .from("items")
    .select("id, rarity, type, damage, armor, perk_magnitude, shield_hp, price_cr");

  if (error || !items) return { success: false, error: "Items konnten nicht geladen werden." };

  const updates: { id: string; price_cr: number }[] = [];
  for (const item of items as Array<{
    id: string; rarity: Rarity; type: string;
    damage: number | null; armor: number; perk_magnitude: number; shield_hp: number; price_cr: number;
  }>) {
    const newPrice = computeItemPrice({
      rarity: item.rarity,
      type: item.type,
      damage: item.damage,
      armor: item.armor ?? 0,
      perk_magnitude: item.perk_magnitude ?? 0,
      shield_hp: item.shield_hp ?? 0,
    });
    if (newPrice !== item.price_cr) updates.push({ id: item.id, price_cr: newPrice });
  }

  if (updates.length === 0) return { success: true, updated: 0 };

  const BATCH_SIZE = 500;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      await admin.from("items").update({ price_cr: row.price_cr }).eq("id", row.id);
    }
  }

  await logAdminAction(user.id, "admin_bulk_reprice", { updated: updates.length });
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true, updated: updates.length };
}

export async function resetUser(targetUserId: string): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  if (user.id === targetUserId) {
    return { success: false, error: "Eigenes Konto kann nicht zurückgesetzt werden." };
  }

  const admin = createAdminClient();

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      credits: 0,
      streak_days: 0,
      cases_opened: 0,
      streak_kill_count: 0,
      pending_streak_cr: 0,
    })
    .eq("id", targetUserId);

  if (profileError) return { success: false, error: "Profil-Reset fehlgeschlagen." };

  const { data: invData, error: invError } = await admin
    .from("inventory")
    .delete()
    .eq("user_id", targetUserId)
    .select("id");

  if (invError) return { success: false, error: "Inventar-Reset fehlgeschlagen." };

  await logAdminAction(user.id, "admin_full_reset", {
    targetUserId,
    deletedInventoryCount: invData?.length ?? 0,
  });
  await notifyUser({
    userId: targetUserId,
    type: "admin_action",
    title: "Account zurückgesetzt",
    message: "Ein Admin hat deinen Account auf den Startzustand zurückgesetzt.",
    link: "/account",
  });
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

export async function setUserVerified(targetUserId: string, verified: boolean): Promise<AdminActionResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ verified })
    .eq("id", targetUserId);

  if (error) return { success: false, error: "Speichern fehlgeschlagen." };
  await logAdminAction(user.id, "set_user_verified", { targetUserId, verified });
  revalidatePath("/admin");
  revalidatePath("/community");
  return { success: true };
}

