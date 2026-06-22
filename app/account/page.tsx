import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountShell } from "@/components/account/account-shell";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, avatar_url, credits, streak_days, cases_opened, role, created_at, accepts_trades, profile_visible")
    .eq("id", user.id)
    .single();

  const { count: inventoryCount } = await supabase
    .from("inventory")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (!profile) redirect("/");

  return (
    <AccountShell
      username={profile.username}
      avatarUrl={profile.avatar_url}
      credits={profile.credits}
      streakDays={profile.streak_days}
      casesOpened={profile.cases_opened}
      role={profile.role}
      memberSince={profile.created_at}
      inventoryCount={inventoryCount ?? 0}
      acceptsTrades={profile.accepts_trades ?? true}
      profileVisible={profile.profile_visible ?? true}
    />
  );
}
