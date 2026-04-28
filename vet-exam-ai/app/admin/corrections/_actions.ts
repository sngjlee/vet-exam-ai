"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../lib/admin/guards";
import { createClient } from "../../../lib/supabase/server";

export async function resolveCorrection(formData: FormData) {
  await requireAdmin();
  const correctionId = String(formData.get("correction_id") ?? "");
  const resolution   = String(formData.get("resolution") ?? "");
  const noteRaw      = String(formData.get("note") ?? "").trim();
  const note         = noteRaw ? noteRaw.slice(0, 200) : null;

  if (!correctionId) redirect("/admin/corrections?error=missing_target");
  if (resolution !== "accepted" && resolution !== "rejected") {
    redirect("/admin/corrections?error=invalid_resolution");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_question_correction", {
    p_correction_id: correctionId,
    p_resolution:    resolution,
    p_note:          note,
  });
  if (error) {
    console.error("[resolveCorrection]", error);
    redirect("/admin/corrections?error=db_error");
  }

  revalidatePath("/admin/corrections");
  redirect("/admin/corrections");
}
