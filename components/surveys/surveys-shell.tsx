"use client";

import { useState } from "react";
import { BarChart3, ClipboardList, Check } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { SurveyWidget } from "@/components/surveys/survey-widget";
import type { Survey } from "@/lib/surveys";

interface SurveysShellProps {
  surveys: Survey[];
  respondedIds: string[];
  credits: number;
  streakDays: number;
  isAdmin: boolean;
  isModerator: boolean;
  userId: string | null;
}

export function SurveysShell({
  surveys,
  respondedIds,
  credits,
  streakDays,
  isAdmin,
  isModerator,
  userId,
}: SurveysShellProps) {
  const [localResponded, setLocalResponded] = useState<Set<string>>(new Set(respondedIds));

  const pending = surveys.filter((s) => !localResponded.has(s.id));
  const done = surveys.filter((s) => localResponded.has(s.id));

  return (
    <div className="min-h-dvh bg-[#070611] text-zinc-100">
      <TopBar
        credits={credits}
        streakDays={streakDays}
        isAdmin={isAdmin}
        isModerator={isModerator}
      />

      <main className="mx-auto max-w-2xl px-3 py-5 sm:px-4 sm:py-10">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-500/15 border border-purple-500/20">
            <ClipboardList className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Umfragen</h1>
            <p className="text-sm text-zinc-500">Deine Meinung zählt!</p>
          </div>
        </div>

        {surveys.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-8">
            {/* Pending surveys */}
            {pending.length > 0 && (
              <section>
                <SectionHeader
                  label="Offen"
                  count={pending.length}
                  color="text-purple-300"
                  dotColor="bg-purple-400"
                />
                <div className="mt-3 flex flex-col gap-4">
                  {pending.map((s) => (
                    <SurveyWidget
                      key={s.id}
                      survey={s}
                      alreadyResponded={false}
                      onSubmitted={() =>
                        setLocalResponded((prev) => new Set([...prev, s.id]))
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed surveys */}
            {done.length > 0 && (
              <section>
                <SectionHeader
                  label="Bereits ausgefüllt"
                  count={done.length}
                  color="text-emerald-300"
                  dotColor="bg-emerald-400"
                />
                <div className="mt-3 flex flex-col gap-4">
                  {done.map((s) => (
                    <SurveyWidget key={s.id} survey={s} alreadyResponded={true} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {!userId && surveys.length > 0 && (
          <p className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
            Logge dich ein, um an Umfragen teilzunehmen und deine Antworten zu speichern.
          </p>
        )}
      </main>
    </div>
  );
}

function SectionHeader({
  label,
  count,
  color,
  dotColor,
}: {
  label: string;
  count: number;
  color: string;
  dotColor: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      <span className={`text-xs font-bold uppercase tracking-widest ${color}`}>{label}</span>
      <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
        {count}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
        <BarChart3 className="h-7 w-7 text-zinc-500" />
      </div>
      <div>
        <h3 className="text-base font-bold text-zinc-300">Keine aktiven Umfragen</h3>
        <p className="mt-1 text-sm text-zinc-600">Schau später nochmal vorbei!</p>
      </div>
    </div>
  );
}
