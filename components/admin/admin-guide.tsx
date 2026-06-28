"use client";

import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import type { AdminGuideContent } from "@/lib/admin-guides";

/**
 * Reusable collapsible "So funktioniert …" guide panel (mirrors the Battle-Pass
 * guide style) rendered above any admin tab. All content lives centrally in
 * lib/admin-guides.ts, so a guide is added/edited there — the tab components are
 * never touched.
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
        <div className="space-y-4 border-t border-white/[0.06] px-4 py-4">
          {content.blocks.map((block, i) => (
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
          {content.tip && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200/90">
              💡 {content.tip}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
