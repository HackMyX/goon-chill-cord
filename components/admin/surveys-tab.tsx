"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import {
  Plus, Trash2, Pencil, Check, X, Loader2, ChevronDown, ChevronUp,
  BarChart3, Users, Clock, Globe, FileText, ArrowUp, ArrowDown,
  ToggleLeft, ToggleRight, RefreshCw, AlertTriangle,
} from "lucide-react";
import {
  getAdminSurveys, getSurveyWithQuestions, createSurvey, updateSurvey,
  deleteSurvey, createSurveyQuestion, updateSurveyQuestion,
  deleteSurveyQuestion, reorderSurveyQuestions, getSurveyResults,
} from "@/lib/actions/surveys";
import type { Survey, SurveyQuestion, SurveyResultsEntry, SurveyStatus, QuestionType } from "@/lib/surveys";
import { QUESTION_TYPE_LABELS, STATUS_META } from "@/lib/surveys";
import { useSoundManager } from "@/lib/sound-manager";

// ── Status badge ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SurveyStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${m.color} ${m.bg} ${m.border}`}>
      {m.label}
    </span>
  );
}

// ── Results panel ─────────────────────────────────────────────────────────

function ResultsPanel({ surveyId }: { surveyId: string }) {
  const [results, setResults] = useState<SurveyResultsEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const sound = useSoundManager();

  async function load() {
    sound.click();
    setLoading(true);
    try { setResults(await getSurveyResults(surveyId)); }
    finally { setLoading(false); }
  }

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/20">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <BarChart3 className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-bold text-zinc-200">Ergebnisse</span>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:border-purple-400/50 hover:text-purple-300 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {results ? "Neu laden" : "Laden"}
        </button>
      </div>

      {!results && !loading && (
        <p className="px-4 py-6 text-center text-xs text-zinc-500">Auf „Laden" klicken um die Ergebnisse zu sehen.</p>
      )}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lade Ergebnisse…
        </div>
      )}

      {results && !loading && (
        <div className="divide-y divide-white/5">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-zinc-500">Noch keine Antworten.</p>
          )}
          {results.map((r) => (
            <div key={r.questionId} className="px-4 py-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-200">{r.question}</p>
                <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-500">{r.totalAnswers} Antworten</span>
              </div>

              {r.type === "text" && (
                <div className="flex flex-col gap-1 pl-2">
                  {(r.textAnswers ?? []).length === 0 ? (
                    <p className="text-xs text-zinc-600">Keine Freitextantworten.</p>
                  ) : (r.textAnswers ?? []).map((t, i) => (
                    <p key={i} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300">{t}</p>
                  ))}
                </div>
              )}

              {r.type === "rating" && (
                <div className="pl-2">
                  <p className="mb-1 text-sm font-bold text-purple-300">Ø {r.ratingAverage ?? 0} / 5</p>
                  {[1, 2, 3, 4, 5].map((v) => {
                    const count = r.ratingCounts?.[v - 1] ?? 0;
                    const pct = r.totalAnswers > 0 ? (count / r.totalAnswers) * 100 : 0;
                    return (
                      <div key={v} className="mb-1 flex items-center gap-2">
                        <span className="w-4 text-right text-xs text-zinc-500">{v}★</span>
                        <div className="flex-1 overflow-hidden rounded-full bg-white/5">
                          <div className="h-2 rounded-full bg-amber-500/60 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs text-zinc-500">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {(r.type === "single" || r.type === "multiple") && (
                <div className="flex flex-col gap-1 pl-2">
                  {(r.options ?? []).map((opt, i) => {
                    const count = r.optionCounts?.[i] ?? 0;
                    const pct = r.totalAnswers > 0 ? (count / r.totalAnswers) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{opt}</span>
                        <div className="w-24 overflow-hidden rounded-full bg-white/5">
                          <div className="h-2 rounded-full bg-purple-500/60 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs text-zinc-500">{count}</span>
                        <span className="w-8 text-right text-[10px] text-zinc-600">{Math.round(pct)}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Question editor ────────────────────────────────────────────────────────

interface QuestionFormValues {
  question: string;
  type: QuestionType;
  options: string[];
  required: boolean;
}

const DEFAULT_QF: QuestionFormValues = { question: "", type: "single", options: ["", ""], required: true };

function QuestionEditor({
  surveyId,
  questions,
  onRefresh,
}: { surveyId: string; questions: SurveyQuestion[]; onRefresh: () => void }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<QuestionFormValues>(DEFAULT_QF);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const sound = useSoundManager();

  function flash(msg: string) { setMessage(msg); setTimeout(() => setMessage(null), 3000); }

  function openNew() { setEditing("new"); setForm(DEFAULT_QF); }

  function openEdit(q: SurveyQuestion) {
    setEditing(q.id);
    setForm({ question: q.question, type: q.type, options: q.options ?? ["", ""], required: q.required });
  }

  async function handleSave() {
    if (!form.question.trim()) { flash("Frage ist Pflichtfeld."); return; }
    if ((form.type === "single" || form.type === "multiple") && form.options.filter((o) => o.trim()).length < 2) {
      flash("Mindestens 2 Antwortoptionen erforderlich."); return;
    }
    setSaving(true);
    sound.click();
    const cleanOptions = form.options.filter((o) => o.trim());
    if (editing === "new") {
      const res = await createSurveyQuestion(surveyId, {
        question: form.question,
        type: form.type,
        options: cleanOptions.length > 0 ? cleanOptions : undefined,
        required: form.required,
        sortOrder: questions.length,
      });
      if (!res.success) { sound.error(); flash(res.error ?? "Fehler."); } else { sound.save(); onRefresh(); setEditing(null); }
    } else if (editing) {
      const res = await updateSurveyQuestion(editing, {
        question: form.question, type: form.type,
        options: cleanOptions.length > 0 ? cleanOptions : null,
        required: form.required,
      });
      if (!res.success) { sound.error(); flash(res.error ?? "Fehler."); } else { sound.save(); onRefresh(); setEditing(null); }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    sound.click();
    setDeletingId(id);
    const res = await deleteSurveyQuestion(id);
    setDeletingId(null);
    if (res.success) { onRefresh(); } else { sound.error(); }
  }

  async function handleMove(idx: number, dir: -1 | 1) {
    const arr = questions.map((q) => q.id);
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    await reorderSurveyQuestions(arr);
    onRefresh();
  }

  const needsOptions = form.type === "single" || form.type === "multiple";

  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Fragen ({questions.length})</h4>
        {editing !== "new" && (
          <button
            onClick={() => { sound.click(); openNew(); }}
            className="flex items-center gap-1 rounded-lg border border-purple-500/30 px-2.5 py-1 text-xs font-semibold text-purple-300 hover:bg-purple-500/10"
          >
            <Plus className="h-3.5 w-3.5" />
            Frage hinzufügen
          </button>
        )}
      </div>

      {message && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">{message}</p>
      )}

      {editing === "new" && (
        <QuestionForm form={form} setForm={setForm} needsOptions={needsOptions} saving={saving}
          onSave={handleSave} onCancel={() => setEditing(null)} />
      )}

      {questions.map((q, idx) => (
        <div key={q.id} className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
          {editing === q.id ? (
            <div className="p-3">
              <QuestionForm form={form} setForm={setForm} needsOptions={needsOptions} saving={saving}
                onSave={handleSave} onCancel={() => setEditing(null)} />
            </div>
          ) : (
            <div className="flex items-start gap-2 px-3 py-2.5">
              <div className="flex flex-col gap-0.5 mt-0.5">
                <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} className="rounded p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-20">
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button onClick={() => handleMove(idx, 1)} disabled={idx === questions.length - 1} className="rounded p-0.5 text-zinc-600 hover:text-zinc-300 disabled:opacity-20">
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-200">{q.question}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-500">{QUESTION_TYPE_LABELS[q.type]}</span>
                  {q.required && <span className="text-[10px] text-red-400">Pflicht</span>}
                  {q.options && <span className="text-[10px] text-zinc-600">{q.options.length} Optionen</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { sound.click(); openEdit(q); }} className="rounded-lg border border-white/10 p-1.5 text-zinc-500 hover:border-amber-400/40 hover:text-amber-300">
                  <Pencil className="h-3 w-3" />
                </button>
                <button onClick={() => handleDelete(q.id)} disabled={deletingId === q.id} className="rounded-lg border border-white/10 p-1.5 text-zinc-500 hover:border-red-500/40 hover:text-red-400 disabled:opacity-50">
                  {deletingId === q.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {questions.length === 0 && editing !== "new" && (
        <p className="py-4 text-center text-xs text-zinc-600">Noch keine Fragen — klicke „Frage hinzufügen".</p>
      )}
    </div>
  );
}

function QuestionForm({ form, setForm, needsOptions, saving, onSave, onCancel }: {
  form: QuestionFormValues;
  setForm: (f: (prev: QuestionFormValues) => QuestionFormValues) => void;
  needsOptions: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const sound = useSoundManager();
  return (
    <div className="rounded-xl border border-purple-500/20 bg-[#0d0c1a] p-3 flex flex-col gap-2">
      <input
        value={form.question}
        onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
        placeholder="Frage…"
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as QuestionType }))}
          className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 outline-none"
        >
          {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
            <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={form.required} onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))} className="accent-purple-500" />
          <span className="text-xs text-zinc-400">Pflichtfeld</span>
        </label>
      </div>

      {needsOptions && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-zinc-500">Antwortoptionen</span>
          {form.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-xs text-zinc-600">{i + 1}.</span>
              <input
                value={opt}
                onChange={(e) => setForm((f) => ({ ...f, options: f.options.map((o, j) => j === i ? e.target.value : o) }))}
                placeholder={`Option ${i + 1}…`}
                className="flex-1 rounded-lg border border-white/8 bg-black/30 px-2.5 py-1 text-xs text-zinc-100 outline-none focus:border-purple-400/40"
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, options: f.options.filter((_, j) => j !== i) }))}
                disabled={form.options.length <= 2}
                className="rounded p-0.5 text-zinc-600 hover:text-red-400 disabled:opacity-20"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, options: [...f.options, ""] }))}
            className="flex items-center gap-1 pl-4 text-[11px] text-zinc-600 hover:text-zinc-400"
          >
            <Plus className="h-3 w-3" />
            Option hinzufügen
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button onClick={onSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-60">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Speichern
        </button>
        <button onClick={onCancel} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:border-white/30">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ── Survey row ─────────────────────────────────────────────────────────────

function SurveyRow({ survey, onRefresh }: { survey: Survey; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<Survey | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [metaForm, setMetaForm] = useState({
    title: survey.title,
    description: survey.description ?? "",
    allowAnonymous: survey.allowAnonymous,
    startAt: survey.startAt ? survey.startAt.slice(0, 16) : "",
    endAt: survey.endAt ? survey.endAt.slice(0, 16) : "",
  });
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const sound = useSoundManager();

  function flash(text: string, ok: boolean) {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 3000);
  }

  async function loadDetail() {
    if (detail) return;
    const d = await getSurveyWithQuestions(survey.id);
    setDetail(d);
  }

  async function handleExpand() {
    sound.click();
    if (!expanded) await loadDetail();
    setExpanded(!expanded);
  }

  async function handleStatusChange(status: SurveyStatus) {
    sound.click();
    startTransition(async () => {
      const res = await updateSurvey(survey.id, { status });
      if (res.success) { sound.save(); onRefresh(); } else { sound.error(); flash(res.error ?? "Fehler.", false); }
    });
  }

  async function handleMetaSave() {
    sound.click();
    if (!metaForm.title.trim()) { flash("Titel ist Pflichtfeld.", false); return; }
    startTransition(async () => {
      const res = await updateSurvey(survey.id, {
        title: metaForm.title,
        description: metaForm.description || null,
        allowAnonymous: metaForm.allowAnonymous,
        startAt: metaForm.startAt ? new Date(metaForm.startAt).toISOString() : null,
        endAt: metaForm.endAt ? new Date(metaForm.endAt).toISOString() : null,
      });
      if (res.success) { sound.save(); flash("Gespeichert.", true); setEditingMeta(false); onRefresh(); }
      else { sound.error(); flash(res.error ?? "Fehler.", false); }
    });
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 4000); return; }
    sound.click();
    startTransition(async () => {
      const res = await deleteSurvey(survey.id);
      if (res.success) { onRefresh(); } else { sound.error(); flash(res.error ?? "Fehler.", false); }
    });
  }

  const refreshDetail = useCallback(async () => {
    const d = await getSurveyWithQuestions(survey.id);
    setDetail(d);
    onRefresh();
  }, [survey.id, onRefresh]);

  return (
    <div className={`rounded-xl border overflow-hidden ${survey.status === "active" ? "border-emerald-500/20" : "border-white/10"} bg-white/[0.02]`}>
      <button
        onClick={handleExpand}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <StatusBadge status={survey.status} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-zinc-200 truncate">{survey.title}</p>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              <Users className="h-2.5 w-2.5" />
              {survey.responseCount ?? 0} Teilnehmer
            </span>
            {survey.allowAnonymous && (
              <span className="text-[10px] text-sky-400">Anonym erlaubt</span>
            )}
            {(survey.startAt || survey.endAt) && (
              <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                <Clock className="h-2.5 w-2.5" />
                {survey.startAt ? new Date(survey.startAt).toLocaleDateString("de-DE") : "offen"}
                {" – "}
                {survey.endAt ? new Date(survey.endAt).toLocaleDateString("de-DE") : "offen"}
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-4 pb-4">
          {/* Action bar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {survey.status === "draft" && (
              <button onClick={() => handleStatusChange("active")} disabled={pending}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">
                <Globe className="h-3.5 w-3.5" />Aktivieren
              </button>
            )}
            {survey.status === "active" && (
              <button onClick={() => handleStatusChange("closed")} disabled={pending}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-500/30 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-500/10 disabled:opacity-50">
                <X className="h-3.5 w-3.5" />Schließen
              </button>
            )}
            {survey.status === "closed" && (
              <button onClick={() => handleStatusChange("draft")} disabled={pending}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-white/5 disabled:opacity-50">
                Zurück zu Entwurf
              </button>
            )}
            <button onClick={() => { sound.click(); setEditingMeta(!editingMeta); }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${editingMeta ? "border-amber-400/40 bg-amber-500/10 text-amber-300" : "border-white/10 text-zinc-400 hover:border-amber-400/30 hover:text-amber-300"}`}>
              <Pencil className="h-3.5 w-3.5" />Einstellungen
            </button>
            <button onClick={() => { sound.click(); setShowResults(!showResults); }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${showResults ? "border-purple-400/40 bg-purple-500/10 text-purple-300" : "border-white/10 text-zinc-400 hover:border-purple-400/30 hover:text-purple-300"}`}>
              <BarChart3 className="h-3.5 w-3.5" />Ergebnisse
            </button>
            <button onClick={handleDelete} disabled={pending}
              className={`ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${confirmDelete ? "border-red-500/50 bg-red-500/20 text-red-300" : "border-white/10 text-zinc-500 hover:border-red-500/30 hover:text-red-400"}`}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {confirmDelete ? "Wirklich löschen?" : "Löschen"}
            </button>
          </div>

          {message && (
            <p className={`mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${message.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
              {message.text}
            </p>
          )}

          {editingMeta && (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-zinc-400">Titel *</span>
                <input value={metaForm.title} onChange={(e) => setMetaForm((f) => ({ ...f, title: e.target.value }))}
                  className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-zinc-400">Beschreibung</span>
                <textarea rows={2} value={metaForm.description} onChange={(e) => setMetaForm((f) => ({ ...f, description: e.target.value }))}
                  className="resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-zinc-400">Start</span>
                  <input type="datetime-local" value={metaForm.startAt} onChange={(e) => setMetaForm((f) => ({ ...f, startAt: e.target.value }))}
                    className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-zinc-400">Ende</span>
                  <input type="datetime-local" value={metaForm.endAt} onChange={(e) => setMetaForm((f) => ({ ...f, endAt: e.target.value }))}
                    className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60" />
                </label>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={metaForm.allowAnonymous} onChange={(e) => setMetaForm((f) => ({ ...f, allowAnonymous: e.target.checked }))} className="accent-purple-500" />
                <span className="text-xs text-zinc-300">Anonyme Teilnahme erlauben</span>
              </label>
              <div className="flex items-center gap-2 pt-1">
                <button onClick={handleMetaSave} disabled={pending}
                  className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-60">
                  {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Speichern
                </button>
                <button onClick={() => setEditingMeta(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400">
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {showResults && <ResultsPanel surveyId={survey.id} />}

          {detail && (
            <QuestionEditor
              surveyId={survey.id}
              questions={detail.questions ?? []}
              onRefresh={refreshDetail}
            />
          )}
          {!detail && !showResults && !editingMeta && (
            <p className="mt-3 text-xs text-zinc-600">Lade Fragen…</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create form ────────────────────────────────────────────────────────────

function CreateSurveyForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [allowAnonymous, setAllowAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();

  async function handleCreate() {
    if (!title.trim()) { setError("Titel ist Pflichtfeld."); return; }
    setSaving(true);
    sound.click();
    const res = await createSurvey({ title, description: description || undefined, allowAnonymous });
    setSaving(false);
    if (res.success) { sound.save(); onCreated(); setTitle(""); setDescription(""); setAllowAnonymous(false); }
    else { sound.error(); setError(res.error ?? "Fehler."); }
  }

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-[#0d0c1a] p-4 flex flex-col gap-3">
      <h4 className="text-sm font-bold text-zinc-100">Neue Umfrage</h4>
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">{error}</p>}
      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); setError(null); }}
        placeholder="Titel der Umfrage *"
        className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
      />
      <textarea
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Beschreibung (optional)"
        className="resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
      />
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={allowAnonymous} onChange={(e) => setAllowAnonymous(e.target.checked)} className="accent-purple-500" />
        <span className="text-xs text-zinc-300">Anonyme Teilnahme erlauben</span>
      </label>
      <div className="flex items-center gap-2">
        <button onClick={handleCreate} disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-60">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Erstellen
        </button>
      </div>
    </div>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────────

export function SurveysTab() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SurveyStatus | "all">("all");
  const sound = useSoundManager();

  const load = useCallback(async () => {
    setLoading(true);
    try { setSurveys(await getAdminSurveys()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = statusFilter === "all" ? surveys : surveys.filter((s) => s.status === statusFilter);
  const counts: Record<SurveyStatus | "all", number> = {
    all: surveys.length,
    draft: surveys.filter((s) => s.status === "draft").length,
    active: surveys.filter((s) => s.status === "active").length,
    closed: surveys.filter((s) => s.status === "closed").length,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3 text-xs text-zinc-400">
        Erstelle Umfragen mit flexiblen Fragetypen. Aktive Umfragen erscheinen automatisch für eingeloggte Nutzer.
        Ergebnisse sind in Echtzeit auswertbar. Anonyme Teilnahme kann pro Umfrage aktiviert werden.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "active", "draft", "closed"] as (SurveyStatus | "all")[]).map((s) => (
          <button key={s} onClick={() => { sound.click(); setStatusFilter(s); }}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              statusFilter === s
                ? "border-purple-400 bg-purple-500/15 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.35)]"
                : "border-white/10 text-zinc-400 hover:border-white/30"
            }`}>
            {s === "all" ? "Alle" : STATUS_META[s].label}
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{counts[s]}</span>
          </button>
        ))}
        <button onClick={() => { sound.click(); load(); }}
          className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 hover:border-white/30">
          <RefreshCw className="h-3 w-3" />
          Aktualisieren
        </button>
        <button onClick={() => { sound.click(); setShowCreate(!showCreate); }}
          className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${showCreate ? "border-purple-400 bg-purple-500/15 text-purple-200" : "border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20"}`}>
          <Plus className="h-4 w-4" />
          Neue Umfrage
        </button>
      </div>

      {showCreate && (
        <CreateSurveyForm onCreated={() => { setShowCreate(false); load(); }} />
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        </div>
      )}

      {!loading && displayed.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] py-12 text-center">
          <BarChart3 className="h-8 w-8 text-zinc-700" />
          <p className="text-sm text-zinc-500">Keine Umfragen gefunden.</p>
        </div>
      )}

      {!loading && displayed.map((s) => (
        <SurveyRow key={s.id} survey={s} onRefresh={load} />
      ))}
    </div>
  );
}
