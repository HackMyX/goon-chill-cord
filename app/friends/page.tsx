import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, isModerator } from "@/lib/admin";
import { getFriendData } from "@/lib/actions/friends";
import { FriendsPageShell } from "@/components/social/friends-page-shell";

export default async function FriendsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, role, username")
    .eq("id", user.id)
    .single();

  const [{ count: inventoryCount }, initialData] = await Promise.all([
    supabase
      .from("inventory")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    getFriendData(),
  ]);

  return (
    <FriendsPageShell
      userId={user.id}
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      inventoryCount={inventoryCount ?? 0}
      isAdmin={isAdmin(profile)}
      isModerator={isModerator(profile)}
      initialData={initialData}
    />
  );
}
