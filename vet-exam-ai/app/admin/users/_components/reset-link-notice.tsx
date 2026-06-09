"use client";

import { useEffect } from "react";
import { clearPasswordResetLinkCookie } from "../_actions";

export function ResetLinkNotice({ resetLink }: { resetLink: string }) {
  useEffect(() => {
    void clearPasswordResetLinkCookie();
  }, []);

  return (
    <div
      className="mb-4 rounded p-3 text-sm"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--teal)", color: "var(--text)" }}
      role="status"
    >
      <p className="mb-2 font-medium" style={{ color: "var(--teal)" }}>
        재설정 링크가 발급되었습니다 (1회용, 약 1시간 유효)
      </p>
      <code
        className="block break-all p-2 rounded text-xs kvle-mono"
        style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
      >
        {resetLink}
      </code>
      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        이 링크를 사용자에게 전달하세요. 페이지를 떠나면 다시 볼 수 없습니다.
        발급 사실은 감사 로그에 기록됩니다.
      </p>
    </div>
  );
}
