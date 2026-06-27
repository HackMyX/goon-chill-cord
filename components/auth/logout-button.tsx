"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSoundManager } from "@/lib/sound-manager";

export function LogoutButton({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const router = useRouter();
  const sound = useSoundManager();

  async function handleLogout() {
    sound.click();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  if (variant === "full") {
    // Prominent, full-width sign-out button — used at the very bottom of /account.
    return (
      <button
        onClick={handleLogout}
        onMouseEnter={sound.hover}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3.5 text-sm font-bold text-red-300 transition-colors hover:border-red-400/60 hover:bg-red-500/20 hover:text-red-200"
      >
        <LogOut className="h-4.5 w-4.5" />
        Abmelden
      </button>
    );
  }

  return (
    <button
      onClick={handleLogout}
      onMouseEnter={sound.hover}
      title="Logout"
      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-zinc-300 transition-colors hover:bg-red-500/20 hover:text-red-400"
    >
      <LogOut className="h-5 w-5" />
    </button>
  );
}
