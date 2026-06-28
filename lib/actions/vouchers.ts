"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { notifyUser } from "@/lib/notifications-internal";
import { logActivity } from "@/lib/debug-log-server";
import { normalizeCode, parseVoucherRewards, parseVoucherSpecs, voucherRewardToSpec, type RedemptionCode, type VoucherRewardType, type VoucherRewardValue } from "@/lib/vouchers";
import { grantReward, type RewardSpec } from "@/lib/rewards-grant";

type Admin = ReturnType<typeof createAdminClient>;

async function requireAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  return isAdmin(profile) ? user : null;
}

/** Build the canonical RewardSpec[] for a code row — understands BOTH the new
 *  RewardSpec JSONB and the legacy single-reward columns (very old codes). */
function rowToSpecs(r: Record<string, unknown>): RewardSpec[] {
  const specs = parseVoucherSpecs(r.rewards);
  if (specs.length > 0) return specs;
  // Legacy single-column fallback (codes created before the `rewards` array existed).
  return parseVoucherRewards(undefined, {
    rewardType: r.reward_type as VoucherRewardType | undefined,
    rewardValue: (r.reward_value as VoucherRewardValue) ?? {},
    abilityDurationHours: (r.ability_duration_hours as number) ?? 0,
  })
    .map((v) => voucherRewardToSpec(v))
    .filter((s): s is RewardSpec => s !== null);
}

function rowToCode(r: Record<string, unknown>, usedCount: number, uniqueUsers?: number): RedemptionCode {
  const targets = r.target_user_ids;
  return {
    code: r.code as string,
    label: (r.label as string | null) ?? null,
    rewards: rowToSpecs(r),
    maxUses: (r.max_uses as number) ?? 0,
    perUserLimit: (r.per_user_limit as number) ?? 1,
    targetUserIds: Array.isArray(targets) && targets.length > 0 ? (targets as string[]) : null,
    startsAt: (r.starts_at as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
    enabled: (r.enabled as boolean) ?? true,
    createdAt: r.created_at as string,
    usedCount,
    uniqueUsers,
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
  if (row.starts_at && new Date(row.starts_at as string) > new Date()) {
    return { success: false, error: "Dieser Code ist noch nicht aktiv." };
  }
  if (row.expires_at && new Date(row.expires_at as string) < new Date()) {
    return { success: false, error: "Dieser Code ist abgelaufen." };
  }

  // Targeted code — only the listed users may redeem.
  const targets = row.target_user_ids;
  if (Array.isArray(targets) && targets.length > 0 && !targets.includes(user.id)) {
    return { success: false, error: "Dieser Code ist nicht für dich bestimmt." };
  }

  const perUserLimit = Math.max(1, (row.per_user_limit as number) ?? 1);
  // How often this user already redeemed it (per-user cap).
  const { count: myCount } = await admin
    .from("redemption_claims").select("*", { count: "exact", head: true }).eq("code", code).eq("user_id", user.id);
  if ((myCount ?? 0) >= perUserLimit) {
    return { success: false, error: perUserLimit === 1 ? "Du hast diesen Code bereits eingelöst." : "Du hast dein Einlöse-Limit für diesen Code erreicht." };
  }

  const maxUses = (row.max_uses as number) ?? 0;
  // Fast-path total cap check (a definitive, race-safe re-check happens after insert).
  if (maxUses > 0) {
    const { count } = await admin
      .from("redemption_claims").select("*", { count: "exact", head: true }).eq("code", code);
    if ((count ?? 0) >= maxUses) return { success: false, error: "Dieser Code ist aufgebraucht." };
  }

  // Reserve the claim FIRST, then enforce BOTH caps race-safely by checking the row
  // is within the earliest-N window (per-user and total). The count-then-insert TOCTOU
  // can't over-issue: a loser under a concurrent race finds itself outside the window.
  const { data: claim, error: claimErr } = await admin
    .from("redemption_claims").insert({ code, user_id: user.id }).select("id").single();
  if (claimErr || !claim) {
    return { success: false, error: "Einlösen fehlgeschlagen. Bitte erneut versuchen." };
  }
  const claimId = (claim as { id: string }).id;

  const withinEarliest = async (limit: number, scopeUser: boolean): Promise<boolean> => {
    let q = admin.from("redemption_claims").select("id").eq("code", code);
    if (scopeUser) q = q.eq("user_id", user.id);
    const { data } = await q.order("claimed_at", { ascending: true }).order("id", { ascending: true }).limit(limit);
    return (data ?? []).some((r) => (r as { id: string }).id === claimId);
  };
  if (!(await withinEarliest(perUserLimit, true))) {
    await admin.from("redemption_claims").delete().eq("id", claimId);
    return { success: false, error: perUserLimit === 1 ? "Du hast diesen Code bereits eingelöst." : "Du hast dein Einlöse-Limit für diesen Code erreicht." };
  }
  if (maxUses > 0 && !(await withinEarliest(maxUses, false))) {
    await admin.from("redemption_claims").delete().eq("id", claimId);
    return { success: false, error: "Dieser Code ist aufgebraucht." };
  }

  // Grant the FULL bundle. Every reward must succeed; on any failure roll the
  // whole claim back so the user can retry (and isn't left half-rewarded).
  const rewards = rowToSpecs(row);
  if (rewards.length === 0) {
    await admin.from("redemption_claims").delete().eq("id", claimId);
    return { success: false, error: "Dieser Code hat keine Belohnungen." };
  }

  const summaries: string[] = [];
  for (const r of rewards) {
    const grant = await grantVoucherReward(admin, user.id, r);
    if (!grant.ok) {
      await admin.from("redemption_claims").delete().eq("id", claimId);
      return { success: false, error: grant.error ?? "Belohnung konnte nicht vergeben werden." };
    }
    summaries.push(grant.summary);
  }
  const summary = summaries.join(" · ");

  await admin.from("redemption_claims").update({ reward_summary: summary }).eq("id", claimId);

  await notifyUser({
    userId: user.id,
    type: "admin_grant_item",
    title: "🎁 Code eingelöst!",
    message: summary,
    link: "/garderobe",
  });
  void logActivity("voucher:claim", `Code ${code} eingelöst`, { userId: user.id, code, reward: summary });
  revalidatePath("/");
  return { success: true, reward: summary };
}

/** Grant ONE stored voucher reward. Normalises BOTH formats (old VoucherReward
 *  JSON and new RewardSpec) to a canonical RewardSpec and dispatches through the
 *  central granter (§9), so every reward type — incl. game_bonus, xp, items — works
 *  here, and pre-existing codes stay redeemable. */
async function grantVoucherReward(
  admin: Admin,
  userId: string,
  reward: unknown
): Promise<{ ok: boolean; error?: string; summary: string }> {
  const spec = voucherRewardToSpec(reward);
  if (!spec) return { ok: false, error: "Ungültige Belohnung.", summary: "" };
  return await grantReward(admin, userId, spec, "voucher");
}

// ─── Admin: manage codes ─────────────────────────────────────────────────────

export async function adminListRedemptionCodes(): Promise<RedemptionCode[]> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return [];
  const admin = createAdminClient();
  const { data: codes } = await admin.from("redemption_codes").select("*").order("created_at", { ascending: false });
  if (!codes || codes.length === 0) return [];
  const { data: claims } = await admin.from("redemption_claims").select("code, user_id");
  const counts = new Map<string, number>();
  const users = new Map<string, Set<string>>();
  for (const c of (claims ?? []) as { code: string; user_id: string }[]) {
    counts.set(c.code, (counts.get(c.code) ?? 0) + 1);
    if (!users.has(c.code)) users.set(c.code, new Set());
    users.get(c.code)!.add(c.user_id);
  }
  return (codes as Record<string, unknown>[]).map((r) =>
    rowToCode(r, counts.get(r.code as string) ?? 0, users.get(r.code as string)?.size ?? 0)
  );
}

/** Validate + sanitise a canonical RewardSpec bundle (all 9 types). Returns the
 *  cleaned specs or an error. Stored RAW into `rewards` JSONB; granted via §9. */
function sanitizeBundle(raw: RewardSpec[] | undefined): { rewards: RewardSpec[] } | { error: string } {
  const rewards: RewardSpec[] = [];
  for (const r of raw ?? []) {
    if (!r || typeof r !== "object") continue;
    const dur = Math.max(0, Math.floor(r.durationHours ?? 0));
    switch (r.type) {
      case "credits": {
        const amount = Math.max(0, Math.floor(r.amount ?? 0));
        if (amount <= 0) return { error: "Eine Credits-Belohnung hat keinen Betrag." };
        rewards.push({ type: "credits", amount });
        break;
      }
      case "xp": {
        const amount = Math.max(0, Math.floor(r.amount ?? 0));
        if (amount <= 0) return { error: "Eine XP-Belohnung hat keinen Betrag." };
        rewards.push({ type: "xp", amount });
        break;
      }
      case "item": {
        if (!r.itemId) return { error: "Eine Item-Belohnung hat kein Item ausgewählt." };
        rewards.push({ type: "item", itemId: r.itemId, amount: Math.max(1, Math.floor(r.amount ?? 1)) });
        break;
      }
      case "random_item": {
        if (!r.itemRarity) return { error: "Ein Zufalls-Item hat keine Seltenheit." };
        rewards.push({ type: "random_item", itemRarity: r.itemRarity, amount: Math.max(1, Math.floor(r.amount ?? 1)) });
        break;
      }
      case "ability": {
        if (!r.abilityKey) return { error: "Eine Fähigkeits-Belohnung hat keine Fähigkeit." };
        rewards.push({ type: "ability", abilityKey: r.abilityKey, durationHours: dur });
        break;
      }
      case "badge": {
        if (!r.badgeKey) return { error: "Eine Badge-Belohnung hat kein Badge." };
        rewards.push({ type: "badge", badgeKey: r.badgeKey });
        break;
      }
      case "name_style": {
        if (!r.styleKey) return { error: "Eine Style-Belohnung hat keinen Name-Style." };
        rewards.push({ type: "name_style", styleKey: r.styleKey });
        break;
      }
      case "case_voucher": {
        const mode = r.voucherMode === "rarity" ? "rarity" : "tier";
        if (mode === "tier" && !r.voucherTierId) return { error: "Ein Case-Gutschein hat kein Case ausgewählt." };
        if (mode === "rarity" && !r.voucherRarityFloor) return { error: "Ein Case-Gutschein (Seltenheit) hat keine Stufe." };
        rewards.push({
          type: "case_voucher",
          voucherMode: mode,
          voucherTierId: mode === "tier" ? r.voucherTierId : undefined,
          voucherRarityFloor: mode === "rarity" ? r.voucherRarityFloor : undefined,
          durationHours: dur,
        });
        break;
      }
      case "game_bonus": {
        if (!r.bonusGame) return { error: "Ein Spiel-Bonus hat kein Spiel ausgewählt." };
        const amount = Math.max(1, Math.floor(r.amount ?? 0));
        rewards.push({ type: "game_bonus", bonusGame: r.bonusGame, amount, durationHours: dur });
        break;
      }
    }
  }
  if (rewards.length === 0) return { error: "Mindestens eine Belohnung hinzufügen." };
  return { rewards };
}

// Legacy single-reward columns (reward_type/reward_value/ability_duration_hours)
// carry a DB CHECK that only allows the original 4 types. They're deprecated — the
// `rewards` JSONB is the source of truth — so we only mirror when the first spec is
// one of those 4, otherwise we write a constraint-safe placeholder.
const LEGACY_MIRROR_TYPES = ["credits", "ability", "badge", "name_style"];

/** The DB row patch (bundle + mirrored legacy columns) for a reward bundle. */
function bundleRow(rewards: RewardSpec[]): Record<string, unknown> {
  const first = rewards[0];
  const mirror = LEGACY_MIRROR_TYPES.includes(first.type);
  return {
    rewards,
    reward_type: mirror ? first.type : "credits",
    reward_value: mirror
      ? { amount: first.amount, abilityKey: first.abilityKey, badgeKey: first.badgeKey, styleKey: first.styleKey }
      : {},
    ability_duration_hours: mirror ? Math.max(0, Math.floor(first.durationHours ?? 0)) : 0,
  };
}

interface CodeSettings {
  label?: string;
  maxUses?: number;
  perUserLimit?: number;
  targetUserIds?: string[] | null;
  startsAt?: string | null;
  expiresAt?: string | null;
}
function settingsRow(s: CodeSettings): Record<string, unknown> {
  const targets = Array.isArray(s.targetUserIds) && s.targetUserIds.length > 0 ? s.targetUserIds : null;
  return {
    label: s.label?.trim() || null,
    max_uses: Math.max(0, Math.floor(s.maxUses ?? 0)),
    per_user_limit: Math.max(1, Math.floor(s.perUserLimit ?? 1)),
    target_user_ids: targets,
    starts_at: s.startsAt || null,
    expires_at: s.expiresAt || null,
  };
}

export async function adminCreateRedemptionCode(input: CodeSettings & {
  code: string;
  rewards: RewardSpec[];
}): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };

  const code = normalizeCode(input.code);
  if (!/^[A-Z0-9-]{3,32}$/.test(code)) {
    return { success: false, error: "Code muss 3–32 Zeichen sein (A–Z, 0–9, Bindestrich)." };
  }

  const bundle = sanitizeBundle(input.rewards);
  if ("error" in bundle) return { success: false, error: bundle.error };

  const admin = createAdminClient();
  const { error } = await admin.from("redemption_codes").insert({
    code,
    ...settingsRow(input),
    ...bundleRow(bundle.rewards),
    created_by: adminUser.id,
  });
  if (error) {
    return { success: false, error: error.code === "23505" ? "Dieser Code existiert bereits." : error.message };
  }
  void logActivity("voucher:create", `Code ${code} erstellt`, { userId: adminUser.id, code, rewards: bundle.rewards.length });
  revalidatePath("/admin");
  return { success: true };
}

/** Full post-hoc edit of an existing code (label, bundle, limit, expiry, status).
 *  The code string itself is immutable — it's the redemption key claims reference. */
export async function adminUpdateRedemptionCode(input: CodeSettings & {
  code: string;
  rewards: RewardSpec[];
  enabled?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };

  const code = normalizeCode(input.code);
  const bundle = sanitizeBundle(input.rewards);
  if ("error" in bundle) return { success: false, error: bundle.error };

  const admin = createAdminClient();
  const patch: Record<string, unknown> = {
    ...settingsRow(input),
    ...bundleRow(bundle.rewards),
  };
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;

  const { data, error } = await admin.from("redemption_codes").update(patch).eq("code", code).select("code").maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Code nicht gefunden." };
  void logActivity("voucher:update", `Code ${code} bearbeitet`, { userId: adminUser.id, code, rewards: bundle.rewards.length });
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

// ─── Admin: direct grant (no code needed) ────────────────────────────────────

/** Instantly apply a reward bundle to one or more players — no code, no redemption.
 *  Each user is notified. Great for compensation, prizes, targeted gifts. */
export async function adminGrantVoucherToUsers(input: {
  userIds: string[];
  rewards: RewardSpec[];
  note?: string;
}): Promise<{ success: boolean; error?: string; granted?: number }> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };

  const bundle = sanitizeBundle(input.rewards);
  if ("error" in bundle) return { success: false, error: bundle.error };
  const userIds = [...new Set((input.userIds ?? []).filter(Boolean))];
  if (userIds.length === 0) return { success: false, error: "Keine Spieler ausgewählt." };

  const admin = createAdminClient();
  const { data: adminProfile } = await admin.from("profiles").select("username").eq("id", adminUser.id).maybeSingle();
  const adminName = (adminProfile as { username?: string } | null)?.username ?? "Admin";
  let granted = 0;
  for (const userId of userIds) {
    const summaries: string[] = [];
    let ok = true;
    for (const r of bundle.rewards) {
      const g = await grantVoucherReward(admin, userId, r);
      if (!g.ok) { ok = false; break; }
      summaries.push(g.summary);
    }
    if (!ok) continue;
    granted++;
    const summary = summaries.join(" · ");

    // Aktivitätslog im Log des EMPFÄNGERS (non-fatal).
    try {
      await admin.from("audit_logs").insert({
        user_id: userId,
        action: "voucher_received",
        payload: { summary, by: adminName, note: input.note?.trim() || null },
      });
    } catch { /* non-fatal */ }

    await notifyUser({
      userId,
      type: "admin_grant_item",
      title: "🎁 Geschenk erhalten!",
      message: input.note?.trim() ? `${input.note.trim()} — ${summary}` : summary,
      link: "/garderobe",
    });
  }
  void logActivity("voucher:grant", `Direkt-Vergabe an ${granted} Spieler`, { userId: adminUser.id, count: granted, rewards: bundle.rewards.length });
  revalidatePath("/admin");
  return { success: true, granted };
}

// ─── Admin: usage / claims management ────────────────────────────────────────

export interface VoucherClaimRow {
  id: string;
  userId: string;
  username: string;
  claimedAt: string;
  rewardSummary: string | null;
}

/** Who redeemed a code, when, and what they got. */
export async function adminGetCodeClaims(code: string): Promise<VoucherClaimRow[]> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return [];
  const admin = createAdminClient();
  const { data: claims } = await admin
    .from("redemption_claims")
    .select("id, user_id, claimed_at, reward_summary")
    .eq("code", normalizeCode(code))
    .order("claimed_at", { ascending: false });
  if (!claims || claims.length === 0) return [];
  const ids = [...new Set(claims.map((c) => c.user_id as string))];
  const { data: profs } = await admin.from("profiles").select("id, username").in("id", ids);
  const names = new Map((profs ?? []).map((p) => [p.id as string, p.username as string]));
  return claims.map((c) => ({
    id: c.id as string,
    userId: c.user_id as string,
    username: names.get(c.user_id as string) ?? "Unbekannt",
    claimedAt: c.claimed_at as string,
    rewardSummary: (c.reward_summary as string | null) ?? null,
  }));
}

/** Remove a user's claim(s) for a code so they can redeem it again. */
export async function adminResetUserClaim(code: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const { error } = await admin.from("redemption_claims").delete().eq("code", normalizeCode(code)).eq("user_id", userId);
  if (error) return { success: false, error: error.message };
  void logActivity("voucher:reset_claim", `Einlösung zurückgesetzt: ${code}`, { userId: adminUser.id, code, target: userId });
  revalidatePath("/admin");
  return { success: true };
}

// ─── Admin: bulk code generation ─────────────────────────────────────────────

/** Generate N unique random codes that all share the same bundle + settings —
 *  perfect for giveaways where each winner gets a single-use one-of-a-kind code. */
export async function adminBulkCreateCodes(input: CodeSettings & {
  prefix: string;
  count: number;
  rewards: RewardSpec[];
}): Promise<{ success: boolean; error?: string; codes?: string[] }> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };

  const bundle = sanitizeBundle(input.rewards);
  if ("error" in bundle) return { success: false, error: bundle.error };

  const count = Math.max(1, Math.min(200, Math.floor(input.count)));
  const prefix = normalizeCode(input.prefix || "GIFT").slice(0, 16);
  if (!/^[A-Z0-9-]*$/.test(prefix)) return { success: false, error: "Präfix nur A–Z, 0–9, Bindestrich." };

  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
  const admin = createAdminClient();
  const settings = settingsRow(input);
  const bRow = bundleRow(bundle.rewards);
  const created: string[] = [];
  for (let i = 0; i < count; i++) {
    let inserted = false;
    for (let attempt = 0; attempt < 6 && !inserted; attempt++) {
      let suffix = "";
      for (let k = 0; k < 6; k++) suffix += ALPHA[Math.floor(Math.random() * ALPHA.length)];
      const code = normalizeCode(`${prefix ? prefix + "-" : ""}${suffix}`).slice(0, 32);
      const { error } = await admin.from("redemption_codes").insert({
        code, ...settings, ...bRow, created_by: adminUser.id,
      });
      if (!error) { created.push(code); inserted = true; }
      else if (error.code !== "23505") break; // non-duplicate error → stop trying this one
    }
  }
  if (created.length === 0) return { success: false, error: "Konnte keine Codes erzeugen." };
  void logActivity("voucher:bulk", `${created.length} Bulk-Codes erstellt`, { userId: adminUser.id, count: created.length });
  revalidatePath("/admin");
  return { success: true, codes: created };
}
