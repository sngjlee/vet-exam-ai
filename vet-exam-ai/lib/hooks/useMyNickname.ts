"use client";

import { useEffect, useState } from "react";
import { createClient } from "../supabase/client";

/**
 * Fetches the signed-in user's nickname from user_profiles_public.
 * Returns null while loading or if signed out / profile missing.
 *
 * Subscribes to onAuthStateChange so account switches in the same tab
 * (logout A → login B) refresh the pill instead of showing stale data.
 */
export function useMyNickname(): string | null {
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function loadFor(userId: string | null) {
      if (cancelled) return;
      if (!userId) {
        setNickname(null);
        return;
      }
      const { data } = await supabase
        .from("user_profiles_public")
        .select("nickname")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setNickname(data?.nickname ?? null);
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

  return nickname;
}
