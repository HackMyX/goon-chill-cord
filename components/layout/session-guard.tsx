"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { createSession, pingSession } from "@/lib/actions/session";
import { motion, AnimatePresence } from "framer-motion";
import { Smartphone, Monitor, RefreshCw, LogOut } from "lucide-react";
import { setSessionStatus } from "@/lib/session-status";

const LS_KEY = "goon_session_token_v1";
const PING_INTERVAL_MS = 25_000; // 25 seconds
const BC_CHANNEL = "goon_session_v1";

// BroadcastChannel protocol between tabs in the same browser
// "claim"    → new tab announces it wants to be primary (waits BC_CLAIM_TIMEOUT_MS)
// "taken"    → existing primary tab rejects the claim
// "takeover" → user explicitly clicked "Sitzung übernehmen" — existing tabs must yield
// "release"  → primary tab is closing, the next tab that claims can succeed
const BC_CLAIM_TIMEOUT_MS = 350;

type GuardStatus = "idle" | "active" | "blocked" | "kicked" | "taking_over";

export function SessionGuard() {
  const [status, setStatusLocal] = useState<GuardStatus>("idle");
  const setStatus = useCallback((s: GuardStatus) => {
    setStatusLocal(s);
    setSessionStatus(s);
  }, []);
  const tokenRef = useRef<string | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const tabIdRef = useRef<string>(Math.random().toString(36).slice(2));
  // true while this tab holds "primary" status (responds to claims with "taken")
  const isPrimaryRef = useRef(false);

  const stopHeartbeat = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback((token: string) => {
    stopHeartbeat();
    pingRef.current = setInterval(async () => {
      try {
        const result = await pingSession(token);
        if (!result.valid) {
          stopHeartbeat();
          isPrimaryRef.current = false;
          setStatus("kicked");
        }
      } catch {
        // Network error — don't kick, just retry next tick
      }
    }, PING_INTERVAL_MS);
  }, [stopHeartbeat]);

  const becomeActive = useCallback((token: string) => {
    isPrimaryRef.current = true;
    tokenRef.current = token;
    setStatus("active");
    startHeartbeat(token);
    // Announce to other tabs we're primary
    bcRef.current?.postMessage({ type: "taken", tabId: tabIdRef.current });
  }, [startHeartbeat]);

  const initSession = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "";

    // 1. Claim primary tab slot via BroadcastChannel
    const bc = bcRef.current;
    let claimBlocked = false;
    if (bc && typeof BroadcastChannel !== "undefined") {
      await new Promise<void>((resolve) => {
        const claimHandler = (e: MessageEvent) => {
          if (e.data?.type === "taken" && e.data.tabId !== tabIdRef.current) {
            claimBlocked = true;
            resolve();
          }
        };
        bc.addEventListener("message", claimHandler);
        bc.postMessage({ type: "claim", tabId: tabIdRef.current });
        // Wait for a "taken" reply; if none arrives we're the primary
        setTimeout(() => {
          bc.removeEventListener("message", claimHandler);
          resolve();
        }, BC_CLAIM_TIMEOUT_MS);
      });
    }

    if (claimBlocked) {
      // Another tab in this browser is already active
      setStatus("blocked");
      return;
    }

    // 2. Validate / create server session
    let token = localStorage.getItem(LS_KEY);

    if (token) {
      try {
        const result = await pingSession(token);
        if (result.valid) { becomeActive(token); return; }
      } catch {
        // Server unreachable — optimistically stay active
        becomeActive(token); return;
      }
    }

    try {
      const { token: newToken } = await createSession(user.id, ua);
      localStorage.setItem(LS_KEY, newToken);
      token = newToken;
      becomeActive(token);
    } catch {
      // Session table not migrated yet — stay silent
    }
  }, [becomeActive]);

  // Take over from another tab (same browser "blocked" case) OR another device
  const handleTakeOver = useCallback(async () => {
    setStatus("taking_over");
    stopHeartbeat();
    // Tell other tabs they've been kicked
    bcRef.current?.postMessage({ type: "takeover", tabId: tabIdRef.current });

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "";
      const { token } = await createSession(user.id, ua);
      localStorage.setItem(LS_KEY, token);
      becomeActive(token);
    } catch {
      setStatus("kicked");
    }
  }, [stopHeartbeat, becomeActive]);

  const handleSignOut = useCallback(async () => {
    stopHeartbeat();
    isPrimaryRef.current = false;
    localStorage.removeItem(LS_KEY);
    bcRef.current?.postMessage({ type: "release", tabId: tabIdRef.current });
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }, [stopHeartbeat]);

  // BroadcastChannel: respond to other tabs' claims / takeovers
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(BC_CHANNEL);
    bcRef.current = bc;

    bc.onmessage = (e: MessageEvent) => {
      const { type, tabId } = (e.data ?? {}) as { type: string; tabId: string };
      if (tabId === tabIdRef.current) return; // ignore own messages

      if (type === "claim" && isPrimaryRef.current) {
        // We are primary — reject the claim
        bc.postMessage({ type: "taken", tabId: tabIdRef.current });
      }

      if (type === "takeover") {
        // Another tab is force-taking over — we yield
        stopHeartbeat();
        isPrimaryRef.current = false;
        setStatus("kicked");
      }
    };

    // On unload, release primary slot so the next tab can claim it
    const onUnload = () => {
      if (isPrimaryRef.current) {
        bc.postMessage({ type: "release", tabId: tabIdRef.current });
      }
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      window.removeEventListener("beforeunload", onUnload);
      bc.close();
      bcRef.current = null;
    };
  }, [stopHeartbeat]);

  // Init on mount + listen to auth changes
  useEffect(() => {
    initSession();

    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        setTimeout(initSession, 500);
      }
      if (event === "SIGNED_OUT") {
        stopHeartbeat();
        isPrimaryRef.current = false;
        localStorage.removeItem(LS_KEY);
        setStatus("idle");
      }
    });

    return () => {
      stopHeartbeat();
      subscription.unsubscribe();
    };
  }, [initSession, stopHeartbeat]);

  return (
    <AnimatePresence>
      {/* Same-browser second tab detected */}
      {status === "blocked" && (
        <motion.div
          key="blocked-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="mx-4 w-full max-w-sm rounded-2xl border border-amber-500/20 bg-zinc-900/95 p-7 text-center shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30">
                <Monitor className="h-7 w-7 text-amber-400" />
              </div>
            </div>

            <h2 className="mb-2 text-lg font-black text-white">
              Sitzung aktiv
            </h2>
            <p className="mb-6 text-sm text-white/50 leading-relaxed">
              Dein Account ist bereits in einem anderen Tab geöffnet.
              Nur eine aktive Sitzung pro Account ist erlaubt.
            </p>

            <div className="flex flex-col gap-3">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleTakeOver}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-black text-white transition-colors hover:bg-amber-500"
              >
                <RefreshCw className="h-4 w-4" />
                Diesen Tab übernehmen
              </motion.button>
              <button
                onClick={() => window.close()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-sm font-semibold text-white/50 transition-colors hover:bg-white/5"
              >
                Tab schließen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Cross-device session takeover */}
      {status === "kicked" && (
        <motion.div
          key="kicked-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/95 p-7 text-center shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30">
                <Smartphone className="h-6 w-6 text-amber-400" />
              </div>
              <span className="text-white/30">→</span>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 ring-1 ring-white/10">
                <Monitor className="h-6 w-6 text-white/30" />
              </div>
            </div>

            <h2 className="mb-2 text-lg font-black text-white">
              Sitzung übernommen
            </h2>
            <p className="mb-6 text-sm text-white/50 leading-relaxed">
              Dein Account wird gerade auf einem anderen Gerät oder Browser verwendet.
              Nur eine aktive Sitzung ist erlaubt.
            </p>

            <div className="flex flex-col gap-3">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleTakeOver}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-black text-white transition-colors hover:bg-violet-500"
              >
                <RefreshCw className="h-4 w-4" />
                Diese Sitzung übernehmen
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleSignOut}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-sm font-semibold text-white/50 transition-colors hover:bg-white/5"
              >
                <LogOut className="h-4 w-4" />
                Abmelden
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {status === "taking_over" && (
        <motion.div
          key="takeover-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <div className="text-center text-white/60 text-sm">
            <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-violet-400" />
            Sitzung wird übernommen…
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
