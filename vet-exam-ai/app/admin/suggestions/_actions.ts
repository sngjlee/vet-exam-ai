"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const SuggestionStatus = z.enum(["received", "reviewing", "accepted", "rejected"]);
const Visibility = z.enum(["visible", "hidden_by_author", "blinded_by_report", "removed_by_admin"]);
const CommentStatus = z.enum(["visible", "hidden_by_author", "hidden_by_votes", "blinded_by_report", "removed_by_admin"]);
const Resolution = z.enum(["upheld", "dismissed"]);

const StateSchema = z.object({
  post_id: z.string().uuid(),
  new_status: SuggestionStatus,
  note: z.string().max(2000).optional().nullable(),
});

const PinSchema = z.object({
  post_id: z.string().uuid(),
  pinned: z.boolean(),
});

const VisibilitySchema = z.object({
  post_id: z.string().uuid(),
  visibility: Visibility,
  reason: z.string().max(500).optional().nullable(),
});

const CommentVisibilitySchema = z.object({
  comment_id: z.string().uuid(),
  status: CommentStatus,
  reason: z.string().max(500).optional().nullable(),
});

const ResolveReportSchema = z.object({
  post_id: z.string().uuid(),
  resolution: Resolution,
  note: z.string().max(2000).optional().nullable(),
});
const ResolveCommentReportSchema = z.object({
  comment_id: z.string().uuid(),
  resolution: Resolution,
  note: z.string().max(2000).optional().nullable(),
});

export async function updateSuggestionStateAction(input: z.input<typeof StateSchema>): Promise<void> {
  const parsed = StateSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_suggestion_state", {
    p_post_id: parsed.post_id,
    p_new_status: parsed.new_status,
    p_note: parsed.note ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/suggestions");
  revalidatePath(`/board/suggestions/${parsed.post_id}`);
}

export async function setAnnouncementPinnedAction(input: z.input<typeof PinSchema>): Promise<void> {
  const parsed = PinSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_announcement_pinned", {
    p_post_id: parsed.post_id,
    p_pinned: parsed.pinned,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/board/announcements");
  revalidatePath(`/board/announcements/${parsed.post_id}`);
}

export async function setBoardPostVisibilityAction(input: z.input<typeof VisibilitySchema>): Promise<void> {
  const parsed = VisibilitySchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_board_post_visibility", {
    p_post_id: parsed.post_id,
    p_visibility: parsed.visibility,
    p_reason: parsed.reason ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/suggestions");
  revalidatePath(`/board/suggestions/${parsed.post_id}`);
  revalidatePath(`/board/announcements/${parsed.post_id}`);
}

export async function setBoardPostCommentVisibilityAction(input: z.input<typeof CommentVisibilitySchema>): Promise<void> {
  const parsed = CommentVisibilitySchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_board_post_comment_visibility", {
    p_comment_id: parsed.comment_id,
    p_status: parsed.status,
    p_reason: parsed.reason ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/suggestions");
}

export async function resolveBoardPostReportAction(input: z.input<typeof ResolveReportSchema>): Promise<void> {
  const parsed = ResolveReportSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_board_post_report", {
    p_post_id: parsed.post_id,
    p_resolution: parsed.resolution,
    p_note: parsed.note ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/suggestions");
}

export async function resolveBoardPostCommentReportAction(input: z.input<typeof ResolveCommentReportSchema>): Promise<void> {
  const parsed = ResolveCommentReportSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_board_post_comment_report", {
    p_comment_id: parsed.comment_id,
    p_resolution: parsed.resolution,
    p_note: parsed.note ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/suggestions");
}

// FormData-bound wrappers — module-level (no closures over loop variables).
// Inline closures in <form action> capture iteration variables and fail at
// runtime under RSC serialization (cf. feedback_rsc_inline_fn_trap.md).
export async function updateSuggestionStateFormAction(formData: FormData): Promise<void> {
  await updateSuggestionStateAction({
    post_id: String(formData.get("post_id") ?? ""),
    new_status: String(formData.get("new_status") ?? "") as
      "received" | "reviewing" | "accepted" | "rejected",
  });
}

export async function setBoardPostVisibilityFormAction(formData: FormData): Promise<void> {
  await setBoardPostVisibilityAction({
    post_id: String(formData.get("post_id") ?? ""),
    visibility: String(formData.get("visibility") ?? "") as
      "visible" | "hidden_by_author" | "blinded_by_report" | "removed_by_admin",
  });
}
