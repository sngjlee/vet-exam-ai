"use client";

import { useState } from "react";
import { COMMENT_TYPES, type CommentType } from "../../lib/comments/schema";
import type { CommentItemData } from "./CommentItem";

const TYPE_LABEL: Record<CommentType, string> = {
  memorization: "💡 암기법",
  correction: "⚠ 정정",
  explanation: "📘 추가설명",
  question: "❓ 질문",
  discussion: "💬 토론",
};

const MAX = 5000;
const WARN = 4500;

type Props = {
  questionId: string;
  onSubmitted: (newComment: CommentItemData) => void;
};

export default function CommentComposer({ questionId, onSubmitted }: Props) {
  const [type, setType] = useState<CommentType | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const len = body.length;
  const overLimit = len > MAX;
  const counterColor =
    overLimit ? "var(--wrong)" : len > WARN ? "var(--blue)" : "var(--text-faint)";

  const canSubmit = !!type && len > 0 && !overLimit && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !type) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: questionId, type, body_text: body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "전송 실패. 다시 시도해주세요.");
      }
      const created = await res.json();
      onSubmitted({
        id: created.id,
        user_id: created.user_id,
        type: created.type,
        body_text: created.body_text,
        body_html: created.body_html,
        created_at: created.created_at,
        edit_count: created.edit_count ?? 0,
        authorNickname: null,
      });
      setBody("");
      setType(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "전송 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "12px 14px",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {COMMENT_TYPES.map((t) => {
          const active = type === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              style={{
                background: active ? "var(--teal-dim)" : "transparent",
                border: `1px solid ${active ? "var(--teal-border)" : "var(--border)"}`,
                color: active ? "var(--text)" : "var(--text-muted)",
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="이 문제에 대한 의견을 남겨주세요..."
        rows={4}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 13,
          fontFamily: "inherit",
          color: "var(--text)",
          resize: "vertical",
          minHeight: 80,
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 11, color: counterColor, fontFamily: "var(--font-mono)" }}>
          {len} / {MAX}자
        </span>
        {error && (
          <span style={{ fontSize: 11, color: "var(--wrong)" }} role="alert">
            {error}
          </span>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            marginLeft: "auto",
            background: canSubmit ? "var(--teal)" : "var(--surface-raised)",
            color: canSubmit ? "#061218" : "var(--text-faint)",
            border: "none",
            padding: "6px 16px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "전송 중..." : "등록"}
        </button>
      </div>
    </div>
  );
}
