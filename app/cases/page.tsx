export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { CasesShell } from "@/components/cases/cases-shell";
import { getCaseConfig } from "@/lib/cases-config";
import { getCaseDisplayConfig } from "@/lib/actions/case-display";
import { type Rarity } from "@/lib/cases";
import { isAdmin, isModerator } from "@/lib/admin";
import { redirect } from "next/navigation";

export default async function CasesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, username, role, gender")
    .eq("id", user.id)
    .single();

  const { count: inventoryCount } = await supabase
    .from("inventory")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const caseGroups = await getCaseConfig();

  const caseGroupPreviews = await Promise.all(
    caseGroups.map(async (group) => {
      const stdIds = group.standard.itemIds?.length ? group.standard.itemIds : null;
      const premIds = group.premium.itemIds?.length ? group.premium.itemIds : null;

      let pool: { rarity: string; type: string; name: string }[] | null = null;
      let count: number | null = null;

      if (stdIds || premIds) {
        const allIds = [...new Set([...(stdIds ?? []), ...(premIds ?? [])])];
        const { data, count: cnt } = await supabase
          .from("items")
          .select("rarity, type, name", { count: "exact" })
          .in("id", allIds)
          .limit(2000);
        pool = data; count = cnt;
      } else {
        const types = Array.from(
          new Set([
            ...(group.standard.itemTypes ?? group.itemTypes),
            ...(group.premium.itemTypes ?? group.itemTypes),
          ])
        );
        const { data, count: cnt } = await supabase
          .from("items")
          .select("rarity, type, name", { count: "exact" })
          .in("type", types)
          .limit(2000);
        pool = data; count = cnt;
      }

      return {
        groupId: group.id,
        poolSize: count ?? 0,
        previewPool: (pool ?? []).map((item) => ({
          rarity: item.rarity as Rarity,
          type: item.type,
          name: item.name,
        })),
      };
    })
  );

  const gender: "m" | "w" = profile?.gender === "w" ? "w" : "m";

  return (
    <CasesShell
      initialCredits={profile?.credits ?? 0}
      inventoryCount={inventoryCount ?? 0}
      streakDays={profile?.streak_days ?? 0}
      caseGroups={caseGroups}
      caseGroupPreviews={caseGroupPreviews}
      gender={gender}
      displayConfig={await getCaseDisplayConfig()}
      isAdmin={isAdmin(profile)}
      isModerator={isModerator(profile)}
    />
  );
}
