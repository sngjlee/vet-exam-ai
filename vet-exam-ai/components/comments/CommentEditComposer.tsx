"use client";

import { useEffect, useState } from "react";

const MAX = 5000;
const WARN = 4500;

export type EditedCommentRow = {
  id: string;
  body_text: string;
  body_html: string;
  edit_count: number;
  updated_at: string;
  created_at: string;
};

type Props = {
  commentId: string;
  initialText: string;
  onSaved: (row: EditedCommentRow) => void;
  onCancel: () => void;
  onConflict?: () => void;
};

export default function CommentEditComposer({
  commentId,
  initialText,
  onSaved,
  onCancel,
  onConflict,
}: Props) {
  const [text, setText] = useState(initialText);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const len = text.length;
  const overLimit = len > MAX;
  const counterColor =
    overLimit ? "var(--wrong)" : len > WARN ? "var(--blue)" : "var(--text-faint)";
  const dirty = text !== initialText;
  const canSubmit = dirty && len > 0 && !overLimit && !submitting;

  function attemptCancel() {
    if (dirty) {
      const ok = window.confirm("작성 중인 내용이 사라집니다. 취소할까요?");
      if (!ok) return;
    }
    onCancel();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") attemptCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_text: text }),
      });
      if (res.status === 409) {
        if (onConflict) onConflict();
        else setError("이 댓글은 더 이상 수정할 수 없습니다");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "수정 실패. 다시 시도해주세요.");
      }
      const updated = (await res.json()) as EditedCommentRow;
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "수정 실패");
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
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
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
        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          <button
            type="button"
            onClick={attemptCancel}
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
            {submitting ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
