"use client";

import { useEffect, useState } from "react";
import { createClient } from "../supabase/client";
import { useAuth } from "./useAuth";

type Role = "user" | "reviewer" | "admin";

export type MyRoleState = { role: Role; isActive: boolean } | null;

export function useMyRole(): MyRoleState {
  const { user, loading } = useAuth();
  const [state, setState] = useState<{
    userId: string;
    value: MyRoleState;
  } | null>(null);

  useEffect(() => {
    if (loading) return;

    let cancelled = false;

    if (!user) {
      return;
    }

    const userId = user.id;

    async function loadRole() {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setState({ userId, value: null });
        return;
      }
      setState({
        userId,
        value: { role: data.role, isActive: data.is_active },
      });
    }

    void loadRole();

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  if (!user || state?.userId !== user.id) return null;
  return state.value;
}
