import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTodayShop } from "@/lib/actions/shop";
import { ShopShell } from "@/components/shop/shop-shell";
import { isAdmin } from "@/lib/admin";

export default async function ShopPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, gender, role, username")
    .eq("id", user.id)
    .single();

  const { listings, resetsAt, motd, motdEnabled, categories } = await getTodayShop();

  return (
    <ShopShell
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      gender={(profile?.gender as "m" | "w") ?? "m"}
      listings={listings}
      resetsAt={resetsAt}
      motd={motdEnabled ? (motd ?? null) : null}
      categories={categories}
      isAdmin={isAdmin(profile)}
    />
  );
}
