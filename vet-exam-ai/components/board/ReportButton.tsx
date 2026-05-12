"use client";

import { useState, useTransition } from "react";
import { reportPost } from "@/app/board/_actions";
import { reportPostComment } from "@/app/board/[kind]/[id]/_actions";

type Props =
  | { kind: "post"; id: string }
  | { kind: "comment"; id: string; postId: string; kindSegment: "suggestions" | "announcements" };

const REASONS = [
  { value: "spam", label: "스팸" },
  { value: "advertising", label: "광고/홍보" },
  { value: "hate_speech", label: "혐오 발언" },
  { value: "privacy", label: "개인정보 노출" },
  { value: "defamation", label: "명예훼손" },
  { value: "copyright", label: "저작권 침해" },
  { value: "misinformation", label: "허위/잘못된 정보" },
  { value: "other", label: "기타" },
] as const;

export function ReportButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<typeof REASONS[number]["value"]>("spam");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      try {
        if (props.kind === "post") {
          await reportPost({ post_id: props.id, reason, note: note || undefined });
        } else {
          await reportPostComment({
            comment_id: props.id,
            reason,
            note: note || undefined,
            post_id: props.postId,
            kind_segment: props.kindSegment,
          });
        }
        setDone(true);
      } catch {
        setDone(true); // 멱등 처리 — 중복 신고면 23505로 무시
      }
    });
  };

  if (done) {
    return <span className="text-xs" style={{ color: "var(--text-muted)" }}>신고 접수됨</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs hover:underline transition-colors"
        style={{ color: "var(--text-muted)" }}
      >
        신고
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)" }}
        >
          <div
            className="w-full max-w-sm rounded-lg p-4"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--rule)",
              color: "var(--text)",
            }}
          >
            <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>신고 사유</h3>
            <div className="mt-2 space-y-1">
              {REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="추가 설명 (선택, 500자)"
              className="mt-2 w-full rounded-md px-2 py-1 text-sm"
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--teal-border)",
                color: "var(--text)",
              }}
              rows={3}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-md px-3 py-1 text-sm disabled:opacity-50"
                style={{ background: "var(--wrong)", color: "var(--text)" }}
              >
                {pending ? "전송 중…" : "신고"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
