"use client";

import { useEffect, useState } from "react";
import { createClient } from "../supabase/client";

type Role = "user" | "reviewer" | "admin";

export type MyRoleState = { role: Role; isActive: boolean } | null;

/**
 * Returns the current user's role + active flag.
 * Subscribes to onAuthStateChange so account switches in the same tab
 * (logout A → login B) refresh instead of leaving stale admin/operator
 * badges visible.
 */
export function useMyRole(): MyRoleState {
  const [state, setState] = useState<MyRoleState>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function loadFor(userId: string | null) {
      if (cancelled) return;
      if (!userId) {
        setState(null);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setState(null);
        return;
      }
      setState({ role: data.role, isActive: data.is_active });
    }

    supabase.auth.getUser().then(({ data }) => {
      loadFor(data.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      loadFor(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
