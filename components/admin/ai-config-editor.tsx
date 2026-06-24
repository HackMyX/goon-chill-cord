"use client";

import { useEffect, useState, useTransition } from "react";
import { KeyRound, CheckCircle2, AlertCircle, RefreshCw, Eye, EyeOff, Sparkles, FlaskConical } from "lucide-react";
import { getAiConfigStatus, updateAiApiKey } from "@/lib/actions/ai-config";

type KeySource = "db" | "env" | "none";

interface StatusState {
  hasKey: boolean;
  source: KeySource;
  maskedKey: string | null;
}

interface TestResult {
  ok: boolean;
  source?: string;
  maskedKey?: string | null;
  model?: string;
  reply?: string;
  error?: string;
  rawError?: string | null;
}

export function AiConfigEditor() {
  const [status, setStatus] = useState<StatusState | null>(null);
  const [inputKey, setInputKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getAiConfigStatus().then(setStatus);
  }, []);

  function handleSave() {
    if (!inputKey.trim()) return;
    setFeedback(null);
    setTestResult(null);
    startTransition(async () => {
      const res = await updateAiApiKey(inputKey.trim());
      if (res.success) {
        setFeedback({ ok: true, msg: "API-Schlüssel gespeichert. Neue Anfragen nutzen ihn sofort." });
        setInputKey("");
        const next = await getAiConfigStatus();
        setStatus(next);
      } else {
        setFeedback({ ok: false, msg: res.error ?? "Unbekannter Fehler." });
      }
    });
  }

  function handleClear() {
    setFeedback(null);
    setTestResult(null);
    startTransition(async () => {
      const res = await updateAiApiKey("");
      if (res.success) {
        setFeedback({ ok: true, msg: "API-Schlüssel entfernt. KI-Assistent nutzt jetzt .env-Fallback (falls gesetzt)." });
        const next = await getAiConfigStatus();
        setStatus(next);
      } else {
        setFeedback({ ok: false, msg: res.error ?? "Unbekannter Fehler." });
      }
    });
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai-test-key");
      const data = await res.json() as TestResult;
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: "Verbindungsfehler beim Test." });
    } finally {
      setTesting(false);
    }
  }

  const sourceLabel: Record<KeySource, string> = {
    db: "Datenbank (DB-Schlüssel aktiv)",
    env: "Umgebungsvariable (kein DB-Schlüssel gesetzt)",
    none: "Kein Schlüssel konfiguriert",
  };

  const sourceColor: Record<KeySource, string> = {
    db: "text-emerald-400",
    env: "text-amber-400",
    none: "text-red-400",
  };

  return (
    <div className="rounded-2xl border border-white/8 bg-black/30 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-purple-400" />
        <h3 className="text-sm font-bold text-zinc-200">KI-Konfiguration (Groq)</h3>
      </div>

      {/* Current key status */}
      <div className="mb-4 rounded-xl border border-white/6 bg-white/[0.03] px-4 py-3">
        {status === null ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Lade Status…
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-zinc-400">Aktueller Schlüssel:</span>
            {status.hasKey ? (
              <span className="font-mono text-zinc-200">{status.maskedKey}</span>
            ) : (
              <span className="text-zinc-500 italic">nicht konfiguriert</span>
            )}
            <span className={`ml-auto text-xs font-semibold ${sourceColor[status.source]}`}>
              {sourceLabel[status.source]}
            </span>
          </div>
        )}
      </div>

      {/* Input row */}
      <div className="mb-2 flex gap-2">
        <div className="relative flex-1">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type={showKey ? "text" : "password"}
            placeholder="Neuen Groq API-Schlüssel eingeben… (gsk_…)"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            className="w-full rounded-xl border border-white/10 bg-black/40 py-2 pl-9 pr-10 text-sm font-mono text-zinc-100 outline-none placeholder:font-sans placeholder:text-zinc-500 focus:border-purple-400/60"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={!inputKey.trim() || isPending}
          className="rounded-xl border border-purple-500/40 bg-purple-500/20 px-4 py-2 text-sm font-semibold text-purple-200 transition hover:bg-purple-500/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Speichern"}
        </button>
        {status?.source === "db" && status.hasKey && (
          <button
            onClick={handleClear}
            disabled={isPending}
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Entfernen
          </button>
        )}
      </div>

      {/* Test button row */}
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={handleTest}
          disabled={testing || !status?.hasKey}
          className="flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
          Schlüssel testen
        </button>
        <p className="text-[11px] text-zinc-500">
          Neuen Schlüssel unter{" "}
          <span className="font-mono text-zinc-400">console.groq.com/keys</span> generieren.
          DB-Schlüssel hat Vorrang vor <span className="font-mono text-zinc-400">GROQ_API_KEY</span>.
        </p>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`mb-3 rounded-xl border px-4 py-3 text-xs ${
          testResult.ok
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {testResult.ok ? (
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p className="font-bold">Schlüssel funktioniert!</p>
                <p className="mt-0.5 text-emerald-400/80">
                  Modell: {testResult.model} · Antwort: „{testResult.reply}"
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p className="font-bold">{testResult.error}</p>
                {testResult.rawError && (
                  <p className="mt-1 font-mono text-[10px] break-all text-red-400/80">
                    {testResult.rawError}
                  </p>
                )}
                <p className="mt-1 text-red-400/60">
                  Quelle: {testResult.source ?? "?"} · Schlüssel: {testResult.maskedKey ?? "(keiner)"}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save feedback */}
      {feedback && (
        <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
          feedback.ok
            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {feedback.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {feedback.msg}
        </div>
      )}
    </div>
  );
}
