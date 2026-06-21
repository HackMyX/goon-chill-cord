import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { getStreakConfig } from "@/lib/actions/streak";
import {
  AdminShell,
  type AuditLogEntry,
  type CaseTierRow,
  type ProfileRow,
  type ItemRow,
} from "@/components/admin/admin-shell";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, username, role")
    .eq("id", user.id)
    .single();

  if (!isAdmin(profile)) redirect("/");

  const admin = createAdminClient();

  // `item_types` may not exist yet (one-time SQL not run) — degrade to the
  // column-less select rather than losing the whole Economy tab.
  async function fetchTierRows() {
    const withTypes = await admin
      .from("case_tiers")
      .select("id, group_id, label, price, rarity_weights, enabled, item_types, updated_at")
      .order("group_id", { ascending: true });
    if (!withTypes.error) return withTypes.data;

    const withoutTypes = await admin
      .from("case_tiers")
      .select("id, group_id, label, price, rarity_weights, enabled, updated_at")
      .order("group_id", { ascending: true });
    return (withoutTypes.data ?? []).map((row) => ({ ...row, item_types: null }));
  }

  const [{ data: auditRows }, tierRows, { data: profileRows }, { data: itemRows }, streakConfig] =
    await Promise.all([
      admin
        .from("audit_logs")
        .select("id, action, payload, created_at, profiles(username)")
        .order("created_at", { ascending: false })
        .limit(50),
      fetchTierRows(),
      admin
        .from("profiles")
        .select("id, username, credits, role, cases_opened")
        .order("credits", { ascending: false })
        .limit(200),
      admin
        .from("items")
        .select("id, name, rarity, type, price_cr")
        .order("name", { ascending: true })
        .limit(1000),
      getStreakConfig(),
    ]);

  return (
    <AdminShell
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      auditLog={(auditRows ?? []) as unknown as AuditLogEntry[]}
      caseTiers={(tierRows ?? []) as unknown as CaseTierRow[]}
      profiles={(profileRows ?? []) as unknown as ProfileRow[]}
      items={(itemRows ?? []) as unknown as ItemRow[]}
      streakConfig={streakConfig}
    />
  );
}
