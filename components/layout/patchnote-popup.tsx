"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, BookOpen, Rocket, Zap, Star, BarChart2, Leaf, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { PatchNote, PatchNoteType } from "@/lib/patchnotes";
import { NOTE_TYPE_META, SECTION_TYPE_META } from "@/lib/patchnotes";

const LS_KEY_PREFIX = "patchnote_dismissed_";

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

  // X = temporär schließen (kommt beim nächsten Seitenbesuch wieder)
  function dismiss() {
    setVisible(false);
  }

  // "Gelesen" = dauerhaft nicht mehr anzeigen
  function dismissPermanently() {
    localStorage.setItem(`${LS_KEY_PREFIX}${note.id}`, "1");
    setVisible(false);
  }

  const meta = NOTE_TYPE_META[note.noteType];
  const TypeIcon = TYPE_ICONS[note.noteType] ?? Rocket;

  // Prefer rich bodyHtml, fallback to old sections
  const hasRichContent = !!note.bodyHtml;
  const hasLegacySections = !hasRichContent && note.content.length > 0;
  const hasContent = hasRichContent || hasLegacySections;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="popup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={dismiss}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.86, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className={`relative w-full max-w-xl overflow-hidden rounded-2xl border shadow-[0_40px_130px_rgba(0,0,0,0.97)] ${meta.border} ${meta.glow}`}
            style={{ background: "linear-gradient(155deg, #0f0e1e 0%, #09080f 100%)" }}
          >
            {/* Animated top color strip */}
            <div
              className={`absolute inset-x-0 top-0 h-[3px]`}
              style={{
                background: `linear-gradient(90deg, transparent 0%, currentColor 20%, currentColor 80%, transparent 100%)`,
                filter: "brightness(3.5)",
                opacity: 0.9,
              }}
            />

            {/* Ambient glow blobs */}
            <div
              className={`pointer-events-none absolute -top-20 -left-20 h-64 w-64 rounded-full blur-3xl ${meta.bg}`}
              style={{ opacity: 0.45 }}
            />
            <div
              className={`pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full blur-3xl ${meta.bg}`}
              style={{ opacity: 0.2 }}
            />

            {/* Header */}
            <div className="relative flex items-start justify-between gap-3 px-6 pt-6 pb-4">
              <div className="flex items-center gap-3.5">
                {/* Type icon */}
                <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${meta.border} ${meta.bg} ${meta.glow}`}>
                  <TypeIcon className={`h-5.5 w-5.5 ${meta.color}`} />
                  {/* Live pulse dot */}
                  <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${meta.color} ${meta.bg} ${meta.border}`}>
                      <Sparkles className="h-2.5 w-2.5" />
                      {meta.label}
                    </span>
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                      {note.version}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-emerald-400/80">
                    Neu verfügbar
                  </p>
                </div>
              </div>

              <button
                onClick={dismiss}
                title="Schließen — wird beim nächsten Seitenbesuch wieder angezeigt"
                className="shrink-0 rounded-xl p-2 text-zinc-600 transition-colors hover:bg-white/8 hover:text-zinc-300"
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

            {/* Content */}
            {hasContent && (
              <div className="relative px-6 pb-4">
                <div
                  className={`max-h-64 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/30 px-5 py-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent`}
                >
                  {hasRichContent ? (
                    <div
                      className="patchnote-richtext text-sm"
                      dangerouslySetInnerHTML={{ __html: note.bodyHtml! }}
                    />
                  ) : (
                    /* Legacy sections fallback */
                    <div className="flex flex-col gap-3">
                      {note.content.slice(0, 3).map((section, si) => {
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
                              {section.items.slice(0, 5).map((item, ii) => (
                                <li key={ii} className="relative text-sm text-zinc-300">
                                  <span className={`absolute -left-3.5 select-none ${sm?.color ?? "text-zinc-500"}`}>·</span>
                                  {item}
                                </li>
                              ))}
                              {section.items.length > 5 && (
                                <li className="text-xs text-zinc-600">+{section.items.length - 5} weitere…</li>
                              )}
                            </ul>
                          </div>
                        );
                      })}
                      {note.content.length > 3 && (
                        <p className="text-xs text-zinc-600">
                          +{note.content.length - 3} weitere Abschnitte auf der Patch Notes Seite
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className={`flex flex-wrap items-center gap-2 border-t px-6 py-4 ${meta.border.replace("border-", "border-t-")}`}
              style={{ borderTopColor: "rgba(255,255,255,0.08)" }}
            >
              <Link
                href="/patchnotes"
                onClick={dismissPermanently}
                className="flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Alle Patch Notes
              </Link>
              <button
                onClick={dismissPermanently}
                className={`flex items-center gap-1.5 rounded-xl border px-5 py-2 text-xs font-bold transition-all hover:brightness-110 active:scale-95 ${meta.bg} ${meta.border} ${meta.color} ${meta.glow}`}
              >
                <span className="text-base leading-none">✓</span>
                Gelesen — nicht mehr anzeigen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
