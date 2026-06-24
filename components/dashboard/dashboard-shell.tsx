"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, Shirt, Users, ShieldAlert, Shield, ClipboardList, Coins } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { CaseOpeningSection } from "@/components/dashboard/case-opening-section";
import { Leaderboard, type LeaderboardEntry } from "@/components/dashboard/leaderboard";
import { subscribeToPresence } from "@/lib/presence-client";
import { createClient } from "@/lib/supabase/client";
import { useSoundManager } from "@/lib/sound-manager";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import type { CaseGroup, Rarity } from "@/lib/cases";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";

/** Same Realtime presence roster the Community page uses (lib/presence-
 * client.ts) — just counting it instead of listing names, for the small
 * "X online" indicator on the "Spieler Liste" button. */
function useOnlineCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => subscribeToPresence((ids) => setCount(ids.size)), []);
  return count;
}

interface CaseGroupPreview {
  groupId: string;
  poolSize: number;
  previewPool: { rarity: Rarity; type: string; name: string }[];
}

interface DashboardShellProps {
  initialCredits: number;
  inventoryCount: number;
  streakDays: number;
  leaderboard: LeaderboardEntry[];
  caseGroups: CaseGroup[];
  caseGroupPreviews: CaseGroupPreview[];
  isAdmin?: boolean;
  isModerator?: boolean;
}

export function DashboardShell({
  initialCredits,
  inventoryCount,
  streakDays,
  leaderboard,
  caseGroups,
  caseGroupPreviews,
  isAdmin = false,
  isModerator = false,
}: DashboardShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setCredits(row.credits);
  });
  const router = useRouter();
  const sound = useSoundManager();
  const onlineCount = useOnlineCount();
  const { siteName } = useSiteConfig();

  // Live-refresh case config whenever an admin changes case_tiers — so the
  // chance bars and prices update without a manual page reload.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("case_tiers_live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "case_tiers" }, () => {
        router.refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router]);

  function handleCreditsChange(newCredits: number) {
    setCredits(newCredits);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        credits={credits}
        inventoryCount={inventoryCount}
        streakDays={streakDays}
        onCreditsChange={handleCreditsChange}
        isAdmin={isAdmin}
        isModerator={isModerator}
      />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-2xl px-4 pt-12 pb-4 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[11px] font-semibold tracking-widest text-purple-300">
            <Zap className="h-3 w-3 animate-pulse" />
            KRUNKER-STYLE CASE OPENING
          </span>
          <h1 className="glow-text mt-4 text-3xl font-black tracking-tight text-zinc-50 sm:text-4xl">
            Willkommen im <span className="text-primary">{siteName}</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
            Öffne Cases und gewinne Cosmetics &amp; Waffen — Normal, Selten, Mythisch oder Ultra RGB.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/garderobe"
              onMouseEnter={sound.hover}
              onClick={sound.click}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(147,51,234,0.5)] transition-transform hover:scale-105"
            >
              <Shirt className="h-4 w-4" />
              Garderobe öffnen
            </Link>
            <Link
              href="/surveys"
              onMouseEnter={sound.hover}
              onClick={sound.click}
              className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/5 px-5 py-2.5 text-sm font-semibold text-purple-300 transition-colors hover:border-purple-400/50 hover:bg-purple-500/10"
            >
              <ClipboardList className="h-4 w-4" />
              Umfragen
            </Link>
            <Link
              href="/don"
              onMouseEnter={sound.hover}
              onClick={sound.click}
              className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-5 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:border-amber-400/50 hover:bg-amber-500/15"
            >
              <Coins className="h-4 w-4" />
              Double or Nothing
            </Link>
            <Link
              href="/community"
              onMouseEnter={sound.hover}
              onClick={sound.click}
              className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/30"
            >
              <Users className="h-4 w-4" />
              Spieler Liste
              {onlineCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                  {onlineCount}
                </span>
              )}
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onMouseEnter={sound.hover}
                onClick={sound.click}
                className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/20"
              >
                <ShieldAlert className="h-4 w-4" />
                Admin
              </Link>
            )}
            {isModerator && !isAdmin && (
              <Link
                href="/mod"
                onMouseEnter={sound.hover}
                onClick={sound.click}
                className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-5 py-2.5 text-sm font-semibold text-sky-300 transition-colors hover:bg-sky-500/20"
              >
                <Shield className="h-4 w-4" />
                Mod-Panel
              </Link>
            )}
          </div>
        </section>

        <Leaderboard entries={leaderboard} />

        {caseGroups.map((group) => {
          const preview = caseGroupPreviews.find((p) => p.groupId === group.id);
          return (
            <CaseOpeningSection
              key={group.id}
              group={group}
              credits={credits}
              previewPool={preview?.previewPool ?? []}
              poolSize={preview?.poolSize ?? 0}
              onCreditsChange={handleCreditsChange}
            />
          );
        })}

      </main>
    </div>
  );
}
