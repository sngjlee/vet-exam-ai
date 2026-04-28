"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../lib/admin/guards";
import { createClient } from "../../../lib/supabase/server";

export async function resolveReport(formData: FormData) {
  await requireAdmin();
  const commentId  = String(formData.get("comment_id") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  const noteRaw    = String(formData.get("note") ?? "").trim();
  const note       = noteRaw ? noteRaw.slice(0, 200) : null;

  if (!commentId) redirect("/admin/reports?error=missing_target");
  if (resolution !== "upheld" && resolution !== "dismissed") {
    redirect("/admin/reports?error=invalid_resolution");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_comment_report", {
    p_comment_id: commentId,
    p_resolution: resolution,
    p_note:       note,
  });
  if (error) {
    console.error("[resolveReport]", error);
    redirect("/admin/reports?error=db_error");
  }

  revalidatePath("/admin/reports");
  redirect("/admin/reports");
}
