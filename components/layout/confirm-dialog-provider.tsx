"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + warning icon, for destructive/irreversible
   * actions (ban, wipe inventory, permanent gender lock, ...). */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Promise-based replacement for `window.confirm()` — resolves `true`/
 * `false` exactly like the native dialog, but renders in the site's own
 * dark/purple style instead of the browser's stock OS dialog. Must be used
 * under <ConfirmDialogProvider> (mounted once in app/layout.tsx). */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm() must be used within a ConfirmDialogProvider");
  }
  return ctx;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timeout);
  }, []);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {mounted &&
        options &&
        createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            onClick={() => settle(false)}
          >
            <div
              className="w-[min(92vw,400px)] rounded-2xl border border-purple-500/30 bg-[#0b0814] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center gap-2">
                {options.danger && <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />}
                <h3 className="text-base font-bold text-zinc-100">{options.title}</h3>
              </div>
              <p className="mb-5 text-sm text-zinc-400">{options.message}</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => settle(false)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/5"
                >
                  {options.cancelLabel ?? "Abbrechen"}
                </button>
                <button
                  onClick={() => settle(true)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
                    options.danger
                      ? "bg-red-600 hover:bg-red-500"
                      : "bg-purple-600 hover:bg-purple-500"
                  }`}
                >
                  {options.confirmLabel ?? "Bestätigen"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}
