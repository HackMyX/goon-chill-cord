"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { logDebugEvent } from "@/lib/debug-log-server";
import type { CaseIconName } from "@/lib/cases";

export interface CaseAdminResult {
  success: boolean;
  error?: string;
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
  if (!isAdmin(profile)) return null;
  return { user, profile };
}

// ---------------------------------------------------------------------------
// Case Group CRUD
// ---------------------------------------------------------------------------

export interface CreateCaseGroupInput {
  id: string;
  title: string;
  subtitle?: string;
  iconName: CaseIconName;
  itemTypes: string[];
  accentColor?: string;
}

/** Creates a new case group with two default tiers (standard + premium). */
export async function createCaseGroup(input: CreateCaseGroupInput): Promise<CaseAdminResult> {
  const auth = await requireAdmin();
  if (!auth) return { success: false, error: "Kein Zugriff." };

  const id = input.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  if (!id || id.length < 2) return { success: false, error: "ID zu kurz oder ungültig." };
  if (!input.title.trim()) return { success: false, error: "Titel darf nicht leer sein." };

  const admin = createAdminClient();

  // Get current max display_order
  const { data: existing } = await admin.from("case_groups").select("display_order").order("display_order", { ascending: false }).limit(1);
  const nextOrder = (existing?.[0]?.display_order ?? -1) + 1;

  // Create group
  const { error: groupErr } = await admin.from("case_groups").insert({
    id,
    title: input.title.trim(),
    subtitle: input.subtitle?.trim() || null,
    icon_name: input.iconName,
    item_types: input.itemTypes,
    display_order: nextOrder,
    enabled: true,
    accent_color: input.accentColor || null,
    is_custom: true,
    updated_at: new Date().toISOString(),
  });

  if (groupErr) {
    if (groupErr.message?.includes("duplicate") || groupErr.message?.includes("unique")) {
      return { success: false, error: `Eine Case-Gruppe mit ID "${id}" existiert bereits.` };
    }
    return { success: false, error: `Gruppe konnte nicht erstellt werden: ${groupErr.message}` };
  }

  // Create two default tiers
  const tierInserts = [
    {
      id: `${id}-standard`,
      group_id: id,
      label: "CASE ÖFFNEN",
      price: 5000,
      rarity_weights: { normal: 87, selten: 10, mythisch: 3, ultra: 0.1 },
      enabled: true,
      item_types: input.itemTypes,
      sort_order: 0,
      name_styles_eligible: false,
      preview_cost: 0,
      multi_open_max: 10,
      updated_at: new Date().toISOString(),
    },
    {
      id: `${id}-premium`,
      group_id: id,
      label: "PREMIUM",
      tier_sublabel: "MEHR CHANCE",
      price: 25000,
      rarity_weights: { normal: 78, selten: 14, mythisch: 7.5, ultra: 0.5 },
      enabled: true,
      item_types: input.itemTypes,
      sort_order: 1,
      name_styles_eligible: false,
      preview_cost: 0,
      multi_open_max: 10,
      updated_at: new Date().toISOString(),
    },
  ];

  const { error: tierErr } = await admin.from("case_tiers").insert(tierInserts);
  if (tierErr) {
    // Rollback group
    await admin.from("case_groups").delete().eq("id", id);
    return { success: false, error: `Tiers konnten nicht erstellt werden: ${tierErr.message}` };
  }

  await logDebugEvent({
    level: "info",
    scope: "cases",
    message: `Admin ${auth.profile?.username} erstellte neue Case-Gruppe "${id}" (${input.title})`,
  }).catch(() => {});

  try {
    await admin.from("audit_logs").insert({
      user_id: auth.user.id,
      action: "admin_case_group_create",
      payload: { id, title: input.title, iconName: input.iconName },
    });
  } catch { /* best-effort */ }

  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

export interface UpdateCaseGroupInput {
  id: string;
  title: string;
  subtitle?: string;
  iconName: CaseIconName;
  itemTypes: string[];
  accentColor?: string;
  enabled: boolean;
}

/** Updates case group metadata (title, icon, item types, etc.). */
export async function updateCaseGroup(input: UpdateCaseGroupInput): Promise<CaseAdminResult> {
  const auth = await requireAdmin();
  if (!auth) return { success: false, error: "Kein Zugriff." };
  if (!input.title.trim()) return { success: false, error: "Titel darf nicht leer sein." };

  const admin = createAdminClient();
  const { error } = await admin.from("case_groups").update({
    title: input.title.trim(),
    subtitle: input.subtitle?.trim() || null,
    icon_name: input.iconName,
    item_types: input.itemTypes,
    enabled: input.enabled,
    accent_color: input.accentColor || null,
    updated_at: new Date().toISOString(),
  }).eq("id", input.id);

  if (error) return { success: false, error: error.message };

  await logDebugEvent({
    level: "info",
    scope: "cases",
    message: `Admin ${auth.profile?.username} aktualisierte Case-Gruppe "${input.id}"`,
  }).catch(() => {});

  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

/** Deletes a custom case group and all its tiers.
 * Seeded groups (is_custom=false) cannot be deleted via this action. */
export async function deleteCaseGroup(groupId: string): Promise<CaseAdminResult> {
  const auth = await requireAdmin();
  if (!auth) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();

  // Verify it exists and is custom
  const { data: group } = await admin.from("case_groups").select("id, title, is_custom").eq("id", groupId).single();
  if (!group) return { success: false, error: "Gruppe nicht gefunden." };
  if (!group.is_custom) {
    return { success: false, error: "Standard-Gruppen (cosmetics/weapons) können nicht gelöscht werden." };
  }

  // Delete tiers first (FK-safe)
  await admin.from("case_tiers").delete().eq("group_id", groupId);
  const { error } = await admin.from("case_groups").delete().eq("id", groupId);
  if (error) return { success: false, error: error.message };

  await logDebugEvent({
    level: "warn",
    scope: "cases",
    message: `Admin ${auth.profile?.username} löschte Case-Gruppe "${groupId}" (${group.title})`,
  }).catch(() => {});

  try {
    await admin.from("audit_logs").insert({
      user_id: auth.user.id,
      action: "admin_case_group_delete",
      payload: { groupId, title: group.title },
    });
  } catch { /* best-effort */ }

  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

/** Updates the display_order of all groups at once.
 * Pass the group IDs in the desired order. */
export async function reorderCaseGroups(orderedIds: string[]): Promise<CaseAdminResult> {
  const auth = await requireAdmin();
  if (!auth) return { success: false, error: "Kein Zugriff." };

  if (!orderedIds.length) return { success: false, error: "Leere Reihenfolge." };

  const admin = createAdminClient();
  const updates = orderedIds.map((id, index) =>
    admin.from("case_groups").update({ display_order: index, updated_at: new Date().toISOString() }).eq("id", id)
  );

  const results = await Promise.all(updates);
  const failed = results.filter((r) => r.error);
  if (failed.length) {
    return { success: false, error: "Reihenfolge konnte nicht gespeichert werden." };
  }

  await logDebugEvent({
    level: "info",
    scope: "cases",
    message: `Admin ${auth.profile?.username} sortierte Case-Gruppen: ${orderedIds.join(", ")}`,
  }).catch(() => {});

  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Case Tier management (extra tiers beyond standard/premium)
// ---------------------------------------------------------------------------

export interface CreateCaseTierInput {
  groupId: string;
  label: string;
  sublabel?: string;
  price: number;
}

/** Adds an extra tier to an existing group. */
export async function createCaseTier(input: CreateCaseTierInput): Promise<CaseAdminResult> {
  const auth = await requireAdmin();
  if (!auth) return { success: false, error: "Kein Zugriff." };
  if (!input.label.trim()) return { success: false, error: "Label darf nicht leer sein." };
  if (input.price < 0) return { success: false, error: "Preis muss positiv sein." };

  const admin = createAdminClient();

  // Find the current max sort_order in this group
  const { data: existingTiers } = await admin.from("case_tiers").select("sort_order").eq("group_id", input.groupId).order("sort_order", { ascending: false }).limit(1);
  const nextSort = (existingTiers?.[0]?.sort_order ?? 0) + 1;

  // Get group's item_types for default
  const { data: group } = await admin.from("case_groups").select("item_types").eq("id", input.groupId).single();

  const tierId = `${input.groupId}-tier-${nextSort}`;
  const { error } = await admin.from("case_tiers").insert({
    id: tierId,
    group_id: input.groupId,
    label: input.label.trim(),
    tier_sublabel: input.sublabel?.trim() || null,
    price: input.price,
    rarity_weights: { normal: 87, selten: 10, mythisch: 3, ultra: 0.1 },
    enabled: true,
    item_types: group?.item_types ?? [],
    sort_order: nextSort,
    name_styles_eligible: false,
    preview_cost: 0,
    multi_open_max: 10,
    updated_at: new Date().toISOString(),
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

/** Deletes an extra tier from a group. Standard (sort_order=0) and premium
 * (sort_order=1) tiers of seeded groups cannot be deleted. */
export async function deleteCaseTier(tierId: string): Promise<CaseAdminResult> {
  const auth = await requireAdmin();
  if (!auth) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { data: tier } = await admin.from("case_tiers").select("id, group_id, sort_order").eq("id", tierId).single();
  if (!tier) return { success: false, error: "Tier nicht gefunden." };

  // Protect standard/premium tiers of seeded groups
  const { data: group } = await admin.from("case_groups").select("is_custom").eq("id", tier.group_id).single();
  if (!group?.is_custom && (tier.sort_order ?? 0) <= 1) {
    return { success: false, error: "Standard- und Premium-Tiers von Standard-Gruppen können nicht gelöscht werden." };
  }

  const { error } = await admin.from("case_tiers").delete().eq("id", tierId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Read helpers for admin page
// ---------------------------------------------------------------------------

export interface CaseGroupAdminRow {
  id: string;
  title: string;
  subtitle: string | null;
  icon_name: string;
  item_types: string[];
  display_order: number;
  enabled: boolean;
  accent_color: string | null;
  is_custom: boolean;
  updated_at: string;
}

/** Loads all case groups for the admin panel, ordered by display_order. */
export async function getCaseGroups(): Promise<CaseGroupAdminRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("case_groups")
    .select("id, title, subtitle, icon_name, item_types, display_order, enabled, accent_color, is_custom, updated_at")
    .order("display_order", { ascending: true });

  if (error || !data) return [];
  return data as CaseGroupAdminRow[];
}
