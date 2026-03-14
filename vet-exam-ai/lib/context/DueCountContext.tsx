"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { useDueCount } from "../hooks/useDueCount";

const DueCountContext = createContext(0);

export function DueCountProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const count = useDueCount(user, loading);
  return (
    <DueCountContext.Provider value={count}>{children}</DueCountContext.Provider>
  );
}

export function useDueCountCtx(): number {
  return useContext(DueCountContext);
}
