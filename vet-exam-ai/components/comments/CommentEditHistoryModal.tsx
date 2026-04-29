"use client";

import { useEffect, useState } from "react";

type Version = { body_html: string; edited_at: string };
type HistoryResponse = {
  current: Version;
  history: Version[];
};

type Props = {
  commentId: string;
  editCount: number;
  onClose: () => void;
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export default function CommentEditHistoryModal({
  commentId,
  editCount,
  onClose,
}: Props) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/comments/${commentId}/history`);
        if (!res.ok) {
          throw new Error(`불러오기 실패 (${res.status})`);
        }
        const json = (await res.json()) as HistoryResponse;
        if (cancelled) return;
        setData(json);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "불러오기 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [commentId, reloadKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const versions =
    data === null
      ? []
      : [
          { label: "[현재]", v: data.current },
          ...data.history.map((v, idx) => ({
            label: idx === data.history.length - 1 ? "[최초 작성]" : "[수정 전]",
            v,
          })),
        ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "16px 18px 18px",
          maxWidth: 560,
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
            수정 이력 (총 {editCount}회)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            닫기
          </button>
        </div>

        {loading && (
          <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "8px 4px" }}>
            이력 불러오는 중…
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "12px 14px",
              background: "var(--wrong-dim)",
              border: "1px solid rgba(192,74,58,0.3)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--text)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {error}
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text)",
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {versions.map((entry, i) => {
              const isLast = i === versions.length - 1;
              return (
                <div
                  key={`${entry.v.edited_at}-${i}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    paddingBottom: 10,
                    borderBottom: isLast ? "none" : "1px dashed var(--border)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-faint)",
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {entry.label} {formatRelative(entry.v.edited_at)}
                  </div>
                  <div
                    className="kvle-prose kvle-selectable-text"
                    style={{ color: "var(--text)", fontSize: 13 }}
                    dangerouslySetInnerHTML={{ __html: entry.v.body_html }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
