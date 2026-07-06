"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, ChevronRight, Flame, Lightbulb, MessageSquare, Search, Trash2, TrendingUp } from "lucide-react";
import {
  COMMENT_TYPE_FILTERS,
  COMMENT_TYPE_META,
  buildCommentsApiPath,
  buildCommentsHref,
  isCommentType,
  normalizeCommentsQuery,
  parseCommentsPage,
  type CommentPreview,
  type CommentsListResponse,
  type CommentsSortMode,
} from "../../lib/comments/list";
import {
  isPopularMemorization,
  POPULAR_MEMORIZATION_THRESHOLD,
} from "../../lib/comments/popularMemorization";

type State = {
  data: CommentsListResponse | null;
  loading: boolean;
  error: string | null;
};

const listCache = new Map<string, CommentsListResponse>();
const STORAGE_PREFIX = "kvle:comments:list:";
const STORAGE_TTL_MS = 2 * 60 * 1000;

export default function CommentsClient({ viewerIsAdmin = false }: { viewerIsAdmin?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const filters = useMemo(() => {
    const sort: CommentsSortMode = searchParams.get("sort") === "popular" ? "popular" : "recent";
    const typeRaw = searchParams.get("type");
    const type = isCommentType(typeRaw) ? typeRaw : null;
    const q = normalizeCommentsQuery(searchParams.get("q"));
    const page = parseCommentsPage(searchParams.get("page"));
    return { sort, type, q, page };
  }, [searchParams]);

  const apiPath = useMemo(() => buildCommentsApiPath(filters), [filters]);
  const cacheKey = apiPath;

  const [state, setState] = useState<State>(() => {
    const cached = readCached(cacheKey);
    return { data: cached, loading: !cached, error: null };
  });

  useEffect(() => {
    const cached = readCached(cacheKey);
    let cancelled = false;
    const controller = new AbortController();

    const pendingStateId = window.setTimeout(() => {
      if (!cancelled) {
        setState({ data: cached, loading: !cached, error: null });
      }
    }, 0);

    fetch(apiPath, { signal: controller.signal })
      .then((res) => {
        if (res.status === 401) {
          router.replace("/auth/login");
          throw new Error("Authentication required");
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CommentsListResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        writeCached(cacheKey, data);
        setState({ data, loading: false, error: null });
        prefetchNextPage(data);
      })
      .catch((err: Error) => {
        if (cancelled || err.name === "AbortError") return;
        setState({ data: cached, loading: false, error: err.message });
      });

    return () => {
      cancelled = true;
      window.clearTimeout(pendingStateId);
      controller.abort();
    };
  }, [apiPath, cacheKey, router]);

  const data = state.data;
  const typeCounts = data?.typeCounts;
  const currentPage = data?.page ?? filters.page;
  const totalPages = data?.totalPages ?? 1;
  const comments = data?.comments ?? [];
  const activeType = data?.type ?? filters.type;
  const activeSort = data?.sort ?? filters.sort;
  const activeQ = data?.q ?? filters.q;

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQ = normalizeCommentsQuery(inputRef.current?.value);
    router.push(buildCommentsHref({ type: activeType, sort: activeSort, q: nextQ, page: 1 }));
  }

  async function handleAdminDelete(commentId: string) {
    if (!viewerIsAdmin) return;
    if (!window.confirm("이 댓글을 운영자 권한으로 삭제할까요?")) return;

    const previous = state.data;
    const next = removeCommentFromList(previous, commentId);
    if (next) {
      writeCached(cacheKey, next);
      setState({ data: next, loading: false, error: null });
    }

    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      if (previous) {
        writeCached(cacheKey, previous);
        setState({ data: previous, loading: false, error: null });
      }
      window.alert("댓글 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <main className="kvle-comments-shell mx-auto max-w-4xl px-6 py-10 space-y-6">
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
          background: "linear-gradient(135deg, rgba(30,167,187,0.10), rgba(255,255,255,0.92))",
          border: "1px solid var(--teal-border)",
          borderRadius: "var(--radius-md)",
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "var(--radius-md)",
              background: "var(--teal-dim)",
              border: "1px solid var(--teal-border)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Lightbulb size={18} style={{ color: "var(--teal)" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: "block", color: "var(--text)", fontSize: 14, marginBottom: 3 }}>
              암기법만 빠르게 보기
            </strong>
            <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.55, margin: 0 }}>
              추천순으로 정렬해 다른 수험생이 실제로 도움 받은 방식부터 봅니다.
            </p>
          </div>
        </div>
        <Link
          href={buildCommentsHref({ type: "memorization", sort: "popular", q: activeQ })}
          className="kvle-btn-primary text-sm"
          style={{ minHeight: 42, padding: "9px 16px", textDecoration: "none" }}
        >
          암기법만 보기
          <span className="kvle-mono" style={{ opacity: 0.75 }}>
            {typeCounts?.memorization ?? "·"}
          </span>
          <ChevronRight size={15} />
        </Link>
      </section>

      <form
        className="kvle-comments-search-form"
        onSubmit={handleSearchSubmit}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 12,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <Search size={17} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
        <input
          key={activeQ}
          ref={inputRef}
          name="q"
          defaultValue={activeQ}
          placeholder="암기법, 질환명, 표현 검색"
          aria-label="댓글 노하우 검색"
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            color: "var(--text)",
            outline: "none",
            fontSize: 14,
          }}
        />
        {activeQ && (
          <Link
            href={buildCommentsHref({ type: activeType, sort: activeSort, q: "" })}
            style={{ color: "var(--text-faint)", fontSize: 12, textDecoration: "none" }}
          >
            지우기
          </Link>
        )}
        <button
          type="submit"
          className="kvle-btn-ghost text-sm"
          style={{ minHeight: 38, padding: "8px 14px" }}
        >
          검색
        </button>
      </form>

      <section
        className="kvle-comments-filter-panel"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <FilterLink
            href={buildCommentsHref({ type: null, sort: activeSort, q: activeQ })}
            active={!activeType}
            count={data?.allCount}
          >
            전체
          </FilterLink>
          {COMMENT_TYPE_FILTERS.map((item) => (
            <FilterLink
              key={item.value}
              href={buildCommentsHref({ type: item.value, sort: activeSort, q: activeQ })}
              active={activeType === item.value}
              count={typeCounts?.[item.value]}
            >
              {item.label}
            </FilterLink>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <FilterLink
            href={buildCommentsHref({ type: activeType, sort: "recent", q: activeQ })}
            active={activeSort === "recent"}
          >
            최근순
          </FilterLink>
          <FilterLink
            href={buildCommentsHref({ type: activeType, sort: "popular", q: activeQ })}
            active={activeSort === "popular"}
          >
            인기순
          </FilterLink>
        </div>
      </section>

      {state.error ? (
        <StatusBox tone="error">댓글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</StatusBox>
      ) : state.loading && !data ? (
        <CommentSkeletonList />
      ) : comments.length === 0 ? (
        <StatusBox>
          {activeQ
            ? "검색 조건에 맞는 댓글이 없습니다. 검색어를 조금 넓혀 보세요."
            : "아직 볼 수 있는 댓글이 없습니다. 문제 상세에서 첫 노하우를 남겨보세요."}
        </StatusBox>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              color: "var(--text-muted)",
              fontSize: 12,
            }}
          >
            <span>
              댓글 <strong style={{ color: "var(--teal)" }}>{data?.total ?? comments.length}</strong>개
              {state.loading && (
                <span style={{ color: "var(--text-faint)", marginLeft: 8 }}>갱신 중</span>
              )}
            </span>
            <span className="kvle-mono">
              {currentPage} / {totalPages}
            </span>
          </div>
          <section className="kvle-comment-preview-list" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {comments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                viewerIsAdmin={viewerIsAdmin}
                onAdminDelete={handleAdminDelete}
              />
            ))}
          </section>
          {totalPages > 1 && (
            <nav
              className="kvle-comments-pager"
              aria-label="댓글 페이지 이동"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <PageLink
                href={buildCommentsHref({
                  type: activeType,
                  sort: activeSort,
                  q: activeQ,
                  page: Math.max(1, currentPage - 1),
                })}
                disabled={currentPage <= 1}
              >
                이전
              </PageLink>
              <span className="kvle-mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {currentPage} / {totalPages}
              </span>
              <PageLink
                href={buildCommentsHref({
                  type: activeType,
                  sort: activeSort,
                  q: activeQ,
                  page: Math.min(totalPages, currentPage + 1),
                })}
                disabled={currentPage >= totalPages}
              >
                다음
              </PageLink>
            </nav>
          )}
        </>
      )}
    </main>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        className="kvle-btn-ghost text-sm"
        aria-disabled="true"
        style={{ minHeight: 44, padding: "10px 16px", opacity: 0.45 }}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="kvle-btn-ghost text-sm"
      style={{ minHeight: 44, padding: "10px 16px", textDecoration: "none" }}
    >
      {children}
    </Link>
  );
}

function FilterLink({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 34,
        padding: "7px 12px",
        borderRadius: "var(--radius-full)",
        fontSize: 12,
        fontWeight: 700,
        textDecoration: "none",
        background: active ? "var(--teal-dim)" : "var(--bg)",
        border: `1px solid ${active ? "var(--teal-border)" : "var(--border)"}`,
        color: active ? "var(--teal)" : "var(--text-muted)",
      }}
    >
      {children}
      {typeof count === "number" && (
        <span
          className="kvle-mono"
          style={{
            color: active ? "var(--teal)" : "var(--text-faint)",
            fontSize: 10,
            opacity: active ? 0.95 : 0.8,
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

function CommentCard({
  comment,
  viewerIsAdmin,
  onAdminDelete,
}: {
  comment: CommentPreview;
  viewerIsAdmin: boolean;
  onAdminDelete: (commentId: string) => void;
}) {
  const meta = COMMENT_TYPE_META[comment.type];
  const questionKey = comment.questionPublicId ?? comment.questionId;
  const detailHref = `/questions/${encodeURIComponent(questionKey)}?comment=${encodeURIComponent(comment.id)}`;

  return (
    <article
      className="kvle-comment-preview-card"
      style={{
        display: "block",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 16,
        color: "inherit",
      }}
    >
      <div className="kvle-comment-preview-header" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span
          style={{
            background: meta.bg,
            color: meta.color,
            borderRadius: "var(--radius-full)",
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {meta.label}
        </span>
        {isPopularMemorization(comment.type, comment.voteScore) && (
          <span
            title={`${POPULAR_MEMORIZATION_THRESHOLD}회 이상 추천받은 암기법`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "#FFF7ED",
              border: "1px solid #FED7AA",
              color: "#C2410C",
              borderRadius: "var(--radius-full)",
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            <Flame size={12} aria-hidden="true" />
            인기 암기법
          </span>
        )}
        <span style={{ color: "var(--text-faint)", fontSize: 11 }}>
          {comment.authorNickname ? `@${comment.authorNickname}` : "익명"} · {formatRelative(comment.createdAt)}
        </span>
        <span
          className="kvle-mono"
          data-comment-preview-question-id
          style={{ marginLeft: "auto", color: "var(--text-faint)", fontSize: 11 }}
        >
          {comment.questionPublicId ?? comment.questionId}
        </span>
        {viewerIsAdmin && (
          <button
            type="button"
            onClick={() => onAdminDelete(comment.id)}
            aria-label="운영자 권한으로 댓글 삭제"
            title="운영자 삭제"
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--radius-full)",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--wrong)",
              cursor: "pointer",
              display: "inline-grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        )}
      </div>

      <Link
        href={detailHref}
        style={{ display: "block", color: "inherit", textDecoration: "none" }}
      >
      <p style={{ color: "var(--text)", fontSize: 14, lineHeight: 1.55, margin: "0 0 12px" }}>
        {truncate(comment.bodyText, 180)}
      </p>

      <div
        className="kvle-comment-preview-footer"
        style={{
          borderTop: "1px solid var(--border)",
          paddingTop: 10,
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
          className="kvle-comment-preview-stats"
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
    </article>
  );
}

function SmallPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        borderRadius: "var(--radius-full)",
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

function StatusBox({
  tone = "default",
  children,
}: {
  tone?: "default" | "error";
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        padding: "32px 20px",
        background: "var(--bg)",
        border: "1px dashed var(--border)",
        borderRadius: "var(--radius-md)",
        color: tone === "error" ? "var(--wrong)" : "var(--text-muted)",
        textAlign: "center",
        fontSize: 14,
      }}
    >
      {children}
    </section>
  );
}

function CommentSkeletonList() {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: 16,
          }}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <SkeletonLine width={56} />
            <SkeletonLine width={120} />
          </div>
          <SkeletonLine width="92%" />
          <div style={{ height: 8 }} />
          <SkeletonLine width="68%" />
          <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <SkeletonLine width="78%" />
          </div>
        </div>
      ))}
    </section>
  );
}

function SkeletonLine({ width }: { width: number | string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width,
        maxWidth: "100%",
        height: 12,
        borderRadius: "var(--radius-full)",
        background: "var(--surface-raised)",
      }}
    />
  );
}

function truncate(value: string, max: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}...`;
}

function removeCommentFromList(
  data: CommentsListResponse | null,
  commentId: string,
): CommentsListResponse | null {
  if (!data) return null;
  const target = data.comments.find((comment) => comment.id === commentId);
  if (!target) return data;

  const nextTotal = Math.max(0, data.total - 1);
  const typeCounts = {
    ...data.typeCounts,
    [target.type]: Math.max(0, (data.typeCounts[target.type] ?? 0) - 1),
  };

  return {
    ...data,
    comments: data.comments.filter((comment) => comment.id !== commentId),
    total: nextTotal,
    allCount: Math.max(0, data.allCount - 1),
    typeCounts,
    totalPages: Math.max(1, Math.ceil(nextTotal / data.pageSize)),
  };
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

function readCached(key: string): CommentsListResponse | null {
  const memory = listCache.get(key);
  if (memory) return memory;
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; data: CommentsListResponse };
    if (Date.now() - parsed.savedAt > STORAGE_TTL_MS) {
      window.sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      return null;
    }
    listCache.set(key, parsed.data);
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCached(key: string, data: CommentsListResponse) {
  listCache.set(key, data);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${STORAGE_PREFIX}${key}`,
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch {
    // Storage quota or private mode: memory cache still covers this tab.
  }
}

function prefetchNextPage(data: CommentsListResponse) {
  if (data.page >= data.totalPages) return;
  const nextPath = buildCommentsApiPath({
    type: data.type,
    sort: data.sort,
    q: data.q,
    page: data.page + 1,
  });
  if (readCached(nextPath)) return;

  fetch(nextPath)
    .then((res) => (res.ok ? (res.json() as Promise<CommentsListResponse>) : null))
    .then((nextData) => {
      if (nextData) writeCached(nextPath, nextData);
    })
    .catch(() => {
      // Best-effort prefetch only.
    });
}
