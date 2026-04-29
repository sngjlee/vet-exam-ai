"use client";

import { useState } from "react";
import type { CommentItemData } from "./CommentItem";
import type { EditedCommentRow } from "./CommentEditComposer";

const MAX = 5000;
const WARN = 4500;

type CreateProps = {
  mode?: "create";
  questionId: string;
  parentId: string;
  onSubmitted: (newComment: CommentItemData) => void;
  onCancel: () => void;
};

type EditProps = {
  mode: "edit";
  commentId: string;
  initialText: string;
  onSaved: (row: EditedCommentRow) => void;
  onCancel: () => void;
  onConflict?: () => void;
};

type Props = CreateProps | EditProps;

export default function CommentReplyComposer(props: Props) {
  const isEdit = props.mode === "edit";
  const initialText = isEdit ? props.initialText : "";
  const [body, setBody] = useState(initialText);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const len = body.length;
  const overLimit = len > MAX;
  const counterColor =
    overLimit ? "var(--wrong)" : len > WARN ? "var(--blue)" : "var(--text-faint)";

  const dirty = isEdit ? body !== initialText : len > 0;
  const canSubmit = dirty && len > 0 && !overLimit && !submitting;

  function attemptCancel() {
    if (isEdit && body !== initialText) {
      const ok = window.confirm("작성 중인 내용이 사라집니다. 취소할까요?");
      if (!ok) return;
    }
    props.onCancel();
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        const res = await fetch(`/api/comments/${props.commentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body_text: body }),
        });
        if (res.status === 409) {
          if (props.onConflict) props.onConflict();
          else setError("이 댓글은 더 이상 수정할 수 없습니다");
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "수정 실패. 다시 시도해주세요.");
        }
        const updated = (await res.json()) as EditedCommentRow;
        props.onSaved(updated);
      } else {
        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_id: props.questionId,
            parent_id: props.parentId,
            body_text: body,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "전송 실패. 다시 시도해주세요.");
        }
        const created = await res.json();
        props.onSubmitted({
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isEdit ? "수정 실패" : "전송 실패");
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
        placeholder={isEdit ? "" : "답글을 입력하세요..."}
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
            {submitting ? (isEdit ? "저장 중..." : "전송 중...") : (isEdit ? "저장" : "등록")}
          </button>
        </div>
      </div>
    </div>
  );
}
