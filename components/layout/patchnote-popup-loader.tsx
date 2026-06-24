"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getActivePopupNote } from "@/lib/actions/patchnotes";
import { PatchnotePopup } from "./patchnote-popup";
import type { PatchNote } from "@/lib/patchnotes";

/**
 * Fetches the active popup note client-side on mount — only for authenticated
 * users. On every route change the popup remounts (new key) so it appears
 * again on each page visit. Only "Gelesen" (localStorage) permanently
 * suppresses it; X-close is temporary.
 */
export function PatchnotePopupLoader() {
  const [note, setNote] = useState<PatchNote | null>(null);
  const [navKey, setNavKey] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      getActivePopupNote().then(setNote);
    });
  }, []);

  useEffect(() => {
    setNavKey((k) => k + 1);
  }, [pathname]);

  if (!note) return null;
  return <PatchnotePopup key={navKey} note={note} />;
}
