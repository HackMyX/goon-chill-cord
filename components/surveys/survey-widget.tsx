"use client";

import { useState, useTransition } from "react";
import { Check, ChevronRight, Loader2, Star } from "lucide-react";
import { submitSurveyResponse } from "@/lib/actions/surveys";
import type { Survey, SurveyQuestion, SurveyAnswer } from "@/lib/surveys";
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
  const sound = useSoundManager();

  const questions = survey.questions ?? [];

  function setTextAnswer(qId: string, text: string) {
    setAnswers((prev) => ({ ...prev, [qId]: { questionId: qId, answerText: text } }));
  }

  function setRatingAnswer(qId: string, rating: number) {
    setAnswers((prev) => ({ ...prev, [qId]: { questionId: qId, answerRating: rating } }));
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
      if ((q.type === "single" || q.type === "multiple") && (!a.answerOptions || a.answerOptions.length === 0))
        return `Bitte wähle eine Antwort für "${q.question}".`;
      if (q.type === "rating" && !a.answerRating) return `Bitte bewerte "${q.question}".`;
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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-6 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
          <Check className="h-6 w-6 text-emerald-400" />
        </div>
        <h3 className="text-base font-bold text-zinc-100">Danke für deine Teilnahme!</h3>
        {survey.description && <p className="text-sm text-zinc-500">{survey.description}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0814] overflow-hidden">
      <div className="border-b border-white/10 px-5 py-4">
        <h3 className="text-base font-bold text-zinc-100">{survey.title}</h3>
        {survey.description && <p className="mt-1 text-sm text-zinc-400">{survey.description}</p>}
      </div>

      <div className="divide-y divide-white/5">
        {questions.map((q, idx) => (
          <QuestionField
            key={q.id}
            question={q}
            idx={idx}
            answer={answers[q.id]}
            onTextChange={(v) => setTextAnswer(q.id, v)}
            onOptionToggle={(i) => toggleOptionAnswer(q.id, i, q.type === "multiple")}
            onRatingChange={(r) => setRatingAnswer(q.id, r)}
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

function QuestionField({ question: q, idx, answer, onTextChange, onOptionToggle, onRatingChange }: {
  question: SurveyQuestion;
  idx: number;
  answer: SurveyAnswer | undefined;
  onTextChange: (v: string) => void;
  onOptionToggle: (i: number) => void;
  onRatingChange: (r: number) => void;
}) {
  const sound = useSoundManager();

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[10px] font-bold text-purple-300">
          {idx + 1}
        </span>
        <div>
          <p className="text-sm font-semibold text-zinc-100">
            {q.question}
            {q.required && <span className="ml-1 text-red-400">*</span>}
          </p>
          <span className="text-[10px] text-zinc-600">{QUESTION_TYPE_LABELS[q.type]}</span>
        </div>
      </div>

      {q.type === "text" && (
        <textarea
          rows={3}
          value={answer?.answerText ?? ""}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Deine Antwort…"
          className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60"
        />
      )}

      {q.type === "rating" && (
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
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

      {(q.type === "single" || q.type === "multiple") && (
        <div className="flex flex-col gap-1.5">
          {(q.options ?? []).map((opt, i) => {
            const selected = answer?.answerOptions?.includes(i) ?? false;
            return (
              <button
                key={i}
                onClick={() => { sound.click(); onOptionToggle(i); }}
                className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-all ${
                  selected
                    ? "border-purple-400/50 bg-purple-500/15 text-purple-100 shadow-[0_0_8px_rgba(168,85,247,0.2)]"
                    : "border-white/10 text-zinc-300 hover:border-white/20 hover:bg-white/[0.03]"
                }`}
              >
                <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-${q.type === "single" ? "full" : "md"} border ${
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
