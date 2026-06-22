import { createClient } from "@/lib/supabase/server";
import { DiscordLoginButton } from "@/components/auth/discord-login-button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getCaseConfig } from "@/lib/cases-config";
import { type Rarity } from "@/lib/cases";
import { isAdmin } from "@/lib/admin";
import { getSiteConfig } from "@/lib/actions/site-config";
import { resolveSiteLogoIcon } from "@/lib/site-logo-icons";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const { siteName, logoUrl, logoIconName } = await getSiteConfig();
    const LogoIcon = resolveSiteLogoIcon(logoIconName);
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-provided arbitrary external URL
            <img src={logoUrl} alt={siteName} className="h-10 w-10 rounded object-cover" />
          ) : (
            <LogoIcon className="h-10 w-10 text-purple-400" />
          )}
          <h1 className="text-4xl font-extrabold text-zinc-100">
            {siteName}
          </h1>
        </div>
        <p className="max-w-md text-zinc-400">
          Tritt der Community bei, sammle Credits, öffne Cases und levele
          deinen Charakter hoch.
        </p>
        <DiscordLoginButton />
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, username, role")
    .eq("id", user.id)
    .single();

  const { count: inventoryCount } = await supabase
    .from("inventory")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data: topProfiles } = await supabase
    .from("profiles")
    .select("id, username, credits")
    .order("credits", { ascending: false })
    .limit(10);

  const caseGroups = await getCaseConfig();

  const caseGroupPreviews = await Promise.all(
    caseGroups.map(async (group) => {
      // A tier can narrow its pool below the group default via the admin
      // panel — union both tiers so the preview reel reflects everything
      // actually reachable in this group, not just the static default.
      const types = Array.from(
        new Set([
          ...(group.standard.itemTypes ?? group.itemTypes),
          ...(group.premium.itemTypes ?? group.itemTypes),
        ])
      );

      const { data: pool, count } = await supabase
        .from("items")
        .select("rarity, type, name", { count: "exact" })
        .in("type", types)
        .limit(100);

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

  return (
    <DashboardShell
      initialCredits={profile?.credits ?? 0}
      inventoryCount={inventoryCount ?? 0}
      streakDays={profile?.streak_days ?? 0}
      leaderboard={topProfiles ?? []}
      caseGroups={caseGroups}
      caseGroupPreviews={caseGroupPreviews}
      isAdmin={isAdmin(profile)}
    />
  );
}
