"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, X } from "lucide-react";
import { getActiveBonusCards, type ActiveBonusCard } from "@/lib/actions/bonus-cards";
import { useSoundManager } from "@/lib/sound-manager";
import { BonusCard } from "@/components/rewards/bonus-card";

/**
 * Drop-in-Ersatz für <GameBonusBadge> — zeigt dieselbe amber Bonus-Pill, ist aber
 * KLICKBAR und öffnet ein Popup mit richtig schick gethemten <BonusCard>s (eine
 * pro aktivem Bonus-Gutschein, mehrere gleichzeitig möglich). Versteckt sich, wenn
 * keine Boni aktiv sind. Re-fetch bei Öffnen UND bei `refreshKey`-Änderung.
 */
export function ActiveBonusDock({
  game, suffix, refreshKey = 0,
}: {
  game: "plinko" | "snake" | "don";
  suffix?: string;
  refreshKey?: number;
}) {
  const [cards, setCards] = useState<ActiveBonusCard[]>([]);
  const [open, setOpen] = useState(false);
  const sound = useSoundManager();

  const load = useCallback(() => {
    let active = true;
    getActiveBonusCards(game)
      .then((rows) => { if (active) setCards(rows); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [game]);

  useEffect(() => load(), [load, refreshKey]);

  // Bei jedem Öffnen frisch nachladen.
  useEffect(() => { if (open) load(); }, [open, load]);

  // ESC schließt.
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open]);

  const total = cards.reduce((sum, c) => sum + c.remaining, 0);
  if (total <= 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => { sound.click(); setOpen(true); }}
        title="Aktive Bonus-Spielzüge ansehen — werden automatisch genutzt, sobald dein normales Limit erreicht ist."
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-black text-amber-300 shadow-[0_0_12px_-2px_rgba(245,158,11,0.55)] transition-colors hover:bg-amber-500/25 hover:text-amber-200"
      >
        <Gift className="h-3 w-3" /> +{total} Bonus{suffix ? ` ${suffix}` : ""}
      </button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="bonus-dock"
              className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

              {/* Panel */}
              <motion.div
                className="relative z-[121] flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0a0710] shadow-[0_32px_96px_rgba(0,0,0,0.95)] sm:max-w-3xl sm:rounded-3xl"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, y: 60, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
              >
                {/* Header */}
                <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-xl border border-amber-400/30 bg-amber-500/15 text-amber-300">
                      <Gift className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-black text-zinc-100">Aktive Boni</p>
                      <p className="text-[11px] text-zinc-500">
                        {cards.length} {cards.length === 1 ? "Karte" : "Karten"} · +{total} gesamt
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Schließen"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Karten-Grid */}
                <div className="overflow-y-auto p-5" style={{ scrollbarWidth: "thin" }}>
                  {cards.length === 0 ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                      <Gift className="h-7 w-7 text-zinc-700" />
                      <p className="text-sm text-zinc-500">Aktuell keine aktiven Boni.</p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-center gap-4">
                      {cards.map((c) => (
                        <BonusCard key={c.id} card={c} />
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
