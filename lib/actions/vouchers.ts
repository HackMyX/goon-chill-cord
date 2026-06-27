"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { notifyUser } from "@/lib/notifications-internal";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";
import { recomputeAutoPrioBadges } from "@/lib/actions/prio-badges";
import { checkAndAwardNameStyleBadges } from "@/lib/actions/badges";
import { normalizeCode, type RedemptionCode, type VoucherRewardType, type VoucherRewardValue } from "@/lib/vouchers";

type Admin = ReturnType<typeof createAdminClient>;

async function requireAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  return isAdmin(profile) ? user : null;
}

function rowToCode(r: Record<string, unknown>, usedCount: number): RedemptionCode {
  return {
    code: r.code as string,
    label: (r.label as string | null) ?? null,
    rewardType: r.reward_type as VoucherRewardType,
    rewardValue: (r.reward_value as VoucherRewardValue) ?? {},
    abilityDurationHours: (r.ability_duration_hours as number) ?? 0,
    maxUses: (r.max_uses as number) ?? 0,
    expiresAt: (r.expires_at as string | null) ?? null,
    enabled: (r.enabled as boolean) ?? true,
    createdAt: r.created_at as string,
    usedCount,
  };
}

// ─── User: redeem a code ─────────────────────────────────────────────────────

export async function claimRedemptionCode(
  rawCode: string
): Promise<{ success: boolean; error?: string; reward?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Nicht eingeloggt." };

  const code = normalizeCode(rawCode);
  if (!code) return { success: false, error: "Bitte einen Code eingeben." };

  const admin = createAdminClient();
  const { data: row } = await admin.from("redemption_codes").select("*").eq("code", code).maybeSingle();
  if (!row) return { success: false, error: "Ungültiger Code." };
  if (!(row.enabled as boolean)) return { success: false, error: "Dieser Code ist deaktiviert." };
  if (row.expires_at && new Date(row.expires_at as string) < new Date()) {
    return { success: false, error: "Dieser Code ist abgelaufen." };
  }

  // Already redeemed by this user? (also enforced by the UNIQUE constraint)
  const { data: mine } = await admin
    .from("redemption_claims").select("id").eq("code", code).eq("user_id", user.id).maybeSingle();
  if (mine) return { success: false, error: "Du hast diesen Code bereits eingelöst." };

  const maxUses = (row.max_uses as number) ?? 0;
  // Fast-path cap check (a definitive, race-safe re-check happens after insert).
  if (maxUses > 0) {
    const { count } = await admin
      .from("redemption_claims").select("*", { count: "exact", head: true }).eq("code", code);
    if ((count ?? 0) >= maxUses) return { success: false, error: "Dieser Code ist aufgebraucht." };
  }

  // Reserve the claim FIRST (the UNIQUE(code,user_id) makes double-redeem impossible
  // even under a double-click race). If this fails on conflict, they already claimed.
  const { data: claim, error: claimErr } = await admin
    .from("redemption_claims").insert({ code, user_id: user.id }).select("id").single();
  if (claimErr || !claim) {
    return { success: false, error: "Du hast diesen Code bereits eingelöst." };
  }

  // Race-safe cap enforcement: after reserving, keep only the earliest `maxUses`
  // claims (deterministic by claimed_at,id). If two different users redeemed a
  // limited code simultaneously, the later one finds itself outside the window
  // and is rolled back — the count-then-insert TOCTOU can't over-issue.
  if (maxUses > 0) {
    const { data: earliest } = await admin
      .from("redemption_claims")
      .select("id")
      .eq("code", code)
      .order("claimed_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(maxUses);
    const within = (earliest ?? []).some((r) => (r as { id: string }).id === (claim as { id: string }).id);
    if (!within) {
      await admin.from("redemption_claims").delete().eq("id", (claim as { id: string }).id);
      return { success: false, error: "Dieser Code ist aufgebraucht." };
    }
  }

  // Grant the reward. On failure, roll the claim back so they can retry.
  const grant = await grantVoucherReward(
    admin, user.id,
    row.reward_type as VoucherRewardType,
    (row.reward_value as VoucherRewardValue) ?? {},
    (row.ability_duration_hours as number) ?? 0
  );
  if (!grant.ok) {
    await admin.from("redemption_claims").delete().eq("code", code).eq("user_id", user.id);
    return { success: false, error: grant.error ?? "Belohnung konnte nicht vergeben werden." };
  }

  await admin.from("redemption_claims").update({ reward_summary: grant.summary }).eq("code", code).eq("user_id", user.id);

  await notifyUser({
    userId: user.id,
    type: "admin_grant_item",
    title: "🎁 Code eingelöst!",
    message: grant.summary,
    link: "/garderobe",
  });
  void logActivity("voucher:claim", `Code ${code} eingelöst`, { userId: user.id, code, reward: grant.summary });
  revalidatePath("/");
  return { success: true, reward: grant.summary };
}

async function grantVoucherReward(
  admin: Admin,
  userId: string,
  type: VoucherRewardType,
  value: VoucherRewardValue,
  abilityDurationHours: number
): Promise<{ ok: boolean; error?: string; summary: string }> {
  try {
    if (type === "credits") {
      const amount = Math.max(0, Math.floor(value.amount ?? 0));
      if (amount <= 0) return { ok: false, error: "Code enthält keine Credits.", summary: "" };
      const { data: p } = await admin.from("profiles").select("credits").eq("id", userId).single();
      await admin.from("profiles").update({ credits: ((p?.credits as number) ?? 0) + amount }).eq("id", userId);
      return { ok: true, summary: `+${amount.toLocaleString("de-DE")} Credits` };
    }

    if (type === "ability") {
      const abilityKey = value.abilityKey;
      if (!abilityKey) return { ok: false, error: "Code ohne Fähigkeit.", summary: "" };
      const { data: def } = await admin.from("ability_definitions").select("name").eq("key", abilityKey).maybeSingle();
      if (!def) return { ok: false, error: "Fähigkeit existiert nicht mehr.", summary: "" };
      const expiresAt = abilityDurationHours > 0
        ? new Date(Date.now() + abilityDurationHours * 3_600_000).toISOString()
        : null;
      const { error } = await admin.from("user_abilities").insert({
        user_id: userId, ability_key: abilityKey, source: "voucher",
        source_detail: abilityDurationHours > 0 ? `Gutschein (${abilityDurationHours}h)` : "Gutschein",
        expires_at: expiresAt,
      });
      if (error) return { ok: false, error: "Fähigkeit konnte nicht vergeben werden.", summary: "" };
      const dur = abilityDurationHours > 0 ? ` (${abilityDurationHours}h)` : "";
      return { ok: true, summary: `Fähigkeit: ${(def.name as string) ?? abilityKey}${dur}` };
    }

    if (type === "badge") {
      const badgeKey = value.badgeKey;
      if (!badgeKey) return { ok: false, error: "Code ohne Badge.", summary: "" };
      const { data: def } = await admin.from("badge_definitions").select("label").eq("key", badgeKey).maybeSingle();
      if (!def) return { ok: false, error: "Badge existiert nicht mehr.", summary: "" };
      const { error } = await admin.from("user_badges")
        .upsert({ user_id: userId, badge_key: badgeKey }, { onConflict: "user_id,badge_key", ignoreDuplicates: true });
      if (error) return { ok: false, error: "Badge konnte nicht vergeben werden.", summary: "" };
      await recomputeAutoPrioBadges(userId);
      return { ok: true, summary: `Badge: ${(def.label as string) ?? badgeKey}` };
    }

    if (type === "name_style") {
      const styleKey = value.styleKey;
      if (!styleKey) return { ok: false, error: "Code ohne Name-Style.", summary: "" };
      const { ensureStyleInDb } = await import("@/lib/actions/name-styles");
      await ensureStyleInDb(styleKey, admin);
      const { error } = await admin.from("user_name_styles")
        .upsert({ user_id: userId, style_key: styleKey, source: "voucher" }, { onConflict: "user_id,style_key", ignoreDuplicates: true });
      if (error) return { ok: false, error: "Name-Style konnte nicht vergeben werden.", summary: "" };
      void checkAndAwardNameStyleBadges(userId);
      return { ok: true, summary: `Name-Style: ${styleKey}` };
    }

    return { ok: false, error: "Unbekannter Belohnungstyp.", summary: "" };
  } catch (e) {
    void logDebugEvent({ level: "error", scope: "voucher", message: "grantVoucherReward fehlgeschlagen", detail: String(e), context: { userId, type } });
    return { ok: false, error: "Interner Fehler bei der Belohnung.", summary: "" };
  }
}

// ─── Admin: manage codes ─────────────────────────────────────────────────────

export async function adminListRedemptionCodes(): Promise<RedemptionCode[]> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return [];
  const admin = createAdminClient();
  const { data: codes } = await admin.from("redemption_codes").select("*").order("created_at", { ascending: false });
  if (!codes || codes.length === 0) return [];
  const { data: claims } = await admin.from("redemption_claims").select("code");
  const counts = new Map<string, number>();
  for (const c of (claims ?? []) as { code: string }[]) counts.set(c.code, (counts.get(c.code) ?? 0) + 1);
  return (codes as Record<string, unknown>[]).map((r) => rowToCode(r, counts.get(r.code as string) ?? 0));
}

export async function adminCreateRedemptionCode(input: {
  code: string;
  label?: string;
  rewardType: VoucherRewardType;
  rewardValue: VoucherRewardValue;
  abilityDurationHours?: number;
  maxUses?: number;
  expiresAt?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };

  const code = normalizeCode(input.code);
  if (!/^[A-Z0-9-]{3,32}$/.test(code)) {
    return { success: false, error: "Code muss 3–32 Zeichen sein (A–Z, 0–9, Bindestrich)." };
  }

  // Validate the reward payload per type.
  const v = input.rewardValue ?? {};
  if (input.rewardType === "credits" && !(v.amount && v.amount > 0)) return { success: false, error: "Credits-Betrag fehlt." };
  if (input.rewardType === "ability" && !v.abilityKey) return { success: false, error: "Fähigkeit fehlt." };
  if (input.rewardType === "badge" && !v.badgeKey) return { success: false, error: "Badge fehlt." };
  if (input.rewardType === "name_style" && !v.styleKey) return { success: false, error: "Name-Style fehlt." };

  const admin = createAdminClient();
  const { error } = await admin.from("redemption_codes").insert({
    code,
    label: input.label?.trim() || null,
    reward_type: input.rewardType,
    reward_value: v,
    ability_duration_hours: Math.max(0, Math.floor(input.abilityDurationHours ?? 0)),
    max_uses: Math.max(0, Math.floor(input.maxUses ?? 0)),
    expires_at: input.expiresAt || null,
    created_by: adminUser.id,
  });
  if (error) {
    return { success: false, error: error.code === "23505" ? "Dieser Code existiert bereits." : error.message };
  }
  void logActivity("voucher:create", `Code ${code} erstellt`, { userId: adminUser.id, code, rewardType: input.rewardType });
  revalidatePath("/admin");
  return { success: true };
}

export async function adminToggleRedemptionCode(
  code: string, enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const { error } = await admin.from("redemption_codes").update({ enabled }).eq("code", normalizeCode(code));
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin");
  return { success: true };
}

export async function adminDeleteRedemptionCode(
  code: string
): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const { error } = await admin.from("redemption_codes").delete().eq("code", normalizeCode(code));
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin");
  return { success: true };
}
