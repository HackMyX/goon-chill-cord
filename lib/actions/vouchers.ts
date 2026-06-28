"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { notifyUser } from "@/lib/notifications-internal";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";
import { recomputeAutoPrioBadges } from "@/lib/actions/prio-badges";
import { checkAndAwardNameStyleBadges } from "@/lib/actions/badges";
import { normalizeCode, parseVoucherRewards, type RedemptionCode, type VoucherReward, type VoucherRewardType, type VoucherRewardValue } from "@/lib/vouchers";

type Admin = ReturnType<typeof createAdminClient>;

async function requireAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  return isAdmin(profile) ? user : null;
}

function rowToCode(r: Record<string, unknown>, usedCount: number, uniqueUsers?: number): RedemptionCode {
  const targets = r.target_user_ids;
  return {
    code: r.code as string,
    label: (r.label as string | null) ?? null,
    rewards: parseVoucherRewards(r.rewards, {
      rewardType: r.reward_type as VoucherRewardType | undefined,
      rewardValue: (r.reward_value as VoucherRewardValue) ?? {},
      abilityDurationHours: (r.ability_duration_hours as number) ?? 0,
    }),
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
  const rewards = parseVoucherRewards(row.rewards, {
    rewardType: row.reward_type as VoucherRewardType | undefined,
    rewardValue: (row.reward_value as VoucherRewardValue) ?? {},
    abilityDurationHours: (row.ability_duration_hours as number) ?? 0,
  });
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

async function grantVoucherReward(
  admin: Admin,
  userId: string,
  reward: VoucherReward
): Promise<{ ok: boolean; error?: string; summary: string }> {
  const type = reward.type;
  const value: VoucherRewardValue = {
    amount: reward.amount, abilityKey: reward.abilityKey, badgeKey: reward.badgeKey, styleKey: reward.styleKey,
  };
  const abilityDurationHours = Math.max(0, Math.floor(reward.durationHours ?? 0));
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

/** Validate + sanitise a reward bundle. Returns the cleaned rewards or an error. */
function sanitizeBundle(raw: VoucherReward[] | undefined): { rewards: VoucherReward[] } | { error: string } {
  const rewards: VoucherReward[] = [];
  for (const r of raw ?? []) {
    if (r.type === "credits") {
      const amount = Math.max(0, Math.floor(r.amount ?? 0));
      if (amount <= 0) return { error: "Eine Credits-Belohnung hat keinen Betrag." };
      rewards.push({ type: "credits", amount });
    } else if (r.type === "ability") {
      if (!r.abilityKey) return { error: "Eine Fähigkeits-Belohnung hat keine Fähigkeit." };
      rewards.push({ type: "ability", abilityKey: r.abilityKey, durationHours: Math.max(0, Math.floor(r.durationHours ?? 0)) });
    } else if (r.type === "badge") {
      if (!r.badgeKey) return { error: "Eine Badge-Belohnung hat kein Badge." };
      rewards.push({ type: "badge", badgeKey: r.badgeKey });
    } else if (r.type === "name_style") {
      if (!r.styleKey) return { error: "Eine Style-Belohnung hat keinen Name-Style." };
      rewards.push({ type: "name_style", styleKey: r.styleKey });
    }
  }
  if (rewards.length === 0) return { error: "Mindestens eine Belohnung hinzufügen." };
  return { rewards };
}

/** The DB row patch (bundle + mirrored legacy columns) for a reward bundle. */
function bundleRow(rewards: VoucherReward[]): Record<string, unknown> {
  const first = rewards[0];
  return {
    rewards,
    reward_type: first.type,
    reward_value: { amount: first.amount, abilityKey: first.abilityKey, badgeKey: first.badgeKey, styleKey: first.styleKey },
    ability_duration_hours: Math.max(0, Math.floor(first.durationHours ?? 0)),
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
  rewards: VoucherReward[];
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
  rewards: VoucherReward[];
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
  rewards: VoucherReward[];
  note?: string;
}): Promise<{ success: boolean; error?: string; granted?: number }> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return { success: false, error: "Kein Zugriff." };

  const bundle = sanitizeBundle(input.rewards);
  if ("error" in bundle) return { success: false, error: bundle.error };
  const userIds = [...new Set((input.userIds ?? []).filter(Boolean))];
  if (userIds.length === 0) return { success: false, error: "Keine Spieler ausgewählt." };

  const admin = createAdminClient();
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
  rewards: VoucherReward[];
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
