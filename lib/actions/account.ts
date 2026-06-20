"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface AccountActionResult {
  success: boolean;
  error?: string;
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export async function updateUsername(newUsername: string): Promise<AccountActionResult> {
  const trimmed = newUsername.trim();

  if (!USERNAME_PATTERN.test(trimmed)) {
    return {
      success: false,
      error: "3-20 Zeichen, nur Buchstaben, Zahlen und Unterstriche.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", trimmed)
    .neq("id", user.id)
    .maybeSingle();

  if (existing) {
    return { success: false, error: "Dieser Name ist bereits vergeben." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ username: trimmed })
    .eq("id", user.id);

  if (error) return { success: false, error: "Speichern fehlgeschlagen." };

  revalidatePath("/account");
  revalidatePath("/");
  return { success: true };
}
