"use client";

import { useEffect, useState } from "react";

/**
 * True once the component has mounted on the client. Use this to gate any
 * value that's allowed to differ between server and client render (clocks,
 * random sampling, `window`-dependent state) — never compute that value
 * during the render that produces the initial HTML, or React will throw a
 * hydration mismatch.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setHydrated(true), 0);
    return () => clearTimeout(timeout);
  }, []);

  return hydrated;
}
