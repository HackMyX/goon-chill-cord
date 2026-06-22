"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/actions/debug-log";

/**
 * Root-level client error boundary — catches anything that escapes every
 * other boundary (including errors in the root layout itself). Reports to
 * the same debug_logs table instrumentation.ts's onRequestError writes to,
 * so the admin Debug Log tab really does see everything, client and
 * server. Must render its own <html>/<body> — Next.js replaces the entire
 * root layout with this component when it triggers.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportClientError({
      message: error.message || "Unbekannter Client-Fehler",
      detail: error.stack ?? (error.digest ? `digest: ${error.digest}` : undefined),
      context: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="de">
      <body className="flex min-h-screen items-center justify-center bg-[#030305] text-zinc-100">
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <p className="text-lg font-bold text-zinc-100">Etwas ist schiefgelaufen.</p>
          <p className="max-w-md text-sm text-zinc-500">
            Der Fehler wurde automatisch erfasst. Lade die Seite neu oder versuch es später erneut.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500"
          >
            Seite neu laden
          </button>
        </div>
      </body>
    </html>
  );
}
