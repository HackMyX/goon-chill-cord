"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCw, X } from "lucide-react";

/**
 * Dezenter, wegklickbarer Hinweis auf Touch-Geräten im HOCHFORMAT: „Dreh quer für
 * mehr Platz". Nicht aufdringlich (kein Zwang), erscheint nur auf schmalen
 * Touch-Screens im Portrait, verschwindet automatisch im Querformat und merkt
 * sich das Wegklicken pro Spiel (localStorage). So bekommt man auf dem Handy das
 * beste Spielerlebnis, ohne genervt zu werden.
 */
export function RotateHint({ game, label }: { game: string; label?: string }) {
  const [show, setShow] = useState(false);
  const key = `rotateHint_dismissed_${game}`;

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(key) === "1"; } catch { /* ignore */ }
    if (dismissed) return;

    const portrait = window.matchMedia("(orientation: portrait) and (max-width: 860px)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const update = () => setShow(portrait.matches && coarse.matches);
    update();
    portrait.addEventListener("change", update);
    return () => portrait.removeEventListener("change", update);
  }, [key]);

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          className="pointer-events-auto fixed left-1/2 top-[calc(0.5rem+env(safe-area-inset-top,0px))] z-[560] flex w-[calc(100vw-1.5rem)] max-w-sm -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-cyan-400/40 bg-[#0a0f1a]/95 px-3.5 py-2.5 shadow-[0_8px_32px_rgba(34,211,238,0.25)] backdrop-blur-md"
          role="status"
        >
          <motion.span
            animate={{ rotate: [0, 90, 90, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1, times: [0, 0.4, 0.7, 1] }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-300"
          >
            <RotateCw className="h-4 w-4" />
          </motion.span>
          <p className="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-cyan-100">
            Dreh dein Gerät <span className="text-cyan-300">quer</span> für das beste{label ? ` ${label}` : ""}-Erlebnis 📱↔️
          </p>
          <button
            onClick={dismiss}
            aria-label="Hinweis schließen"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 text-zinc-400 transition-colors hover:border-white/25 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
