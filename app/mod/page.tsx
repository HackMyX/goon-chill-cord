import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, isModerator } from "@/lib/admin";
import { ModShell } from "@/components/mod/mod-shell";
import {
  getModPermissions,
  getModActions,
  getMyModActions,
  getModUsers,
  getModTickets,
} from "@/lib/actions/mod";

export default async function ModPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, username, credits, streak_days")
    .eq("id", user.id)
    .single();

  if (!isModerator(profile) && !isAdmin(profile)) redirect("/");

  const [permissions, users, tickets, recentActions, myActions] = await Promise.all([
    getModPermissions(),
    getModUsers(),
    getModTickets(),
    getModActions(50),
    getMyModActions(20),
  ]);

  return (
    <ModShell
      modUsername={profile?.username ?? "Moderator"}
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      permissions={permissions}
      users={users}
      tickets={tickets}
      recentActions={recentActions}
      myActions={myActions}
      isAdminUser={isAdmin(profile)}
    />
  );
}
