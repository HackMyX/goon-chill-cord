export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { DiscordLoginButton } from "@/components/auth/discord-login-button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { isAdmin, isModerator } from "@/lib/admin";
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
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={siteName} className="h-10 w-10 rounded object-cover" />
          ) : (
            <LogoIcon className="h-10 w-10 text-purple-400" />
          )}
          <h1 className="text-4xl font-extrabold text-zinc-100">{siteName}</h1>
        </div>
        <p className="max-w-md text-zinc-400">
          Tritt der Community bei, sammle Credits, öffne Cases und levele deinen Charakter hoch.
        </p>
        <DiscordLoginButton />
      </div>
    );
  }

  const [
    { data: profile },
    { count: inventoryCount },
    { data: topProfiles },
    { data: streakProfiles },
    { count: userCount },
    siteConfig,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("credits, streak_days, username, role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("inventory")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("profiles")
      .select("id, username, credits")
      .or(`profile_visible.eq.true,id.eq.${user.id}`)
      .order("credits", { ascending: false })
      .limit(10),
    supabase
      .from("profiles")
      .select("id, username, streak_days")
      .or(`profile_visible.eq.true,id.eq.${user.id}`)
      .gt("streak_days", 0)
      .order("streak_days", { ascending: false })
      .limit(10),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true }),
    getSiteConfig(),
  ]);

  return (
    <DashboardShell
      initialCredits={profile?.credits ?? 0}
      inventoryCount={inventoryCount ?? 0}
      streakDays={profile?.streak_days ?? 0}
      leaderboard={topProfiles ?? []}
      streakLeaderboard={(streakProfiles ?? []).map((p) => ({
        id: p.id,
        username: p.username,
        streak_days: p.streak_days ?? 0,
      }))}
      isAdmin={isAdmin(profile)}
      isModerator={isModerator(profile)}
      username={profile?.username ?? undefined}
      userCount={userCount ?? 0}
      homepageConfig={siteConfig.homepageConfig}
    />
  );
}
