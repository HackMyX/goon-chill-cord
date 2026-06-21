import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * `next` arrives as a raw query param — without this guard a value like
 * "//evil.com" or "https://evil.com" would be an open redirect, and
 * (more relevantly to past bug reports here) a malformed value could send
 * the browser straight back into a page that immediately bounces it again,
 * which *looks like* an infinite login<->home loop. Only same-app, root-
 * relative paths are accepted; anything else falls back to "/".
 */
function sanitizeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { origin, searchParams } = requestUrl;
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  // The single most common cause of "login works but I end up on the wrong
  // domain / bounce forever" is that this exact origin (e.g.
  // http://localhost:3000) isn't in Supabase's Authentication -> URL
  // Configuration -> Redirect URLs allowlist. When that's the case Supabase
  // silently ignores `redirectTo` and sends the browser back to the
  // project's configured Site URL instead — which, on a project shared
  // between local dev and production, is the live site. Logging the
  // request's actual origin here makes that mismatch immediately visible
  // in the server console instead of having to guess from symptoms.
  console.log("[auth/callback]", {
    origin,
    next,
    hasCode: Boolean(code),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
  });

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] exchangeCodeForSession failed", error.message);
  } else {
    console.error("[auth/callback] no ?code in callback URL — query was", requestUrl.search);
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
