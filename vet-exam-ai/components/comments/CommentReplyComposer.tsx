"use client";

import { useState } from "react";
import type { CommentItemData } from "./CommentItem";

const MAX = 5000;
const WARN = 4500;

type Props = {
  questionId: string;
  parentId: string;
  onSubmitted: (newComment: CommentItemData) => void;
  onCancel: () => void;
};

export default function CommentReplyComposer({
  questionId,
  parentId,
  onSubmitted,
  onCancel,
}: Props) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const len = body.length;
  const overLimit = len > MAX;
  const counterColor =
    overLimit ? "var(--wrong)" : len > WARN ? "var(--blue)" : "var(--text-faint)";

  const canSubmit = len > 0 && !overLimit && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: questionId,
          parent_id: parentId,
          body_text: body,
        }),
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
        body_html: created.body_html,
        created_at: created.created_at,
        authorNickname: null,
      });
      setBody("");
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
        padding: "10px 12px",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="답글을 입력하세요..."
        rows={3}
        autoFocus
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 13,
          fontFamily: "inherit",
          color: "var(--text)",
          resize: "vertical",
          minHeight: 60,
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
        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
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
    </div>
  );
}
