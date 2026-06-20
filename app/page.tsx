import { createClient } from "@/lib/supabase/server";
import { DiscordLoginButton } from "@/components/auth/discord-login-button";
import { TopBar } from "@/components/layout/top-bar";
import { Gamepad2 } from "lucide-react";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-[#0b0b12] px-4 text-center">
        <div className="flex items-center gap-3">
          <Gamepad2 className="h-10 w-10 text-purple-400" />
          <h1 className="text-4xl font-extrabold text-zinc-100">
            Goon&apos;n Chill Cord
          </h1>
        </div>
        <p className="max-w-md text-zinc-400">
          Tritt der Community bei, sammle Credits, öffne Cases und levele
          deinen Charakter hoch.
        </p>
        <DiscordLoginButton />
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();

  const { count: inventoryCount } = await supabase
    .from("inventory")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  return (
    <div className="flex flex-1 flex-col bg-[#0b0b12]">
      <TopBar
        credits={profile?.credits ?? 0}
        inventoryCount={inventoryCount ?? 0}
      />
      <main className="flex flex-1 items-center justify-center text-zinc-500">
        Willkommen zurück, {user.user_metadata?.full_name ?? user.email}.
      </main>
    </div>
  );
}
