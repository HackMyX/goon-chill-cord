import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTodayShop } from "@/lib/actions/shop";
import { ShopShell } from "@/components/shop/shop-shell";

export default async function ShopPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, streak_days, gender")
    .eq("id", user.id)
    .single();

  const { listings, resetsAt } = await getTodayShop();

  return (
    <ShopShell
      credits={profile?.credits ?? 0}
      streakDays={profile?.streak_days ?? 0}
      gender={(profile?.gender as "m" | "w") ?? "m"}
      listings={listings}
      resetsAt={resetsAt}
    />
  );
}
