import type { Instrumentation } from "next";

/**
 * Catches every server-side error Next.js itself sees — Server Component
 * render errors, Route Handler errors, and Server Action errors — without
 * needing a try/catch at every call site. This is the backbone of the
 * admin panel's Debug Log tab (components/admin/debug-log-tab.tsx): full
 * coverage by construction, not by remembering to instrument each action.
 *
 * Dynamic import (not a top-level one) because this file also loads in the
 * Edge runtime, where lib/debug-log-server.ts's Supabase admin client
 * (Node-only `server-only` + service-role key) must never be pulled in.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { logDebugEvent } = await import("@/lib/debug-log-server");
  const error = err as { message?: string; stack?: string; digest?: string };

  await logDebugEvent({
    level: "error",
    scope: `next:${context.routerKind}/${context.routeType}`,
    message: error.message ?? "Unbekannter Server-Fehler",
    detail: error.stack ?? (error.digest ? `digest: ${error.digest}` : undefined),
    context: {
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
    },
  });
};
