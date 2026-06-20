"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
    // Only one item per slot may be equipped at a time.
    const { data: sameSlot } = await supabase
      .from("inventory")
      .select("id, items!inner(type)")
      .eq("user_id", user.id)
      .eq("items.type", dbType);

    const idsToUnequip = (sameSlot ?? []).map((row) => row.id);
    if (idsToUnequip.length > 0) {
      await supabase
        .from("inventory")
        .update({ equipped: false })
        .in("id", idsToUnequip);
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
  return { success: true };
}
