"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Rocket, GitCommit, GitBranch, Clock, Download, User, Globe, Copy, Check, AlertTriangle } from "lucide-react";
import { BUILD_INFO, hasDeployInfo, relativeTimeDe, formatDe } from "@/lib/build-info";
import { VERSION_LS_LOADED_AT } from "@/components/layout/version-watcher";

/**
 * „Version & Deployment"-Panel im Debug-Tab. Zeigt live & in vollem Umfang:
 * welcher Vercel-Deploy gerade läuft (Name, Commit, Nachricht, Branch, Autor),
 * wann gebaut/deployed wurde (+ „vor X"), und wann DIESE Version im aktuellen
 * Browser geladen wurde. So sieht man sofort, ob das neue Deployment da ist.
 */
export function VersionPanel() {
  const [now, setNow] = useState(() => Date.now());
  const [loadedAt, setLoadedAt] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try { setLoadedAt(localStorage.getItem(VERSION_LS_LOADED_AT) || ""); } catch { /* ignore */ }
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const b = BUILD_INFO;
  const known = hasDeployInfo();
  const envLabel = b.vercelEnv === "production" ? "Produktion" : b.vercelEnv === "preview" ? "Preview" : b.vercelEnv || "lokal";
  const envTone = b.vercelEnv === "production" ? "emerald" : b.vercelEnv === "preview" ? "amber" : "zinc";
  const ENV_CLS: Record<string, string> = {
    emerald: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    amber: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    zinc: "border-white/15 bg-white/5 text-zinc-400",
  };

  function copySummary() {
    const text = [
      `Deploy: ${b.deployName || "—"}`,
      `Commit: ${b.commitShort || "—"} (${b.commitRef || "—"})`,
      `Nachricht: ${b.commitMessage || "—"}`,
      `Gebaut: ${formatDe(b.buildTime)}`,
      `Deployment-ID: ${b.deploymentId || "—"}`,
      `Geladen: ${loadedAt ? formatDe(loadedAt) : "—"}`,
    ].join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  }

  return (
    <div className="overflow-hidden rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/[0.08] via-fuchsia-500/[0.04] to-transparent">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-violet-400/40 bg-violet-500/15 text-violet-300 shadow-[0_0_16px_-2px_rgba(167,139,250,0.6)]">
          <Rocket className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-zinc-100">Version &amp; Deployment</p>
          <p className="text-[11px] text-zinc-500">Welcher Vercel-Deploy läuft &amp; wann er geladen wurde</p>
        </div>
        <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${ENV_CLS[envTone]}`}>
          {envLabel}
        </span>
        <button
          type="button"
          onClick={copySummary}
          title="Zusammenfassung kopieren"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition-colors hover:border-white/25 hover:text-zinc-200"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {!known && (
        <div className="flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/[0.05] px-4 py-2.5 text-[11px] text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Keine Vercel-Build-Infos vorhanden (lokaler Build oder System-Env-Variablen sind im Vercel-Projekt
            deaktiviert). In Produktion erscheinen hier Commit, Nachricht und Deploy-Name automatisch.
          </span>
        </div>
      )}

      {/* Deploy-Name groß */}
      <div className="px-4 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Aktueller Deploy</p>
        <p className="mt-0.5 break-all font-mono text-base font-black text-violet-200">
          {b.deployName || "lokaler Build"}
        </p>
        {b.commitMessage && (
          <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-zinc-200">„{b.commitMessage}"</p>
        )}
      </div>

      {/* Detail-Grid */}
      <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2">
        <Row icon={<Clock className="h-3.5 w-3.5" />} label="Gebaut / Deployed">
          <span className="font-mono text-zinc-200">{formatDe(b.buildTime)}</span>
          <span className="ml-1.5 text-[11px] text-violet-300">({relativeTimeDe(b.buildTime, now)})</span>
        </Row>
        <Row icon={<Download className="h-3.5 w-3.5" />} label="Diese Version geladen">
          {loadedAt ? (
            <>
              <span className="font-mono text-zinc-200">{formatDe(loadedAt)}</span>
              <span className="ml-1.5 text-[11px] text-violet-300">({relativeTimeDe(loadedAt, now)})</span>
            </>
          ) : (
            <span className="text-zinc-500">erste Session dieser Version</span>
          )}
        </Row>
        <Row icon={<GitCommit className="h-3.5 w-3.5" />} label="Commit">
          <span className="font-mono text-zinc-200">{b.commitShort || "—"}</span>
          {b.commitAuthor && <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] text-zinc-500"><User className="h-3 w-3" />{b.commitAuthor}</span>}
        </Row>
        <Row icon={<GitBranch className="h-3.5 w-3.5" />} label="Branch">
          <span className="font-mono text-zinc-200">{b.commitRef || "—"}</span>
        </Row>
        {b.deploymentId && (
          <Row icon={<Globe className="h-3.5 w-3.5" />} label="Deployment-ID">
            <span className="break-all font-mono text-[11px] text-zinc-400">{b.deploymentId}</span>
          </Row>
        )}
      </div>

      <div className="border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-zinc-500">
        💡 Nach einem Push baut Vercel automatisch. Lade die Seite neu (<kbd className="rounded bg-white/10 px-1">Strg</kbd>+<kbd className="rounded bg-white/10 px-1">Shift</kbd>+<kbd className="rounded bg-white/10 px-1">R</kbd>):
        ändert sich „Gebaut / Deployed" auf einen frischen Zeitpunkt, ist das neue Deployment live. Jeder Versionswechsel
        erscheint zusätzlich unten im Log als <span className="font-mono text-violet-300">deploy</span>-Eintrag.
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
        {icon} {label}
      </p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}
