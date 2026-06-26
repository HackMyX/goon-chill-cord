"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribe to a live-config channel and re-apply fresh data on every admin
 * save — no page reload (AGENTS §3). Pairs with broadcastLive(channel) on the
 * server (lib/realtime-broadcast.ts).
 *
 *   const [config, setConfig] = useState(initialConfig);
 *   useLiveConfig("snake-config-live", getSnakeConfig, setConfig);
 *
 * `load` is the getter server action; `apply` receives its result (usually a
 * state setter). Refs keep the subscription stable across re-renders.
 */
export function useLiveConfig<T>(
  channel: string,
  load: () => Promise<T>,
  apply: (data: T) => void,
): void {
  const loadRef = useRef(load);
  loadRef.current = load;
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(channel)
      .on("broadcast", { event: "changed" }, () => {
        loadRef.current()
          .then((d) => applyRef.current(d))
          .catch(() => { /* keep current data on error */ });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [channel]);
}
