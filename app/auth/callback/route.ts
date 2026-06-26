import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeviceBanned } from "@/lib/actions/fingerprint";
import { logDebugEvent } from "@/lib/debug-log-server";

function sanitizeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function extractIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { origin, searchParams } = requestUrl;
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  console.log("[auth/callback]", {
    origin,
    next,
    hasCode: Boolean(code),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
  });

  if (code) {
    // Read fingerprint cookie set by FpRegistrar (client-side, before login click)
    const fpCookie = request.headers.get("cookie")
      ?.split(";")
      .find((c) => c.trim().startsWith("_fp="))
      ?.split("=")[1]
      ?.trim() ?? null;

    // Block banned devices BEFORE completing the OAuth session exchange.
    // This means even a brand-new Discord account on a banned device is rejected.
    if (fpCookie && await isDeviceBanned(fpCookie)) {
      return NextResponse.redirect(`${origin}/auth/auth-code-error?reason=device_banned`);
    }

    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const userId = data.user.id;
      const admin = createAdminClient();
      const meta = data.user.user_metadata ?? {};

      // Discord avatar URL — keep in sync with profiles on every login
      const discordAvatarUrl: string | null =
        (meta.avatar_url as string | undefined) ??
        (meta.picture as string | undefined) ??
        null;

      // Ensure a profile row exists — guards against the trigger failing silently
      // (e.g. username uniqueness race) or the user being deleted+re-created.
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (!existing) {
        const baseName = (meta.username ?? meta.full_name ?? meta.name ?? data.user.email?.split("@")[0] ?? "Spieler").slice(0, 28);

        const { data: siteConf } = await admin
          .from("site_config")
          .select("starting_credits")
          .eq("id", "default")
          .maybeSingle();
        const startingCredits = siteConf?.starting_credits ?? 500;

        // Check uniqueness, append suffix if needed
        const { data: nameTaken } = await admin
          .from("profiles")
          .select("id")
          .eq("username", baseName)
          .maybeSingle();
        const username = nameTaken ? `${baseName}_${userId.slice(0, 5)}` : baseName;

        await admin.from("profiles").upsert(
          { id: userId, username, credits: startingCredits, cases_opened: 0, role: "user", avatar_url: discordAvatarUrl },
          { onConflict: "id", ignoreDuplicates: true }
        );
      } else if (discordAvatarUrl) {
        // Sync the Discord avatar on every login so it stays up-to-date
        await admin.from("profiles").update({ avatar_url: discordAvatarUrl }).eq("id", userId);
      }

      // Log the login event for IP-tracking (security section), include fingerprint
      const ip = extractIp(request);
      const ua = request.headers.get("user-agent") ?? null;
      try {
        await admin.from("login_events").insert({
          user_id: userId,
          ip_address: ip,
          user_agent: ua,
          fingerprint: fpCookie ?? null,
        });
      } catch { /* login_events may not exist yet on fresh installs — never block auth */ }
      void logDebugEvent({ level: "info", scope: "auth:login", message: `Benutzer eingeloggt${!existing ? " (NEU)" : ""}: ${userId}`, context: { userId, ip, isNew: !existing } });

      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("[auth/callback] exchangeCodeForSession failed", error?.message);
  } else {
    console.error("[auth/callback] no ?code in callback URL — query was", requestUrl.search);
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
