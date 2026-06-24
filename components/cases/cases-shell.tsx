"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Coins, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { TopBar } from "@/components/layout/top-bar";
import { CaseOpeningSection } from "@/components/dashboard/case-opening-section";
import { createClient } from "@/lib/supabase/client";
import { useSiteConfig } from "@/components/layout/site-config-provider";
import type { CaseGroup, Rarity } from "@/lib/cases";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";

interface CaseGroupPreview {
  groupId: string;
  poolSize: number;
  previewPool: { rarity: Rarity; type: string; name: string }[];
}

interface CasesShellProps {
  initialCredits: number;
  inventoryCount: number;
  streakDays: number;
  caseGroups: CaseGroup[];
  caseGroupPreviews: CaseGroupPreview[];
  isAdmin?: boolean;
  isModerator?: boolean;
}

export function CasesShell({
  initialCredits,
  inventoryCount,
  streakDays,
  caseGroups,
  caseGroupPreviews,
  isAdmin = false,
  isModerator = false,
}: CasesShellProps) {
  const [credits, setCredits] = useState(initialCredits);
  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setCredits(row.credits);
  });
  const router = useRouter();
  const { currencyName } = useSiteConfig();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("cases_tiers_live")
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

  const creditsFormatted = new Intl.NumberFormat("de-DE").format(credits);

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
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/5">
          {/* Atmospheric background */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-80 w-[700px] rounded-full bg-purple-600/12 blur-[100px]" />
            <div className="absolute top-0 left-1/4 h-64 w-64 rounded-full bg-fuchsia-600/8 blur-[80px]" />
            <div className="absolute top-0 right-1/4 h-56 w-56 rounded-full bg-indigo-600/8 blur-[70px]" />
          </div>

          <div className="relative z-10 mx-auto max-w-3xl px-4 pt-12 pb-10 text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1.5 text-xs font-bold tracking-widest text-purple-300">
                <Package className="h-3.5 w-3.5" />
                CASES
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08 }}
              className="mt-4 text-4xl font-black tracking-tight sm:text-5xl"
            >
              <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-rose-400 bg-clip-text text-transparent">
                Cases öffnen
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.14 }}
              className="mx-auto mt-3 max-w-md text-sm text-zinc-400"
            >
              Öffne Cases und gewinne exklusive Cosmetics &amp; Waffen — von Normal bis Ultra RGB.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-600/80 px-5 py-2 text-sm font-bold text-white shadow-[0_0_20px_rgba(147,51,234,0.35)]"
            >
              <Coins className="h-4 w-4 text-purple-200" />
              <span className="tabular-nums">{creditsFormatted}</span>
              <span className="text-purple-200/80">{currencyName}</span>
            </motion.div>

            {/* Rarity legend */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-5 flex flex-wrap justify-center gap-2"
            >
              {[
                { label: "Normal", color: "bg-zinc-400/20 text-zinc-400 border-zinc-400/20" },
                { label: "Selten", color: "bg-blue-400/20 text-blue-400 border-blue-400/20" },
                { label: "Mythisch", color: "bg-purple-400/20 text-purple-400 border-purple-400/20" },
                { label: "Ultra", color: "bg-gradient-to-r from-fuchsia-400 to-rose-400 text-transparent bg-clip-text border-fuchsia-400/30" },
              ].map(({ label, color }) => (
                <span
                  key={label}
                  className={`flex items-center gap-1 rounded-full border px-3 py-0.5 text-[11px] font-semibold ${color}`}
                >
                  <Sparkles className="h-3 w-3 opacity-70" />
                  {label}
                </span>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Case sections */}
        {caseGroups.length === 0 ? (
          <div className="mx-auto max-w-2xl px-4 py-16 text-center">
            <Package className="mx-auto mb-4 h-12 w-12 text-zinc-700" />
            <p className="text-zinc-500">Noch keine Cases konfiguriert. Admins können Cases im Admin-Panel einrichten.</p>
          </div>
        ) : (
          caseGroups.map((group, i) => {
            const preview = caseGroupPreviews.find((p) => p.groupId === group.id);
            return (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
              >
                <CaseOpeningSection
                  group={group}
                  credits={credits}
                  previewPool={preview?.previewPool ?? []}
                  poolSize={preview?.poolSize ?? 0}
                  onCreditsChange={handleCreditsChange}
                />
              </motion.div>
            );
          })
        )}
      </main>
    </div>
  );
}
