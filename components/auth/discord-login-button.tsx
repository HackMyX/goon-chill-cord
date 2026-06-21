"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSoundManager } from "@/lib/sound-manager";
import { getURL } from "@/lib/get-url";

export function DiscordLoginButton() {
  const [loading, setLoading] = useState(false);
  const sound = useSoundManager();

  async function handleLogin() {
    sound.click();
    setLoading(true);
    const redirectTo = `${getURL()}/auth/callback`;
    // Logged client-side so you can see in the browser console exactly
    // which origin is being sent to Supabase *before* it redirects away —
    // if this ever prints anything other than your current address bar's
    // origin, that's the bug. If it's correct here but you still land on
    // the wrong domain after login, the redirect is being rejected by
    // Supabase's Authentication -> URL Configuration -> Redirect URLs
    // allowlist (it must contain this exact origin) and it's silently
    // falling back to the project's Site URL — not something fixable from
    // application code.
    console.log("[DiscordLogin] redirectTo:", redirectTo);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo },
    });
  }

  return (
    <button
      onMouseEnter={sound.hover}
      onClick={handleLogin}
      disabled={loading}
      className="flex items-center gap-3 rounded-full bg-[#5865F2] px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-[#5865F2]/30 transition-all hover:scale-105 hover:bg-[#4752c4] disabled:opacity-60"
    >
      <svg
        viewBox="0 0 127.14 96.36"
        className="h-6 w-6 fill-current"
        aria-hidden="true"
      >
        <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.9,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
      </svg>
      {loading ? "Verbinde..." : "Login mit Discord"}
    </button>
  );
}
