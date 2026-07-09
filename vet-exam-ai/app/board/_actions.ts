"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sanitizePostHtml, htmlToText } from "@/lib/board/sanitize";

const KindSchema = z.enum(["suggestion", "announcement"]);

const CreateSchema = z.object({
  kind: KindSchema,
  title: z.string().trim().min(1).max(200),
  body_html: z.string().min(1).max(80_000), // pre-sanitize generous; post-sanitize enforces 20k
  image_urls: z.array(z.string().min(1)).max(5).default([]),
  is_anonymized: z.boolean().default(false),
});

const UpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  body_html: z.string().min(1).max(80_000),
  image_urls: z.array(z.string().min(1)).max(5).default([]),
  is_anonymized: z.boolean().default(false),
});

export async function createPost(input: z.input<typeof CreateSchema>): Promise<{ id: string }> {
  const parsed = CreateSchema.parse(input);
  const supabase = await createClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    redirect("/auth/login?next=/board");
  }

  const safeHtml = sanitizePostHtml(parsed.body_html);
  const bodyText = htmlToText(safeHtml);
  if (bodyText.length < 1 || bodyText.length > 20_000) {
    throw new Error("본문은 1~20000자 사이여야 합니다.");
  }

  // announcement는 익명 강제 false; suggestion만 사용자 선택 반영
  const isAnon = parsed.kind === "suggestion" ? parsed.is_anonymized : false;

  const { data, error } = await supabase
    .from("board_posts")
    .insert({
      kind: parsed.kind,
      user_id: userRes.user.id,
      title: parsed.title,
      body_text: bodyText,
      body_html: safeHtml,
      image_urls: parsed.image_urls,
      is_anonymized: isAnon,
      suggestion_status: parsed.kind === "suggestion" ? "received" : null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "글 작성 실패");
  }

  revalidatePath(`/board/${parsed.kind}s`);
  return { id: data.id };
}

export async function updatePost(input: z.input<typeof UpdateSchema>): Promise<void> {
  const parsed = UpdateSchema.parse(input);
  const supabase = await createClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    redirect("/auth/login");
  }

  const safeHtml = sanitizePostHtml(parsed.body_html);
  const bodyText = htmlToText(safeHtml);
  if (bodyText.length < 1 || bodyText.length > 20_000) {
    throw new Error("본문은 1~20000자 사이여야 합니다.");
  }

  // RLS가 visibility/status 잠금 처리. 위반 시 supabase가 0 row 반환.
  const { error, count } = await supabase
    .from("board_posts")
    .update({
      title: parsed.title,
      body_text: bodyText,
      body_html: safeHtml,
      image_urls: parsed.image_urls,
      is_anonymized: parsed.is_anonymized,
    }, { count: "exact" })
    .eq("id", parsed.id);

  if (error) throw new Error(error.message);
  if (!count) {
    throw new Error("수정 불가 상태이거나 권한이 없습니다.");
  }

  // 어떤 kind인지 모르므로 두 경로 모두 invalidate
  revalidatePath(`/board/suggestions/${parsed.id}`);
  revalidatePath(`/board/announcements/${parsed.id}`);
}

const KindSegmentSchema = z.enum(["suggestions", "announcements"]);

export async function softDeletePost(
  id: string,
  kindSegment: z.infer<typeof KindSegmentSchema>,
): Promise<void> {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    redirect("/auth/login");
  }

  const { error, count } = await supabase
    .from("board_posts")
    .update({ visibility: "hidden_by_author" }, { count: "exact" })
    .eq("id", id)
    .eq("user_id", userRes.user.id);

  if (error) throw new Error(error.message);
  if (!count) throw new Error("삭제 불가 상태이거나 권한이 없습니다.");

  revalidatePath("/board/suggestions");
  revalidatePath("/board/announcements");
  redirect(`/board/${kindSegment}`);
}

// FormData-bound wrapper for <form action> usage. Server Component <form>
// elements can't capture closure variables reliably under RSC, so we go
// through a stable module-level action with hidden inputs.
export async function softDeletePostFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const kindSegment = KindSegmentSchema.parse(formData.get("kind_segment"));
  await softDeletePost(id, kindSegment);
}

const REPORT_REASONS = [
  "spam", "misinformation", "privacy", "hate_speech",
  "advertising", "copyright", "defamation", "other",
] as const;
const ReportSchema = z.object({
  post_id: z.string().uuid(),
  reason: z.enum(REPORT_REASONS),
  note: z.string().max(500).optional(),
});

export async function toggleUpvote(postId: string): Promise<{ upvoted: boolean }> {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const userId = userRes.user.id;

  // 현재 상태 확인
  const { data: existing } = await supabase
    .from("board_post_upvotes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("board_post_upvotes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    revalidatePath(`/board/suggestions/${postId}`);
    revalidatePath(`/board/announcements/${postId}`);
    return { upvoted: false };
  }

  const { error } = await supabase
    .from("board_post_upvotes")
    .insert({ post_id: postId, user_id: userId });
  // A concurrent tap may have inserted the same (post_id, user_id) first — the
  // unique PK makes that a 23505. The end state is "upvoted", so treat it as
  // success (same idempotent handling as reportPost below).
  if (error && error.code !== "23505") throw new Error(error.message);

  revalidatePath(`/board/suggestions/${postId}`);
  revalidatePath(`/board/announcements/${postId}`);
  return { upvoted: true };
}

export async function reportPost(input: z.input<typeof ReportSchema>): Promise<void> {
  const parsed = ReportSchema.parse(input);
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const { error } = await supabase
    .from("board_post_reports")
    .insert({
      post_id: parsed.post_id,
      reporter_id: userRes.user.id,
      reason: parsed.reason,
      description: parsed.note ?? null,
    });

  // unique (post_id, reporter_id) 충돌은 멱등 처리
  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }

  revalidatePath(`/board/suggestions/${parsed.post_id}`);
  revalidatePath(`/board/announcements/${parsed.post_id}`);
}
