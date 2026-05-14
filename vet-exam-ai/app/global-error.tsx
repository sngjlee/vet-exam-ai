"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", "Pretendard Variable", sans-serif',
          background: "#0a0a0a",
          color: "#e5e5e5",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            textAlign: "center",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: "2rem 1.5rem",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            문제가 발생했습니다
          </h2>
          <p style={{ fontSize: 13, color: "#a3a3a3", marginBottom: 20 }}>
            잠시 후 다시 시도해 주세요. 문제가 반복되면 관리자에게 알려주세요.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid rgba(30,167,187,0.4)",
              background: "rgba(30,167,187,0.12)",
              color: "#1ea7bb",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
