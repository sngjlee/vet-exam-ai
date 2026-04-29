import { z } from "zod";
import { ImageUrlsSchema } from "./imageUrlValidate";

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
      .max(5000, "5000자를 초과할 수 없습니다")
      .default(""),
    image_urls: ImageUrlsSchema,
  })
  .refine(
    (data) => data.parent_id != null || data.type != null,
    { message: "type is required for root comments", path: ["type"] }
  )
  .refine(
    (data) => data.body_text.length > 0 || data.image_urls.length > 0,
    { message: "내용을 입력하거나 이미지를 첨부해주세요", path: ["body_text"] }
  );

export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const EditCommentSchema = z
  .object({
    body_text: z
      .string()
      .max(5000, "5000자를 초과할 수 없습니다")
      .optional(),
    image_urls: ImageUrlsSchema.optional(),
  })
  .refine(
    (data) => data.body_text !== undefined || data.image_urls !== undefined,
    { message: "수정할 내용이 없습니다", path: ["body_text"] }
  );

export type EditCommentInput = z.infer<typeof EditCommentSchema>;
