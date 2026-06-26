"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSoundConfig } from "@/lib/actions/sound-config";
import { useSoundManager } from "@/lib/sound-manager";
import type { SoundConfig } from "@/lib/sound-config";

interface SoundConfigLoaderProps {
  config: SoundConfig;
}

/** Applies sound config (loaded server-side) to the global SoundManager singleton.
 * Live updates: admin saves broadcast on "sound-config-live" → re-fetch and
 * re-apply without a reload (AGENTS §3). */
export function SoundConfigLoader({ config }: SoundConfigLoaderProps) {
  const sound = useSoundManager();

  useEffect(() => {
    sound.loadConfig(config);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("sound-config-live")
      .on("broadcast", { event: "sound_config_changed" }, () => {
        getSoundConfig().then((cfg) => sound.loadConfig(cfg)).catch(() => { /* keep current on error */ });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
