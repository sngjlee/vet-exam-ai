import { z } from "zod";

export const COMMENT_TYPES = [
  "memorization",
  "correction",
  "explanation",
  "question",
  "discussion",
] as const;

export const CommentTypeSchema = z.enum(COMMENT_TYPES);
export type CommentType = z.infer<typeof CommentTypeSchema>;

export const CreateCommentSchema = z
  .object({
    question_id: z.string().min(1),
    parent_id: z.string().uuid().nullish(),
    type: CommentTypeSchema.optional(),
    body_text: z
      .string()
      .min(1, "내용을 입력해주세요")
      .max(5000, "5000자를 초과할 수 없습니다"),
  })
  .refine(
    (data) => data.parent_id != null || data.type != null,
    { message: "type is required for root comments", path: ["type"] }
  );

export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const EditCommentSchema = z.object({
  body_text: z
    .string()
    .min(1, "내용을 입력해주세요")
    .max(5000, "5000자를 초과할 수 없습니다"),
});

export type EditCommentInput = z.infer<typeof EditCommentSchema>;
