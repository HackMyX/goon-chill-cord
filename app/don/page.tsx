export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, isModerator } from "@/lib/admin";
import { getDonConfig, getFlipsToday, getFlipsThisHour } from "@/lib/actions/don-config";
import { DonShell } from "@/components/don/don-shell";

export default async function DonPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const [{ data: profile }, { count: inventoryCount }, donConfig, flipsToday, flipsThisHour] = await Promise.all([
    supabase
      .from("profiles")
      .select("credits, streak_days, username, role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("inventory")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    getDonConfig(),
    getFlipsToday(user.id),
    getFlipsThisHour(user.id),
  ]);

  return (
    <DonShell
      initialCredits={profile?.credits ?? 0}
      inventoryCount={inventoryCount ?? 0}
      streakDays={profile?.streak_days ?? 0}
      isAdmin={isAdmin(profile)}
      isModerator={isModerator(profile)}
      donConfig={donConfig}
      initialFlipsToday={flipsToday}
      initialHourlyFlipsUsed={flipsThisHour}
    />
  );
}
