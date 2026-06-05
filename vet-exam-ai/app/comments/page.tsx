import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, ChevronRight, MessageSquare, TrendingUp } from "lucide-react";
import { createClient } from "../../lib/supabase/server";
import type { CommentType } from "../../lib/comments/schema";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SortMode = "recent" | "popular";

type CommentPreview = {
  id: string;
  questionId: string;
  userId: string | null;
  type: CommentType;
  bodyText: string;
  voteScore: number;
  replyCount: number;
  createdAt: string;
  questionPublicId: string | null;
  questionPreview: string;
  category: string;
  topic: string | null;
  authorNickname: string | null;
};

const TYPE_META: Record<CommentType, { label: string; color: string; bg: string }> = {
  memorization: { label: "암기법", color: "#B45309", bg: "#FEF3C7" },
  correction: { label: "정정", color: "#9F1239", bg: "#FFE4E6" },
  explanation: { label: "추가설명", color: "#075985", bg: "#E0F2FE" },
  question: { label: "질문", color: "#5B21B6", bg: "#EDE9FE" },
  discussion: { label: "토론", color: "#334155", bg: "#E2E8F0" },
};

const TYPE_FILTERS: Array<{ value: "all" | CommentType; label: string }> = [
  { value: "all", label: "전체" },
  { value: "memorization", label: "암기법" },
  { value: "correction", label: "정정" },
  { value: "explanation", label: "추가설명" },
  { value: "question", label: "질문" },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isCommentType(value: string | undefined): value is CommentType {
  return Boolean(value && value in TYPE_META);
}

function truncate(value: string, max: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}...`;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export default async function CommentsPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const sort: SortMode = firstParam(params.sort) === "popular" ? "popular" : "recent";
  const typeRaw = firstParam(params.type);
  const type = isCommentType(typeRaw) ? typeRaw : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  let query = supabase
    .from("comments")
    .select("id, question_id, user_id, type, body_text, vote_score, reply_count, created_at")
    .eq("status", "visible")
    .is("parent_id", null)
    .limit(40);

  if (type) {
    query = query.eq("type", type);
  }
  query =
    sort === "popular"
      ? query.order("vote_score", { ascending: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });

  const { data: commentRows, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const rows = commentRows ?? [];
  const questionIds = Array.from(new Set(rows.map((row) => row.question_id)));
  const userIds = Array.from(
    new Set(rows.map((row) => row.user_id).filter((value): value is string => Boolean(value))),
  );

  const [questionsRes, profilesRes] = await Promise.all([
    questionIds.length > 0
      ? supabase
          .from("questions")
          .select("id, public_id, question, category, topic")
          .in("id", questionIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? supabase
          .from("user_profiles_public")
          .select("user_id, nickname")
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (questionsRes.error) throw new Error(questionsRes.error.message);
  if (profilesRes.error) throw new Error(profilesRes.error.message);

  const questionById = new Map((questionsRes.data ?? []).map((question) => [question.id, question]));
  const nicknameByUserId = new Map(
    (profilesRes.data ?? []).map((profile) => [profile.user_id, profile.nickname]),
  );

  const comments: CommentPreview[] = rows.map((row) => {
    const question = questionById.get(row.question_id);
    return {
      id: row.id,
      questionId: row.question_id,
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

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <header>
        <span className="kvle-label">댓글 노하우</span>
        <h1
          style={{
            color: "var(--text)",
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(24px, 4vw, 32px)",
            fontWeight: 800,
            lineHeight: 1.2,
            margin: "8px 0 6px",
          }}
        >
          수험생들이 남긴 암기법과 정정 제안
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          문제별 댓글을 한곳에서 훑고, 필요한 항목은 바로 해설 상세로 이동하세요.
        </p>
      </header>

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <FilterLink href="/comments" active={!type}>
            전체
          </FilterLink>
          {TYPE_FILTERS.slice(1).map((item) => (
            <FilterLink
              key={item.value}
              href={`/comments?type=${item.value}${sort === "popular" ? "&sort=popular" : ""}`}
              active={type === item.value}
            >
              {item.label}
            </FilterLink>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <FilterLink
            href={`/comments${type ? `?type=${type}` : ""}`}
            active={sort === "recent"}
          >
            최근순
          </FilterLink>
          <FilterLink
            href={`/comments?${type ? `type=${type}&` : ""}sort=popular`}
            active={sort === "popular"}
          >
            인기순
          </FilterLink>
        </div>
      </section>

      {comments.length === 0 ? (
        <section
          style={{
            padding: "32px 20px",
            background: "var(--bg)",
            border: "1px dashed var(--border)",
            borderRadius: 12,
            color: "var(--text-muted)",
            textAlign: "center",
            fontSize: 14,
          }}
        >
          아직 볼 수 있는 댓글이 없습니다. 문제 상세에서 첫 노하우를 남겨보세요.
        </section>
      ) : (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {comments.map((comment) => (
            <CommentCard key={comment.id} comment={comment} />
          ))}
        </section>
      )}
    </main>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 34,
        padding: "7px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        textDecoration: "none",
        background: active ? "var(--teal-dim)" : "var(--bg)",
        border: `1px solid ${active ? "var(--teal-border)" : "var(--border)"}`,
        color: active ? "var(--teal)" : "var(--text-muted)",
      }}
    >
      {children}
    </Link>
  );
}

function CommentCard({ comment }: { comment: CommentPreview }) {
  const meta = TYPE_META[comment.type];
  const questionKey = comment.questionPublicId ?? comment.questionId;
  const detailHref = `/questions/${encodeURIComponent(questionKey)}?comment=${encodeURIComponent(comment.id)}`;

  return (
    <Link
      href={detailHref}
      style={{
        display: "block",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span
          style={{
            background: meta.bg,
            color: meta.color,
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {meta.label}
        </span>
        <span style={{ color: "var(--text-faint)", fontSize: 11 }}>
          {comment.authorNickname ? `@${comment.authorNickname}` : "익명"} · {formatRelative(comment.createdAt)}
        </span>
        <span
          className="kvle-mono"
          style={{ marginLeft: "auto", color: "var(--text-faint)", fontSize: 11 }}
        >
          {comment.questionPublicId ?? comment.questionId}
        </span>
      </div>

      <p style={{ color: "var(--text)", fontSize: 14, lineHeight: 1.55, margin: "0 0 12px" }}>
        {truncate(comment.bodyText, 180)}
      </p>

      <div
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "10px 12px",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <BookOpen size={15} style={{ color: "var(--teal)", marginTop: 2, flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
            <SmallPill>{comment.category}</SmallPill>
            {comment.topic && <SmallPill>{comment.topic}</SmallPill>}
          </div>
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: 12,
              lineHeight: 1.45,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {comment.questionPreview}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--text-faint)",
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          <TrendingUp size={13} />
          <span>{comment.voteScore}</span>
          <MessageSquare size={13} />
          <span>{comment.replyCount}</span>
          <ChevronRight size={15} />
        </div>
      </div>
    </Link>
  );
}

function SmallPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "var(--surface-raised)",
        color: "var(--text-muted)",
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 7px",
      }}
    >
      {children}
    </span>
  );
}
