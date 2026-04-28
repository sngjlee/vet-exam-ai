import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../supabase/server";
import type { Database } from "../supabase/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function requireAdmin(): Promise<{ user: User; profile: ProfileRow }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || !profile.is_active) {
    redirect("/dashboard");
  }

  return { user, profile };
}
