"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import type { AdminGuideContent } from "@/lib/admin-guides";

/**
 * Reusable, richly-structured "So funktioniert …" guide panel (mirrors the
 * bespoke Cases guide: hierarchy flow → numbered steps → how-it-works box →
 * sections → glossary). All content lives centrally in lib/admin-guides.ts, so a
 * guide is added/edited there and the tab components are never touched.
 */
export function AdminGuide({ content, defaultOpen = false }: { content: AdminGuideContent; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-purple-500/25 bg-gradient-to-br from-purple-500/[0.07] via-purple-500/[0.02] to-transparent">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300">
          <BookOpen className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-zinc-100">{content.title}</p>
          <p className="truncate text-xs text-zinc-500">{content.subtitle}</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-5 border-t border-white/[0.06] px-4 py-4">

          {/* Hierarchy flow */}
          {content.hierarchy && content.hierarchy.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-purple-300/80">Hierarchie auf einen Blick</p>
              <div className="flex flex-wrap items-stretch gap-2">
                {content.hierarchy.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                      <p className="text-xs font-bold text-zinc-100">{h.label}</p>
                      <p className="max-w-[180px] text-[10px] leading-snug text-zinc-500">{h.text}</p>
                    </div>
                    {i < content.hierarchy!.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Numbered steps */}
          {content.steps && content.steps.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-purple-300/80">Schritt für Schritt</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {content.steps.map((s, i) => (
                  <div key={i} className="flex gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-purple-500/20 text-xs font-black text-purple-200">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-zinc-100">{s.title}</p>
                      <p className="text-[11px] leading-relaxed text-zinc-400">{s.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How it works (highlighted) */}
          {content.howItWorks && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-300/90">{content.howItWorks.heading}</p>
              <ul className="space-y-1">
                {content.howItWorks.lines.map((line, j) => (
                  <li key={j} className="flex gap-2 text-xs leading-relaxed text-zinc-300">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400/70" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* General sections */}
          {content.blocks?.map((block, i) => (
            <div key={i}>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-purple-300/80">{block.heading}</p>
              <ul className="space-y-1">
                {block.lines.map((line, j) => (
                  <li key={j} className="flex gap-2 text-xs leading-relaxed text-zinc-400">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-purple-400/60" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Glossary */}
          {content.glossary && content.glossary.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-purple-300/80">Begriffe in einem Satz</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {content.glossary.map((g, i) => (
                  <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <p className="text-xs font-bold text-zinc-100">{g.term}</p>
                    <p className="text-[10px] leading-snug text-zinc-500">{g.def}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {content.tip && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-200/90">
              💡 {content.tip}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
