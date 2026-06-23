"use client";

import { createContext, useContext } from "react";
import { DEFAULT_PET_TYPES, type PetTypeConfig } from "@/lib/pets";

const PetConfigContext = createContext<PetTypeConfig[]>(DEFAULT_PET_TYPES);

export function PetConfigProvider({
  initialConfigs,
  children,
}: {
  initialConfigs: PetTypeConfig[];
  children: React.ReactNode;
}) {
  return <PetConfigContext.Provider value={initialConfigs}>{children}</PetConfigContext.Provider>;
}

export function usePetConfigs(): PetTypeConfig[] {
  return useContext(PetConfigContext);
}
