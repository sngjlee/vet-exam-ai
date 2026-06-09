// vet-exam-ai/app/board/[kind]/[id]/_actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sanitizePostHtml, htmlToText } from "@/lib/board/sanitize";

const KindUrlSegmentSchema = z.enum(["suggestions", "announcements"]);

const CreateCommentSchema = z.object({
  post_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  body_html: z.string().min(1).max(80_000),
  image_urls: z.array(z.string().min(1)).max(3).default([]),
  is_anonymized: z.boolean().default(false),
  kind_segment: KindUrlSegmentSchema, // for revalidatePath only
});

const UpdateCommentSchema = z.object({
  id: z.string().uuid(),
  body_html: z.string().min(1).max(80_000),
  image_urls: z.array(z.string().min(1)).max(3).default([]),
  is_anonymized: z.boolean().default(false),
  post_id: z.string().uuid(),
  kind_segment: KindUrlSegmentSchema,
});

const ReportCommentSchema = z.object({
  comment_id: z.string().uuid(),
  reason: z.enum([
    "spam", "misinformation", "privacy", "hate_speech",
    "advertising", "copyright", "defamation", "other",
  ]),
  note: z.string().max(500).optional(),
  post_id: z.string().uuid(),
  kind_segment: KindUrlSegmentSchema,
});

export async function createPostComment(input: z.input<typeof CreateCommentSchema>): Promise<{ id: string }> {
  const parsed = CreateCommentSchema.parse(input);
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const safeHtml = sanitizePostHtml(parsed.body_html);
  const bodyText = htmlToText(safeHtml);
  if (bodyText.length < 1 || bodyText.length > 5000) {
    throw new Error("댓글은 1~5000자 사이여야 합니다.");
  }

  const { data, error } = await supabase
    .from("board_post_comments")
    .insert({
      post_id: parsed.post_id,
      user_id: userRes.user.id,
      parent_id: parsed.parent_id ?? null,
      body_text: bodyText,
      body_html: safeHtml,
      image_urls: parsed.image_urls,
      is_anonymized: parsed.is_anonymized,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "댓글 작성 실패");

  revalidatePath(`/board/${parsed.kind_segment}/${parsed.post_id}`);
  return { id: data.id };
}

export async function updatePostComment(input: z.input<typeof UpdateCommentSchema>): Promise<void> {
  const parsed = UpdateCommentSchema.parse(input);
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const safeHtml = sanitizePostHtml(parsed.body_html);
  const bodyText = htmlToText(safeHtml);
  if (bodyText.length < 1 || bodyText.length > 5000) {
    throw new Error("댓글은 1~5000자 사이여야 합니다.");
  }

  const { error, count } = await supabase
    .from("board_post_comments")
    .update({
      body_text: bodyText,
      body_html: safeHtml,
      image_urls: parsed.image_urls,
      is_anonymized: parsed.is_anonymized,
    }, { count: "exact" })
    .eq("id", parsed.id);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("수정 불가 상태이거나 권한이 없습니다.");

  revalidatePath(`/board/${parsed.kind_segment}/${parsed.post_id}`);
}

export async function softDeletePostComment(
  commentId: string,
  postId: string,
  kindSegment: z.infer<typeof KindUrlSegmentSchema>,
): Promise<void> {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const { error, count } = await supabase
    .from("board_post_comments")
    .update({ status: "hidden_by_author" }, { count: "exact" })
    .eq("id", commentId)
    .eq("user_id", userRes.user.id);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("삭제 불가 상태이거나 권한이 없습니다.");

  revalidatePath(`/board/${kindSegment}/${postId}`);
}

export async function reportPostComment(input: z.input<typeof ReportCommentSchema>): Promise<void> {
  const parsed = ReportCommentSchema.parse(input);
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const { error } = await supabase
    .from("board_post_comment_reports")
    .insert({
      comment_id: parsed.comment_id,
      reporter_id: userRes.user.id,
      reason: parsed.reason,
      description: parsed.note ?? null,
    });

  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }

  revalidatePath(`/board/${parsed.kind_segment}/${parsed.post_id}`);
}
