export type PatchNoteType = "update" | "hotfix" | "event" | "balance" | "season" | "maintenance";
export type PatchNoteStatus = "draft" | "published";
export type SectionType = "added" | "changed" | "fixed" | "removed" | "balance" | "event" | "note" | "warning";

export interface PatchNoteSection {
  type: SectionType;
  title: string;
  items: string[];
}

export interface PatchNote {
  id: string;
  version: string;
  title: string;
  summary: string | null;
  content: PatchNoteSection[];
  noteType: PatchNoteType;
  status: PatchNoteStatus;
  isPinned: boolean;
  showPopup: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const NOTE_TYPE_META: Record<PatchNoteType, { label: string; color: string; bg: string; border: string; glow: string }> = {
  update:      { label: "Update",      color: "text-purple-300", bg: "bg-purple-500/20",  border: "border-purple-400/40", glow: "shadow-[0_0_20px_rgba(168,85,247,0.3)]"  },
  hotfix:      { label: "Hotfix",      color: "text-red-300",    bg: "bg-red-500/20",     border: "border-red-400/40",    glow: "shadow-[0_0_20px_rgba(239,68,68,0.3)]"   },
  event:       { label: "Event",       color: "text-amber-300",  bg: "bg-amber-500/20",   border: "border-amber-400/40",  glow: "shadow-[0_0_20px_rgba(251,191,36,0.3)]"  },
  balance:     { label: "Balance",     color: "text-blue-300",   bg: "bg-blue-500/20",    border: "border-blue-400/40",   glow: "shadow-[0_0_20px_rgba(59,130,246,0.3)]"  },
  season:      { label: "Season",      color: "text-emerald-300",bg: "bg-emerald-500/20", border: "border-emerald-400/40",glow: "shadow-[0_0_20px_rgba(52,211,153,0.3)]"  },
  maintenance: { label: "Wartung",     color: "text-zinc-300",   bg: "bg-zinc-500/20",    border: "border-zinc-400/40",   glow: "shadow-[0_0_20px_rgba(161,161,170,0.2)]" },
};

export const SECTION_TYPE_META: Record<SectionType, { label: string; icon: string; color: string }> = {
  added:   { label: "Neu",          icon: "✦", color: "text-emerald-400" },
  changed: { label: "Geändert",     icon: "◈", color: "text-blue-400"    },
  fixed:   { label: "Behoben",      icon: "◉", color: "text-red-400"     },
  removed: { label: "Entfernt",     icon: "✕", color: "text-zinc-500"    },
  balance: { label: "Balance",      icon: "⚖", color: "text-amber-400"   },
  event:   { label: "Event",        icon: "★", color: "text-yellow-400"  },
  note:    { label: "Hinweis",      icon: "◆", color: "text-purple-400"  },
  warning: { label: "Achtung",      icon: "⚠", color: "text-orange-400"  },
};
