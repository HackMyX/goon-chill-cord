import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, isModerator } from "@/lib/admin";
import { getMineConfig, getMineLeaderboard, ensureMineProgress } from "@/lib/actions/mine";
import { MineShell } from "@/components/mine/mine-shell";

export const dynamic = "force-dynamic";

export default async function MinePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, username, role")
    .eq("id", user.id)
    .single();

  const [config, leaderboard, progress] = await Promise.all([
    getMineConfig(),
    getMineLeaderboard(20),
    ensureMineProgress(user.id),
  ]);

  return (
    <MineShell
      userId={user.id}
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      username={profile?.username ?? "Spieler"}
      isAdmin={isAdmin(profile)}
      isModerator={isModerator(profile)}
      config={config}
      progress={progress}
      leaderboard={leaderboard}
    />
  );
}
