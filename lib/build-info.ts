// ─────────────────────────────────────────────────────────────────────────────
// Build-/Deploy-Info — zur Build-Zeit eingebacken (siehe next.config.ts `env`).
// Client-sicher: nur statische NEXT_PUBLIC_*-Werte, die beim `next build`
// inlined werden. Damit weiß jede laufende Instanz exakt, welcher Vercel-Deploy
// sie ist und wann sie gebaut wurde.
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildInfo {
  buildTime: string;       // ISO-Zeitstempel des Builds (= ~Deploy-Zeit)
  commitSha: string;       // voller Git-Commit-Hash
  commitShort: string;     // 7-stelliger Kurz-Hash
  commitMessage: string;   // erste Zeile der Commit-Nachricht
  commitRef: string;       // Branch (z. B. main)
  commitAuthor: string;    // Autor des Commits
  deploymentId: string;    // Vercel Deployment-ID (dpl_…)
  deployUrl: string;       // Vercel-Deploy-URL (enthält den eindeutigen Deploy-Namen)
  deployName: string;      // menschlich lesbarer Deploy-Name (Subdomain der Deploy-URL)
  vercelEnv: string;       // production | preview | development
  /** Stabiler Schlüssel, der sich bei JEDEM neuen Deploy ändert. */
  versionKey: string;
}

const sha = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "";
const deployUrl = process.env.NEXT_PUBLIC_DEPLOY_URL ?? "";
const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const deploymentId = process.env.NEXT_PUBLIC_DEPLOYMENT_ID ?? "";

/** „goon-chill-cord-abc123" aus der Deploy-URL ziehen (der erkennbare Deploy-Name). */
function deriveDeployName(url: string): string {
  if (!url) return "";
  const host = url.replace(/^https?:\/\//, "").split("/")[0];
  return host.split(".")[0] || host;
}

export const BUILD_INFO: BuildInfo = {
  buildTime,
  commitSha: sha,
  commitShort: sha ? sha.slice(0, 7) : "",
  commitMessage: (process.env.NEXT_PUBLIC_COMMIT_MESSAGE ?? "").split("\n")[0],
  commitRef: process.env.NEXT_PUBLIC_COMMIT_REF ?? "",
  commitAuthor: process.env.NEXT_PUBLIC_COMMIT_AUTHOR ?? "",
  deploymentId,
  deployUrl,
  deployName: deriveDeployName(deployUrl),
  vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "",
  // Eindeutig pro Deploy: bevorzugt Deployment-ID, sonst Commit, sonst Build-Zeit.
  versionKey: deploymentId || sha || buildTime || "dev",
};

/** Liegen echte Vercel-Build-Infos vor (oder lokaler Dev-Build ohne)? */
export function hasDeployInfo(): boolean {
  return Boolean(BUILD_INFO.commitSha || BUILD_INFO.deploymentId);
}

/** Deutsches „vor X" / „in X" relativ zu jetzt. */
export function relativeTimeDe(iso: string, now: number = Date.now()): string {
  if (!iso) return "unbekannt";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unbekannt";
  const sec = Math.round((now - then) / 1000);
  const abs = Math.abs(sec);
  const suffix = sec >= 0 ? "vor" : "in";
  const fmt = (n: number, unit: string) => `${suffix} ${n} ${unit}`;
  if (abs < 45) return "gerade eben";
  if (abs < 90) return fmt(1, "Minute");
  if (abs < 3600) return fmt(Math.round(abs / 60), "Minuten");
  if (abs < 5400) return fmt(1, "Stunde");
  if (abs < 86400) return fmt(Math.round(abs / 3600), "Stunden");
  if (abs < 129600) return fmt(1, "Tag");
  return fmt(Math.round(abs / 86400), "Tagen");
}

/** Voller deutscher Zeitstempel. */
export function formatDe(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
