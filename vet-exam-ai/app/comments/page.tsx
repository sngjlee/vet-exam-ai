import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import CommentsClient from "./comments-client";

export const dynamic = "force-dynamic";

export default async function CommentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  const viewerIsAdmin = profile?.role === "admin" && profile.is_active === true;

  return <CommentsClient viewerIsAdmin={viewerIsAdmin} />;
}
