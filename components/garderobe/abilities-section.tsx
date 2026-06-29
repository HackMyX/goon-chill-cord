"use client";

import { useRef, useState, useTransition } from "react";
import { Zap, Check, ShieldOff, Info, RefreshCw, Clock } from "lucide-react";
import type { UserAbility } from "@/lib/abilities";
import {
  ABILITY_CATEGORY_LABELS,
  ABILITY_RARITY_COLORS, ABILITY_RARITY_LABELS,
} from "@/lib/abilities";
import { equipAbility } from "@/lib/actions/abilities";
import { useSoundManager } from "@/lib/sound-manager";
import { AbilityVoucherCard } from "@/components/rewards/ability-voucher-card";
import { RewardCardCanvas } from "@/components/rewards/reward-card-canvas";

interface AbilitiesSectionProps {
  abilities: UserAbility[];
  equippedKey: string | null;
}

/** Human-readable remaining time for a time-limited ability (null = permanent). */
function timeLeftLabel(expiresAt: string | null | undefined): { text: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { text: "abgelaufen", urgent: true };
  const h = ms / 3_600_000;
  if (h >= 48) return { text: `${Math.floor(h / 24)}d`, urgent: false };
  if (h >= 1) return { text: `${Math.floor(h)}h`, urgent: h < 6 };
  return { text: `${Math.max(1, Math.floor(ms / 60_000))}min`, urgent: true };
}

function TimeBadge({ expiresAt }: { expiresAt: string | null | undefined }) {
  const t = timeLeftLabel(expiresAt);
  if (!t) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
        t.urgent ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-sky-500/40 bg-sky-500/10 text-sky-300"
      }`}
      title={expiresAt ? `Läuft ab: ${new Date(expiresAt).toLocaleString("de-DE")}` : undefined}
    >
      <Clock className="h-2.5 w-2.5" />
      {t.text}
    </span>
  );
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
        setMsg(newKey ? `✅ "${abilities.find((a) => a.abilityKey === newKey)?.definition?.name ?? newKey}" aktiviert` : "Gutschein-Slot geleert");
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
        <p className="text-sm font-medium text-zinc-400">Keine Fähigkeits-Gutscheine</p>
        <p className="mt-1 text-xs text-zinc-600">
          Fähigkeits-Gutscheine erhältst du aus Cases, dem Shop, dem Battle Pass oder bei Level-Ups.
        </p>
      </div>
    );
  }

  const equippedAbility = abilities.find((a) => a.abilityKey === equipped);
  const sectionRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-4" ref={sectionRef}>
      {/* Equipped slot */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-bold text-zinc-200">Mein aktiver Fähigkeits-Gutschein</span>
        </div>
        {equippedAbility?.definition ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-amber-200">{equippedAbility.definition.name}</span>
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${ABILITY_RARITY_COLORS[equippedAbility.definition.rarity]}`}>
                  {ABILITY_RARITY_LABELS[equippedAbility.definition.rarity]}
                </span>
                <TimeBadge expiresAt={equippedAbility.expiresAt} />
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
            Kein Slot belegt — wähle unten einen Fähigkeits-Gutschein aus
          </div>
        )}
      </div>

      {/* Feedback message */}
      {msg && (
        <p className={`text-sm ${msg.startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>
          {msg}
        </p>
      )}

      {/* Owned abilities grid — schick gethemte Gutschein-Karten + Ausrüst-Button */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {abilities.map((ua, i) => {
          const def = ua.definition;
          if (!def) return null;
          const isEquipped = equipped === ua.abilityKey;
          const source = ua.source === "level_reward" ? "Level-Belohnung" :
                         ua.source === "bp_tier" ? "Battle Pass" :
                         ua.source === "case" ? "Case" :
                         ua.source === "shop" ? "Shop" :
                         ua.source === "admin_grant" ? "Admin" : ua.source;

          return (
            <div key={ua.id} className="flex flex-col gap-2">
              <AbilityVoucherCard
                name={def.name}
                description={def.description}
                icon={def.icon}
                category={ABILITY_CATEGORY_LABELS[def.category]}
                cardTheme={def.cardTheme}
                cardRarity={def.cardRarity}
                abilityRarity={def.rarity}
                equipped={isEquipped}
                expiresAt={ua.expiresAt}
                effectCategory={def.category}
                view3d={{ index: i }}
              />
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-[10px] text-zinc-600">
                  {source} · {new Date(ua.acquiredAt).toLocaleDateString("de-DE")}
                </span>
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
          Du kannst einen Fähigkeits-Gutschein gleichzeitig aktivieren. Der Gutschein ist in allen Spielen aktiv,
          solange er ausgerüstet ist. Tausche ihn jederzeit aus.
        </span>
      </div>

      {/* EINE geteilte 3D-Canvas für alle Gutschein-Karten (ein WebGL-Context). */}
      {abilities.length > 0 && <RewardCardCanvas eventSourceRef={sectionRef} zIndex={5} />}
    </div>
  );
}
