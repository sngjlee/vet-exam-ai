"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  REPORT_REASONS,
  REPORT_REASON_LABEL,
  type ReportReason,
} from "../../lib/comments/reportSchema";
import { COMMENT_MODERATION_COPY } from "../../lib/comments/moderationCopy";

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

  const closeAndReset = useCallback(() => {
    setReason(null);
    setDescription("");
    setError(null);
    setSubmitting(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAndReset();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeAndReset]);

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
        closeAndReset();
        return;
      }
      if (res.status === 409) {
        onAlreadyReported(commentId);
        closeAndReset();
        return;
      }
      if (res.status === 403) {
        setError(COMMENT_MODERATION_COPY.reportOwnCommentError);
      } else if (res.status === 410) {
        setError(COMMENT_MODERATION_COPY.reportUnavailableError);
      } else if (res.status === 422) {
        setError(COMMENT_MODERATION_COPY.reportInvalidError);
      } else {
        setError(COMMENT_MODERATION_COPY.reportFailedError);
      }
    } catch {
      setError(COMMENT_MODERATION_COPY.reportNetworkError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={COMMENT_MODERATION_COPY.reportDialogTitle}
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
      onClick={closeAndReset}
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
          <strong style={{ fontSize: 14, color: "var(--text)" }}>
            {COMMENT_MODERATION_COPY.reportDialogTitle}
          </strong>
          <button
            type="button"
            onClick={closeAndReset}
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
            {COMMENT_MODERATION_COPY.reportIntro}
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
              {COMMENT_MODERATION_COPY.defamationNote}
            </div>
          )}

          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {COMMENT_MODERATION_COPY.reportDescriptionLabel}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={COMMENT_MODERATION_COPY.reportDescriptionPlaceholder}
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
            onClick={closeAndReset}
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
            {submitting
              ? COMMENT_MODERATION_COPY.reportSubmitting
              : COMMENT_MODERATION_COPY.reportSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
