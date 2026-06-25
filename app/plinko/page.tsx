import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlinkoConfig, getMyPlinkoUsageThisHour } from "@/lib/actions/plinko";
import { PlinkoShell } from "@/components/plinko/plinko-shell";

export const dynamic = "force-dynamic";

export default async function PlinkoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, role")
    .eq("id", user.id)
    .single();

  const [config, usedThisHour] = await Promise.all([
    getPlinkoConfig(),
    getMyPlinkoUsageThisHour(user.id),
  ]);

  if (!config.enabled) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">🎰</div>
          <h1 className="text-2xl font-black text-zinc-200">Plinko ist aktuell deaktiviert.</h1>
          <p className="mt-2 text-zinc-500">Das Admin-Team hat Plinko temporär deaktiviert.</p>
        </div>
      </main>
    );
  }

  const isAdmin = profile?.role === "admin";
  const isModerator = profile?.role === "moderator";

  return (
    <PlinkoShell
      config={config}
      initialCredits={profile?.credits ?? 0}
      initialUsedThisHour={usedThisHour}
      isAdmin={isAdmin}
      isModerator={isModerator}
    />
  );
}
