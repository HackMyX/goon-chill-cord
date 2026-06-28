"use client";

import { useEffect, useState } from "react";
import { getAdminKeyOptions, type AdminKeyOptions, type KeyOption } from "@/lib/actions/admin-key-options";

type Kind = keyof AdminKeyOptions;

// Geteilter Modul-Cache: alle <KeySelect> teilen sich EINEN Fetch. TTL sorgt für
// automatische Aktualisierung — neu angelegte Fähigkeiten/Styles/Badges/Items
// tauchen beim nächsten Öffnen/Re-Render auf, ohne manuelles Neuladen.
let cache: AdminKeyOptions | null = null;
let cacheTime = 0;
let inflight: Promise<AdminKeyOptions> | null = null;
const listeners = new Set<() => void>();
const TTL_MS = 15000;
const EMPTY: AdminKeyOptions = { ability: [], name_style: [], badge: [], item: [], case_tier: [] };

function load(force = false): Promise<AdminKeyOptions> {
  const fresh = cache && Date.now() - cacheTime < TTL_MS;
  if (fresh && !force) return Promise.resolve(cache as AdminKeyOptions);
  if (inflight) return inflight;
  inflight = getAdminKeyOptions()
    .then((d) => { cache = d; cacheTime = Date.now(); inflight = null; listeners.forEach((l) => l()); return d; })
    .catch(() => { inflight = null; return cache ?? EMPTY; });
  return inflight;
}

/** Liefert die (geteilten) Key-Optionen + lädt bei Bedarf (stale) automatisch nach. */
export function useAdminKeyOptions(): AdminKeyOptions {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    void load(); // refresht, wenn der Cache abgelaufen ist
    return () => { listeners.delete(l); };
  }, []);
  return cache ?? EMPTY;
}

/**
 * Dropdown mit allen verfügbaren Keys einer Kategorie (auto-befüllt + auto-aktualisierend).
 * Ersetzt überall die Freitext-Key-Eingaben.
 */
export function KeySelect({
  kind,
  value,
  onChange,
  className,
  placeholder,
  allowEmpty = true,
}: {
  kind: Kind;
  value: string | undefined;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const options = useAdminKeyOptions();
  const list: KeyOption[] = options[kind] ?? [];
  const hasValue = !value || list.some((o) => o.value === value);
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-purple-400/60"}
    >
      {allowEmpty && <option value="">{placeholder ?? "— wählen —"}</option>}
      {/* Aktueller Wert, der (noch) nicht in der Liste ist, bleibt sichtbar. */}
      {!hasValue && value && <option value={value}>{value} (unbekannt)</option>}
      {list.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
