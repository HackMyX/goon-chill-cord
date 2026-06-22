"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/actions/debug-log";

/** Route-level error boundary — catches render errors inside a page
 * without blowing away the whole layout (TopBar etc. stay mounted), unlike
 * app/global-error.tsx which only fires for errors the root layout itself
 * can't survive. Reports to the same debug_logs table either way. */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({
      message: error.message || "Unbekannter Fehler",
      detail: error.stack ?? (error.digest ? `digest: ${error.digest}` : undefined),
      context: { digest: error.digest },
    });
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <p className="text-lg font-bold text-zinc-100">Diese Seite hatte einen Fehler.</p>
      <p className="max-w-md text-sm text-zinc-500">Der Fehler wurde automatisch erfasst.</p>
      <button
        onClick={reset}
        className="mt-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500"
      >
        Erneut versuchen
      </button>
    </div>
  );
}
