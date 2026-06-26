export type SurveyStatus = "draft" | "active" | "closed";
export type QuestionType = "single" | "multiple" | "text" | "rating" | "poll" | "scale" | "yes_no" | "number";

export interface Survey {
  id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  startAt: string | null;
  endAt: string | null;
  allowAnonymous: boolean;
  imageUrl: string | null;
  showResultsAfterSubmit: boolean;
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
  hintText: string | null;
  imageUrl: string | null;
  scaleMin: number;
  scaleMax: number;
  maxLength: number;
}

export interface SurveyAnswer {
  questionId: string;
  answerText?: string;
  answerOptions?: number[];
  answerRating?: number;
  answerNumber?: number;
}

export interface SurveyResultsEntry {
  questionId: string;
  question: string;
  type: QuestionType;
  options: string[] | null;
  totalAnswers: number;
  optionCounts?: number[];
  optionPercents?: number[];
  textAnswers?: string[];
  ratingAverage?: number;
  ratingCounts?: number[];
  numberAverage?: number;
  numberMin?: number;
  numberMax?: number;
  yesCount?: number;
  noCount?: number;
  scaleAverage?: number;
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single:   "Einfachauswahl",
  multiple: "Mehrfachauswahl",
  text:     "Freitext",
  rating:   "Bewertung (1–5 Sterne)",
  poll:     "Abstimmung (Live-Ergebnis)",
  scale:    "Skala (Schieberegler)",
  yes_no:   "Ja / Nein",
  number:   "Zahl",
};

export const QUESTION_TYPE_ICONS: Record<QuestionType, string> = {
  single:   "◉",
  multiple: "☑",
  text:     "✏",
  rating:   "★",
  poll:     "📊",
  scale:    "↔",
  yes_no:   "✓✗",
  number:   "#",
};

export const STATUS_META: Record<SurveyStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:  { label: "Entwurf",       color: "text-zinc-400",    bg: "bg-zinc-800/60",     border: "border-zinc-600/40" },
  active: { label: "Aktiv",         color: "text-emerald-300", bg: "bg-emerald-500/15",  border: "border-emerald-400/40" },
  closed: { label: "Geschlossen",   color: "text-zinc-500",    bg: "bg-zinc-800/40",     border: "border-zinc-700/40" },
};
