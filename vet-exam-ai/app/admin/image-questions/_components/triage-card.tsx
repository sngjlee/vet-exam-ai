"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import {
  triageQuestionDecide,
  triageQuestionRevert,
} from "../../../../lib/admin/triage";
import {
  TRIAGE_STATUS_LABEL,
  TRIAGE_STATUS_COLOR,
  type ImageTriageStatus,
} from "../../../../lib/admin/triage-labels";

export type TriageCardData = {
  id:           string;
  publicId:     string | null;
  round:        number | null;
  category:     string;
  question:     string;
  choices:      string[];
  answer:       string;
  explanation:  string | null;
  questionImages:    { filename: string; url: string | null }[];
  explanationImages: { filename: string; url: string | null }[];
  triageStatus: ImageTriageStatus | null; // null = pending (row 미존재)
  triageNote:   string | null;
};

const ACTION_BUTTONS: { status: ImageTriageStatus; label: string; primary: boolean }[] = [
  { status: "activate_no_image", label: "활성화",       primary: true  },
  { status: "needs_rewrite",     label: "재작성 필요",  primary: false },
  { status: "needs_rebuild",     label: "도식 재제작",  primary: false },
  { status: "needs_license",     label: "라이선스 필요", primary: false },
  { status: "remove",            label: "폐기",         primary: false },
];

export function TriageCard({
  row,
  selected,
  onToggle,
  thumbnailSlot,
}: {
  row: TriageCardData;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
  thumbnailSlot: ReactNode;
}) {
  const [note, setNote] = useState(row.triageNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDecide(status: ImageTriageStatus) {
    setError(null);
    startTransition(async () => {
      const trimmed = note.trim();
      const result = await triageQuestionDecide(
        row.id,
        status,
        trimmed.length > 0 ? trimmed : null,
      );
      if (!result.ok) setError(result.error);
    });
  }

  function handleRevert() {
    setError(null);
    startTransition(async () => {
      const result = await triageQuestionRevert(row.id);
      if (!result.ok) setError(result.error);
    });
  }

  const decided = row.triageStatus !== null;
  const decidedColor = row.triageStatus
    ? TRIAGE_STATUS_COLOR[row.triageStatus]
    : null;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background:  "var(--surface-raised)",
        border:      "1px solid var(--rule)",
        opacity:     pending ? 0.6 : 1,
        transition:  "opacity 0.15s ease",
      }}
    >
      {/* 헤더: 체크박스 + KVLE + 카테고리 + 회차 + 분류 상태 */}
      <div className="flex items-center gap-3 mb-3" style={{ fontSize: 13 }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggle(row.id, e.target.checked)}
          aria-label={`${row.publicId ?? row.id} 선택`}
          disabled={decided}
          style={{ cursor: decided ? "not-allowed" : "pointer" }}
        />
        <Link
          href={`/admin/questions/${row.id}`}
          className="kvle-mono"
          style={{ color: "var(--teal)", textDecoration: "underline" }}
        >
          {row.publicId ?? row.id.slice(0, 8)}
        </Link>
        <span style={{ color: "var(--text-muted)" }}>·</span>
        <span>{row.category}</span>
        {row.round != null && (
          <>
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span style={{ color: "var(--text-muted)" }}>{row.round}회</span>
          </>
        )}
        {decided && decidedColor && (
          <span
            style={{
              marginLeft:   "auto",
              padding:      "2px 8px",
              borderRadius: 999,
              fontSize:     11,
              background:   decidedColor.bg,
              color:        decidedColor.fg,
            }}
          >
            {TRIAGE_STATUS_LABEL[row.triageStatus!]}
          </span>
        )}
      </div>

      {/* 본문 */}
      <div style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 10 }}>
        <div style={{ fontWeight: 500, marginBottom: 6 }}>{row.question}</div>
        <ol style={{ paddingLeft: 20, margin: 0, color: "var(--text-muted)" }}>
          {row.choices.map((c, i) => (
            <li
              key={i}
              style={{
                color:      c === row.answer ? "var(--teal)" : undefined,
                fontWeight: c === row.answer ? 500 : undefined,
              }}
            >
              {c}
            </li>
          ))}
        </ol>
        {row.explanation && (
          <div style={{ marginTop: 8, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
            <span style={{ color: "var(--text)", fontWeight: 500 }}>해설: </span>
            {row.explanation}
          </div>
        )}
      </div>

      {/* 썸네일 (server에서 signed URL 발급 + 주입) */}
      {thumbnailSlot && (
        <div style={{ marginBottom: 12 }}>{thumbnailSlot}</div>
      )}

      {/* 액션 버튼 */}
      {!decided && (
        <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
          {ACTION_BUTTONS.map((b) => (
            <button
              key={b.status}
              type="button"
              onClick={() => handleDecide(b.status)}
              disabled={pending}
              style={{
                padding:      "6px 12px",
                fontSize:     12,
                borderRadius: 4,
                border:       `1px solid ${b.primary ? "var(--teal)" : "var(--rule)"}`,
                background:   b.primary ? "var(--teal)" : "var(--surface)",
                color:        b.primary ? "white" : "var(--text)",
                cursor:       pending ? "wait" : "pointer",
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {decided && (
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <button
            type="button"
            onClick={handleRevert}
            disabled={pending}
            style={{
              padding:      "6px 12px",
              fontSize:     12,
              borderRadius: 4,
              border:       "1px solid var(--rule)",
              background:   "var(--surface)",
              color:        "var(--text-muted)",
              cursor:       pending ? "wait" : "pointer",
            }}
          >
            분류 되돌리기
          </button>
          {row.triageNote && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              메모: {row.triageNote}
            </span>
          )}
        </div>
      )}

      {/* 메모 입력 */}
      {!decided && (
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="메모 (선택, 분류 시 함께 저장)"
          maxLength={500}
          style={{
            width:        "100%",
            padding:      "6px 10px",
            fontSize:     12,
            borderRadius: 4,
            border:       "1px solid var(--rule)",
            background:   "var(--surface)",
            color:        "var(--text)",
          }}
        />
      )}

      {error && (
        <div style={{ marginTop: 8, color: "rgb(185, 28, 28)", fontSize: 12 }}>
          오류: {error}
        </div>
      )}
    </div>
  );
}
