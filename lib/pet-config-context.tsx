"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPetConfigs } from "@/lib/actions/pets";
import { DEFAULT_PET_TYPES, type PetTypeConfig } from "@/lib/pets";

const PetConfigContext = createContext<PetTypeConfig[]>(DEFAULT_PET_TYPES);

export function PetConfigProvider({
  initialConfigs,
  children,
}: {
  initialConfigs: PetTypeConfig[];
  children: React.ReactNode;
}) {
  const [configs, setConfigs] = useState<PetTypeConfig[]>(initialConfigs);

  useEffect(() => { setConfigs(initialConfigs); }, [initialConfigs]);

  // Live updates: admin saves broadcast on "pets-live" (lib/actions/pets.ts) →
  // re-fetch so pet display stats update everywhere without a reload (AGENTS §3).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("pets-live")
      .on("broadcast", { event: "pets_changed" }, () => {
        getPetConfigs().then(setConfigs).catch(() => { /* keep current on error */ });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  return <PetConfigContext.Provider value={configs}>{children}</PetConfigContext.Provider>;
}

export function usePetConfigs(): PetTypeConfig[] {
  return useContext(PetConfigContext);
}
