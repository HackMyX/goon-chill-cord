"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";

/**
 * Zentrale Quelle für ALLE auswählbaren Keys pro Kategorie — damit überall im
 * Admin (Shop, Reward-Editor, Level-Road, …) ein Dropdown statt Freitext steht,
 * das sich automatisch füllt + aktualisiert. Eine Action, ein Batch.
 */

export interface KeyOption {
  value: string;
  label: string;
}

export interface AdminKeyOptions {
  ability: KeyOption[];
  name_style: KeyOption[];
  badge: KeyOption[];
  item: KeyOption[];
  case_tier: KeyOption[];
}

const EMPTY: AdminKeyOptions = { ability: [], name_style: [], badge: [], item: [], case_tier: [] };

export async function getAdminKeyOptions(): Promise<AdminKeyOptions> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return EMPTY;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) return EMPTY;

  const [ab, st, ba, it, ct] = await Promise.all([
    admin.from("ability_definitions").select("key, name").order("name"),
    admin.from("name_styles").select("key, label").order("label"),
    admin.from("badge_definitions").select("key, label").order("label"),
    admin.from("items").select("id, name, rarity").order("name"),
    admin.from("case_tiers").select("id, label, group_label").order("price"),
  ]);

  const map = (rows: unknown, valueKey: string, labelKey: string, fallback = ""): KeyOption[] =>
    ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      value: String(r[valueKey] ?? ""),
      label: String(r[labelKey] ?? r[valueKey] ?? fallback),
    })).filter((o) => o.value);

  return {
    ability: map(ab.data, "key", "name"),
    name_style: map(st.data, "key", "label"),
    badge: map(ba.data, "key", "label"),
    item: ((it.data ?? []) as Record<string, unknown>[]).map((r) => ({
      value: String(r.id ?? ""),
      label: `${String(r.name ?? r.id)}${r.rarity ? ` · ${String(r.rarity)}` : ""}`,
    })).filter((o) => o.value),
    case_tier: ((ct.data ?? []) as Record<string, unknown>[]).map((r) => ({
      value: String(r.id ?? ""),
      label: `${r.group_label ? `${String(r.group_label)} · ` : ""}${String(r.label ?? r.id)}`,
    })).filter((o) => o.value),
  };
}
