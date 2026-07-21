"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireAdmin } from "@/lib/admin/guards";
import { createClient } from "@/lib/supabase/server";
import {
  parseAiCommentReviewInput,
  type AiCommentReviewInput,
} from "./_lib/schemas";

type ReviewErrorCode =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "permission_denied"
  | "invalid_candidate"
  | "review_failed";
export type AiCommentReviewResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: ReviewErrorCode };

type ParsedReviewForm =
  | { readonly ok: true; readonly input: AiCommentReviewInput }
  | { readonly ok: false };

type DatabaseError = {
  readonly code?: string | null;
};

function parseReviewForm(formData: FormData): ParsedReviewForm {
  try {
    return {
      ok: true,
      input: parseAiCommentReviewInput({
        candidateId: formData.get("candidate_id"),
        resolution: formData.get("resolution"),
        note: formData.get("note"),
      }),
    };
  } catch (error) {
    if (error instanceof ZodError) return { ok: false };
    throw error;
  }
}

function mapDatabaseError(error: DatabaseError): ReviewErrorCode {
  if (error.code === "42501") return "permission_denied";
  if (error.code === "P0002" || error.code === "PGRST116") return "not_found";
  if (error.code === "55000" || error.code === "23505") return "conflict";
  if (error.code === "22023") return "invalid_candidate";
  return "review_failed";
}

export async function reviewAiCommentCandidateAction(
  formData: FormData,
): Promise<AiCommentReviewResult> {
  await requireAdmin();
  const parsed = parseReviewForm(formData);
  if (!parsed.ok) return { ok: false, code: "invalid_input" };

  const supabase = await createClient();
  const { data: candidate, error: candidateError } = await supabase
    .from("ai_comment_candidates")
    .select("id, question_public_id, body_text, status")
    .eq("id", parsed.input.candidateId)
    .maybeSingle();

  if (candidateError) return { ok: false, code: mapDatabaseError(candidateError) };
  if (!candidate) return { ok: false, code: "not_found" };
  if (candidate.status !== "pending") return { ok: false, code: "conflict" };
  if (parsed.input.resolution === "approve" && !candidate.body_text) {
    return { ok: false, code: "invalid_candidate" };
  }

  const { error: reviewError } = await supabase.rpc("review_ai_comment_candidate", {
    p_candidate_id: parsed.input.candidateId,
    p_resolution: parsed.input.resolution,
    p_note: parsed.input.note,
  });
  if (reviewError) return { ok: false, code: mapDatabaseError(reviewError) };

  revalidatePath("/admin/ai-comments");
  revalidatePath(`/questions/${encodeURIComponent(candidate.question_public_id)}`);
  return { ok: true };
}
