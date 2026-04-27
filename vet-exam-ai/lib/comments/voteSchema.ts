// vet-exam-ai/lib/comments/voteSchema.ts
import { z } from "zod";

export const VoteValueSchema = z.union([z.literal(1), z.literal(-1)]);
export type VoteValue = z.infer<typeof VoteValueSchema>;

export const VoteRequestSchema = z.object({
  value: VoteValueSchema,
});
export type VoteRequest = z.infer<typeof VoteRequestSchema>;

export const SORT_MODES = ["score", "recent"] as const;
export const SortModeSchema = z.enum(SORT_MODES);
export type SortMode = z.infer<typeof SortModeSchema>;
