"use client";

import { useEffect } from "react";
import { useSoundManager } from "@/lib/sound-manager";
import type { SoundConfig } from "@/lib/sound-config";

interface SoundConfigLoaderProps {
  config: SoundConfig;
}

/** Applies sound config (loaded server-side) to the global SoundManager singleton. */
export function SoundConfigLoader({ config }: SoundConfigLoaderProps) {
  const sound = useSoundManager();

  useEffect(() => {
    sound.loadConfig(config);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
