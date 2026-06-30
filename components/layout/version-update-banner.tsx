"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, X, Rocket } from "lucide-react";
import { BUILD_INFO } from "@/lib/build-info";

// Sobald serverseitig eine neuere Version live ist (anderer versionKey als das
// geladene Bundle), erscheint dieses kleine Banner oben links — automatisch auf
// JEDER Seite (global im Layout gemountet). Es bleibt stehen, bis man es selbst
// wegklickt, und bietet direkt einen „Neu laden"-Button. Geprüft wird per Poll
// (alle 60 s) und zusätzlich sofort beim Zurückkehren in den Tab (Fokus/Sichtbar).
const DISMISS_KEY = "gnc_update_dismissed";

interface AvailableVersion {
  versionKey: string;
  deployName: string;
  commitMessage: string;
}

export function VersionUpdateBanner() {
  const [available, setAvailable] = useState<AvailableVersion | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Partial<AvailableVersion>;
      const serverKey = data?.versionKey ?? "";
      if (!serverKey || serverKey === "dev") return;
      if (serverKey === BUILD_INFO.versionKey) {
        setAvailable(null); // wieder synchron (z. B. nach Reload)
        return;
      }
      // Schon weggeklickt? Nur unterdrücken, wenn es DIESELBE neue Version ist —
      // bei einer noch neueren Version erscheint das Banner wieder.
      let dismissed: string | null = null;
      try {
        dismissed = window.localStorage.getItem(DISMISS_KEY);
      } catch {
        dismissed = null;
      }
      if (dismissed === serverKey) return;
      setAvailable({
        versionKey: serverKey,
        deployName: data?.deployName ?? "",
        commitMessage: data?.commitMessage ?? "",
      });
    } catch {
      /* Netzwerkfehler ignorieren — beim nächsten Poll erneut versuchen. */
    }
  }, []);

  useEffect(() => {
    if (BUILD_INFO.versionKey === "dev") return; // lokaler Dev-Build: kein Banner
    check();
    const iv = window.setInterval(check, 60_000);
    const onFocus = () => check();
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [check]);

  if (!available) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, available.versionKey);
    } catch {
      /* ignore */
    }
    setAvailable(null);
  };

  return (
    <div className="fixed left-4 top-20 z-[120] w-[300px] max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-left-4 duration-300">
      <div className="rounded-xl border border-purple-400/40 bg-zinc-950/95 p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300">
            <Rocket className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-zinc-100">Neue Version verfügbar</p>
            <p className="mt-0.5 text-xs leading-snug text-zinc-400">
              {available.commitMessage
                ? `„${available.commitMessage.slice(0, 80)}"`
                : "Lade neu, um die neueste Version zu bekommen."}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-purple-500"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Neu laden
              </button>
              <button
                onClick={dismiss}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
              >
                Später
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Schließen"
            className="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
