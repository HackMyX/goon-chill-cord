"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      title="Logout"
      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-zinc-300 transition-colors hover:bg-red-500/20 hover:text-red-400"
    >
      <LogOut className="h-5 w-5" />
    </button>
  );
}
