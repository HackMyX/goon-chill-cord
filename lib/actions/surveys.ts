"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import type { Survey, SurveyQuestion, SurveyAnswer, SurveyResultsEntry, SurveyStatus, QuestionType } from "@/lib/surveys";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return isAdmin(profile) ? user : null;
}

async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function rowToSurvey(r: Record<string, unknown>): Survey {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string | null,
    status: (r.status as SurveyStatus) ?? "draft",
    startAt: r.start_at as string | null,
    endAt: r.end_at as string | null,
    allowAnonymous: (r.allow_anonymous as boolean) ?? false,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    responseCount: (r.response_count as number) ?? undefined,
  };
}

function rowToQuestion(r: Record<string, unknown>): SurveyQuestion {
  return {
    id: r.id as string,
    surveyId: r.survey_id as string,
    question: r.question as string,
    type: (r.type as QuestionType) ?? "single",
    options: r.options as string[] | null,
    required: (r.required as boolean) ?? true,
    sortOrder: (r.sort_order as number) ?? 0,
  };
}

// ── Admin read ─────────────────────────────────────────────────────────────

export async function getAdminSurveys(): Promise<Survey[]> {
  const user = await requireAdmin();
  if (!user) return [];
  const admin = createAdminClient();
  try {
    const { data } = await admin
      .from("surveys")
      .select("*, survey_responses(count)")
      .order("created_at", { ascending: false });
    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const responseCount = (row.survey_responses as Array<{ count: number }>)?.[0]?.count ?? 0;
      return { ...rowToSurvey(row), responseCount };
    });
  } catch { return []; }
}

export async function getSurveyWithQuestions(id: string): Promise<Survey | null> {
  const user = await requireAdmin();
  if (!user) return null;
  const admin = createAdminClient();
  try {
    const [surveyRes, questionsRes, countRes] = await Promise.all([
      admin.from("surveys").select("*").eq("id", id).single(),
      admin.from("survey_questions").select("*").eq("survey_id", id).order("sort_order"),
      admin.from("survey_responses").select("*", { count: "exact", head: true }).eq("survey_id", id),
    ]);
    if (!surveyRes.data) return null;
    return {
      ...rowToSurvey(surveyRes.data as Record<string, unknown>),
      questions: (questionsRes.data ?? []).map(rowToQuestion),
      responseCount: countRes.count ?? 0,
    };
  } catch { return null; }
}

// ── Public read ────────────────────────────────────────────────────────────

export async function getActiveSurveys(): Promise<Survey[]> {
  const admin = createAdminClient();
  try {
    const now = new Date().toISOString();
    const { data } = await admin
      .from("surveys")
      .select("*")
      .eq("status", "active")
      .or(`start_at.is.null,start_at.lte.${now}`)
      .or(`end_at.is.null,end_at.gte.${now}`)
      .order("created_at", { ascending: false });
    return (data ?? []).map((r) => rowToSurvey(r as Record<string, unknown>));
  } catch { return []; }
}

export async function getSurveyPublic(id: string): Promise<Survey | null> {
  const admin = createAdminClient();
  try {
    const [surveyRes, questionsRes] = await Promise.all([
      admin.from("surveys").select("*").eq("id", id).single(),
      admin.from("survey_questions").select("*").eq("survey_id", id).order("sort_order"),
    ]);
    if (!surveyRes.data) return null;
    const s = surveyRes.data as Record<string, unknown>;
    if (s.status !== "active") return null;
    return {
      ...rowToSurvey(s),
      questions: (questionsRes.data ?? []).map(rowToQuestion),
    };
  } catch { return null; }
}

export async function hasUserResponded(surveyId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const admin = createAdminClient();
  try {
    const { data } = await admin
      .from("survey_responses")
      .select("id")
      .eq("survey_id", surveyId)
      .eq("user_id", user.id)
      .limit(1);
    return (data?.length ?? 0) > 0;
  } catch { return false; }
}

// ── Admin mutations ────────────────────────────────────────────────────────

export async function createSurvey(input: {
  title: string;
  description?: string;
  allowAnonymous?: boolean;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  try {
    const { data, error } = await admin
      .from("surveys")
      .insert({
        title: input.title.trim(),
        description: input.description?.trim() || null,
        allow_anonymous: input.allowAnonymous ?? false,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin");
    return { success: true, id: data.id };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function updateSurvey(
  id: string,
  input: {
    title?: string;
    description?: string | null;
    status?: SurveyStatus;
    startAt?: string | null;
    endAt?: string | null;
    allowAnonymous?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if ("description" in input) patch.description = input.description?.trim() || null;
  if (input.status !== undefined) patch.status = input.status;
  if ("startAt" in input) patch.start_at = input.startAt ?? null;
  if ("endAt" in input) patch.end_at = input.endAt ?? null;
  if (input.allowAnonymous !== undefined) patch.allow_anonymous = input.allowAnonymous;
  try {
    const { error } = await admin.from("surveys").update(patch).eq("id", id);
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin");
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function deleteSurvey(id: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  try {
    const { error } = await admin.from("surveys").delete().eq("id", id);
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin");
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function createSurveyQuestion(
  surveyId: string,
  input: { question: string; type: QuestionType; options?: string[]; required?: boolean; sortOrder?: number }
): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  try {
    const { data, error } = await admin
      .from("survey_questions")
      .insert({
        survey_id: surveyId,
        question: input.question.trim(),
        type: input.type,
        options: input.options && input.options.length > 0 ? input.options : null,
        required: input.required ?? true,
        sort_order: input.sortOrder ?? 0,
      })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, id: data.id };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function updateSurveyQuestion(
  id: string,
  input: { question?: string; type?: QuestionType; options?: string[] | null; required?: boolean; sortOrder?: number }
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (input.question !== undefined) patch.question = input.question.trim();
  if (input.type !== undefined) patch.type = input.type;
  if ("options" in input) patch.options = input.options && input.options.length > 0 ? input.options : null;
  if (input.required !== undefined) patch.required = input.required;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  try {
    const { error } = await admin.from("survey_questions").update(patch).eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function deleteSurveyQuestion(id: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  try {
    const { error } = await admin.from("survey_questions").delete().eq("id", id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function reorderSurveyQuestions(
  questionIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  try {
    await Promise.all(
      questionIds.map((id, idx) =>
        admin.from("survey_questions").update({ sort_order: idx }).eq("id", id)
      )
    );
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// ── User submission ────────────────────────────────────────────────────────

export async function submitSurveyResponse(
  surveyId: string,
  answers: SurveyAnswer[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  try {
    // Check survey is active
    const { data: survey } = await admin
      .from("surveys")
      .select("status, allow_anonymous, start_at, end_at")
      .eq("id", surveyId)
      .single();
    if (!survey) return { success: false, error: "Umfrage nicht gefunden." };
    if (survey.status !== "active") return { success: false, error: "Diese Umfrage ist nicht mehr aktiv." };

    // Check if user already responded
    if (user) {
      const { data: existing } = await admin
        .from("survey_responses")
        .select("id")
        .eq("survey_id", surveyId)
        .eq("user_id", user.id)
        .limit(1);
      if (existing && existing.length > 0) return { success: false, error: "Du hast bereits an dieser Umfrage teilgenommen." };
    } else if (!survey.allow_anonymous) {
      return { success: false, error: "Du musst eingeloggt sein um teilzunehmen." };
    }

    // Insert answers
    const answerRows = answers.map((a) => ({
      survey_id: surveyId,
      question_id: a.questionId,
      user_id: user?.id ?? null,
      answer_text: a.answerText ?? null,
      answer_options: a.answerOptions ?? null,
      answer_rating: a.answerRating ?? null,
    }));

    const { error: ansErr } = await admin.from("survey_answers").insert(answerRows);
    if (ansErr) return { success: false, error: ansErr.message };

    // Record response (for dedup)
    if (user) {
      await admin.from("survey_responses").insert({ survey_id: surveyId, user_id: user.id });
    }

    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// ── Results for admin ──────────────────────────────────────────────────────

export async function getSurveyResults(surveyId: string): Promise<SurveyResultsEntry[]> {
  const user = await requireAdmin();
  if (!user) return [];
  const admin = createAdminClient();
  try {
    const [questionsRes, answersRes] = await Promise.all([
      admin.from("survey_questions").select("*").eq("survey_id", surveyId).order("sort_order"),
      admin.from("survey_answers").select("*").eq("survey_id", surveyId),
    ]);
    const questions = (questionsRes.data ?? []).map(rowToQuestion);
    const answers = answersRes.data ?? [];

    return questions.map((q) => {
      const qAnswers = answers.filter((a: Record<string, unknown>) => a.question_id === q.id);
      const entry: SurveyResultsEntry = {
        questionId: q.id,
        question: q.question,
        type: q.type,
        options: q.options,
        totalAnswers: qAnswers.length,
      };

      if (q.type === "text") {
        entry.textAnswers = qAnswers
          .map((a: Record<string, unknown>) => a.answer_text as string)
          .filter(Boolean);
      } else if (q.type === "rating") {
        const ratings = qAnswers
          .map((a: Record<string, unknown>) => a.answer_rating as number)
          .filter((r) => r >= 1 && r <= 5);
        entry.ratingAverage = ratings.length
          ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
          : 0;
        entry.ratingCounts = [1, 2, 3, 4, 5].map((v) => ratings.filter((r) => r === v).length);
      } else {
        const optCount = q.options?.length ?? 0;
        const counts = Array.from({ length: optCount }, () => 0);
        for (const a of qAnswers) {
          const selected = (a as Record<string, unknown>).answer_options as number[] | null;
          if (!selected) continue;
          for (const idx of selected) {
            if (idx >= 0 && idx < optCount) counts[idx]++;
          }
        }
        entry.optionCounts = counts;
      }

      return entry;
    });
  } catch { return []; }
}
