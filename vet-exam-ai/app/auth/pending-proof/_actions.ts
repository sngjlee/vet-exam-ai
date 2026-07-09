"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "../../../lib/supabase/server";
import type { Database } from "../../../lib/supabase/types";
import { captureOperationalError, classifySupabaseFailure } from "../../../lib/utils/logging";
import { checkRateLimit, RATE_LIMITS } from "../../../lib/rate-limit";

type ProofKind     = Database["public"]["Enums"]["signup_proof_kind"];
type ApplicantType = Database["public"]["Enums"]["applicant_type"];

export type SubmitInput = {
  university:         string;
  targetRound:        number;
  realName:           string | null;
  studentNumber:      string | null;
  freeNote:           string | null;
  proofKind:          ProofKind;
  proofStoragePath:   string | null;
  proofText:          string | null;
  applicantType:      ApplicantType;
};

export type SubmitResult =
  | { ok: true }
  | {
      ok: false;
      error: "auth_required" | "invalid_input" | "rpc_failed" | "rate_limited";
      message?: string;
    };

export async function submitSignupApplicationAction(input: SubmitInput): Promise<SubmitResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth_required" };

  const rl = await checkRateLimit(supabase, RATE_LIMITS.signupApplication, user.id);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "rate_limited",
      message: "제출이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (!input.university.trim()) {
    return { ok: false, error: "invalid_input", message: "소속 대학을 입력해 주세요." };
  }
  if (!Number.isInteger(input.targetRound) || input.targetRound < 1 || input.targetRound > 200) {
    return { ok: false, error: "invalid_input", message: "목표 회차를 1~200으로 입력해 주세요." };
  }
  if (input.proofKind === "image" && !input.proofStoragePath) {
    return { ok: false, error: "invalid_input", message: "이미지 경로가 누락되었습니다." };
  }
  if (input.proofKind === "text" && !input.proofText) {
    return { ok: false, error: "invalid_input", message: "증빙 텍스트를 입력해 주세요." };
  }

  const { error } = await supabase.rpc("submit_signup_application", {
    p_university:          input.university,
    p_target_round:        input.targetRound,
    p_proof_kind:          input.proofKind,
    p_applicant_type:      input.applicantType,
    p_real_name:           input.realName,
    p_student_number:      input.studentNumber,
    p_free_note:           input.freeNote,
    p_proof_storage_path:  input.proofStoragePath,
    p_proof_text:          input.proofText,
  });
  if (error) {
    const failureKind = classifySupabaseFailure(error);
    captureOperationalError(error, {
      area: failureKind === "rls_denied" ? "rls" : "supabase",
      operation: "submit_signup_application",
      failureKind,
      level: failureKind === "rls_denied" ? "error" : "warning",
    });
    return { ok: false, error: "rpc_failed", message: error.message };
  }

  revalidatePath("/auth/pending-proof");
  revalidatePath("/auth/pending-review");
  redirect("/auth/pending-review");
}
