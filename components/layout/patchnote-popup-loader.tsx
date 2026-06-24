"use client";

import { useState, useEffect } from "react";
import { getActivePopupNote } from "@/lib/actions/patchnotes";
import { PatchnotePopup } from "./patchnote-popup";
import type { PatchNote } from "@/lib/patchnotes";

/**
 * Fetches the active popup note client-side on mount so users always see
 * the current popup regardless of layout server-component caching.
 */
export function PatchnotePopupLoader() {
  const [note, setNote] = useState<PatchNote | null>(null);

  useEffect(() => {
    getActivePopupNote().then(setNote);
  }, []);

  if (!note) return null;
  return <PatchnotePopup note={note} />;
}
