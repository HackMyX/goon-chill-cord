"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";

interface CollapsibleAdminRowProps {
  /** Always-visible — icon/name/id, the enabled/disabled toggle, the Save
   * button and its status feedback all belong here, never in `children`,
   * so flipping a toggle and saving never *requires* expanding the row
   * first. Any interactive element in here (a button, another clickable)
   * must call `e.stopPropagation()` in its own onClick — otherwise the
   * click also bubbles up to this row's own expand/collapse toggle. */
  header: React.ReactNode;
  /** Hidden until expanded. When omitted (or falsy — e.g. the result of
   * `{condition && <content/>}` when condition is false), the expand
   * button is not rendered at all so rows with no extra settings look
   * exactly the same as each other without a dead click-target. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * One uniform shape for every "list of editable things" admin screen.
 * Every row starts collapsed on each page load (plain useState, not
 * persisted). The expand button is suppressed entirely when no children
 * are passed so rows without extra settings never show a dead arrow.
 */
export function CollapsibleAdminRow({ header, children, className }: CollapsibleAdminRowProps) {
  const [expanded, setExpanded] = useState(false);
  const sound = useSoundManager();

  // `{false}` (from `{condition && <el/>}` with condition=false), null, and
  // undefined all count as "no children" — suppress the expand button.
  const hasChildren = children !== null && children !== undefined && children !== false;

  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all duration-200 hover:border-purple-400/30 hover:shadow-[0_0_24px_rgba(168,85,247,0.12)] ${className ?? ""}`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">{header}</div>
        {hasChildren && (
          <button
            type="button"
            onMouseEnter={sound.hover}
            onClick={() => {
              sound.click();
              setExpanded((v) => !v);
            }}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-zinc-500 transition-colors hover:border-white/30 hover:text-zinc-200"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Schliessen</span>
              </>
            ) : (
              <>
                <span>Details</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="mt-3 border-t border-white/5 pt-3">{children}</div>
      )}
    </div>
  );
}
