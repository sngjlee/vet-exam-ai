"use client";

import { Pencil } from "lucide-react";

type Props = {
  onStartEdit: () => void;
};

export default function ProfileTempNicknameBanner({ onStartEdit }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "12px 16px",
        marginBottom: 20,
        borderRadius: 10,
        background: "var(--amber-dim)",
        border: "1px solid var(--amber)",
        color: "var(--text)",
        fontSize: 14,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <strong style={{ color: "var(--amber)" }}>닉네임을 설정해 주세요</strong>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
          임시 닉네임으로 작성한 댓글에는{" "}
          <code style={{ fontFamily: "var(--font-mono, monospace)" }}>user_xxxxxxxx</code>로
          표시됩니다.
        </span>
      </div>
      <button
        type="button"
        onClick={onStartEdit}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          background: "var(--amber)",
          color: "#080D1A",
          border: "none",
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <Pencil size={14} />
        편집
      </button>
    </div>
  );
}
