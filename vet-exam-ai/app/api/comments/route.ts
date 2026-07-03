import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { CreateCommentSchema } from "../../../lib/comments/schema";
import { renderCommentMarkdown } from "../../../lib/comments/sanitize";
import { findInvalidImageUrl } from "../../../lib/comments/imageUrlValidate";
import { captureOperationalError, classifySupabaseFailure } from "../../../lib/utils/logging";
import {
  COMMENT_TYPE_FILTERS,
  COMMENTS_PAGE_SIZE,
  emptyCommentsTypeCounts,
  isCommentType,
  normalizeCommentsQuery,
  parseCommentsPage,
  type CommentPreview,
  type CommentsListResponse,
  type CommentsSortMode,
} from "../../../lib/comments/list";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sort: CommentsSortMode = url.searchParams.get("sort") === "popular" ? "popular" : "recent";
  const typeRaw = url.searchParams.get("type");
  const type = isCommentType(typeRaw) ? typeRaw : null;
  const q = normalizeCommentsQuery(url.searchParams.get("q"));
  const searchable = q.length >= 2;
  const page = parseCommentsPage(url.searchParams.get("page"));
  const from = (page - 1) * COMMENTS_PAGE_SIZE;
  const to = from + COMMENTS_PAGE_SIZE - 1;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let query = supabase
    .from("comments")
    .select("id, question_public_id, user_id, type, body_text, vote_score, reply_count, created_at", {
      count: "exact",
    })
    .eq("status", "visible")
    .is("parent_id", null);

  if (type) {
    query = query.eq("type", type);
  }
  if (searchable) {
    query = query.ilike("body_text", `%${q}%`);
  }
  query =
    sort === "popular"
      ? query.order("vote_score", { ascending: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });
  query = query.range(from, to);

  const makeCountQuery = (countType: typeof type) => {
    let countQuery = supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("status", "visible")
      .is("parent_id", null);
    if (countType) {
      countQuery = countQuery.eq("type", countType);
    }
    if (searchable) {
      countQuery = countQuery.ilike("body_text", `%${q}%`);
    }
    return countQuery;
  };

  const [commentsRes, allCountRes, ...typeCountResults] = await Promise.all([
    query,
    makeCountQuery(null),
    ...COMMENT_TYPE_FILTERS.map((item) => makeCountQuery(item.value)),
  ]);

  const { data: commentRows, error, count } = commentsRes;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (allCountRes.error) {
    return NextResponse.json({ error: allCountRes.error.message }, { status: 500 });
  }
  for (const result of typeCountResults) {
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
  }

  const rows = commentRows ?? [];
  const total = count ?? 0;
  const allCount = allCountRes.count ?? 0;
  const typeCounts = emptyCommentsTypeCounts();
  COMMENT_TYPE_FILTERS.forEach((item, index) => {
    typeCounts[item.value] = typeCountResults[index]?.count ?? 0;
  });
  const totalPages = Math.max(1, Math.ceil(total / COMMENTS_PAGE_SIZE));
  const questionIds = Array.from(
    new Set(rows.map((row) => row.question_public_id).filter((v): v is string => Boolean(v))),
  );
  const userIds = Array.from(
    new Set(rows.map((row) => row.user_id).filter((value): value is string => Boolean(value))),
  );

  const [questionsRes, profilesRes] = await Promise.all([
    questionIds.length > 0
      ? supabase
          .from("questions")
          .select("id, public_id, question, category, topic")
          .in("public_id", questionIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? supabase
          .from("user_profiles_public")
          .select("user_id, nickname")
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (questionsRes.error) {
    return NextResponse.json({ error: questionsRes.error.message }, { status: 500 });
  }
  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  }

  const questionById = new Map(
    (questionsRes.data ?? []).map((question) => [question.public_id ?? question.id, question]),
  );
  const nicknameByUserId = new Map(
    (profilesRes.data ?? []).map((profile) => [profile.user_id, profile.nickname]),
  );

  const comments: CommentPreview[] = rows.map((row) => {
    const question = questionById.get(row.question_public_id ?? "");
    return {
      id: row.id,
      questionId: row.question_public_id ?? "",
      userId: row.user_id,
      type: row.type,
      bodyText: row.body_text,
      voteScore: row.vote_score ?? 0,
      replyCount: row.reply_count ?? 0,
      createdAt: row.created_at,
      questionPublicId: question?.public_id ?? null,
      questionPreview: question?.question ?? "문제 정보를 불러올 수 없습니다.",
      category: question?.category ?? "기타",
      topic: question?.topic ?? null,
      authorNickname: row.user_id ? nicknameByUserId.get(row.user_id) ?? null : null,
    };
  });

  const body: CommentsListResponse = {
    comments,
    total,
    allCount,
    typeCounts,
    page,
    pageSize: COMMENTS_PAGE_SIZE,
    totalPages,
    sort,
    type,
    q,
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
    },
  });
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateCommentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { question_id, parent_id, type, body_text, image_urls } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const invalidUrl = findInvalidImageUrl(image_urls, user.id);
  if (invalidUrl) {
    return NextResponse.json(
      { error: "invalid_image_url", detail: invalidUrl },
      { status: 400 }
    );
  }

  // Reply branch: validate parent + force type
  let effectiveType = type as
    | "memorization"
    | "correction"
    | "explanation"
    | "question"
    | "discussion"
    | undefined;
  let effectiveParentId: string | null = null;

  if (parent_id) {
    const { data: parent, error: parentErr } = await supabase
      .from("comments")
      .select("id, question_public_id, parent_id, status")
      .eq("id", parent_id)
      .maybeSingle();

    if (parentErr) {
      return NextResponse.json({ error: parentErr.message }, { status: 500 });
    }
    if (!parent || parent.status !== "visible") {
      return NextResponse.json(
        { error: "Parent comment not found" },
        { status: 404 }
      );
    }
    if (parent.question_public_id !== question_id) {
      return NextResponse.json(
        { error: "Parent belongs to another question" },
        { status: 400 }
      );
    }
    if (parent.parent_id !== null) {
      return NextResponse.json(
        { error: "Cannot reply to a reply (depth limit 1)" },
        { status: 400 }
      );
    }
    effectiveType = "discussion"; // force — request type ignored for replies
    effectiveParentId = parent_id;
  } else {
    // Root branch — refine guarantees `type` is present here
    if (!effectiveType) {
      return NextResponse.json(
        { error: "type is required for root comments" },
        { status: 400 }
      );
    }
  }

  const body_html = renderCommentMarkdown(body_text);

  const { data, error } = await supabase
    .from("comments")
    .insert({
      // B1: `question_id` from the request is now the KVLE public id.
      question_public_id: question_id,
      user_id: user.id,
      parent_id: effectiveParentId,
      type: effectiveType,
      body_text,
      body_html,
      image_urls,
    })
    .select(
      "id, question_public_id, user_id, parent_id, type, body_text, body_html, image_urls, status, created_at, updated_at, edit_count"
    )
    .single();

  if (error) {
    const failureKind = classifySupabaseFailure(error);
    captureOperationalError(error, {
      area: failureKind === "rls_denied" ? "rls" : "supabase",
      operation: "create_comment",
      failureKind,
      level: failureKind === "rls_denied" ? "error" : "warning",
      tags: { comment_type: effectiveType },
      context: { has_parent: Boolean(effectiveParentId), image_count: image_urls.length },
    });

    // Postgres CHECK violations → 422; depth trigger raise → 409; else 500
    if (error.code === "23514") {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (
      error.message?.includes("Comments cannot be nested beyond 1 level") ||
      error.code === "P0001"
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
