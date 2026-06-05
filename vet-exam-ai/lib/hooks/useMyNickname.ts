"use client";

import { useEffect, useState } from "react";
import { createClient } from "../supabase/client";
import { useAuth } from "./useAuth";

export function useMyNickname(): string | null {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<{
    userId: string;
    nickname: string | null;
  } | null>(null);

  useEffect(() => {
    if (loading) return;

    let cancelled = false;

    if (!user) {
      return;
    }

    const userId = user.id;

    async function loadNickname() {
      const supabase = createClient();
      const { data } = await supabase
        .from("user_profiles_public")
        .select("nickname")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setProfile({ userId, nickname: data?.nickname ?? null });
    }

    void loadNickname();

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  if (!user || profile?.userId !== user.id) return null;
  return profile.nickname;
}
