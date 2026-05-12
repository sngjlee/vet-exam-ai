"use client";

import { useState, useTransition } from "react";
import {
  updateSuggestionStateFormAction,
  setBoardPostVisibilityFormAction,
} from "../_actions";

type Status = "received" | "reviewing" | "accepted" | "rejected";
type Visibility = "visible" | "hidden_by_author" | "blinded_by_report" | "removed_by_admin";

type Props = {
  postId: string;
  currentStatus: Status | null;
  currentVisibility: Visibility;
};

type ExpandedForm = "reject" | "accept" | null;

const noteStyle = {
  background: "var(--surface)",
  border: "1px solid var(--teal-border)",
  color: "var(--text)",
} as const;

export function SuggestionActionRow({ postId, currentStatus, currentVisibility }: Props) {
  const [expanded, setExpanded] = useState<ExpandedForm>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setExpanded(null);
    setNote("");
    setError(null);
  };

  const submitStatus = (status: Status, requireNote: boolean) => {
    if (requireNote && !note.trim()) {
      setError("사유를 입력해주세요.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("post_id", postId);
    fd.set("new_status", status);
    if (note.trim()) fd.set("note", note.trim());
    startTransition(async () => {
      try {
        await updateSuggestionStateFormAction(fd);
        reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "처리 실패");
      }
    });
  };

  const submitVisibility = (visibility: "removed_by_admin" | "visible") => {
    setError(null);
    const fd = new FormData();
    fd.set("post_id", postId);
    fd.set("visibility", visibility);
    startTransition(async () => {
      try {
        await setBoardPostVisibilityFormAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "처리 실패");
      }
    });
  };

  const simpleButton = (status: Status, label: string) => (
    <button
      key={status}
      type="button"
      onClick={() => submitStatus(status, false)}
      disabled={currentStatus === status || pending}
      className="rounded-md px-2 py-1 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ border: "1px solid var(--rule)", color: "var(--text)", background: "transparent" }}
    >
      {label}
    </button>
  );

  const toggleButton = (kind: "accept" | "reject", label: string, disabled: boolean) => (
    <button
      type="button"
      onClick={() => {
        if (expanded === kind) {
          reset();
        } else {
          setExpanded(kind);
          setNote("");
          setError(null);
        }
      }}
      disabled={disabled || pending}
      className="rounded-md px-2 py-1 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        border:
          expanded === kind
            ? kind === "reject"
              ? "1px solid rgba(192, 74, 58, 0.5)"
              : "1px solid var(--teal-border)"
            : "1px solid var(--rule)",
        color: expanded === kind
          ? kind === "reject" ? "var(--wrong)" : "var(--teal)"
          : "var(--text)",
        background: "transparent",
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 text-sm">
        {simpleButton("received", "접수로")}
        {simpleButton("reviewing", "검토중으로")}
        {toggleButton("accept", "채택", currentStatus === "accepted")}
        {toggleButton("reject", "반려", currentStatus === "rejected")}
        {currentVisibility === "visible" ? (
          <button
            type="button"
            onClick={() => submitVisibility("removed_by_admin")}
            disabled={pending}
            className="rounded-md px-2 py-1 text-xs transition-colors"
            style={{
              border: "1px solid rgba(192, 74, 58, 0.4)",
              color: "var(--wrong)",
              background: "transparent",
            }}
          >
            삭제
          </button>
        ) : (
          <button
            type="button"
            onClick={() => submitVisibility("visible")}
            disabled={pending}
            className="rounded-md px-2 py-1 text-xs transition-colors"
            style={{
              border: "1px solid var(--rule)",
              color: "var(--text)",
              background: "transparent",
            }}
          >
            복구
          </button>
        )}
      </div>

      {expanded ? (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              expanded === "reject"
                ? "반려 사유를 작성자에게 전달합니다 (필수)"
                : "채택 코멘트 — 빈 칸이면 사유 없이 채택 (선택)"
            }
            maxLength={2000}
            rows={3}
            className="w-full rounded-md px-3 py-2 text-sm"
            style={noteStyle}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                submitStatus(
                  expanded === "reject" ? "rejected" : "accepted",
                  expanded === "reject",
                )
              }
              disabled={pending}
              className="rounded-md px-3 py-1 text-xs font-semibold disabled:opacity-50"
              style={{
                background: expanded === "reject" ? "var(--wrong)" : "var(--teal)",
                color: expanded === "reject" ? "var(--text)" : "#080D1A",
                border: "none",
              }}
            >
              {pending ? "전송 중…" : expanded === "reject" ? "반려 확정" : "채택 확정"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="text-xs hover:underline"
              style={{ color: "var(--text-muted)", background: "transparent", border: "none" }}
            >
              취소
            </button>
            <span className="ml-auto text-xs" style={{ color: "var(--text-faint)" }}>
              {note.length}/2000
            </span>
          </div>
          {error ? (
            <div className="text-xs" style={{ color: "var(--wrong)" }}>{error}</div>
          ) : null}
        </div>
      ) : error ? (
        <div className="text-xs" style={{ color: "var(--wrong)" }}>{error}</div>
      ) : null}
    </div>
  );
}
