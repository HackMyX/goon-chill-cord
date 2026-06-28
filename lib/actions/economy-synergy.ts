"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { logActivity } from "@/lib/debug-log-server";
import {
  DEFAULT_SYNERGY_CONFIG, mergeSynergyConfig, computeSynergyMultipliers,
  type EconomySynergyConfig,
} from "@/lib/economy-synergy";

type Admin = ReturnType<typeof createAdminClient>;

// ── Short-lived cache (the credit hook reads this on every reward) ──────────────
let CACHE: { cfg: EconomySynergyConfig; at: number } | null = null;
const TTL = 30_000;

export async function getSynergyConfig(): Promise<EconomySynergyConfig> {
  if (CACHE && Date.now() - CACHE.at < TTL) return CACHE.cfg;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("economy_synergy_config").select("config").eq("id", "default").maybeSingle();
    const cfg = mergeSynergyConfig((data?.config as Partial<EconomySynergyConfig> | null) ?? null);
    CACHE = { cfg, at: Date.now() };
    return cfg;
  } catch {
    return DEFAULT_SYNERGY_CONFIG;
  }
}

async function requireAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  return isAdmin(profile) ? user : null;
}

export async function adminGetSynergyConfig(): Promise<EconomySynergyConfig> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return DEFAULT_SYNERGY_CONFIG;
  const admin = createAdminClient();
  const { data } = await admin.from("economy_synergy_config").select("config").eq("id", "default").maybeSingle();
  return mergeSynergyConfig((data?.config as Partial<EconomySynergyConfig> | null) ?? null);
}

export async function adminUpdateSynergyConfig(
  cfg: EconomySynergyConfig
): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };
  const clean = mergeSynergyConfig(cfg);
  const admin = createAdminClient();
  const { error } = await admin.from("economy_synergy_config").upsert({ id: "default", config: clean, updated_at: new Date().toISOString() });
  if (error) return { success: false, error: error.message };
  CACHE = null; // bust
  void logActivity("synergy:update", "Synergie-Konfiguration aktualisiert", { userId: adminUser.id });
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

// ── Cross-flow helper: add BP XP to the user's ACTIVE battle pass ───────────────
export async function addBpXpToActivePass(admin: Admin, userId: string, amount: number): Promise<void> {
  if (!(amount > 0)) return;
  try {
    const { data: pass } = await admin
      .from("battle_passes").select("id").eq("is_active", true).eq("enabled", true).maybeSingle();
    if (!pass) return;
    const passId = pass.id as string;
    const { data: ubp } = await admin
      .from("user_battle_passes").select("bp_xp").eq("user_id", userId).eq("pass_id", passId).maybeSingle();
    if (ubp) {
      await admin.from("user_battle_passes").update({ bp_xp: ((ubp.bp_xp as number | null) ?? 0) + amount }).eq("user_id", userId).eq("pass_id", passId);
    } else {
      await admin.from("user_battle_passes").insert({ user_id: userId, pass_id: passId, bp_xp: amount, progress_days: 0, has_premium: false });
    }
  } catch { /* non-fatal */ }
}

// ── Public: live boost status for banners / UI ──────────────────────────────────
export async function getActiveBoostStatus(): Promise<{ active: boolean; label: string; xpMult: number; creditMult: number }> {
  const cfg = await getSynergyConfig();
  const m = computeSynergyMultipliers(cfg, 0, new Date()); // level 0 → only time boosts
  return { active: m.timeBoostActive, label: cfg.eventLabel, xpMult: m.xpMult, creditMult: m.creditMult };
}
