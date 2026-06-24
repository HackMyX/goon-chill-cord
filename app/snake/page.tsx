import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, isModerator } from "@/lib/admin";
import { getSnakeConfig, getSnakeLeaderboard, getMySnakeBest, getDailyCrEarned } from "@/lib/actions/snake";
import { SnakeShell } from "@/components/snake/snake-shell";

export const dynamic = "force-dynamic";

export default async function SnakePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, username, role")
    .eq("id", user.id)
    .single();

  const [config, lbX1, lbX2, lbGrind, lbFarm, myBest, dailyCrEarned] = await Promise.all([
    getSnakeConfig(),
    getSnakeLeaderboard("x1", 20),
    getSnakeLeaderboard("x2", 20),
    getSnakeLeaderboard("grind", 20),
    getSnakeLeaderboard("farm", 20),
    getMySnakeBest(user.id),
    getDailyCrEarned(user.id),
  ]);

  return (
    <SnakeShell
      userId={user.id}
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      username={profile?.username ?? "Spieler"}
      isAdmin={isAdmin(profile)}
      isModerator={isModerator(profile)}
      config={config}
      leaderboardX1={lbX1}
      leaderboardX2={lbX2}
      leaderboardGrind={lbGrind}
      leaderboardFarm={lbFarm}
      myBestX1={myBest.x1}
      myBestX2={myBest.x2}
      myBestGrind={myBest.grind}
      myBestFarm={myBest.farm}
      dailyCrEarned={dailyCrEarned}
    />
  );
}
