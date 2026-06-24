import { createClient } from "@/lib/supabase/server";
import { isAdmin, isModerator } from "@/lib/admin";
import { getActiveSurveys, hasUserResponded } from "@/lib/actions/surveys";
import { SurveysShell } from "@/components/surveys/surveys-shell";

export const dynamic = "force-dynamic";

export default async function SurveysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [surveys, profileRes] = await Promise.all([
    getActiveSurveys(),
    user
      ? supabase.from("profiles").select("credits, streak_days, role").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const profile = profileRes.data;
  const credits = profile?.credits ?? 0;
  const streakDays = profile?.streak_days ?? 0;

  // Check which surveys the user already responded to
  const respondedIds: string[] = [];
  if (user && surveys.length > 0) {
    await Promise.all(
      surveys.map(async (s) => {
        const responded = await hasUserResponded(s.id);
        if (responded) respondedIds.push(s.id);
      })
    );
  }

  // We also need to load questions for each survey
  const { getSurveyPublic } = await import("@/lib/actions/surveys");
  const surveysWithQuestions = await Promise.all(
    surveys.map((s) => getSurveyPublic(s.id))
  );
  const fullSurveys = surveysWithQuestions.filter(Boolean) as NonNullable<
    Awaited<ReturnType<typeof getSurveyPublic>>
  >[];

  return (
    <SurveysShell
      surveys={fullSurveys}
      respondedIds={respondedIds}
      credits={credits}
      streakDays={streakDays}
      isAdmin={isAdmin(profile)}
      isModerator={isModerator(profile)}
      userId={user?.id ?? null}
    />
  );
}
