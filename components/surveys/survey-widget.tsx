"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronRight, Loader2, Star, BarChart3, ThumbsUp, ThumbsDown } from "lucide-react";
import { submitSurveyResponse, getSurveyResultsPublic } from "@/lib/actions/surveys";
import type { Survey, SurveyQuestion, SurveyAnswer, SurveyResultsEntry } from "@/lib/surveys";
import { QUESTION_TYPE_LABELS } from "@/lib/surveys";
import { useSoundManager } from "@/lib/sound-manager";

interface SurveyWidgetProps {
  survey: Survey;
  alreadyResponded?: boolean;
  onSubmitted?: () => void;
}

export function SurveyWidget({ survey, alreadyResponded = false, onSubmitted }: SurveyWidgetProps) {
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({});
  const [submitted, setSubmitted] = useState(alreadyResponded);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<SurveyResultsEntry[] | null>(null);
  const sound = useSoundManager();

  const questions = survey.questions ?? [];

  // Load public results after submission (or if already responded + results enabled)
  useEffect(() => {
    if ((submitted || alreadyResponded) && survey.showResultsAfterSubmit) {
      getSurveyResultsPublic(survey.id).then(setResults);
    }
  }, [submitted, alreadyResponded, survey.id, survey.showResultsAfterSubmit]);

  function setTextAnswer(qId: string, text: string) {
    setAnswers((prev) => ({ ...prev, [qId]: { questionId: qId, answerText: text } }));
  }

  function setNumberAnswer(qId: string, value: number) {
    setAnswers((prev) => ({ ...prev, [qId]: { questionId: qId, answerNumber: value } }));
  }

  function setRatingAnswer(qId: string, rating: number) {
    setAnswers((prev) => ({ ...prev, [qId]: { questionId: qId, answerRating: rating } }));
  }

  function setScaleAnswer(qId: string, value: number) {
    setAnswers((prev) => ({ ...prev, [qId]: { questionId: qId, answerNumber: value } }));
  }

  function setYesNoAnswer(qId: string, yes: boolean) {
    setAnswers((prev) => ({ ...prev, [qId]: { questionId: qId, answerOptions: [yes ? 0 : 1] } }));
  }

  function toggleOptionAnswer(qId: string, idx: number, multiple: boolean) {
    setAnswers((prev) => {
      const current = prev[qId]?.answerOptions ?? [];
      let next: number[];
      if (multiple) {
        next = current.includes(idx) ? current.filter((i) => i !== idx) : [...current, idx];
      } else {
        next = [idx];
      }
      return { ...prev, [qId]: { questionId: qId, answerOptions: next } };
    });
  }

  function validate(): string | null {
    for (const q of questions) {
      if (!q.required) continue;
      const a = answers[q.id];
      if (!a) return `Frage "${q.question}" ist Pflichtfeld.`;
      if (q.type === "text" && !a.answerText?.trim()) return `Frage "${q.question}" ist Pflichtfeld.`;
      if ((q.type === "single" || q.type === "multiple" || q.type === "poll" || q.type === "yes_no") && (!a.answerOptions || a.answerOptions.length === 0))
        return `Bitte wähle eine Antwort für "${q.question}".`;
      if (q.type === "rating" && !a.answerRating) return `Bitte bewerte "${q.question}".`;
      if ((q.type === "scale" || q.type === "number") && a.answerNumber === undefined) return `Bitte gib einen Wert für "${q.question}" an.`;
    }
    return null;
  }

  function handleSubmit() {
    const err = validate();
    if (err) { sound.error(); setError(err); return; }
    setError(null);
    sound.click();
    startTransition(async () => {
      const res = await submitSurveyResponse(survey.id, Object.values(answers));
      if (res.success) {
        sound.win();
        setSubmitted(true);
        onSubmitted?.();
      } else {
        sound.error();
        setError(res.error ?? "Fehler beim Absenden.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0b0814] overflow-hidden">
        <div className="flex flex-col items-center gap-3 px-6 py-8 text-center border-b border-white/10">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
            <Check className="h-6 w-6 text-emerald-400" />
          </div>
          <h3 className="text-base font-bold text-zinc-100">Danke für deine Teilnahme!</h3>
          <p className="text-sm text-zinc-500">Deine Antworten wurden gespeichert.</p>
        </div>

        {/* Results after submit */}
        {survey.showResultsAfterSubmit && (
          <div className="px-5 py-4">
            {results === null ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-zinc-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Lade Ergebnisse…
              </div>
            ) : results.length === 0 ? (
              <p className="text-center text-xs text-zinc-600 py-4">Noch keine Ergebnisse zum Anzeigen.</p>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  <BarChart3 className="h-3.5 w-3.5 text-purple-400" /> Ergebnisse
                </div>
                {results.map((r) => (
                  <ResultBlock key={r.questionId} result={r} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0814] overflow-hidden">
      {/* Header */}
      <div className="border-b border-white/10 px-5 py-4">
        {survey.imageUrl && (
          <img
            src={survey.imageUrl}
            alt={survey.title}
            className="mb-4 w-full rounded-xl object-cover"
            style={{ maxHeight: 200 }}
          />
        )}
        <h3 className="text-base font-bold text-zinc-100">{survey.title}</h3>
        {survey.description && (
          <p className="mt-1 text-sm text-zinc-400 whitespace-pre-line">{survey.description}</p>
        )}
      </div>

      <div className="divide-y divide-white/5">
        {questions.map((q, idx) => (
          <QuestionField
            key={q.id}
            question={q}
            idx={idx}
            answer={answers[q.id]}
            onTextChange={(v) => setTextAnswer(q.id, v)}
            onNumberChange={(v) => setNumberAnswer(q.id, v)}
            onOptionToggle={(i) => toggleOptionAnswer(q.id, i, q.type === "multiple")}
            onRatingChange={(r) => setRatingAnswer(q.id, r)}
            onScaleChange={(v) => setScaleAnswer(q.id, v)}
            onYesNoChange={(yes) => setYesNoAnswer(q.id, yes)}
          />
        ))}
      </div>

      <div className="border-t border-white/10 px-5 py-4">
        {error && (
          <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
        )}
        <button
          onClick={handleSubmit}
          disabled={pending}
          className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-purple-500 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          Absenden
        </button>
      </div>
    </div>
  );
}

// ── Result visualization block ────────────────────────────────────────────

function ResultBlock({ result }: { result: SurveyResultsEntry }) {
  if (result.type === "text") {
    return (
      <div>
        <p className="mb-2 text-sm font-semibold text-zinc-200">{result.question}</p>
        <p className="text-xs text-zinc-600 mb-2">{result.totalAnswers} Antworten</p>
        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
          {(result.textAnswers ?? []).map((t, i) => (
            <div key={i} className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300">{t}</div>
          ))}
        </div>
      </div>
    );
  }

  if (result.type === "rating") {
    return (
      <div>
        <p className="mb-2 text-sm font-semibold text-zinc-200">{result.question}</p>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl font-black text-amber-300">{result.ratingAverage?.toFixed(1)}</span>
          <div className="flex gap-0.5">
            {[1,2,3,4,5].map((v) => (
              <Star key={v} className="h-4 w-4" fill={(result.ratingAverage ?? 0) >= v ? "#fbbf24" : "none"} color="#fbbf24" />
            ))}
          </div>
          <span className="text-xs text-zinc-600">{result.totalAnswers} Stimmen</span>
        </div>
        <div className="flex gap-1">
          {(result.ratingCounts ?? []).map((c, i) => {
            const max = Math.max(...(result.ratingCounts ?? [1]));
            const pct = max > 0 ? c / max : 0;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                <div className="w-full rounded-t-sm bg-amber-500/20" style={{ height: 32 }}>
                  <div className="rounded-t-sm bg-amber-400" style={{ width: "100%", height: `${pct * 100}%`, marginTop: `${(1-pct)*100}%` }} />
                </div>
                <span className="text-[9px] text-zinc-600">{i+1}★</span>
                <span className="text-[10px] font-bold text-zinc-400">{c}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (result.type === "yes_no") {
    const yes = result.yesCount ?? 0;
    const no = result.noCount ?? 0;
    const total = yes + no;
    const yesPct = total > 0 ? Math.round(yes / total * 100) : 0;
    return (
      <div>
        <p className="mb-3 text-sm font-semibold text-zinc-200">{result.question}</p>
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
            <ThumbsUp className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
            <div className="text-xl font-black text-emerald-300">{yesPct}%</div>
            <div className="text-xs text-zinc-500">{yes} Ja</div>
          </div>
          <div className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center">
            <ThumbsDown className="h-5 w-5 text-red-400 mx-auto mb-1" />
            <div className="text-xl font-black text-red-300">{100 - yesPct}%</div>
            <div className="text-xs text-zinc-500">{no} Nein</div>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-zinc-600">{total} Stimmen gesamt</p>
      </div>
    );
  }

  if (result.type === "scale" || result.type === "number") {
    return (
      <div>
        <p className="mb-2 text-sm font-semibold text-zinc-200">{result.question}</p>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-black text-purple-300">{result.scaleAverage ?? result.numberAverage}</span>
          <div className="text-xs text-zinc-600">
            <div>Min: {result.numberMin}</div>
            <div>Max: {result.numberMax}</div>
          </div>
        </div>
        <p className="text-xs text-zinc-600">{result.totalAnswers} Antworten</p>
      </div>
    );
  }

  // single, multiple, poll
  const opts = result.options ?? [];
  const percents = result.optionPercents ?? opts.map(() => 0);
  const counts = result.optionCounts ?? opts.map(() => 0);
  const maxPct = Math.max(...percents, 1);

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-zinc-200">{result.question}</p>
      <div className="flex flex-col gap-2">
        {opts.map((opt, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-zinc-300">{opt}</span>
              <span className="text-xs font-bold tabular-nums text-zinc-400">{percents[i]}% <span className="text-zinc-600">({counts[i]})</span></span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-500"
                style={{ width: `${(percents[i] / maxPct) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-600">{result.totalAnswers} Stimmen</p>
    </div>
  );
}

// ── Question field ────────────────────────────────────────────────────────────

function QuestionField({ question: q, idx, answer, onTextChange, onNumberChange, onOptionToggle, onRatingChange, onScaleChange, onYesNoChange }: {
  question: SurveyQuestion;
  idx: number;
  answer: SurveyAnswer | undefined;
  onTextChange: (v: string) => void;
  onNumberChange: (v: number) => void;
  onOptionToggle: (i: number) => void;
  onRatingChange: (r: number) => void;
  onScaleChange: (v: number) => void;
  onYesNoChange: (yes: boolean) => void;
}) {
  const sound = useSoundManager();
  const scaleValue = answer?.answerNumber ?? q.scaleMin;

  return (
    <div className="px-5 py-4">
      {/* Question image */}
      {q.imageUrl && (
        <img src={q.imageUrl} alt={q.question} className="mb-3 w-full rounded-xl object-cover" style={{ maxHeight: 160 }} />
      )}

      {/* Question label */}
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[10px] font-bold text-purple-300">
          {idx + 1}
        </span>
        <div>
          <p className="text-sm font-semibold text-zinc-100">
            {q.question}
            {q.required && <span className="ml-1 text-red-400">*</span>}
          </p>
          {q.hintText && <p className="mt-0.5 text-xs text-zinc-500">{q.hintText}</p>}
          <span className="text-[10px] text-zinc-600">{QUESTION_TYPE_LABELS[q.type]}</span>
        </div>
      </div>

      {/* Text */}
      {q.type === "text" && (
        <textarea
          rows={3}
          maxLength={q.maxLength}
          value={answer?.answerText ?? ""}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Deine Antwort…"
          className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
        />
      )}

      {/* Number */}
      {q.type === "number" && (
        <input
          type="number"
          value={answer?.answerNumber ?? ""}
          onChange={(e) => onNumberChange(Number(e.target.value))}
          placeholder="Zahl eingeben…"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
        />
      )}

      {/* Rating */}
      {q.type === "rating" && (
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { sound.click(); onRatingChange(v); }}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                (answer?.answerRating ?? 0) >= v
                  ? "border-amber-400/50 bg-amber-500/20 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
                  : "border-white/10 text-zinc-500 hover:border-amber-400/30 hover:text-amber-400"
              }`}
            >
              <Star className="h-4 w-4" fill={(answer?.answerRating ?? 0) >= v ? "currentColor" : "none"} />
            </button>
          ))}
          {answer?.answerRating && (
            <span className="ml-1 text-sm font-bold text-amber-300">{answer.answerRating}/5</span>
          )}
        </div>
      )}

      {/* Scale slider */}
      {q.type === "scale" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="w-6 text-xs text-zinc-600 text-right">{q.scaleMin}</span>
            <input
              type="range"
              min={q.scaleMin}
              max={q.scaleMax}
              step={1}
              value={scaleValue}
              onChange={(e) => { sound.click(); onScaleChange(Number(e.target.value)); }}
              className="flex-1 accent-purple-500"
            />
            <span className="w-6 text-xs text-zinc-600">{q.scaleMax}</span>
          </div>
          <div className="text-center">
            <span className="text-xl font-black text-purple-300">{scaleValue}</span>
          </div>
        </div>
      )}

      {/* Yes / No */}
      {q.type === "yes_no" && (
        <div className="flex gap-2">
          {([true, false] as const).map((isYes) => {
            const selected = answer?.answerOptions?.includes(isYes ? 0 : 1) ?? false;
            return (
              <button
                key={String(isYes)}
                type="button"
                onClick={() => { sound.click(); onYesNoChange(isYes); }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-bold transition-all ${
                  selected
                    ? isYes
                      ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                      : "border-red-400/50 bg-red-500/15 text-red-200"
                    : "border-white/10 text-zinc-400 hover:border-white/20"
                }`}
              >
                {isYes ? <><ThumbsUp className="h-4 w-4" /> Ja</> : <><ThumbsDown className="h-4 w-4" /> Nein</>}
              </button>
            );
          })}
        </div>
      )}

      {/* Single / Multiple / Poll */}
      {(q.type === "single" || q.type === "multiple" || q.type === "poll") && (
        <div className="flex flex-col gap-1.5">
          {(q.options ?? []).map((opt, i) => {
            const selected = answer?.answerOptions?.includes(i) ?? false;
            return (
              <button
                key={i}
                type="button"
                onClick={() => { sound.click(); onOptionToggle(i); }}
                className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-all ${
                  selected
                    ? "border-purple-400/50 bg-purple-500/15 text-purple-100 shadow-[0_0_8px_rgba(168,85,247,0.2)]"
                    : "border-white/10 text-zinc-300 hover:border-white/20 hover:bg-white/[0.03]"
                }`}
              >
                <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-${q.type === "multiple" ? "md" : "full"} border ${
                  selected ? "border-purple-400 bg-purple-500" : "border-white/20"
                }`}>
                  {selected && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
