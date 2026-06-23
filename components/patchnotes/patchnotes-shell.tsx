"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Pin,
  Search,
  ChevronDown,
  Tag,
  Calendar,
  Sparkles,
  Zap,
  ArrowLeft,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { useSoundManager } from "@/lib/sound-manager";
import type { PatchNote, PatchNoteType, SectionType } from "@/lib/patchnotes";
import { NOTE_TYPE_META, SECTION_TYPE_META } from "@/lib/patchnotes";

const ALL_TYPES: PatchNoteType[] = ["update", "hotfix", "event", "balance", "season", "maintenance"];

const SECTION_ICONS: Record<SectionType, string> = {
  added:   "✦",
  changed: "◈",
  fixed:   "◉",
  removed: "✕",
  balance: "⚖",
  event:   "★",
  note:    "◆",
  warning: "⚠",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

function TypeBadge({ type }: { type: PatchNoteType }) {
  const meta = NOTE_TYPE_META[type];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${meta.color} ${meta.bg} ${meta.border}`}>
      {meta.label}
    </span>
  );
}

function NoteCard({ note, expanded, onToggle }: { note: PatchNote; expanded: boolean; onToggle: () => void }) {
  const meta = NOTE_TYPE_META[note.noteType];
  const sound = useSoundManager();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [expanded]);

  return (
    <div
      ref={cardRef}
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
        note.isPinned
          ? `${meta.border} ${meta.bg} ${meta.glow}`
          : "border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]"
      }`}
    >
      {/* Pinned glow strip */}
      {note.isPinned && (
        <div className={`absolute inset-x-0 top-0 h-px ${meta.color} opacity-60`} style={{ background: `linear-gradient(90deg, transparent, currentColor 30%, currentColor 70%, transparent)` }} />
      )}

      <button
        className="w-full px-6 py-5 text-left"
        onClick={() => { sound.click(); onToggle(); }}
        onMouseEnter={sound.hover}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {note.isPinned && (
              <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>
                <Pin className="h-3 w-3" />
                Gepinnt
              </span>
            )}
            <TypeBadge type={note.noteType} />
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
              {note.version}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <Calendar className="h-3 w-3" />
            {note.publishedAt ? formatDate(note.publishedAt) : "—"}
          </div>
        </div>

        <h2 className="mt-3 text-lg font-extrabold tracking-tight text-zinc-50 transition-colors group-hover:text-white">
          {note.title}
        </h2>

        {note.summary && (
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{note.summary}</p>
        )}

        {note.content.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex gap-1">
              {note.content.slice(0, 5).map((s, i) => (
                <span key={i} className={`text-xs ${SECTION_TYPE_META[s.type]?.color ?? "text-zinc-400"}`}>
                  {SECTION_ICONS[s.type]}
                </span>
              ))}
              {note.content.length > 5 && (
                <span className="text-xs text-zinc-600">+{note.content.length - 5}</span>
              )}
            </div>
            <span className="text-[11px] text-zinc-600">
              {note.content.reduce((a, s) => a + s.items.length, 0)} Einträge
            </span>
            <ChevronDown
              className={`ml-auto h-4 w-4 text-zinc-500 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        )}
      </button>

      {/* Expanded content */}
      {expanded && note.content.length > 0 && (
        <div className="border-t border-white/8 px-6 pb-6 pt-5">
          <div className="flex flex-col gap-5">
            {note.content.map((section, si) => {
              const sm = SECTION_TYPE_META[section.type];
              return (
                <div key={si}>
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className={`text-base ${sm?.color ?? "text-zinc-400"}`}>{SECTION_ICONS[section.type]}</span>
                    <span className={`text-sm font-bold uppercase tracking-wider ${sm?.color ?? "text-zinc-400"}`}>
                      {section.title || sm?.label}
                    </span>
                    <div className={`h-px flex-1 opacity-20 ${sm?.color ?? "bg-zinc-600"}`} style={{ background: "currentColor" }} />
                  </div>
                  <ul className="space-y-1.5 pl-5">
                    {section.items.map((item, ii) => (
                      <li key={ii} className="relative text-sm text-zinc-300">
                        <span className={`absolute -left-4 select-none ${sm?.color ?? "text-zinc-500"}`}>·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface PatchNotesShellProps {
  notes: PatchNote[];
  credits: number;
  streakDays: number;
  isAdmin: boolean;
  isModerator: boolean;
}

export function PatchNotesShell({ notes, credits, streakDays, isAdmin, isModerator }: PatchNotesShellProps) {
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<PatchNoteType | "all">("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const pinned = notes.find((n) => n.isPinned);
    return pinned ? new Set([pinned.id]) : new Set();
  });
  const sound = useSoundManager();

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = notes.filter((n) => {
    const matchType = activeType === "all" || n.noteType === activeType;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      n.title.toLowerCase().includes(q) ||
      n.version.toLowerCase().includes(q) ||
      n.summary?.toLowerCase().includes(q) ||
      n.content.some((s) => s.items.some((i) => i.toLowerCase().includes(q)));
    return matchType && matchSearch;
  });

  const pinned = filtered.filter((n) => n.isPinned);
  const rest = filtered.filter((n) => !n.isPinned);

  const usedTypes = Array.from(new Set(notes.map((n) => n.noteType)));

  return (
    <div className="flex min-h-screen flex-col bg-[#030305]">
      <TopBar credits={credits} streakDays={streakDays} isAdmin={isAdmin} isModerator={isModerator} />

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-white/5">
        {/* Animated background orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-purple-600/10 blur-[120px]" />
          <div className="absolute -right-32 top-0 h-80 w-80 rounded-full bg-indigo-600/10 blur-[100px]" />
          <div className="absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-500/8 blur-[80px]" />
        </div>
        <div className="relative mx-auto max-w-5xl px-4 py-16 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-purple-300">
            <Sparkles className="h-3.5 w-3.5" />
            Patch Notes & Updates
          </div>
          <h1 className="glow-text text-4xl font-extrabold tracking-tight text-zinc-50 sm:text-5xl">
            Was ist neu?
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm text-zinc-400">
            Alle Updates, Hotfixes, Events und Balanceänderungen — immer auf dem neuesten Stand.
          </p>

          {isAdmin && (
            <div className="mt-6">
              <Link
                href="/admin"
                onMouseEnter={sound.hover}
                onClick={sound.click}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-400/20"
              >
                <ShieldAlert className="h-4 w-4" />
                Patch Notes im Admin-Panel bearbeiten
                <ExternalLink className="h-3 w-3 opacity-70" />
              </Link>
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        {/* Back */}
        <Link
          href="/"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Startseite
        </Link>

        {/* Filters */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60 focus:ring-1 focus:ring-purple-400/20"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onMouseEnter={sound.hover}
              onClick={() => { sound.click(); setActiveType("all"); }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                activeType === "all"
                  ? "border-zinc-400 bg-zinc-400/15 text-zinc-200"
                  : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-400"
              }`}
            >
              <Tag className="h-3 w-3" />
              Alle
            </button>
            {usedTypes.map((type) => {
              const meta = NOTE_TYPE_META[type];
              return (
                <button
                  key={type}
                  onMouseEnter={sound.hover}
                  onClick={() => { sound.click(); setActiveType(type); }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                    activeType === type
                      ? `${meta.color} ${meta.bg} ${meta.border}`
                      : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-400"
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {notes.length === 0 ? (
          <div className="py-24 text-center">
            <div className="mb-4 text-5xl">📋</div>
            <h3 className="text-xl font-bold text-zinc-400">Noch keine Patch Notes</h3>
            <p className="mt-2 text-sm text-zinc-600">Die ersten Updates erscheinen hier, sobald sie veröffentlicht werden.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <div className="mb-4 text-4xl opacity-40">
              <Search className="mx-auto h-12 w-12" />
            </div>
            <h3 className="text-lg font-bold text-zinc-500">Keine Ergebnisse</h3>
            <p className="mt-1 text-sm text-zinc-600">Versuch einen anderen Suchbegriff oder Filter.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Pinned first */}
            {pinned.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <Pin className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-600">Angepinnt</span>
                </div>
                {pinned.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    expanded={expandedIds.has(note.id)}
                    onToggle={() => toggleExpand(note.id)}
                  />
                ))}
                {rest.length > 0 && (
                  <div className="flex items-center gap-2 pt-2">
                    <Zap className="h-3.5 w-3.5 text-zinc-500" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-600">Alle Updates</span>
                  </div>
                )}
              </>
            )}
            {rest.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                expanded={expandedIds.has(note.id)}
                onToggle={() => toggleExpand(note.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
