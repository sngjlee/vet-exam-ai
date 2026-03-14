"use client";

import { useCallback, useMemo } from "react";
import { useAuth } from "./useAuth";
import { createClient } from "../supabase/client";
import { SupabaseAttemptsRepository } from "../attempts/supabaseRepo";
import type { AttemptPayload } from "../attempts/types";

export function useAttempts() {
  const { user } = useAuth();

  // null when signed out — guest users get no-op logging.
  const repo = useMemo(
    () =>
      user ? new SupabaseAttemptsRepository(createClient(), user.id) : null,
    [user],
  );

  const logAttempt = useCallback(
    async (payload: AttemptPayload): Promise<void> => {
      if (!repo) return; // guest: skip silently
      await repo.log(payload);
    },
    [repo],
  );

  return { logAttempt };
}
