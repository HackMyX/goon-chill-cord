"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getActivePopupNote } from "@/lib/actions/patchnotes";
import { PatchnotePopup } from "./patchnote-popup";
import type { PatchNote } from "@/lib/patchnotes";

/**
 * Fetches the active popup note client-side on mount. On every route change
 * the popup remounts (new key) so it appears again on each page visit —
 * only "Gelesen" (localStorage) permanently suppresses it.
 */
export function PatchnotePopupLoader() {
  const [note, setNote] = useState<PatchNote | null>(null);
  const [navKey, setNavKey] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    getActivePopupNote().then(setNote);
  }, []);

  // Bump key on every navigation so PatchnotePopup remounts and re-checks
  // visibility. X-close is temporary (no localStorage); only "Gelesen" is permanent.
  useEffect(() => {
    setNavKey((k) => k + 1);
  }, [pathname]);

  if (!note) return null;
  return <PatchnotePopup key={navKey} note={note} />;
}
