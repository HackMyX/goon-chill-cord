"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { createSession, pingSession } from "@/lib/actions/session";
import { motion, AnimatePresence } from "framer-motion";
import { Smartphone, Monitor, RefreshCw, LogOut } from "lucide-react";

const LS_KEY = "goon_session_token_v1";
const PING_INTERVAL_MS = 25_000; // 25 seconds
const BC_CHANNEL = "goon_session_v1";

type GuardStatus = "idle" | "active" | "kicked" | "taking_over";

export function SessionGuard() {
  const [status, setStatus] = useState<GuardStatus>("idle");
  const tokenRef = useRef<string | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const tabIdRef = useRef<string>(Math.random().toString(36).slice(2));

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
          setStatus("kicked");
        }
      } catch {
        // Network error — don't kick, just retry next tick
      }
    }, PING_INTERVAL_MS);
  }, [stopHeartbeat]);

  const initSession = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // Not logged in — nothing to do

    const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "";

    let token = localStorage.getItem(LS_KEY);

    if (token) {
      // Validate existing token
      try {
        const result = await pingSession(token);
        if (result.valid) {
          tokenRef.current = token;
          setStatus("active");
          startHeartbeat(token);
          return;
        }
        // Token invalid — create a fresh one
      } catch {
        // Server unreachable — optimistically stay active, retry on next ping
        tokenRef.current = token;
        setStatus("active");
        startHeartbeat(token);
        return;
      }
    }

    // No token or invalid token: create new session
    try {
      const { token: newToken } = await createSession(user.id, ua);
      localStorage.setItem(LS_KEY, newToken);
      tokenRef.current = newToken;
      setStatus("active");
      startHeartbeat(newToken);
    } catch {
      // If session creation fails (table not migrated yet), stay silent
    }
  }, [startHeartbeat]);

  // Take over from another device: create new session
  const handleTakeOver = useCallback(async () => {
    setStatus("taking_over");
    stopHeartbeat();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "";
      const { token } = await createSession(user.id, ua);
      localStorage.setItem(LS_KEY, token);
      tokenRef.current = token;
      setStatus("active");
      startHeartbeat(token);
    } catch {
      setStatus("kicked");
    }
  }, [stopHeartbeat, startHeartbeat]);

  const handleSignOut = useCallback(async () => {
    stopHeartbeat();
    localStorage.removeItem(LS_KEY);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }, [stopHeartbeat]);

  // BroadcastChannel: detect same-browser multi-tab
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(BC_CHANNEL);
    bcRef.current = bc;

    bc.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "tab_ping" && e.data.tabId !== tabIdRef.current) {
        // Another tab is active in the same browser — we just co-exist (same session token)
        // No action needed; rate-limiting on the server prevents dual farming
      }
    };

    // Announce ourselves
    bc.postMessage({ type: "tab_ping", tabId: tabIdRef.current });

    return () => {
      bc.close();
      bcRef.current = null;
    };
  }, []);

  // Init on mount + listen to auth changes
  useEffect(() => {
    initSession();

    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        // Re-init when user signs in (e.g. after session exchange)
        setTimeout(initSession, 500);
      }
      if (event === "SIGNED_OUT") {
        stopHeartbeat();
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
