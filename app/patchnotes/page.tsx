import { createClient } from "@/lib/supabase/server";
import { isAdmin, isModerator } from "@/lib/admin";
import { getPublishedNotes } from "@/lib/actions/patchnotes";
import { PatchNotesShell } from "@/components/patchnotes/patchnotes-shell";

export const dynamic = "force-dynamic";

export default async function PatchNotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const notes = await getPublishedNotes();

  let credits = 0;
  let streakDays = 0;
  let adminFlag = false;
  let modFlag = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits, streak_days, role")
      .eq("id", user.id)
      .single();
    credits = profile?.credits ?? 0;
    streakDays = profile?.streak_days ?? 0;
    adminFlag = isAdmin(profile);
    modFlag = isModerator(profile);
  }

  return (
    <PatchNotesShell
      notes={notes}
      credits={credits}
      streakDays={streakDays}
      isAdmin={adminFlag}
      isModerator={modFlag}
    />
  );
}
