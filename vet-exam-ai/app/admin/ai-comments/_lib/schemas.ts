import { z } from "zod";

const candidateStatuses = [
  "all",
  "generating",
  "pending",
  "published",
  "rejected",
  "failed",
] as const;
const seedAuthors = ["all", "memory", "explain", "wrong", "correction"] as const;

function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

const boundedFilter = z.preprocess(
  firstValue,
  z.string().trim().max(100).catch(""),
);

const searchSchema = z.object({
  status: z.preprocess(firstValue, z.enum(candidateStatuses).catch("pending")),
  model: boundedFilter,
  subject: boundedFilter,
  category: boundedFilter,
  author: z.preprocess(firstValue, z.enum(seedAuthors).catch("all")),
  publicId: z.preprocess(firstValue, z.string().trim().max(50).catch("")),
  page: z.preprocess(firstValue, z.coerce.number().int().positive().catch(1)),
});

const optionalNote = z.preprocess(
  (value) => typeof value === "string" && value.trim().length > 0 ? value.trim() : null,
  z.string().max(500).nullable(),
);

const reviewInputSchema = z.object({
  candidateId: z.string().uuid(),
  resolution: z.enum(["approve", "reject"]),
  note: optionalNote.default(null),
});

export type AiCommentCandidateSearch = z.infer<typeof searchSchema>;
export type AiCommentReviewInput = z.infer<typeof reviewInputSchema>;

export function parseAiCommentCandidateSearch(raw: Readonly<Record<string, unknown>>): AiCommentCandidateSearch {
  return searchSchema.parse(raw);
}

export function parseAiCommentReviewInput(raw: unknown): AiCommentReviewInput {
  return reviewInputSchema.parse(raw);
}
