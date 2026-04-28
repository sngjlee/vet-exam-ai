"use client";

import { useEffect, useState } from "react";
import { createClient } from "../supabase/client";

type Role = "user" | "reviewer" | "admin";

export type MyRoleState = { role: Role; isActive: boolean } | null;

export function useMyRole(): MyRoleState {
  const [state, setState] = useState<MyRoleState>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setState(null);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setState(null);
        return;
      }
      setState({ role: data.role, isActive: data.is_active });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
