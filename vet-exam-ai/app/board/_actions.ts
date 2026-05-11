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

export async function softDeletePost(id: string): Promise<void> {
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
}
