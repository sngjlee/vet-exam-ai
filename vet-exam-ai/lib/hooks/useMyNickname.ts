"use client";

import { useEffect, useState } from "react";
import { createClient } from "../supabase/client";

/**
 * Fetches the signed-in user's nickname from user_profiles_public.
 * Returns null while loading or if signed out / profile missing.
 *
 * Used by NavBar to wrap the user pill in a `/profile/<nickname>` link.
 */
export function useMyNickname(): string | null {
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setNickname(null);
        return;
      }
      const { data } = await supabase
        .from("user_profiles_public")
        .select("nickname")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setNickname(data?.nickname ?? null);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return nickname;
}
