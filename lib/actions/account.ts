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

export interface PlayerSettings {
  acceptsTrades: boolean;
  profileVisible: boolean;
}

export async function getPlayerSettings(): Promise<PlayerSettings> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { acceptsTrades: true, profileVisible: true };

  const { data } = await supabase
    .from("profiles")
    .select("accepts_trades, profile_visible")
    .eq("id", user.id)
    .single();

  return {
    acceptsTrades: data?.accepts_trades ?? true,
    profileVisible: data?.profile_visible ?? true,
  };
}

export async function updatePlayerSettings(input: Partial<PlayerSettings>): Promise<AccountActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };

  const payload: Record<string, boolean> = {};
  if (typeof input.acceptsTrades === "boolean") payload.accepts_trades = input.acceptsTrades;
  if (typeof input.profileVisible === "boolean") payload.profile_visible = input.profileVisible;
  if (Object.keys(payload).length === 0) return { success: true };

  const { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
  if (error) return { success: false, error: "Speichern fehlgeschlagen." };

  revalidatePath("/account");
  revalidatePath("/");
  revalidatePath("/community");
  return { success: true };
}
