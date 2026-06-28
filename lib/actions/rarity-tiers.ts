"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";
import {
  DEFAULT_RARITY_TIERS,
  BONUS_CARD_RARITIES,
  type RarityTier,
  type BonusCardRarity,
} from "@/lib/bonus-card-themes";

/**
 * Konfigurierbare Stärke→Seltenheit-Stufen (Auto-Theme). Liegen in
 * `site_config.rarity_tiers jsonb` (Singleton id='default'). Bestimmen, welche
 * Seltenheit (und damit welches Auto-Theme) eine Bonus-Menge bekommt.
 * Vergabe-Logik (rewards-grant.ts) UND Live-Vorschau (Admin) nutzen dieselben Stufen.
 */

/** Grobe Validierung: Array aus { rarity ∈ Seltenheiten, minAmount >= 0 }. */
function sanitizeTiers(raw: unknown): RarityTier[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: RarityTier[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const r = (entry as { rarity?: unknown }).rarity;
    const m = (entry as { minAmount?: unknown }).minAmount;
    if (typeof r !== "string" || !(r in BONUS_CARD_RARITIES)) return null;
    if (typeof m !== "number" || !Number.isFinite(m) || m < 0) return null;
    out.push({ rarity: r as BonusCardRarity, minAmount: Math.floor(m) });
  }
  return out;
}

export async function getRarityTiers(): Promise<RarityTier[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("site_config")
    .select("rarity_tiers")
    .eq("id", "default")
    .maybeSingle();
  if (error || !data) return DEFAULT_RARITY_TIERS;
  const tiers = sanitizeTiers((data as { rarity_tiers: unknown }).rarity_tiers);
  return tiers ?? DEFAULT_RARITY_TIERS;
}

export async function saveRarityTiers(
  tiers: RarityTier[],
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
  if (!isAdmin(profile)) return { success: false, error: "Kein Zugriff." };

  // Validierung: mind. 1 Eintrag, jede rarity gültig, minAmount >= 0.
  const clean = sanitizeTiers(tiers);
  if (!clean) return { success: false, error: "Ungültige Stufen — jede Seltenheit muss gültig sein und minAmount ≥ 0." };

  const admin = createAdminClient();
  const { error } = await admin.from("site_config").upsert({
    id: "default",
    rarity_tiers: clean,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    void logDebugEvent({ level: "error", scope: "admin:rarity-tiers", message: "Seltenheits-Stufen Speichern fehlgeschlagen", detail: error.message, context: { userId: user.id } });
    return { success: false, error: "Speichern fehlgeschlagen — ist die rarity_tiers-Migration eingespielt? (node scripts/add-rarity-tiers-config.cjs)" };
  }

  void logActivity("admin:rarity-tiers", "Seltenheits-Stufen gespeichert", { userId: user.id, tiers: clean });
  return { success: true };
}
