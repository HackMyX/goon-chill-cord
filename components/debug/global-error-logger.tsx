"use client";

import { useEffect } from "react";
import { debugError } from "@/lib/debug";

/**
 * Catches anything that would otherwise just silently show up as a red
 * line in the console (or, worse, not show up clearly at all) and re-logs
 * it with a consistent `[GLOBAL ERROR]` tag plus full context, so the user
 * can open DevTools, copy the relevant block, and paste it back here for a
 * fast diagnosis — no flag to flip, no rebuild needed.
 */
export function GlobalErrorLogger() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      debugError("GLOBAL ERROR", event.message, {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      debugError("GLOBAL ERROR", "Unhandled promise rejection", {
        reason: event.reason,
        stack: event.reason?.stack,
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
