"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import {
  Plus, Trash2, Save, Eye, EyeOff, Pin, PinOff, Loader2,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown, Pencil, Check,
  X, FileText, Rocket, Globe, AlertTriangle, Copy, Bell, BellOff,
} from "lucide-react";
import {
  getAllNotes,
  createPatchNote,
  updatePatchNote,
  publishPatchNote,
  unpublishPatchNote,
  deletePatchNote,
  togglePatchNotePopup,
} from "@/lib/actions/patchnotes";
import type { PatchNote, PatchNoteType, SectionType, PatchNoteSection } from "@/lib/patchnotes";
import { NOTE_TYPE_META, SECTION_TYPE_META } from "@/lib/patchnotes";
import { useSoundManager } from "@/lib/sound-manager";

const ALL_NOTE_TYPES: PatchNoteType[] = ["update", "hotfix", "event", "balance", "season", "maintenance"];
const ALL_SECTION_TYPES: SectionType[] = ["added", "changed", "fixed", "removed", "balance", "event", "note", "warning"];

function TypeBadge({ type }: { type: PatchNoteType }) {
  const m = NOTE_TYPE_META[type];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${m.color} ${m.bg} ${m.border}`}>
      {m.label}
    </span>
  );
}

function StatusBadge({ status }: { status: "draft" | "published" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
      status === "published"
        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
        : "border-zinc-600/40 bg-zinc-800/60 text-zinc-500"
    }`}>
      {status === "published" ? <Globe className="h-2.5 w-2.5" /> : <FileText className="h-2.5 w-2.5" />}
      {status === "published" ? "Veröffentlicht" : "Entwurf"}
    </span>
  );
}

// ---- Section builder ----
interface SectionEditorProps {
  sections: PatchNoteSection[];
  onChange: (sections: PatchNoteSection[]) => void;
}

function SectionEditor({ sections, onChange }: SectionEditorProps) {
  function addSection() {
    onChange([...sections, { type: "added", title: "", items: [""] }]);
  }

  function removeSection(idx: number) {
    onChange(sections.filter((_, i) => i !== idx));
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const arr = [...sections];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    onChange(arr);
  }

  function updateSection(idx: number, patch: Partial<PatchNoteSection>) {
    onChange(sections.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  function addItem(si: number) {
    const s = sections[si];
    updateSection(si, { items: [...s.items, ""] });
  }

  function removeItem(si: number, ii: number) {
    const s = sections[si];
    if (s.items.length <= 1) return;
    updateSection(si, { items: s.items.filter((_, i) => i !== ii) });
  }

  function updateItem(si: number, ii: number, val: string) {
    const s = sections[si];
    updateSection(si, { items: s.items.map((v, i) => i === ii ? val : v) });
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map((section, si) => {
        const sm = SECTION_TYPE_META[section.type];
        return (
          <div key={si} className={`rounded-xl border bg-black/30 p-3 ${sm?.color ? "border-white/10" : "border-white/10"}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {/* Section type selector */}
              <select
                value={section.type}
                onChange={(e) => updateSection(si, { type: e.target.value as SectionType })}
                className="rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-purple-400/60"
              >
                {ALL_SECTION_TYPES.map((t) => (
                  <option key={t} value={t}>{SECTION_TYPE_META[t]?.label ?? t}</option>
                ))}
              </select>
              {/* Section title */}
              <input
                type="text"
                placeholder="Abschnittstitel (optional)"
                value={section.title}
                onChange={(e) => updateSection(si, { title: e.target.value })}
                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-purple-400/60"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  title="Nach oben"
                  onClick={() => moveSection(si, -1)}
                  disabled={si === 0}
                  className="rounded p-1 text-zinc-600 hover:text-zinc-300 disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Nach unten"
                  onClick={() => moveSection(si, 1)}
                  disabled={si === sections.length - 1}
                  className="rounded p-1 text-zinc-600 hover:text-zinc-300 disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Abschnitt entfernen"
                  onClick={() => removeSection(si)}
                  className="rounded p-1 text-zinc-600 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Items */}
            <div className="flex flex-col gap-1.5 pl-2">
              {section.items.map((item, ii) => (
                <div key={ii} className="flex items-center gap-1.5">
                  <span className={`shrink-0 text-sm ${sm?.color ?? "text-zinc-500"}`}>·</span>
                  <input
                    type="text"
                    placeholder={`Eintrag ${ii + 1}…`}
                    value={item}
                    onChange={(e) => updateItem(si, ii, e.target.value)}
                    className="flex-1 rounded-lg border border-white/8 bg-black/30 px-2.5 py-1 text-xs text-zinc-200 outline-none focus:border-purple-400/40"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(si, ii)}
                    disabled={section.items.length <= 1}
                    className="shrink-0 rounded p-0.5 text-zinc-700 hover:text-red-400 disabled:opacity-20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => addItem(si)}
              className="mt-2 flex items-center gap-1 pl-4 text-[11px] text-zinc-600 hover:text-zinc-400"
            >
              <Plus className="h-3 w-3" />
              Eintrag hinzufügen
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addSection}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 py-2.5 text-xs text-zinc-500 transition-colors hover:border-white/30 hover:text-zinc-300"
      >
        <Plus className="h-3.5 w-3.5" />
        Abschnitt hinzufügen
      </button>
    </div>
  );
}

// ---- Note form (create/edit) ----
interface NoteFormValues {
  version: string;
  title: string;
  summary: string;
  noteType: PatchNoteType;
  content: PatchNoteSection[];
  isPinned: boolean;
}

const DEFAULT_FORM: NoteFormValues = {
  version: "",
  title: "",
  summary: "",
  noteType: "update",
  content: [],
  isPinned: false,
};

function noteToForm(n: PatchNote): NoteFormValues {
  return {
    version: n.version,
    title: n.title,
    summary: n.summary ?? "",
    noteType: n.noteType,
    content: n.content,
    isPinned: n.isPinned,
  };
}

// ---- Row in the list ----
interface NoteRowProps {
  note: PatchNote;
  onEdit: (n: PatchNote) => void;
  onDuplicate: (n: PatchNote) => void;
  onRefresh: () => void;
  isActivePopup?: boolean;
}

function NoteRow({ note, onEdit, onDuplicate, onRefresh, isActivePopup }: NoteRowProps) {
  const [pending, start] = useTransition();
  const sound = useSoundManager();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handlePublish() {
    start(async () => {
      if (note.status === "published") await unpublishPatchNote(note.id);
      else await publishPatchNote(note.id);
      onRefresh();
    });
  }

  async function handlePin() {
    start(async () => {
      await updatePatchNote(note.id, { isPinned: !note.isPinned });
      onRefresh();
    });
  }

  async function handleTogglePopup() {
    start(async () => {
      await togglePatchNotePopup(note.id, !note.showPopup);
      onRefresh();
    });
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    start(async () => {
      await deletePatchNote(note.id);
      onRefresh();
    });
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
      note.isPinned ? "border-purple-500/30 bg-purple-500/5" : "border-white/8 bg-white/[0.02] hover:border-white/12"
    }`}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={note.noteType} />
          <StatusBadge status={note.status} />
          <span className="font-mono text-xs text-zinc-500">{note.version}</span>
          {note.isPinned && <Pin className="h-3 w-3 text-purple-400" />}
          {note.showPopup && <span title="Popup aktiviert"><Bell className="h-3 w-3 text-amber-400" /></span>}
          {isActivePopup && (
            <span className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              LIVE
            </span>
          )}
        </div>
        <span className="truncate font-semibold text-zinc-200">{note.title}</span>
        {note.publishedAt && (
          <span className="text-[11px] text-zinc-600">
            {new Date(note.publishedAt).toLocaleDateString("de-DE")}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          title={note.isPinned ? "Lospinnen" : "Anpinnen"}
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); handlePin(); }}
          disabled={pending}
          className="rounded-lg border border-white/10 p-1.5 text-zinc-500 transition-colors hover:border-purple-400/50 hover:text-purple-300 disabled:opacity-40"
        >
          {note.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
        <button
          title={note.showPopup ? "Popup deaktivieren" : "Als Popup anzeigen (erscheint beim nächsten Seitenbesuch)"}
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); handleTogglePopup(); }}
          disabled={pending || note.status !== "published"}
          className={`rounded-lg border p-1.5 transition-colors disabled:opacity-40 ${
            note.showPopup
              ? "border-amber-400/40 bg-amber-500/10 text-amber-300 hover:border-amber-400/60"
              : "border-white/10 text-zinc-500 hover:border-amber-400/40 hover:text-amber-300"
          }`}
        >
          {note.showPopup ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
        </button>
        <button
          title="Duplizieren"
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); onDuplicate(note); }}
          className="rounded-lg border border-white/10 p-1.5 text-zinc-500 transition-colors hover:border-sky-400/50 hover:text-sky-300"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          title="Bearbeiten"
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); onEdit(note); }}
          className="rounded-lg border border-white/10 p-1.5 text-zinc-500 transition-colors hover:border-amber-400/50 hover:text-amber-300"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          title={note.status === "published" ? "Zurück zu Entwurf" : "Veröffentlichen"}
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); handlePublish(); }}
          disabled={pending}
          className={`rounded-lg border p-1.5 transition-colors disabled:opacity-40 ${
            note.status === "published"
              ? "border-amber-400/30 text-amber-400 hover:border-amber-400/60 hover:text-amber-300"
              : "border-emerald-400/30 text-emerald-400 hover:border-emerald-400/60 hover:text-emerald-300"
          }`}
        >
          {note.status === "published" ? <EyeOff className="h-3.5 w-3.5" /> : <Rocket className="h-3.5 w-3.5" />}
        </button>
        {confirmDelete ? (
          <>
            <button
              title="Ja, löschen"
              onClick={() => handleDelete()}
              disabled={pending}
              className="rounded-lg border border-red-500/50 bg-red-500/20 p-1.5 text-red-300 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              title="Abbrechen"
              onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-white/10 p-1.5 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            title="Löschen"
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); handleDelete(); }}
            disabled={pending}
            className="rounded-lg border border-white/10 p-1.5 text-zinc-600 transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---- Main Editor ----
export function PatchNotesEditor({ initialNotes }: { initialNotes: PatchNote[] }) {
  const [notes, setNotes] = useState<PatchNote[]>(initialNotes);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<NoteFormValues>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "draft" | "published">("all");
  const sound = useSoundManager();

  async function refreshNotes() {
    const fresh = await getAllNotes();
    setNotes(fresh);
  }

  function openNew() {
    setEditingId("new");
    setForm(DEFAULT_FORM);
    setShowForm(true);
  }

  function openEdit(note: PatchNote) {
    setEditingId(note.id);
    setForm(noteToForm(note));
    setShowForm(true);
  }

  function openDuplicate(note: PatchNote) {
    setEditingId("new");
    setForm({ ...noteToForm(note), title: note.title + " (Kopie)", isPinned: false });
    setShowForm(true);
  }

  function cancelForm() {
    setEditingId(null);
    setShowForm(false);
    setForm(DEFAULT_FORM);
  }

  async function handleSave(andPublish = false) {
    if (!form.version.trim() || !form.title.trim()) {
      setMessage({ text: "Version und Titel sind Pflichtfelder.", ok: false });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setSaving(true);
    sound.click();

    let id = editingId === "new" ? null : editingId;

    if (!id) {
      const res = await createPatchNote({
        version: form.version,
        title: form.title,
        summary: form.summary || undefined,
        noteType: form.noteType,
        content: form.content,
      });
      if (!res.success || !res.id) {
        setSaving(false);
        setMessage({ text: res.error ?? "Fehler beim Erstellen.", ok: false });
        setTimeout(() => setMessage(null), 3000);
        return;
      }
      id = res.id;
    } else {
      const res = await updatePatchNote(id, {
        version: form.version,
        title: form.title,
        summary: form.summary || null,
        noteType: form.noteType,
        content: form.content,
        isPinned: form.isPinned,
      });
      if (!res.success) {
        setSaving(false);
        setMessage({ text: res.error ?? "Fehler.", ok: false });
        setTimeout(() => setMessage(null), 3000);
        return;
      }
    }

    if (andPublish && id) {
      const res = await publishPatchNote(id);
      if (!res.success) {
        setSaving(false);
        setMessage({ text: res.error ?? "Fehler beim Veröffentlichen.", ok: false });
        setTimeout(() => setMessage(null), 3000);
        return;
      }
    }

    if (form.isPinned && id && editingId === "new") {
      await updatePatchNote(id, { isPinned: true });
    }

    setSaving(false);
    sound.win();
    setMessage({ text: andPublish ? "Veröffentlicht!" : "Gespeichert.", ok: true });
    setTimeout(() => setMessage(null), 3000);
    await refreshNotes();
    cancelForm();
  }

  const filteredNotes = notes.filter((n) =>
    filterStatus === "all" || n.status === filterStatus
  );
  const draftCount = notes.filter((n) => n.status === "draft").length;
  const publishedCount = notes.filter((n) => n.status === "published").length;

  // The active popup is the most recently published note with show_popup=true
  // (matches what getActivePopupNote() returns server-side)
  const activePopupId = useMemo(() => {
    const eligible = notes
      .filter(n => n.status === "published" && n.showPopup && n.publishedAt)
      .sort((a, b) => new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime());
    return eligible[0]?.id ?? null;
  }, [notes]);

  const activePopupNote = activePopupId ? notes.find(n => n.id === activePopupId) ?? null : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h3 className="text-base font-bold text-zinc-100">Patch Notes verwalten</h3>
          <p className="text-[11px] text-zinc-500">
            {publishedCount} veröffentlicht · {draftCount} Entwurf{draftCount !== 1 ? "e" : ""}
          </p>
        </div>
        <button
          onMouseEnter={sound.hover}
          onClick={() => { sound.click(); openNew(); }}
          className="ml-auto flex items-center gap-2 rounded-xl border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-sm font-semibold text-purple-200 transition-colors hover:bg-purple-500/25"
        >
          <Plus className="h-4 w-4" />
          Neue Patch Note
        </button>
      </div>

      {/* Active popup banner */}
      {activePopupNote ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-500/8 px-4 py-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-500/15">
            <Bell className="h-4 w-4 text-amber-300" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-amber-200">
              Aktiver Popup: {activePopupNote.version} — {activePopupNote.title}
            </p>
            <p className="text-[11px] text-amber-500/80">
              Erscheint bei jedem Seitenaufruf für Nutzer, die ihn noch nicht gelesen haben.
            </p>
          </div>
        </div>
      ) : null}

      {/* Message */}
      {message && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm font-medium ${
          message.ok
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {message.ok ? <Check className="mr-2 inline h-4 w-4" /> : <AlertTriangle className="mr-2 inline h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border border-purple-500/30 bg-[#0d0c1a] p-5">
          <div className="mb-4 flex items-center gap-2">
            {editingId === "new" ? (
              <Plus className="h-4 w-4 text-purple-400" />
            ) : (
              <Pencil className="h-4 w-4 text-amber-400" />
            )}
            <h4 className="text-sm font-bold text-zinc-100">
              {editingId === "new" ? "Neue Patch Note" : "Patch Note bearbeiten"}
            </h4>
            <button onClick={cancelForm} className="ml-auto text-zinc-600 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-400">Version *</span>
              <input
                type="text"
                placeholder="v1.2.0"
                value={form.version}
                onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-semibold text-zinc-400">Titel *</span>
              <input
                type="text"
                placeholder="Großes Update — Community Features"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
              />
            </label>
          </div>

          <label className="mt-3 flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-400">Kurzbeschreibung (optional)</span>
            <textarea
              rows={2}
              placeholder="Ein kurzer Überblick über dieses Update…"
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              className="resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-purple-400/60"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-400">Typ</span>
              <div className="flex flex-wrap gap-1.5">
                {(["update", "hotfix", "event", "balance", "season", "maintenance"] as PatchNoteType[]).map((t) => {
                  const m = NOTE_TYPE_META[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, noteType: t }))}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                        form.noteType === t
                          ? `${m.color} ${m.bg} ${m.border}`
                          : "border-white/10 text-zinc-600 hover:text-zinc-400"
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 self-end">
              <input
                type="checkbox"
                checked={form.isPinned}
                onChange={(e) => setForm((f) => ({ ...f, isPinned: e.target.checked }))}
                className="h-4 w-4 accent-purple-500"
              />
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <Pin className="h-3 w-3" /> Anpinnen
              </span>
            </label>
          </div>

          <div className="mt-4 border-t border-white/8 pt-4">
            <span className="mb-2 block text-xs font-semibold text-zinc-400">Inhalt (Abschnitte)</span>
            <SectionEditor
              sections={form.content}
              onChange={(c) => setForm((f) => ({ ...f, content: c }))}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              onMouseEnter={sound.hover}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Als Entwurf speichern
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              onMouseEnter={sound.hover}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Speichern & Veröffentlichen
            </button>
            <button
              onClick={cancelForm}
              className="ml-auto text-sm text-zinc-600 hover:text-zinc-400"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 border-b border-white/8 pb-3">
        {(["all", "published", "draft"] as const).map((f) => (
          <button
            key={f}
            onMouseEnter={sound.hover}
            onClick={() => { sound.click(); setFilterStatus(f); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              filterStatus === f
                ? "bg-white/10 text-zinc-200"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {f === "all" ? "Alle" : f === "published" ? "Veröffentlicht" : "Entwürfe"}
            <span className="ml-1.5 tabular-nums text-zinc-600">
              {f === "all" ? notes.length : f === "published" ? publishedCount : draftCount}
            </span>
          </button>
        ))}
      </div>

      {/* Note list */}
      {filteredNotes.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-600">
          {notes.length === 0 ? "Noch keine Patch Notes — erstelle die erste!" : "Keine Einträge in dieser Kategorie."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredNotes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              onEdit={openEdit}
              onDuplicate={openDuplicate}
              onRefresh={refreshNotes}
              isActivePopup={note.id === activePopupId}
            />
          ))}
        </div>
      )}

      <p className="text-center text-[10px] text-zinc-700">
        Öffentliche Ansicht: <a href="/patchnotes" target="_blank" className="underline hover:text-zinc-500">/patchnotes</a>
      </p>
    </div>
  );
}
