"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

type Props = {
  isOwner: boolean;
  isReported: boolean;
  canDelete: boolean;
  canReport: boolean;
  onDelete: () => void;
  onReport: () => void;
};

export default function CommentMenuOverflow({
  isOwner,
  isReported,
  canDelete,
  canReport,
  onDelete,
  onReport,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showDelete = canDelete;
  const showReport = !isOwner && canReport && !isReported;
  const showReportedBadge = !isOwner && isReported;
  if (!showDelete && !showReport && !showReportedBadge) return null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="더보기"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-faint)",
          cursor: "pointer",
          padding: 4,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            minWidth: 120,
            zIndex: 20,
            overflow: "hidden",
          }}
        >
          {showDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              style={{
                display: "block",
                width: "100%",
                background: "transparent",
                border: "none",
                padding: "8px 12px",
                textAlign: "left",
                fontSize: 12,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              삭제
            </button>
          )}
          {showReport && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onReport();
              }}
              style={{
                display: "block",
                width: "100%",
                background: "transparent",
                border: "none",
                padding: "8px 12px",
                textAlign: "left",
                fontSize: 12,
                color: "var(--wrong)",
                cursor: "pointer",
              }}
            >
              신고
            </button>
          )}
          {showReportedBadge && (
            <span
              role="menuitem"
              aria-disabled="true"
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                textAlign: "left",
                fontSize: 12,
                color: "var(--text-faint)",
                cursor: "not-allowed",
              }}
            >
              신고됨 ✓
            </span>
          )}
        </div>
      )}
    </div>
  );
}
