"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  THEME_CATALOG, USER_THEME_LS_KEY, isThemeKey,
  type ThemeConfig, type ThemeKey,
} from "@/lib/theme-config";

interface ThemeCtx {
  /** Globally-active theme + whether users may override (admin-controlled) */
  config: ThemeConfig;
  /** The user's personal override (null = follow global) */
  userTheme: ThemeKey | null;
  /** The theme actually applied right now */
  effective: ThemeKey;
  /** Whether the user is allowed to pick their own theme */
  canChoose: boolean;
  /** Set (or clear with null) the user's personal theme */
  setUserTheme: (k: ThemeKey | null) => void;
  catalog: typeof THEME_CATALOG;
}

const Ctx = createContext<ThemeCtx | null>(null);

/** Apply a theme key to <html> by toggling the data-theme attribute. */
function applyTheme(key: ThemeKey) {
  const el = document.documentElement;
  if (key === "default") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", key);
}

export function ThemeProvider({
  initial,
  children,
}: {
  initial: ThemeConfig;
  children: React.ReactNode;
}) {
  const [config, setConfig] = useState<ThemeConfig>(initial);
  const [userTheme, setUserThemeState] = useState<ThemeKey | null>(null);

  // Load the user's saved override once on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(USER_THEME_LS_KEY);
      if (saved && isThemeKey(saved)) setUserThemeState(saved);
    } catch { /* ignore */ }
  }, []);

  const effective: ThemeKey =
    config.allowUserChoice && userTheme ? userTheme : config.activeTheme;

  // Keep <html data-theme> in sync with the effective theme.
  // (Server already set the global theme; this reconciles user overrides + live updates.)
  const lastApplied = useRef<string>(initial.activeTheme);
  useEffect(() => {
    if (lastApplied.current !== effective) {
      applyTheme(effective);
      lastApplied.current = effective;
    }
  }, [effective]);

  // Live updates: admin saves broadcast on "theme-live" → apply without reload.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("theme-live")
      .on("broadcast", { event: "theme_changed" }, (msg) => {
        const p = msg.payload as Partial<ThemeConfig> | undefined;
        if (!p || !isThemeKey(p.activeTheme)) return;
        setConfig({
          activeTheme: p.activeTheme,
          allowUserChoice: !!p.allowUserChoice,
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const setUserTheme = useCallback((k: ThemeKey | null) => {
    setUserThemeState(k);
    try {
      if (k) localStorage.setItem(USER_THEME_LS_KEY, k);
      else localStorage.removeItem(USER_THEME_LS_KEY);
    } catch { /* ignore */ }
  }, []);

  const value = useMemo<ThemeCtx>(() => ({
    config,
    userTheme,
    effective,
    canChoose: config.allowUserChoice,
    setUserTheme,
    catalog: THEME_CATALOG,
  }), [config, userTheme, effective, setUserTheme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
