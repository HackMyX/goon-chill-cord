"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, BookOpen, Rocket, Zap, Star, BarChart2, Leaf, Settings } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { PatchNote, PatchNoteType } from "@/lib/patchnotes";
import { NOTE_TYPE_META, SECTION_TYPE_META } from "@/lib/patchnotes";

const LS_KEY_PREFIX = "dismissed_popup_";

const TYPE_ICONS: Record<PatchNoteType, LucideIcon> = {
  update: Rocket,
  hotfix: Zap,
  event: Star,
  balance: BarChart2,
  season: Leaf,
  maintenance: Settings,
};

export function PatchnotePopup({ note }: { note: PatchNote }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(`${LS_KEY_PREFIX}${note.id}`);
    if (!dismissed) setVisible(true);
  }, [note.id]);

  function dismiss() { setVisible(false); }

  function dismissPermanently() {
    localStorage.setItem(`${LS_KEY_PREFIX}${note.id}`, "1");
    setVisible(false);
  }

  const meta = NOTE_TYPE_META[note.noteType];
  const TypeIcon = TYPE_ICONS[note.noteType] ?? Rocket;
  const hasContent = note.content.length > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="popup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={dismiss}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 36 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className={`relative w-full max-w-lg overflow-hidden rounded-2xl border shadow-[0_40px_120px_rgba(0,0,0,0.95)] ${meta.border} ${meta.glow}`}
            style={{ background: "linear-gradient(160deg, #0f0e1e 0%, #09080f 100%)" }}
          >
            {/* Top color strip */}
            <div className={`absolute inset-x-0 top-0 h-[2px] ${meta.bg}`} style={{ filter: "brightness(4)", opacity: 0.85 }} />

            {/* Ambient glow blob */}
            <div
              className={`pointer-events-none absolute -top-16 -left-16 h-56 w-56 rounded-full blur-3xl ${meta.bg}`}
              style={{ opacity: 0.5 }}
            />

            {/* Header */}
            <div className="relative flex items-start justify-between gap-3 px-6 pt-6 pb-4">
              <div className="flex items-center gap-3">
                {/* Type icon */}
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${meta.border} ${meta.bg} ${meta.glow}`}>
                  <TypeIcon className={`h-5 w-5 ${meta.color}`} />
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${meta.color} ${meta.bg} ${meta.border}`}>
                      {meta.label}
                    </span>
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                      {note.version}
                    </span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-600">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    Neu verfügbar
                  </p>
                </div>
              </div>

              <button
                onClick={dismiss}
                title="Schließen — wird beim nächsten Besuch wieder angezeigt"
                className="rounded-xl p-2 text-zinc-600 transition-colors hover:bg-white/8 hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Title + summary */}
            <div className="relative px-6 pb-4">
              <h2 className="text-xl font-extrabold tracking-tight text-zinc-50">{note.title}</h2>
              {note.summary && (
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{note.summary}</p>
              )}
            </div>

            {/* Content preview */}
            {hasContent && (
              <div className="max-h-52 overflow-y-auto px-6 pb-4">
                <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-white/[0.025] p-4">
                  {note.content.slice(0, 2).map((section, si) => {
                    const sm = SECTION_TYPE_META[section.type];
                    return (
                      <div key={si}>
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className={`text-sm leading-none ${sm?.color ?? "text-zinc-400"}`}>{sm?.icon}</span>
                          <span className={`text-[11px] font-bold uppercase tracking-wider ${sm?.color ?? "text-zinc-400"}`}>
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
                            <li className="text-xs text-zinc-600">+{section.items.length - 4} weitere…</li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                  {note.content.length > 2 && (
                    <p className="text-xs text-zinc-600">
                      +{note.content.length - 2} weitere Abschnitte auf der Patch Notes Seite
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/8 px-6 py-4">
              <Link
                href="/patchnotes"
                onClick={dismissPermanently}
                className="flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Alle Patch Notes lesen
              </Link>
              <button
                onClick={dismissPermanently}
                className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-bold transition-opacity hover:opacity-90 ${meta.bg} ${meta.border} ${meta.color}`}
              >
                <span>✓</span>
                Gelesen — nicht mehr anzeigen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
