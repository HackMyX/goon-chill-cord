export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { DiscordLoginButton } from "@/components/auth/discord-login-button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { isAdmin, isModerator } from "@/lib/admin";
import { getSiteConfig } from "@/lib/actions/site-config";
import { resolveSiteLogoIcon } from "@/lib/site-logo-icons";
import { fetchGameLeaderboards } from "@/lib/actions/homepage-leaderboards";
import { getHomepageChatConfig } from "@/lib/actions/homepage-chat-config";

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
    gameLeaderboards,
    chatSidebarConfig,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("credits, streak_days, username, role, active_name_style_key")
      .eq("id", user.id)
      .single(),
    supabase
      .from("inventory")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("profiles")
      .select("id, username, credits, active_name_style_key, prio_badges, avatar_url")
      .or(`profile_visible.eq.true,id.eq.${user.id}`)
      .order("credits", { ascending: false })
      .limit(10),
    supabase
      .from("profiles")
      .select("id, username, streak_days, active_name_style_key, prio_badges, avatar_url")
      .or(`profile_visible.eq.true,id.eq.${user.id}`)
      .gt("streak_days", 0)
      .order("streak_days", { ascending: false })
      .limit(10),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true }),
    getSiteConfig(),
    fetchGameLeaderboards(),
    getHomepageChatConfig(),
  ]);

  // Fetch badges for all leaderboard users (silently skip if table missing)
  const leaderboardUserIds = [
    ...(topProfiles ?? []).map((p) => p.id),
    ...(streakProfiles ?? []).map((p) => p.id),
  ];
  const badgesByUser: Record<string, string[]> = {};
  if (leaderboardUserIds.length > 0) {
    try {
      const { data: badgeRows } = await supabase
        .from("user_badges")
        .select("user_id, badge_key")
        .in("user_id", leaderboardUserIds);
      for (const row of badgeRows ?? []) {
        const uid = (row as Record<string, unknown>).user_id as string;
        const key = (row as Record<string, unknown>).badge_key as string;
        if (!badgesByUser[uid]) badgesByUser[uid] = [];
        badgesByUser[uid].push(key);
      }
    } catch {
      // user_badges table not yet created — skip silently
    }
  }

  return (
    <DashboardShell
      initialCredits={profile?.credits ?? 0}
      inventoryCount={inventoryCount ?? 0}
      streakDays={profile?.streak_days ?? 0}
      leaderboard={(topProfiles ?? []).map((p) => ({
        id: p.id,
        username: p.username,
        credits: p.credits,
        active_name_style_key: (p as Record<string, unknown>).active_name_style_key as string | undefined,
        avatarUrl: (p as Record<string, unknown>).avatar_url as string | null | undefined,
        badges: badgesByUser[p.id] ?? [],
        prio_badges: ((p as Record<string, unknown>).prio_badges as string[] | null) ?? [],
      }))}
      streakLeaderboard={(streakProfiles ?? []).map((p) => ({
        id: p.id,
        username: p.username,
        streak_days: p.streak_days ?? 0,
        active_name_style_key: (p as Record<string, unknown>).active_name_style_key as string | undefined,
        avatarUrl: (p as Record<string, unknown>).avatar_url as string | null | undefined,
        badges: badgesByUser[p.id] ?? [],
        prio_badges: ((p as Record<string, unknown>).prio_badges as string[] | null) ?? [],
      }))}
      isAdmin={isAdmin(profile)}
      isModerator={isModerator(profile)}
      username={profile?.username ?? undefined}
      nameStyleKey={(profile as Record<string, unknown> | null)?.active_name_style_key as string | undefined}
      userCount={userCount ?? 0}
      homepageConfig={siteConfig.homepageConfig}
      chatSidebarConfig={chatSidebarConfig}
      gameLeaderboards={gameLeaderboards}
    />
  );
}
