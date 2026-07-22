import "server-only";

import { z } from "zod";
import { requireAdmin } from "../../../../lib/admin/guards";
import { createClient } from "../../../../lib/supabase/server";
import type { AiCommentCandidateRow } from "../../../../lib/supabase/types";
import type { AiCommentCandidateSearch } from "./schemas";

export const AI_COMMENT_CANDIDATE_PAGE_SIZE = 20;

const CANDIDATE_PROJECTION = `
  id,
  question_public_id,
  seed_author_key,
  seed_user_id,
  comment_type,
  body_text,
  status,
  model,
  prompt_version,
  risk_flags,
  created_at,
  questions!inner (
    public_id,
    question,
    choices,
    answer,
    explanation,
    category,
    subject,
    topic
  )
` as const;

const questionContextSchema = z.object({
  public_id: z.string(),
  question: z.string(),
  choices: z.array(z.string()),
  answer: z.string(),
  explanation: z.string(),
  category: z.string(),
  subject: z.string().nullable(),
  topic: z.string().nullable(),
});

const candidateQueryRowsSchema = z.array(z.object({
  id: z.string(),
  question_public_id: z.string(),
  seed_author_key: z.enum(["memory", "explain", "wrong", "correction"]).nullable(),
  seed_user_id: z.string().nullable(),
  comment_type: z.enum(["explanation", "memorization", "correction"]).nullable(),
  body_text: z.string().nullable(),
  status: z.enum(["generating", "pending", "published", "rejected", "failed"]),
  model: z.string(),
  prompt_version: z.string(),
  risk_flags: z.array(z.unknown()),
  created_at: z.string(),
  questions: questionContextSchema,
}));

type SafeCandidateSource = {
  readonly id: string;
  readonly seed_author_key: AiCommentCandidateRow["seed_author_key"];
  readonly comment_type: AiCommentCandidateRow["comment_type"];
  readonly body_text: string | null;
  readonly status: AiCommentCandidateRow["status"];
  readonly model: string;
  readonly prompt_version: string;
  readonly risk_flags: readonly unknown[];
  readonly created_at: string;
};

type QuestionContext = z.infer<typeof questionContextSchema>;
type CandidateQueryRow = z.infer<typeof candidateQueryRowsSchema>[number];

export type AiCommentCandidateItem = {
  readonly id: string;
  readonly seedAuthorKey: AiCommentCandidateRow["seed_author_key"];
  readonly seedNickname: string | null;
  readonly commentType: AiCommentCandidateRow["comment_type"];
  readonly bodyText: string;
  readonly status: AiCommentCandidateRow["status"];
  readonly model: string;
  readonly promptVersion: string;
  readonly riskFlags: readonly string[];
  readonly createdAt: string;
  readonly question: {
    readonly publicId: string;
    readonly question: string;
    readonly choices: readonly string[];
    readonly answer: string;
    readonly explanation: string;
    readonly category: string;
    readonly subject: string | null;
    readonly topic: string | null;
  };
};

export type AiCommentCandidatePage = {
  readonly items: readonly AiCommentCandidateItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
  readonly pendingTotal: number;
};

type SerializeInput<TCandidate extends SafeCandidateSource> = {
  readonly candidate: TCandidate;
  readonly question: QuestionContext;
  readonly nickname: string | null;
};

export function serializeAiCommentCandidate<TCandidate extends SafeCandidateSource>(
  input: SerializeInput<TCandidate>,
): AiCommentCandidateItem {
  return {
    id: input.candidate.id,
    seedAuthorKey: input.candidate.seed_author_key,
    seedNickname: input.nickname,
    commentType: input.candidate.comment_type,
    bodyText: input.candidate.body_text ?? "",
    status: input.candidate.status,
    model: input.candidate.model,
    promptVersion: input.candidate.prompt_version,
    riskFlags: input.candidate.risk_flags.filter(
      (flag): flag is string => typeof flag === "string",
    ),
    createdAt: input.candidate.created_at,
    question: {
      publicId: input.question.public_id,
      question: input.question.question,
      choices: input.question.choices,
      answer: input.question.answer,
      explanation: input.question.explanation,
      category: input.question.category,
      subject: input.question.subject,
      topic: input.question.topic,
    },
  };
}

export class AiCommentCandidateQueryError extends Error {
  readonly code = "query_failed";

  constructor() {
    super("AI comment candidate query failed");
    this.name = "AiCommentCandidateQueryError";
  }
}

function isUnfilteredPendingSearch(search: AiCommentCandidateSearch): boolean {
  return search.status === "pending"
    && search.model === ""
    && search.subject === ""
    && search.category === ""
    && search.author === "all"
    && search.publicId === "";
}

export async function loadAiCommentCandidates(
  search: AiCommentCandidateSearch,
): Promise<AiCommentCandidatePage> {
  await requireAdmin();
  const supabase = await createClient();

  const buildCandidateQuery = () => {
    let query = supabase
      .from("ai_comment_candidates")
      .select(CANDIDATE_PROJECTION, { count: "exact" });
    if (search.status !== "all") query = query.eq("status", search.status);
    if (search.model) query = query.eq("model", search.model);
    if (search.author !== "all") query = query.eq("seed_author_key", search.author);
    if (search.publicId) query = query.eq("question_public_id", search.publicId);
    if (search.subject) query = query.eq("questions.subject", search.subject);
    if (search.category) query = query.eq("questions.category", search.category);
    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  };

  const requestedOffset = (search.page - 1) * AI_COMMENT_CANDIDATE_PAGE_SIZE;
  let result = await buildCandidateQuery().range(
    requestedOffset,
    requestedOffset + AI_COMMENT_CANDIDATE_PAGE_SIZE - 1,
  );
  if (result.error) throw new AiCommentCandidateQueryError();

  const total = result.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / AI_COMMENT_CANDIDATE_PAGE_SIZE));
  const page = Math.min(search.page, totalPages);
  if (page !== search.page) {
    const offset = (page - 1) * AI_COMMENT_CANDIDATE_PAGE_SIZE;
    result = await buildCandidateQuery().range(
      offset,
      offset + AI_COMMENT_CANDIDATE_PAGE_SIZE - 1,
    );
    if (result.error) throw new AiCommentCandidateQueryError();
  }

  const parsedRows = candidateQueryRowsSchema.safeParse(result.data ?? []);
  if (!parsedRows.success) throw new AiCommentCandidateQueryError();
  const rows: readonly CandidateQueryRow[] = parsedRows.data;
  const seedUserIds = [...new Set(rows.flatMap((candidate) =>
    candidate.seed_user_id ? [candidate.seed_user_id] : []))];
  const profilesResult = seedUserIds.length > 0
    ? await supabase.from("user_profiles_public").select("user_id, nickname").in("user_id", seedUserIds)
    : { data: [], error: null };
  if (profilesResult.error) throw new AiCommentCandidateQueryError();

  const nicknames = new Map((profilesResult.data ?? []).map((profile) => [profile.user_id, profile.nickname]));
  const items = rows.map((candidate) => serializeAiCommentCandidate({
    candidate,
    question: candidate.questions,
    nickname: candidate.seed_user_id ? nicknames.get(candidate.seed_user_id) ?? null : null,
  }));

  let pendingTotal = total;
  if (!isUnfilteredPendingSearch(search)) {
    const pendingResult = await supabase
      .from("ai_comment_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (pendingResult.error) throw new AiCommentCandidateQueryError();
    pendingTotal = pendingResult.count ?? 0;
  }

  return {
    items,
    page,
    pageSize: AI_COMMENT_CANDIDATE_PAGE_SIZE,
    total,
    totalPages,
    pendingTotal,
  };
}