import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "../../../../lib/auth/requireUser";
import { EditCommentSchema } from "../../../../lib/comments/schema";
import { renderCommentMarkdown } from "../../../../lib/comments/sanitize";
import { findInvalidImageUrl } from "../../../../lib/comments/imageUrlValidate";
import { getCommentImagePrefix } from "../../../../lib/comments/imageStoragePrefix";
import { logAdminAction } from "../../../../lib/admin/audit";
import { jsonError, ApiError } from "../../../../lib/api/errors";
import { logError } from "../../../../lib/utils/logging";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return jsonError(ApiError.MissingParam, 400);
  }

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { data: existing, error: selectErr } = await supabase
    .from("comments")
    .select("id, user_id, question_id, type, body_text, status")
    .eq("id", id)
    .maybeSingle();

  if (selectErr) {
    logError("[comments/[id]] DELETE select failed", selectErr);
    return jsonError(ApiError.Internal, 500);
  }
  if (!existing) {
    return jsonError(ApiError.NotFound, 404);
  }
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    logError("[comments/[id]] DELETE profile lookup failed", profileErr);
    return jsonError(ApiError.Internal, 500);
  }

  const isOwner = existing.user_id === user.id;
  const isAdmin = profile?.role === "admin" && profile.is_active === true;
  if (!isOwner && !isAdmin) {
    return jsonError(ApiError.Forbidden, 403);
  }

  const nextStatus = !isOwner && isAdmin ? "removed_by_admin" : "hidden_by_author";
  const { error: updateErr } = await supabase
    .from("comments")
    .update({ status: nextStatus })
    .eq("id", id);

  if (updateErr) {
    logError("[comments/[id]] DELETE update failed", updateErr);
    return jsonError(ApiError.Internal, 500);
  }

  if (nextStatus === "removed_by_admin") {
    await logAdminAction({
      action: "comment_remove",
      targetType: "comment",
      targetId: id,
      before: {
        status: existing.status,
        question_id: existing.question_id,
        type: existing.type,
        user_id: existing.user_id,
      },
      after: { status: nextStatus },
      note: "Removed from comments list",
    });
  }

  return new NextResponse(null, { status: 204 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return jsonError(ApiError.MissingParam, 400);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError(ApiError.InvalidJson, 400);
  }

  const parsed = EditCommentSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(ApiError.ValidationFailed, 422, { issues: parsed.error.issues });
  }
  const { body_text, image_urls } = parsed.data;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  if (image_urls !== undefined && image_urls.length > 0) {
    // Owner segment = profiles.comment_image_prefix (opaque), not auth.uid().
    const ownerPrefix = await getCommentImagePrefix(supabase, user.id);
    if (!ownerPrefix) {
      return jsonError("invalid_image_url", 400, { detail: "owner_prefix_unavailable" });
    }
    const invalidUrl = findInvalidImageUrl(image_urls, ownerPrefix);
    if (invalidUrl) {
      return jsonError("invalid_image_url", 400, { detail: invalidUrl });
    }
  }

  const { data: existing, error: selectErr } = await supabase
    .from("comments")
    .select(
      "id, user_id, status, body_text, body_html, image_urls, created_at, updated_at, edit_count"
    )
    .eq("id", id)
    .maybeSingle();

  if (selectErr) {
    logError("[comments/[id]] PATCH select failed", selectErr);
    return jsonError(ApiError.Internal, 500);
  }
  if (!existing) {
    return jsonError(ApiError.NotFound, 404);
  }
  if (existing.user_id !== user.id) {
    return jsonError(ApiError.Forbidden, 403);
  }
  if (existing.status !== "visible") {
    return jsonError(ApiError.Conflict, 409);
  }

  const nextBodyText = body_text !== undefined ? body_text : existing.body_text;
  const nextImageUrls =
    image_urls !== undefined ? image_urls : existing.image_urls ?? [];

  if (nextBodyText.length === 0 && nextImageUrls.length === 0) {
    return jsonError(ApiError.ValidationFailed, 422);
  }

  const textChanged = body_text !== undefined && body_text !== existing.body_text;
  const imagesChanged =
    image_urls !== undefined && !arraysEqual(image_urls, existing.image_urls ?? []);

  if (!textChanged && !imagesChanged) {
    return NextResponse.json(
      {
        id: existing.id,
        body_text: existing.body_text,
        body_html: existing.body_html,
        image_urls: existing.image_urls ?? [],
        edit_count: existing.edit_count,
        updated_at: existing.updated_at,
        created_at: existing.created_at,
      },
      { status: 200 }
    );
  }

  const updatePayload: {
    body_text?: string;
    body_html?: string;
    image_urls?: string[];
  } = {};
  if (textChanged) {
    updatePayload.body_text = body_text!;
    updatePayload.body_html = renderCommentMarkdown(body_text!);
  }
  if (imagesChanged) {
    updatePayload.image_urls = image_urls!;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("comments")
    .update(updatePayload)
    .eq("id", id)
    .select(
      "id, body_text, body_html, image_urls, edit_count, updated_at, created_at"
    )
    .single();

  if (updateErr) {
    logError("[comments/[id]] PATCH update failed", updateErr);
    return jsonError(ApiError.Internal, 500);
  }

  return NextResponse.json(updated, { status: 200 });
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
