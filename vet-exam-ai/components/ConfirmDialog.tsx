// components/ConfirmDialog.tsx
"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "삭제",
  cancelLabel = "취소",
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(8,13,26,0.8)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onCancel}
    >
      <div
        className="fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "400px",
          padding: "6px",
          borderRadius: "20px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div
          style={{
            position: "relative",
            borderRadius: "14px",
            padding: "1.5rem",
            background: "var(--surface)",
            borderTop: "3px solid var(--wrong)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              color: "var(--text-faint)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              lineHeight: 0,
            }}
            aria-label="닫기"
          >
            <X size={16} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--wrong-dim)",
                border: "1px solid rgba(192,74,58,0.25)",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={16} style={{ color: "var(--wrong)" }} />
            </div>
            <h2
              id="confirm-title"
              className="text-base font-bold"
              style={{ color: "var(--text)" }}
            >
              {title}
            </h2>
          </div>

          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button onClick={onCancel} className="kvle-btn-ghost text-sm">
              {cancelLabel}
            </button>
            <button onClick={onConfirm} className="kvle-btn-danger text-sm">
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
