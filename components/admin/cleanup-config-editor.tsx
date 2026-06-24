"use client";

import { useState, useTransition } from "react";
import { Trash2, Play, Clock, CheckCircle2, AlertCircle, Loader2, RotateCcw, Info } from "lucide-react";
import { CollapsibleAdminRow } from "@/components/admin/collapsible-admin-row";
import {
  updateCleanupRule,
  runCleanupNow,
  runAllEnabledCleanups,
} from "@/lib/actions/cleanup-config";
import type { CleanupRule, CleanupSourceKey } from "@/lib/cleanup-config";
import { useSoundManager } from "@/lib/sound-manager";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h}h`;
  return `vor ${Math.floor(h / 24)}d`;
}

function CleanupRuleRow({
  rule,
  onChange,
}: {
  rule: CleanupRule;
  onChange: (updated: CleanupRule) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  const [days, setDays] = useState(rule.retentionDays);
  const sound = useSoundManager();

  function showFlash(text: string, ok: boolean) {
    setFlash({ text, ok });
    if (ok) sound.save(); else sound.error();
    setTimeout(() => setFlash(null), 3500);
  }

  async function handleToggle() {
    sound.click();
    const newEnabled = !rule.enabled;
    setSaving(true);
    const res = await updateCleanupRule(rule.sourceKey, { enabled: newEnabled });
    setSaving(false);
    if (res.success) {
      onChange({ ...rule, enabled: newEnabled });
      showFlash(newEnabled ? "Aktiviert." : "Deaktiviert.", true);
    } else {
      showFlash(res.error ?? "Fehler.", false);
    }
  }

  async function handleSaveDays() {
    sound.click();
    setSaving(true);
    const res = await updateCleanupRule(rule.sourceKey, { retentionDays: days });
    setSaving(false);
    if (res.success) {
      onChange({ ...rule, retentionDays: days });
      showFlash(`Aufbewahrung: ${days} Tage gespeichert.`, true);
    } else {
      showFlash(res.error ?? "Fehler.", false);
    }
  }

  async function handleRunNow() {
    sound.click();
    setRunning(true);
    const res = await runCleanupNow(rule.sourceKey, days);
    setRunning(false);
    if (res.success) {
      onChange({ ...rule, lastRunAt: new Date().toISOString(), lastRunDeleted: res.deleted, retentionDays: days });
      showFlash(`${res.deleted} Einträge gelöscht.`, true);
    } else {
      showFlash(res.error ?? "Fehler.", false);
    }
  }

  const daysChanged = days !== rule.retentionDays;

  return (
    <div className={`rounded-2xl border p-4 transition-colors ${
      rule.enabled
        ? "border-purple-500/25 bg-purple-500/[0.04]"
        : "border-white/10 bg-white/[0.02]"
    }`}>
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-100">{rule.label}</span>
            {rule.enabled && (
              <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                AKTIV
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">{rule.description}</p>
          {rule.lastRunAt && (
            <p className="text-[11px] text-zinc-600">
              Letzter Lauf: {fmtDate(rule.lastRunAt)} ({timeAgo(rule.lastRunAt)})
              {rule.lastRunDeleted !== null && (
                <span className="ml-1 text-zinc-500">· {rule.lastRunDeleted} gelöscht</span>
              )}
            </p>
          )}
        </div>

        {/* Enable toggle */}
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />}
          <button
            onClick={handleToggle}
            disabled={saving}
            className={`relative h-6 w-11 rounded-full border transition-colors disabled:opacity-50 ${
              rule.enabled
                ? "border-purple-500/50 bg-purple-500/40"
                : "border-white/10 bg-white/5"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full border transition-transform ${
                rule.enabled
                  ? "translate-x-[22px] border-purple-400 bg-purple-300"
                  : "translate-x-0 border-white/20 bg-zinc-500"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Controls row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <Clock className="h-3 w-3 shrink-0 text-zinc-500" />
          Aufbewahren:
          <input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || 30)))}
            className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-0.5 text-center text-xs text-zinc-100 outline-none focus:border-purple-400/60"
          />
          Tage
        </label>

        {daysChanged && (
          <button
            onClick={handleSaveDays}
            disabled={saving}
            className="flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-300 hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Speichern
          </button>
        )}

        <button
          onClick={handleRunNow}
          disabled={running || saving}
          title={`Jetzt löschen: Alles älter als ${days} Tage`}
          className="ml-auto flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
        >
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Jetzt ausführen
        </button>
      </div>

      {flash && (
        <p className={`mt-2 flex items-center gap-1 text-[11px] font-medium ${flash.ok ? "text-emerald-400" : "text-red-400"}`}>
          {flash.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
          {flash.text}
        </p>
      )}
    </div>
  );
}

export function CleanupConfigEditor({ rules: initialRules }: { rules: CleanupRule[] }) {
  const [rules, setRules] = useState(initialRules);
  const [runningAll, startRunAll] = useTransition();
  const [allResult, setAllResult] = useState<string | null>(null);
  const sound = useSoundManager();

  function handleRuleChange(updated: CleanupRule) {
    setRules((prev) => prev.map((r) => (r.sourceKey === updated.sourceKey ? updated : r)));
  }

  function handleRunAll() {
    sound.click();
    setAllResult(null);
    startRunAll(async () => {
      const res = await runAllEnabledCleanups();
      if (res.success) {
        const total = res.results.reduce((s, r) => s + r.deleted, 0);
        setAllResult(`Alle aktiven Regeln ausgeführt: ${total} Einträge gelöscht.`);
        sound.save();
        // Update lastRunAt/lastRunDeleted in local state
        setRules((prev) =>
          prev.map((rule) => {
            const result = res.results.find((r) => r.sourceKey === rule.sourceKey);
            if (!result || !rule.enabled) return rule;
            return {
              ...rule,
              lastRunAt: new Date().toISOString(),
              lastRunDeleted: result.deleted,
            };
          })
        );
      } else {
        setAllResult("Fehler beim Ausführen.");
        sound.error();
      }
    });
  }

  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <CollapsibleAdminRow
      header={
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-red-400" />
          <span className="text-base font-bold text-zinc-100">Verlaufs-Bereinigung</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[11px] font-bold text-purple-300">
              {activeCount} aktiv
            </span>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Info banner */}
        <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] px-4 py-3 text-[11px] text-zinc-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
          <span>
            Aktivierte Regeln löschen beim „Alle ausführen" automatisch alle Einträge die älter als die
            eingestellte Anzahl Tage sind. <strong className="text-zinc-300">„Jetzt ausführen"</strong>{" "}
            löscht sofort unabhängig vom aktiviert/deaktiviert Status.
            Benachrichtigungen: es werden nur <em>gelesene</em> gelöscht.
          </span>
        </div>

        {/* All-run button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunAll}
            disabled={runningAll || activeCount === 0}
            className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
          >
            {runningAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Alle aktiven Regeln ausführen ({activeCount})
          </button>
          {allResult && (
            <span className="text-xs font-medium text-emerald-400">{allResult}</span>
          )}
        </div>

        {/* Rules */}
        <div className="flex flex-col gap-2.5">
          {rules.map((rule) => (
            <CleanupRuleRow
              key={rule.sourceKey}
              rule={rule}
              onChange={handleRuleChange}
            />
          ))}
        </div>
      </div>
    </CollapsibleAdminRow>
  );
}
