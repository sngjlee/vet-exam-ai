"use client";

import Link from "next/link";
import { useState } from "react";
import type { Database } from "../../../lib/supabase/types";

type CommentType = Database["public"]["Enums"]["comment_type"];

type CommentRow = {
  id: string;
  question_id: string;
  question_stem_preview: string;
  body_text_preview: string;
  vote_score: number;
  type: CommentType;
  created_at: string;
};

type Props = {
  userId: string;
  initialComments: CommentRow[];
  initialHasMore: boolean;
};

const TYPE_LABEL: Record<CommentType, string> = {
  memorization: "💡 암기법",
  correction: "⚠ 정정",
  explanation: "📘 추가설명",
  question: "❓ 질문",
  discussion: "💬 토론",
};

export default function ProfileCommentList({
  userId,
  initialComments,
  initialHasMore,
}: Props) {
  const [comments, setComments] = useState<CommentRow[]>(initialComments);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const offset = comments.length;
      const res = await fetch(
        `/api/profile/${encodeURIComponent(userId)}/comments?offset=${offset}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { comments: CommentRow[]; has_more: boolean };
      setComments((prev) => [...prev, ...data.comments]);
      setHasMore(data.has_more);
    } catch (e) {
      setError("댓글을 불러오지 못했습니다.");
      console.error("[ProfileCommentList]", e);
    } finally {
      setLoading(false);
    }
  }

  if (comments.length === 0) {
    return (
      <section>
        <h2
          className="mb-4 font-bold"
          style={{ fontFamily: "var(--font-serif)", color: "var(--text)", fontSize: 22 }}
        >
          작성한 댓글
        </h2>
        <div
          style={{
            padding: "20px 16px",
            textAlign: "center",
            color: "var(--text-faint)",
            fontSize: 13,
            border: "1px dashed var(--border)",
            borderRadius: 10,
          }}
        >
          아직 작성한 댓글이 없습니다.
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2
        className="mb-4 font-bold"
        style={{ fontFamily: "var(--font-serif)", color: "var(--text)", fontSize: 22 }}
      >
        작성한 댓글
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {comments.map((c) => (
          <Link
            key={c.id}
            href={`/questions/${c.question_id}#comment-${c.id}`}
            style={{
              display: "block",
              padding: "12px 14px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--surface)",
              textDecoration: "none",
              color: "var(--text)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              <span>{TYPE_LABEL[c.type]}</span>
              <span>·</span>
              <span>추천 {c.vote_score}</span>
              <span>·</span>
              <span>{new Date(c.created_at).toLocaleDateString("ko-KR")}</span>
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: 4,
              }}
            >
              {c.question_stem_preview}
              {c.question_stem_preview.length === 80 ? "…" : ""}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {c.body_text_preview}
              {c.body_text_preview.length === 120 ? "…" : ""}
            </div>
          </Link>
        ))}
      </div>
      {error && (
        <div style={{ color: "var(--wrong)", fontSize: 12, marginTop: 8 }}>{error}</div>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "10px",
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            color: "var(--text-muted)",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "불러오는 중…" : "더 보기 ▾"}
        </button>
      )}
    </section>
  );
}
