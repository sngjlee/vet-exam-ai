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

  return <CommentsClient />;
}
