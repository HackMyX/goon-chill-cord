"use client";

import { useEffect, useRef, useState } from "react";
import { X, Star, Sparkles, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface BroadcastPopup {
  id: string;
  content: string;
  rarity: string;
}

const RARITY_STYLE: Record<string, { border: string; bg: string; glow: string; icon: typeof Star }> = {
  ultra:   { border: "border-amber-400/60",  bg: "bg-gradient-to-r from-amber-500/20 to-yellow-500/10",  glow: "shadow-[0_0_20px_rgba(245,158,11,0.4)]", icon: Trophy },
  mythisch:{ border: "border-purple-400/60", bg: "bg-gradient-to-r from-purple-500/20 to-fuchsia-500/10", glow: "shadow-[0_0_20px_rgba(168,85,247,0.4)]",  icon: Sparkles },
};

const DEFAULT_STYLE = { border: "border-blue-400/40", bg: "bg-blue-500/10", glow: "shadow-[0_0_12px_rgba(59,130,246,0.3)]", icon: Star };

export function GlobalBroadcast() {
  const [popups, setPopups] = useState<BroadcastPopup[]>([]);
  const supabase = useRef(createClient());

  useEffect(() => {
    const client = supabase.current;
    let channel: ReturnType<typeof client.channel> | null = null;

    // Only subscribe for authenticated users — no popups for logged-out visitors
    client.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      channel = client
        .channel("global-broadcast")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "global_chat_messages",
            filter: "is_system=eq.true",
          },
          (payload) => {
            const row = payload.new as {
              id: string;
              content: string;
              metadata: { rarity?: string } | null;
            };
            const rarity = row.metadata?.rarity ?? "normal";
            setPopups((prev) => [...prev, { id: row.id, content: row.content, rarity }]);
            setTimeout(() => {
              setPopups((prev) => prev.filter((p) => p.id !== row.id));
            }, 7000);
          }
        )
        .subscribe();
    });

    return () => { if (channel) client.removeChannel(channel); };
  }, []);

  if (popups.length === 0) return null;

  return (
    <div className="fixed left-4 top-20 z-[200] flex flex-col gap-2 pointer-events-none">
      {popups.map((popup) => {
        const style = RARITY_STYLE[popup.rarity] ?? DEFAULT_STYLE;
        const Icon = style.icon;
        return (
          <div
            key={popup.id}
            className={`pointer-events-auto flex max-w-[280px] items-start gap-2.5 rounded-xl border px-3.5 py-2.5 backdrop-blur-md animate-in slide-in-from-left-4 fade-in duration-300 ${style.border} ${style.bg} ${style.glow}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${popup.rarity === "ultra" ? "text-amber-300" : popup.rarity === "mythisch" ? "text-purple-300" : "text-blue-300"}`} />
            <p className="flex-1 text-xs font-semibold leading-snug text-zinc-100">{popup.content}</p>
            <button
              onClick={() => setPopups((p) => p.filter((x) => x.id !== popup.id))}
              className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-zinc-200"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
