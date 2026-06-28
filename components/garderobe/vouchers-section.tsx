"use client";

import { Ticket, Gamepad2, Clock, Sparkles, Disc3, Dice5 } from "lucide-react";
import type { CaseTokenView, GameBonusView } from "@/lib/actions/rewards";

/**
 * Wardrobe section that shows the player's owned vouchers — case tokens +
 * game-bonus pools — as cards (mirrors the abilities section). Redemption itself
 * is delegated to the top-bar Reward-Wallet via the `gn:open-rewards` event, so
 * there's a single source of truth for opening cases (no duplicated reveal).
 */

const RARITY_COLOR: Record<string, string> = {
  normal: "#9ca3af", selten: "#38bdf8", mythisch: "#a855f7", ultra: "#f59e0b",
};
const RARITY_LABEL: Record<string, string> = {
  normal: "Normal", selten: "Selten", mythisch: "Mythisch", ultra: "Ultra",
};
const GAME_ICON: Record<string, typeof Disc3> = { plinko: Disc3, snake: Gamepad2, don: Dice5 };

function relExpiry(iso: string | null): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "abgelaufen";
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))} min`;
  if (h < 24) return `${h} Std`;
  return `${Math.floor(h / 24)} T`;
}

function openWallet() {
  window.dispatchEvent(new Event("gn:open-rewards"));
}

export function VouchersSection({ caseTokens, gameBonuses }: { caseTokens: CaseTokenView[]; gameBonuses: GameBonusView[] }) {
  if (caseTokens.length === 0 && gameBonuses.length === 0) {
    return (
      <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs text-zinc-500">
        Noch keine Gutscheine. Du erhältst sie z.B. aus dem Battle Pass oder aus Cases — sie erscheinen dann hier.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {caseTokens.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            <Ticket className="h-3.5 w-3.5 text-fuchsia-300" /> Case-Gutscheine ({caseTokens.length})
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {caseTokens.map((t) => {
              const col = t.rarityFloor ? RARITY_COLOR[t.rarityFloor] ?? "#e879f9" : "#e879f9";
              const expiry = relExpiry(t.expiresAt);
              const title = t.mode === "rarity"
                ? `Gratis-Case · mind. ${RARITY_LABEL[t.rarityFloor ?? "normal"]}`
                : t.tierLabel ?? "Gratis-Case";
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3"
                  style={{ boxShadow: `inset 0 0 30px -20px ${col}` }}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                    style={{ background: `${col}22`, color: col }}>🎟️</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{title}</p>
                    <p className="text-[10px] text-zinc-500">
                      {t.mode === "tier" && t.groupTitle ? t.groupTitle : "Beliebiges Case"}
                      {expiry && <> · <span className="text-amber-400/80"><Clock className="mr-0.5 inline h-2.5 w-2.5" />{expiry}</span></>}
                    </p>
                  </div>
                  <button onClick={openWallet}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-violet-600/90 px-2.5 py-1.5 text-[11px] font-black text-white transition-colors hover:bg-violet-500">
                    <Sparkles className="h-3 w-3" /> Öffnen
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {gameBonuses.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            <Gamepad2 className="h-3.5 w-3.5 text-amber-300" /> Spiel-Boni ({gameBonuses.length})
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {gameBonuses.map((b) => {
              const Icon = GAME_ICON[b.game] ?? Gamepad2;
              const expiry = relExpiry(b.nextExpiry);
              return (
                <div key={b.game} className="flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300"><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">+{b.remaining} {b.gameLabel}</p>
                    <p className="text-[10px] text-zinc-500">
                      Automatisch über dem Limit nutzbar{expiry && <> · <span className="text-amber-400/80">{expiry}</span></>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
