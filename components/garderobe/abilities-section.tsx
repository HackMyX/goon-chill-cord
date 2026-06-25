"use client";

import { useState, useTransition } from "react";
import { Zap, Check, ShieldOff, Info, RefreshCw } from "lucide-react";
import type { UserAbility } from "@/lib/abilities";
import {
  ABILITY_CATEGORY_COLORS, ABILITY_CATEGORY_LABELS,
  ABILITY_RARITY_COLORS, ABILITY_RARITY_LABELS,
} from "@/lib/abilities";
import { equipAbility } from "@/lib/actions/abilities";
import { useSoundManager } from "@/lib/sound-manager";

interface AbilitiesSectionProps {
  abilities: UserAbility[];
  equippedKey: string | null;
}

export function AbilitiesSection({ abilities, equippedKey: initialEquipped }: AbilitiesSectionProps) {
  const [equipped, setEquipped] = useState<string | null>(initialEquipped);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");
  const sound = useSoundManager();

  function handleEquip(key: string) {
    const newKey = equipped === key ? null : key;
    startTransition(async () => {
      const result = await equipAbility(newKey);
      if (result.success) {
        setEquipped(newKey);
        sound.abilityEquip();
        setMsg(newKey ? `✅ "${abilities.find((a) => a.abilityKey === newKey)?.definition?.name ?? newKey}" ausgerüstet` : "Fähigkeits-Slot geleert");
        setTimeout(() => setMsg(""), 2500);
      } else {
        setMsg(`❌ ${result.error}`);
        setTimeout(() => setMsg(""), 2500);
      }
    });
  }

  if (abilities.length === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 text-center">
        <Zap className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
        <p className="text-sm font-medium text-zinc-400">Keine Fähigkeiten</p>
        <p className="mt-1 text-xs text-zinc-600">
          Fähigkeiten erhältst du aus Cases, dem Shop, dem Battle Pass oder bei Level-Ups.
        </p>
      </div>
    );
  }

  const equippedAbility = abilities.find((a) => a.abilityKey === equipped);

  return (
    <div className="space-y-4">
      {/* Equipped slot */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-bold text-zinc-200">Ausgerüsteter Fähigkeiten-Slot</span>
        </div>
        {equippedAbility?.definition ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-amber-200">{equippedAbility.definition.name}</span>
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${ABILITY_RARITY_COLORS[equippedAbility.definition.rarity]}`}>
                  {ABILITY_RARITY_LABELS[equippedAbility.definition.rarity]}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">{equippedAbility.definition.description}</p>
            </div>
            <button
              onClick={() => handleEquip(equipped!)}
              disabled={isPending}
              className="flex min-h-[44px] items-center gap-1 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-zinc-400 hover:border-red-500/30 hover:text-red-400"
            >
              <ShieldOff className="h-3 w-3" /> Ausrüsten
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-zinc-600">
            Kein Slot belegt — wähle unten eine Fähigkeit aus
          </div>
        )}
      </div>

      {/* Feedback message */}
      {msg && (
        <p className={`text-sm ${msg.startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>
          {msg}
        </p>
      )}

      {/* Owned abilities grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {abilities.map((ua) => {
          const def = ua.definition;
          if (!def) return null;
          const isEquipped = equipped === ua.abilityKey;

          return (
            <div
              key={ua.id}
              className={`rounded-xl border p-4 transition-all ${
                isEquipped
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-white/8 bg-white/[0.02] hover:border-white/15"
              }`}
            >
              <div className="mb-2 flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-zinc-100">{def.name}</span>
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${ABILITY_RARITY_COLORS[def.rarity]}`}>
                      {ABILITY_RARITY_LABELS[def.rarity]}
                    </span>
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${ABILITY_CATEGORY_COLORS[def.category]}`}>
                      {ABILITY_CATEGORY_LABELS[def.category]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{def.description}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-zinc-600">
                    Quelle: {ua.source === "level_reward" ? "Level-Belohnung" :
                             ua.source === "bp_tier" ? "Battle Pass" :
                             ua.source === "case" ? "Case" :
                             ua.source === "shop" ? "Shop" :
                             ua.source === "admin_grant" ? "Admin" : ua.source}
                  </span>
                  <span className="text-[10px] text-zinc-700">
                    {new Date(ua.acquiredAt).toLocaleDateString("de-DE")}
                  </span>
                </div>
                <button
                  onClick={() => handleEquip(ua.abilityKey)}
                  disabled={isPending}
                  className={`flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
                    isEquipped
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
                      : "bg-purple-600/80 text-white hover:bg-purple-500"
                  }`}
                >
                  {isPending && <RefreshCw className="h-3 w-3 animate-spin" />}
                  {isEquipped ? (
                    <><Check className="h-3 w-3" /> Ausgerüstet</>
                  ) : (
                    <><Zap className="h-3 w-3" /> Ausrüsten</>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-zinc-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Du kannst eine Fähigkeit gleichzeitig ausrüsten. Die Fähigkeit ist in allen Spielen aktiv,
          solange sie ausgerüstet ist. Tausche sie jederzeit aus.
        </span>
      </div>
    </div>
  );
}
