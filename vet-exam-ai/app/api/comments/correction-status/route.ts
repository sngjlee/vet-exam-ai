import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";
import {
  CORRECTION_REVIEW_PRIORITY,
  isCorrectionReviewStatus,
  type CommentCorrectionReview,
  type CommentCorrectionReviewResponse,
} from "../../../../lib/comments/correctionReview";

type CorrectionRow = {
  proposed_by: string | null;
  proposed_change: Record<string, unknown> | null;
  status: string;
  resolved_at: string | null;
};

export async function GET(req: NextRequest) {
  const questionId = new URL(req.url).searchParams.get("question_id")?.trim();
  if (!questionId) {
    return NextResponse.json({ error: "Missing question_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("question_corrections")
    .select("proposed_by, proposed_change, status, resolved_at")
    .eq("question_id", questionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byCommentId: CommentCorrectionReviewResponse["byCommentId"] = {};
  const byUserId: CommentCorrectionReviewResponse["byUserId"] = {};

  for (const row of (data ?? []) as CorrectionRow[]) {
    if (!row.proposed_by || !isCorrectionReviewStatus(row.status)) continue;

    const isPublicStatus = row.status === "accepted";
    const isOwnStatus = row.proposed_by === user.id;
    if (!isPublicStatus && !isOwnStatus) continue;

    const review: CommentCorrectionReview = {
      status: row.status,
      resolvedAt: row.resolved_at,
    };

    assignIfHigherPriority(byUserId, row.proposed_by, review);

    const commentId = readCommentId(row.proposed_change);
    if (commentId) {
      assignIfHigherPriority(byCommentId, commentId, review);
    }
  }

  const body: CommentCorrectionReviewResponse = { byCommentId, byUserId };
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
    },
  });
}

function assignIfHigherPriority(
  target: Record<string, CommentCorrectionReview>,
  key: string,
  review: CommentCorrectionReview,
) {
  const existing = target[key];
  if (
    !existing ||
    CORRECTION_REVIEW_PRIORITY[review.status] > CORRECTION_REVIEW_PRIORITY[existing.status]
  ) {
    target[key] = review;
  }
}

function readCommentId(value: Record<string, unknown> | null): string | null {
  const raw = value?.comment_id ?? value?.commentId;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}
