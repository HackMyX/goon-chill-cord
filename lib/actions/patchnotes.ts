"use server";

import { revalidatePath, unstable_noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import type { PatchNote, PatchNoteType, PatchNoteStatus, PatchNoteSection } from "@/lib/patchnotes";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
  return isAdmin(profile) ? user : null;
}

function rowToNote(r: Record<string, unknown>): PatchNote {
  return {
    id: r.id as string,
    version: r.version as string,
    title: r.title as string,
    summary: r.summary as string | null,
    content: (r.content as PatchNoteSection[]) ?? [],
    bodyHtml: (r.body_html as string | null) ?? null,
    noteType: (r.note_type as PatchNoteType) ?? "update",
    status: (r.status as PatchNoteStatus) ?? "draft",
    isPinned: (r.is_pinned as boolean) ?? false,
    showPopup: (r.show_popup as boolean) ?? false,
    publishedAt: r.published_at as string | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** Returns the latest published note with show_popup=true, or null.
 *  Returns null if the current user has already permanently dismissed it. */
export async function getActivePopupNote(): Promise<PatchNote | null> {
  unstable_noStore(); // never serve stale popup data from cache
  const admin = createAdminClient();
  // show_popup column may not exist yet — graceful fallback to null
  try {
    const { data } = await admin
      .from("patch_notes")
      .select("*")
      .eq("status", "published")
      .eq("show_popup", true)
      .order("published_at", { ascending: false })
      .limit(1)
      .single();
    if (!data) return null;
    const note = rowToNote(data as Record<string, unknown>);

    // Check if this user has already permanently dismissed this exact note
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("dismissed_patchnote_id")
        .eq("id", user.id)
        .single();
      if ((profile as unknown as { dismissed_patchnote_id?: string | null })?.dismissed_patchnote_id === note.id) {
        return null;
      }
    }

    return note;
  } catch { return null; }
}

/** Permanently dismisses the active patchnote popup for the current user. */
export async function dismissPatchnote(noteId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profiles")
    .update({ dismissed_patchnote_id: noteId })
    .eq("id", user.id);
}

/** Public — returns only published notes, newest first, pinned first. */
export async function getPublishedNotes(): Promise<PatchNote[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("patch_notes")
    .select("*")
    .eq("status", "published")
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(100);
  return (data ?? []).map(rowToNote);
}

/** Admin — returns all notes (draft + published). */
export async function getAllNotes(): Promise<PatchNote[]> {
  const user = await requireAdmin();
  if (!user) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("patch_notes")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToNote);
}

export async function createPatchNote(input: {
  version: string;
  title: string;
  summary?: string;
  noteType: PatchNoteType;
  content?: PatchNoteSection[];
  bodyHtml?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("patch_notes")
    .insert({
      version: input.version.trim(),
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      note_type: input.noteType,
      content: input.content ?? [],
      body_html: input.bodyHtml?.trim() || null,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  revalidatePath("/patchnotes");
  return { success: true, id: data.id };
}

export async function updatePatchNote(
  id: string,
  input: {
    version?: string;
    title?: string;
    summary?: string | null;
    noteType?: PatchNoteType;
    content?: PatchNoteSection[];
    bodyHtml?: string | null;
    isPinned?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.version !== undefined) patch.version = input.version.trim();
  if (input.title !== undefined) patch.title = input.title.trim();
  if ("summary" in input) patch.summary = input.summary?.trim() || null;
  if (input.noteType !== undefined) patch.note_type = input.noteType;
  if (input.content !== undefined) patch.content = input.content;
  if ("bodyHtml" in input) patch.body_html = input.bodyHtml?.trim() || null;
  if (input.isPinned !== undefined) patch.is_pinned = input.isPinned;

  const { error } = await admin.from("patch_notes").update(patch).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/patchnotes");
  return { success: true };
}

export async function publishPatchNote(
  id: string,
  publishedAt?: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const now = publishedAt ?? new Date().toISOString();
  const { error } = await admin.from("patch_notes").update({
    status: "published",
    published_at: now,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/patchnotes");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function unpublishPatchNote(id: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const { error } = await admin.from("patch_notes").update({
    status: "draft",
    published_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/patchnotes");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function deletePatchNote(id: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const { error } = await admin.from("patch_notes").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/patchnotes");
  return { success: true };
}

export async function togglePatchNotePopup(
  id: string,
  show: boolean
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  const admin = createAdminClient();
  const { error } = await admin.from("patch_notes").update({
    show_popup: show,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/patchnotes");
  revalidatePath("/", "layout");
  return { success: true };
}

/** Latest published note — used for "New" badge in TopBar. */
export async function getLatestPublishedAt(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("patch_notes")
    .select("published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .single();
  return data?.published_at ?? null;
}
