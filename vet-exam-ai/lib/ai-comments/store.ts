import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/types";
import type {
  AiCommentClaim,
  AiCommentFailureUpdate,
  AiCommentGenerationSnapshot,
  AiCommentGenerationStore,
  AiCommentPendingUpdate,
  AiCommentReservationResult,
} from "./generate";
import { resolveAiCommentSeedAccountIds } from "./seed-accounts";
import type { AiCommentQuestionSource } from "./select";

type AdminClient = SupabaseClient<Database>;
type QuestionRow = Database["public"]["Tables"]["questions"]["Row"];
type QuestionSelectionRow = Pick<
  QuestionRow,
  | "public_id"
  | "question"
  | "choices"
  | "answer"
  | "explanation"
  | "category"
  | "subject"
  | "topic"
  | "is_active"
  | "year"
  | "session"
  | "round"
  | "question_image_files"
  | "explanation_image_files"
  | "question_image_files_original"
  | "explanation_image_files_original"
>;

const QUESTION_SELECT = "public_id, question, choices, answer, explanation, category, subject, topic, is_active, year, session, round, question_image_files, explanation_image_files, question_image_files_original, explanation_image_files_original" as const;

class AiCommentStoreContractError extends Error {
  readonly name = "AiCommentStoreContractError";

  constructor(readonly operation: string) {
    super(`AI comment store returned no row for ${operation}`);
  }
}

function throwIfError(error: PostgrestError | null): void {
  if (error !== null) throw error;
}

function utcStarts(now: Date): Readonly<{ day: string; month: string }> {
  return {
    day: new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    )).toISOString(),
    month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
  };
}

function toQuestionSource(row: QuestionSelectionRow): AiCommentQuestionSource {
  return {
    publicId: row.public_id,
    question: row.question,
    choices: row.choices,
    answer: row.answer,
    explanation: row.explanation,
    category: row.category,
    subject: row.subject,
    topic: row.topic,
    isActive: row.is_active,
    year: row.year,
    session: row.session,
    round: row.round,
    questionImageFiles: row.question_image_files,
    explanationImageFiles: row.explanation_image_files,
    questionImageFilesOriginal: row.question_image_files_original,
    explanationImageFilesOriginal: row.explanation_image_files_original,
  };
}

async function loadSnapshot(
  admin: AdminClient,
  now: Date,
): Promise<AiCommentGenerationSnapshot> {
  const starts = utcStarts(now);
  const [questions, visibleComments, currentCandidates, hashes, daily, monthly, pending] =
    await Promise.all([
      admin.from("questions").select(QUESTION_SELECT).eq("is_active", true),
      admin.from("comments").select("question_public_id").eq("status", "visible"),
      admin.from("ai_comment_candidates")
        .select("question_public_id")
        .in("status", ["generating", "pending", "published"]),
      admin.from("ai_comment_candidates").select("input_hash"),
      admin.from("ai_comment_candidates")
        .select("id", { count: "exact", head: true })
        .gte("created_at", starts.day),
      admin.from("ai_comment_candidates")
        .select("id", { count: "exact", head: true })
        .gte("created_at", starts.month),
      admin.from("ai_comment_candidates")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

  throwIfError(questions.error);
  throwIfError(visibleComments.error);
  throwIfError(currentCandidates.error);
  throwIfError(hashes.error);
  throwIfError(daily.error);
  throwIfError(monthly.error);
  throwIfError(pending.error);

  return {
    counters: {
      dailyRequests: daily.count ?? 0,
      monthlyRequests: monthly.count ?? 0,
      pendingCandidates: pending.count ?? 0,
    },
    questions: (questions.data ?? []).map(toQuestionSource),
    visibleCommentQuestionIds: (visibleComments.data ?? [])
      .map((row) => row.question_public_id)
      .filter((publicId): publicId is string => publicId !== null),
    currentCandidateQuestionIds: (currentCandidates.data ?? []).map((row) => row.question_public_id),
    existingInputHashes: (hashes.data ?? []).map((row) => row.input_hash),
  };
}

async function claim(
  admin: AdminClient,
  input: AiCommentClaim,
): Promise<AiCommentReservationResult> {
  const { data, error } = await admin.rpc("reserve_ai_comment_generation", {
    p_question_public_id: input.questionPublicId,
    p_input_hash: input.inputHash,
    p_model: input.model,
    p_prompt_version: input.promptVersion,
    p_daily_limit: input.dailyLimit,
    p_monthly_limit: input.monthlyLimit,
    p_pending_limit: input.pendingLimit,
  });
  throwIfError(error);
  const reservation = data?.[0];
  if (reservation === undefined) throw new AiCommentStoreContractError("reservation");

  switch (reservation.result) {
    case "claimed":
      if (reservation.candidate_id === null) {
        throw new AiCommentStoreContractError("claimed reservation");
      }
      return { kind: "claimed", claimId: reservation.candidate_id };
    case "duplicate":
      return { kind: "duplicate" };
    case "daily_limit":
      return { kind: "daily_limit" };
    case "monthly_limit":
      return { kind: "monthly_limit" };
    case "pending_limit":
      return { kind: "pending_limit" };
    default:
      throw new AiCommentStoreContractError("reservation result");
  }
}

async function markPending(admin: AdminClient, update: AiCommentPendingUpdate): Promise<void> {
  const { error } = await admin.from("ai_comment_candidates").update({
    status: "pending",
    seed_author_key: update.candidate.authorKey,
    seed_user_id: update.seedUserId,
    comment_type: update.candidate.commentType,
    body_text: update.candidate.bodyText,
    openai_request_id: update.meta.providerRequestId,
    client_request_id: update.meta.clientRequestId,
    risk_flags: [...update.candidate.riskFlags],
    input_tokens: update.meta.usage.inputTokens,
    output_tokens: update.meta.usage.outputTokens,
    reasoning_tokens: update.meta.usage.reasoningTokens,
    failure_code: null,
  }).eq("id", update.claimId);
  throwIfError(error);
}

async function markFailed(admin: AdminClient, update: AiCommentFailureUpdate): Promise<void> {
  const meta = update.meta;
  const { error } = await admin.from("ai_comment_candidates").update({
    status: "failed",
    failure_code: update.failureCode,
    openai_request_id: meta?.providerRequestId ?? null,
    client_request_id: meta?.clientRequestId ?? null,
    input_tokens: meta?.usage.inputTokens ?? null,
    output_tokens: meta?.usage.outputTokens ?? null,
    reasoning_tokens: meta?.usage.reasoningTokens ?? null,
  }).eq("id", update.claimId);
  throwIfError(error);
}

export function createSupabaseAiCommentGenerationStore(
  admin: AdminClient,
): AiCommentGenerationStore {
  return {
    loadSnapshot: (now) => loadSnapshot(admin, now),
    resolveSeedAccountIds: () => resolveAiCommentSeedAccountIds(admin),
    claim: (input) => claim(admin, input),
    markPending: (update) => markPending(admin, update),
    markFailed: (update) => markFailed(admin, update),
  };
}
