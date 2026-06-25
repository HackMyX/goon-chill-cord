"use client";

import { useState } from "react";
import { BP_THEMES } from "@/lib/battle-pass";
import type { ActiveBpView } from "@/lib/battle-pass";
import { BattlePassShell } from "./battlepass-shell";

export function BattlePassSelector({ views }: { views: ActiveBpView[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (views.length === 1) {
    const v = views[0];
    return <BattlePassShell pass={v.pass} userStatus={v.userStatus} />;
  }

  const selected = views[selectedIndex] ?? views[0];
  const theme = BP_THEMES[selected.pass.theme ?? "default"];

  return (
    <div className="flex flex-1 flex-col">
      {/* Pass selector tabs */}
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: `${theme.accent}22`, background: `linear-gradient(180deg, ${theme.accent}0a 0%, transparent 100%)` }}
      >
        <div className="mx-auto max-w-6xl">
          <div className="flex gap-2 flex-wrap">
            {views.map((v, i) => {
              const t = BP_THEMES[v.pass.theme ?? "default"];
              const isActive = i === selectedIndex;
              return (
                <button
                  key={v.pass.id}
                  onClick={() => setSelectedIndex(i)}
                  className="relative flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200"
                  style={
                    isActive
                      ? {
                          background: `${t.accent}20`,
                          border: `1px solid ${t.accent}60`,
                          color: t.accent,
                          boxShadow: `0 0 16px ${t.glow}`,
                        }
                      : {
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "rgba(255,255,255,0.4)",
                        }
                  }
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: t.accent, boxShadow: isActive ? `0 0 6px ${t.glow}` : undefined }}
                  />
                  <span>{v.pass.name}</span>
                  {v.pass.seasonLabel && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ background: `${t.accent}20`, color: t.accent }}
                    >
                      {v.pass.seasonLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active pass content */}
      <BattlePassShell pass={selected.pass} userStatus={selected.userStatus} />
    </div>
  );
}
