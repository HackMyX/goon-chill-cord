export type SurveyStatus = "draft" | "active" | "closed";
export type QuestionType = "single" | "multiple" | "text" | "rating";

export interface Survey {
  id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  startAt: string | null;
  endAt: string | null;
  allowAnonymous: boolean;
  createdAt: string;
  updatedAt: string;
  questions?: SurveyQuestion[];
  responseCount?: number;
  hasResponded?: boolean;
}

export interface SurveyQuestion {
  id: string;
  surveyId: string;
  question: string;
  type: QuestionType;
  options: string[] | null;
  required: boolean;
  sortOrder: number;
}

export interface SurveyAnswer {
  questionId: string;
  answerText?: string;
  answerOptions?: number[];
  answerRating?: number;
}

export interface SurveyResultsEntry {
  questionId: string;
  question: string;
  type: QuestionType;
  options: string[] | null;
  totalAnswers: number;
  optionCounts?: number[];
  textAnswers?: string[];
  ratingAverage?: number;
  ratingCounts?: number[];
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: "Einfachauswahl",
  multiple: "Mehrfachauswahl",
  text: "Freitext",
  rating: "Bewertung (1–5)",
};

export const STATUS_META: Record<SurveyStatus, { label: string; color: string; bg: string; border: string }> = {
  draft: { label: "Entwurf", color: "text-zinc-400", bg: "bg-zinc-800/60", border: "border-zinc-600/40" },
  active: { label: "Aktiv", color: "text-emerald-300", bg: "bg-emerald-500/15", border: "border-emerald-400/40" },
  closed: { label: "Geschlossen", color: "text-zinc-500", bg: "bg-zinc-800/40", border: "border-zinc-700/40" },
};
