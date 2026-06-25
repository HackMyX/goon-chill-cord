export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, isModerator } from "@/lib/admin";
import { getActiveBattlePass } from "@/lib/actions/battle-pass";
import { BattlePassShell } from "@/components/battlepass/battlepass-shell";
import { TopBar } from "@/components/layout/top-bar";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function BattlePassPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: profile }, view] = await Promise.all([
    supabase.from("profiles").select("credits, streak_days, role").eq("id", user.id).single(),
    getActiveBattlePass(),
  ]);

  const credits = profile?.credits ?? 0;
  const streakDays = profile?.streak_days ?? 0;
  const adminFlag = isAdmin(profile);
  const modFlag = isModerator(profile);

  if (!view) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar credits={credits} streakDays={streakDays} isAdmin={adminFlag} isModerator={modFlag} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 flex flex-col items-center justify-center text-center gap-4">
          <div className="text-5xl">🎁</div>
          <h1 className="text-xl font-bold text-zinc-100">Kein aktiver Battle Pass</h1>
          <p className="text-sm text-zinc-400">Momentan ist kein Battle Pass aktiv. Schau später wieder vorbei!</p>
          <Link href="/" className="mt-2 flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Startseite
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} isAdmin={adminFlag} isModerator={modFlag} />
      <BattlePassShell pass={view.pass} userStatus={view.userStatus} />
    </div>
  );
}
