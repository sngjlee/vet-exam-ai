import { z } from "zod";

export const AI_COMMENT_AUTHOR_KEYS = ["memory", "explain", "wrong", "correction"] as const;
export const AI_COMMENT_TYPES = ["memorization", "explanation", "correction"] as const;
export const AI_COMMENT_RISK_FLAGS = [
  "answer_conflict",
  "explanation_conflict",
  "unsupported_claim",
  "ambiguous_source",
  "prompt_injection",
  "image_dependency",
  "unsafe_content",
] as const;

export const aiCommentQuestionInputSchema = z.object({
  public_id: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(100),
  topic: z.string().trim().min(1).max(200).nullable(),
  question: z.string().trim().min(1).max(10_000),
  choices: z.array(z.string().trim().min(1).max(2_000)).min(2).max(20),
  answer: z.string().trim().min(1).max(2_000),
  explanation: z.string().trim().min(1).max(20_000),
}).strict();

export const aiCommentOutputSchema = z.object({
  eligible: z.boolean(),
  author_key: z.enum(AI_COMMENT_AUTHOR_KEYS),
  comment_type: z.enum(AI_COMMENT_TYPES),
  body_text: z.string().max(2_000),
  grounded: z.boolean(),
  risk_flags: z.array(z.enum(AI_COMMENT_RISK_FLAGS)).max(AI_COMMENT_RISK_FLAGS.length),
  reason: z.string().trim().min(1).max(500),
}).strict();

export type AiCommentQuestionInput = z.infer<typeof aiCommentQuestionInputSchema>;
export type AiCommentAuthorKey = (typeof AI_COMMENT_AUTHOR_KEYS)[number];
export type AiCommentType = (typeof AI_COMMENT_TYPES)[number];
export type AiCommentRiskFlag = (typeof AI_COMMENT_RISK_FLAGS)[number];

export type AiCommentCandidate = Readonly<{
  authorKey: AiCommentAuthorKey;
  commentType: AiCommentType;
  bodyText: string;
  riskFlags: readonly AiCommentRiskFlag[];
  reason: string;
}>;

export type AiCommentValidationFailureCode =
  | "parse_error"
  | "ineligible"
  | "ungrounded"
  | "blocking_risk"
  | "invalid_mapping"
  | "invalid_body";

export type AiCommentValidationResult =
  | Readonly<{ kind: "candidate"; candidate: AiCommentCandidate }>
  | Readonly<{ kind: "failure"; code: AiCommentValidationFailureCode }>;

const COMMENT_TYPE_BY_AUTHOR = {
  memory: "memorization",
  explain: "explanation",
  wrong: "explanation",
  correction: "correction",
} as const satisfies Record<AiCommentAuthorKey, AiCommentType>;

const URL_PATTERN = /(?:https?:\/\/|www\.)/iu;
const HTML_PATTERN = /<[^>]+>/u;
const HANGUL_PATTERN = /[가-힣]/u;

export function validateAiCommentOutput(value: unknown): AiCommentValidationResult {
  const parsed = aiCommentOutputSchema.safeParse(value);
  if (!parsed.success) {
    return { kind: "failure", code: "parse_error" };
  }

  const output = parsed.data;
  if (!output.eligible) {
    return { kind: "failure", code: "ineligible" };
  }
  if (!output.grounded) {
    return { kind: "failure", code: "ungrounded" };
  }
  if (output.risk_flags.length > 0) {
    return { kind: "failure", code: "blocking_risk" };
  }
  if (COMMENT_TYPE_BY_AUTHOR[output.author_key] !== output.comment_type) {
    return { kind: "failure", code: "invalid_mapping" };
  }

  const bodyText = output.body_text.trim();
  const characterCount = Array.from(bodyText).length;
  if (
    characterCount < 20
    || characterCount > 500
    || !HANGUL_PATTERN.test(bodyText)
    || URL_PATTERN.test(bodyText)
    || HTML_PATTERN.test(bodyText)
  ) {
    return { kind: "failure", code: "invalid_body" };
  }

  return {
    kind: "candidate",
    candidate: {
      authorKey: output.author_key,
      commentType: output.comment_type,
      bodyText,
      riskFlags: output.risk_flags,
      reason: output.reason,
    },
  };
}
