"use server";

import { createClient } from "@/lib/supabase/server";
import { logDebugEvent } from "@/lib/debug-log-server";

/**
 * Wird vom Client genau EINMAL pro neuem Build (pro Browser) aufgerufen, sobald
 * eine neue Version erstmals geladen wurde. Schreibt einen gut sichtbaren
 * `deploy`-Eintrag ins Debug-Log → dort sieht der Admin live, dass das neue
 * Deployment angekommen und im Browser aktiv ist.
 */
export async function reportVersionLoaded(info: {
  versionKey: string;
  deployName?: string;
  commitShort?: string;
  commitMessage?: string;
  commitRef?: string;
  buildTime?: string;
  deploymentId?: string;
  vercelEnv?: string;
}): Promise<{ logged: boolean }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { logged: false }; // nur eingeloggte Loads zählen

    const label = info.deployName || info.commitShort || info.versionKey || "unbekannt";
    const msgLine = info.commitMessage ? ` — „${info.commitMessage}"` : "";

    await logDebugEvent({
      level: "info",
      scope: "deploy",
      message: `🚀 Neue Version geladen: ${label}${msgLine}`,
      detail: [
        info.deployName ? `Deploy: ${info.deployName}` : null,
        info.commitShort ? `Commit: ${info.commitShort}` : null,
        info.commitRef ? `Branch: ${info.commitRef}` : null,
        info.commitMessage ? `Nachricht: ${info.commitMessage}` : null,
        info.buildTime ? `Gebaut: ${info.buildTime}` : null,
        info.deploymentId ? `Deployment-ID: ${info.deploymentId}` : null,
        info.vercelEnv ? `Umgebung: ${info.vercelEnv}` : null,
        `Geladen: ${new Date().toISOString()}`,
        `Nutzer: ${user.id}`,
      ].filter(Boolean).join("\n"),
      context: {
        versionKey: info.versionKey,
        deployName: info.deployName ?? null,
        commitShort: info.commitShort ?? null,
        commitRef: info.commitRef ?? null,
        buildTime: info.buildTime ?? null,
        deploymentId: info.deploymentId ?? null,
        vercelEnv: info.vercelEnv ?? null,
        userId: user.id,
      },
    });
    return { logged: true };
  } catch {
    return { logged: false };
  }
}
