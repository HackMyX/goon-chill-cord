"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

export interface ToggleEquipResult {
  success: boolean;
  error?: string;
}

export async function toggleEquip(
  inventoryId: string,
  dbType: string,
  nextEquipped: boolean
): Promise<ToggleEquipResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Du musst eingeloggt sein." };
  }

  if (nextEquipped) {
    if (dbType === "ring") {
      // Allow up to 2 rings simultaneously (one per arm). Only unequip the
      // oldest-equipped ring when both slots are already taken.
      const { data: equippedRings } = await supabase
        .from("inventory")
        .select("id, obtained_at, items!inner(type)")
        .eq("user_id", user.id)
        .eq("equipped", true)
        .eq("items.type", "ring");

      const rings = (equippedRings ?? []) as { id: string; obtained_at: string | null }[];
      rings.sort((a, b) => (a.obtained_at ?? "").localeCompare(b.obtained_at ?? ""));

      if (rings.length >= 2) {
        await supabase.from("inventory").update({ equipped: false }).eq("id", rings[0].id);
      }
    } else {
      // Only one item per slot may be equipped at a time.
      const { data: sameSlot } = await supabase
        .from("inventory")
        .select("id, items!inner(type)")
        .eq("user_id", user.id)
        .eq("items.type", dbType);

      const idsToUnequip = (sameSlot ?? []).map((row) => row.id);
      if (idsToUnequip.length > 0) {
        await supabase.from("inventory").update({ equipped: false }).in("id", idsToUnequip);
      }
    }
  }

  const { error } = await supabase
    .from("inventory")
    .update({ equipped: nextEquipped })
    .eq("id", inventoryId)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: "Item konnte nicht aktualisiert werden." };
  }

  revalidatePath("/garderobe");
  revalidatePath("/world");
  return { success: true };
}

/**
 * Persists the player's chosen body/gender ("m" | "w") to profiles.gender so
 * it's the same in the Garderobe preview, the 3D World, and after a reload —
 * previously this only lived in WardrobeShell's local useState and the World
 * page hard-coded "m", so picking "w" in the Garderobe never actually showed
 * up anywhere else.
 *
 * One-way door for regular players: the *first* call also sets
 * `gender_locked = true`, and every call after that is rejected server-side
 * regardless of what the client sends. This is deliberately not just a
 * client-side disabled button — gender determines which body shape and
 * silhouette every equipped item (hair included) renders as, so the lock
 * has to be enforced where it can't be bypassed by calling the action
 * directly.
 *
 * Admins are exempt from the lock entirely (and never get `gender_locked`
 * set on their own switches) — they need to freely flip between both bodies
 * to check the male/female Garderobe and World rendering while testing.
 */
export async function updateGender(gender: "m" | "w"): Promise<ToggleEquipResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Du musst eingeloggt sein." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("gender_locked, role, username")
    .eq("id", user.id)
    .single();

  const admin = isAdmin(profile);

  if (profile?.gender_locked && !admin) {
    return {
      success: false,
      error: "Geschlecht ist bereits festgelegt und kann nicht mehr geändert werden.",
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update(admin ? { gender } : { gender, gender_locked: true })
    .eq("id", user.id);

  if (error) {
    return { success: false, error: "Geschlecht konnte nicht gespeichert werden." };
  }

  revalidatePath("/garderobe");
  revalidatePath("/world");
  revalidatePath("/account");
  revalidatePath("/");
  return { success: true };
}
