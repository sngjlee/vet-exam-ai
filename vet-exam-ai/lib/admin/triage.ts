"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import type { ImageTriageStatus } from "./triage-labels";
import { logError } from "../utils/logging";

export type TriageActionResult =
  | { ok: true; count?: number }
  | { ok: false; error: string };

export async function triageQuestionDecide(
  questionId: string,
  status: ImageTriageStatus,
  note: string | null,
): Promise<TriageActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("triage_question_decide", {
    p_question_id: questionId,
    p_status:      status,
    p_note:        note,
  });
  if (error) {
    logError("[triage] decide failed", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/image-questions");
  revalidatePath("/admin");
  return { ok: true };
}

export async function triageQuestionsBulkActivate(
  ids: string[],
  note: string | null,
): Promise<TriageActionResult> {
  if (ids.length === 0) return { ok: false, error: "선택된 항목이 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("triage_questions_bulk_activate", {
    p_ids:  ids,
    p_note: note,
  });
  if (error) {
    logError("[triage] bulk activate failed", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/image-questions");
  revalidatePath("/admin");
  return { ok: true, count: (data as number | null) ?? ids.length };
}

export async function triageQuestionRevert(
  questionId: string,
): Promise<TriageActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("triage_question_revert", {
    p_question_id: questionId,
  });
  if (error) {
    logError("[triage] revert failed", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/image-questions");
  revalidatePath("/admin");
  return { ok: true };
}

export async function triageQuestionReplaceAndActivate(args: {
  questionId:       string;
  questionFiles:    string[];
  explanationFiles: string[];
  note:             string | null;
}): Promise<TriageActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("triage_question_replace_and_activate", {
    p_question_id:        args.questionId,
    p_question_files:     args.questionFiles,
    p_explanation_files:  args.explanationFiles,
    p_note:               args.note,
  });
  if (error) {
    logError("[triage] replace-and-activate failed", error);
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/image-questions");
  revalidatePath("/admin");
  return { ok: true };
}
