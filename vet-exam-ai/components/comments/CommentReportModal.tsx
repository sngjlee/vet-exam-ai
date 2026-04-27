"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  REPORT_REASONS,
  REPORT_REASON_LABEL,
  type ReportReason,
} from "../../lib/comments/reportSchema";

type Props = {
  commentId: string;
  open: boolean;
  onClose: () => void;
  onSubmitted: (commentId: string) => void;
  onAlreadyReported: (commentId: string) => void;
};

export default function CommentReportModal({
  commentId,
  open,
  onClose,
  onSubmitted,
  onAlreadyReported,
}: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason(null);
      setDescription("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const charCount = description.length;
  const overLimit = charCount > 500;
  const canSubmit = reason !== null && !overLimit && !submitting;

  async function handleSubmit() {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/comments/${commentId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          ...(description.length > 0 ? { description } : {}),
        }),
      });
      if (res.status === 201) {
        onSubmitted(commentId);
        onClose();
        return;
      }
      if (res.status === 409) {
        onAlreadyReported(commentId);
        onClose();
        return;
      }
      if (res.status === 403) {
        setError("본인 댓글은 신고할 수 없습니다.");
      } else if (res.status === 410) {
        setError("이미 처리된 댓글입니다.");
      } else if (res.status === 422) {
        setError("입력값이 올바르지 않습니다.");
      } else {
        setError("신고 처리에 실패했습니다. 다시 시도해주세요.");
      }
    } catch {
      setError("네트워크 오류로 신고에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="댓글 신고"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--bg)",
          borderRadius: 12,
          boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <strong style={{ fontSize: 14, color: "var(--text)" }}>댓글 신고</strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-faint)",
              padding: 4,
              display: "inline-flex",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflow: "auto",
          }}
        >
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            신고 사유를 선택해주세요.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {REPORT_REASONS.map((r) => (
              <label
                key={r}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: reason === r ? "var(--surface-raised)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  style={{ marginTop: 2 }}
                />
                <span style={{ fontSize: 13, color: "var(--text)" }}>
                  {REPORT_REASON_LABEL[r]}
                </span>
              </label>
            ))}
          </div>

          {reason === "defamation" && (
            <div
              role="note"
              style={{
                marginTop: 4,
                padding: "10px 12px",
                background: "var(--wrong-dim)",
                border: "1px solid rgba(192,74,58,0.3)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--text)",
                lineHeight: 1.6,
              }}
            >
              이 신고는 정보통신망법 제44조의2에 따른 임시조치 요청입니다.
              30일간 비공개 처리되며, 작성자에게 이의제기 기회가 부여됩니다.
            </div>
          )}

          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
              부가 설명 (선택)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="추가로 알려주실 내용이 있으면 입력해주세요."
              style={{
                width: "100%",
                resize: "vertical",
                padding: "8px 10px",
                fontSize: 13,
                background: "var(--bg)",
                border: `1px solid ${overLimit ? "var(--wrong)" : "var(--border)"}`,
                borderRadius: 8,
                color: "var(--text)",
                fontFamily: "inherit",
              }}
            />
            <div
              style={{
                fontSize: 11,
                color: overLimit ? "var(--wrong)" : "var(--text-faint)",
                textAlign: "right",
              }}
            >
              {charCount} / 500
            </div>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                padding: "8px 10px",
                background: "var(--wrong-dim)",
                border: "1px solid rgba(192,74,58,0.3)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--text)",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text)",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? "var(--wrong)" : "var(--surface-raised)",
              border: "none",
              color: canSubmit ? "#fff" : "var(--text-faint)",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "제출 중..." : "신고하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
