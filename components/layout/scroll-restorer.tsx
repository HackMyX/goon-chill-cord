"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Per-route scroll-position persistence across browser reloads.
 *
 * Why this exists: the homepage and most pages are `force-dynamic` and load
 * their tallest content (leaderboards, 3D scenes, images) asynchronously after
 * hydration, so the page grows *after* the browser's native scroll restoration
 * has already run — leaving a reloaded user snapped back to the top. This saves
 * the scroll offset per pathname in sessionStorage and restores it on the next
 * full load, retrying until the page has actually grown tall enough to reach it.
 *
 * Deliberately restores ONLY on the initial load/reload, never on in-app
 * navigation (clicking a link should land at the top, the expected behaviour) —
 * and never on the active-game routes, where a reload is meant to restart fresh
 * (per the spec) and where scroll is meaningless anyway.
 */
const KEY = "gn_scroll_v1";
const NO_RESTORE = ["/world", "/snake", "/plinko", "/don", "/mine"];

function isExcluded(path: string): boolean {
  return NO_RESTORE.some((p) => path === p || path.startsWith(p + "/"));
}

function readMap(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function writeMap(m: Record<string, number>): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* private mode / quota — non-critical */
  }
}

export function ScrollRestorer() {
  const pathname = usePathname();
  const restoredRef = useRef(false);

  // Take manual control so the browser's own (height-dependent, unreliable
  // here) restoration doesn't fight ours.
  useEffect(() => {
    if (!("scrollRestoration" in history)) return;
    const prev = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = prev;
    };
  }, []);

  // Continuously save the scroll offset for the current path (rAF-throttled),
  // plus a final save on unload and when navigating away.
  useEffect(() => {
    if (isExcluded(pathname)) return;
    let raf = 0;
    const save = () => {
      const m = readMap();
      m[pathname] = Math.round(window.scrollY);
      writeMap(m);
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        save();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeunload", save);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("beforeunload", save);
      if (raf) cancelAnimationFrame(raf);
      save();
    };
  }, [pathname]);

  // Restore ONCE, on the initial full load/reload only.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const path = window.location.pathname;
    if (isExcluded(path)) return;
    const target = readMap()[path];
    if (!target || target <= 0) return;

    let cancelled = false;
    let attempts = 0;

    // Abort restoration the moment the user takes over scrolling themselves.
    const onUserScroll = () => {
      cancelled = true;
    };
    window.addEventListener("wheel", onUserScroll, { passive: true, once: true });
    window.addEventListener("touchmove", onUserScroll, { passive: true, once: true });
    window.addEventListener("keydown", onUserScroll, { once: true });

    const tryRestore = () => {
      if (cancelled) return cleanup();
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll >= target - 4) {
        window.scrollTo(0, target);
        // One confirmation pass in case a late layout shift nudges it.
        if (attempts++ < 2) {
          setTimeout(tryRestore, 140);
        } else {
          cleanup();
        }
        return;
      }
      // Page not tall enough yet — async content still loading. Keep waiting
      // up to ~3.5s, then give up gracefully.
      if (attempts++ < 44) {
        setTimeout(tryRestore, 80);
      } else {
        cleanup();
      }
    };

    function cleanup() {
      window.removeEventListener("wheel", onUserScroll);
      window.removeEventListener("touchmove", onUserScroll);
      window.removeEventListener("keydown", onUserScroll);
    }

    const t = setTimeout(tryRestore, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
      cleanup();
    };
  }, []);

  return null;
}
