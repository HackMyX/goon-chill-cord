import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, isModerator } from "@/lib/admin";
import { getSnakeConfig, getSnakeLeaderboard, getMySnakeBest, getDailyCrEarned, getDailyGamesPerMode } from "@/lib/actions/snake";
import { getEquippedAbility } from "@/lib/actions/abilities";
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

  // Load config first so the leaderboards honour each mode's configured size.
  const config = await getSnakeConfig();
  const [lbX1, lbX2, lbGrind, lbFarm, myBest, dailyCrEarned, dailyGames, equipped] = await Promise.all([
    getSnakeLeaderboard("x1", config.x1.leaderboardSize ?? 20),
    getSnakeLeaderboard("x2", config.x2.leaderboardSize ?? 20),
    getSnakeLeaderboard("grind", config.grind.leaderboardSize ?? 20),
    getSnakeLeaderboard("farm", config.farm.leaderboardSize ?? 20),
    getMySnakeBest(user.id),
    getDailyCrEarned(user.id),
    getDailyGamesPerMode(user.id),
    getEquippedAbility(user.id),
  ]);

  // Equipped ability: more frequent golden apples (client-side spawn boost).
  const goldAppleRate = equipped?.effectType === "snake_gold_apple_rate" ? equipped.effectValue : 0;

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
      dailyGamesX1={dailyGames.x1}
      dailyGamesX2={dailyGames.x2}
      dailyGamesGrind={dailyGames.grind}
      dailyGamesFarm={dailyGames.farm}
      goldAppleRate={goldAppleRate}
    />
  );
}
