"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, BookOpen } from "lucide-react";
import Link from "next/link";
import type { PatchNote, PatchNoteType } from "@/lib/patchnotes";
import { NOTE_TYPE_META, SECTION_TYPE_META } from "@/lib/patchnotes";

const LS_KEY_PREFIX = "dismissed_popup_";

interface PatchnotePopupProps {
  note: PatchNote;
}

function TypeBadge({ type }: { type: PatchNoteType }) {
  const m = NOTE_TYPE_META[type];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${m.color} ${m.bg} ${m.border}`}>
      {m.label}
    </span>
  );
}

export function PatchnotePopup({ note }: PatchnotePopupProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if permanently dismissed
    const dismissed = localStorage.getItem(`${LS_KEY_PREFIX}${note.id}`);
    if (!dismissed) setVisible(true);
  }, [note.id]);

  function dismiss() { setVisible(false); }

  function dismissPermanently() {
    localStorage.setItem(`${LS_KEY_PREFIX}${note.id}`, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const meta = NOTE_TYPE_META[note.noteType];
  const hasContent = note.content.length > 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={dismiss}
      />

      {/* Panel */}
      <div className={`relative w-full max-w-lg overflow-hidden rounded-2xl border shadow-[0_25px_80px_rgba(0,0,0,0.8)] ${meta.border} ${meta.bg}`}>
        {/* Top glow strip */}
        <div className={`absolute inset-x-0 top-0 h-px opacity-60 ${meta.color}`}
          style={{ background: `linear-gradient(90deg, transparent, currentColor 30%, currentColor 70%, transparent)` }} />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className={`h-4 w-4 ${meta.color}`} />
            <TypeBadge type={note.noteType} />
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
              {note.version}
            </span>
          </div>
          <button
            onClick={dismiss}
            title="Schließen (wird wieder angezeigt)"
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title */}
        <div className="px-6 pb-2">
          <h2 className="text-xl font-extrabold tracking-tight text-zinc-50">{note.title}</h2>
          {note.summary && <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{note.summary}</p>}
        </div>

        {/* Content preview (first 2 sections) */}
        {hasContent && (
          <div className="max-h-56 overflow-y-auto px-6 pb-4">
            <div className="flex flex-col gap-4 pt-2">
              {note.content.slice(0, 2).map((section, si) => {
                const sm = SECTION_TYPE_META[section.type];
                return (
                  <div key={si}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className={`text-sm ${sm?.color ?? "text-zinc-400"}`}>
                        {section.type === "added" ? "✦" : section.type === "fixed" ? "◉" : section.type === "changed" ? "◈" : section.type === "removed" ? "✕" : "◆"}
                      </span>
                      <span className={`text-xs font-bold uppercase tracking-wider ${sm?.color ?? "text-zinc-400"}`}>
                        {section.title || sm?.label}
                      </span>
                    </div>
                    <ul className="space-y-1 pl-5">
                      {section.items.slice(0, 4).map((item, ii) => (
                        <li key={ii} className="relative text-sm text-zinc-300">
                          <span className={`absolute -left-3.5 select-none ${sm?.color ?? "text-zinc-500"}`}>·</span>
                          {item}
                        </li>
                      ))}
                      {section.items.length > 4 && (
                        <li className="text-xs text-zinc-500">+{section.items.length - 4} weitere…</li>
                      )}
                    </ul>
                  </div>
                );
              })}
              {note.content.length > 2 && (
                <p className="text-xs text-zinc-600">+{note.content.length - 2} weitere Abschnitte auf der Patch-Notes-Seite</p>
              )}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-6 py-4">
          <Link
            href="/patchnotes"
            onClick={dismissPermanently}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 transition-all hover:bg-white/10 hover:text-white"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Alle Patch Notes ansehen
          </Link>
          <button
            onClick={dismissPermanently}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white transition-all ${meta.bg} border ${meta.border} hover:opacity-90`}
          >
            <span className={meta.color}>✓</span>
            Gelesen — nicht mehr anzeigen
          </button>
        </div>
      </div>
    </div>
  );
}
