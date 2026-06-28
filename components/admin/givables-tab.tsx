"use client";

import { useState } from "react";
import { Zap, Gift } from "lucide-react";
import { AbilityAdminTab } from "@/components/admin/ability-admin-tab";
import { VoucherAdminTab } from "@/components/admin/voucher-admin-tab";
import { AdminGuide } from "@/components/admin/admin-guide";
import { TAB_GUIDES } from "@/lib/admin-guides";
import { useSoundManager } from "@/lib/sound-manager";

/**
 * "Givables" — vereint die vergebbaren Inhalte, die früher zwei getrennte Tabs
 * waren: Fähigkeiten + Gutscheine. Ein Sub-Umschalter wählt den Bereich;
 * der jeweils passende Guide wird darüber gerendert.
 */
export function GivablesTab({ profiles }: { profiles: { id: string; username: string }[] }) {
  const [sub, setSub] = useState<"abilities" | "vouchers">("abilities");
  const sound = useSoundManager();

  const SUBS = [
    { id: "abilities" as const, label: "Fähigkeits-Gutscheine", icon: Zap },
    { id: "vouchers" as const, label: "Gutscheine", icon: Gift },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {SUBS.map((s) => (
          <button
            key={s.id}
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); setSub(s.id); }}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
              sub === s.id
                ? "border-purple-400 bg-purple-500/15 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.45)]"
                : "border-white/10 text-zinc-400 hover:border-white/30"
            }`}
          >
            <s.icon className="h-4 w-4" />
            {s.label}
          </button>
        ))}
      </div>

      {TAB_GUIDES[sub] && <AdminGuide content={TAB_GUIDES[sub]} />}

      {sub === "abilities" && <AbilityAdminTab profiles={profiles} />}
      {sub === "vouchers" && <VoucherAdminTab profiles={profiles} />}
    </div>
  );
}
