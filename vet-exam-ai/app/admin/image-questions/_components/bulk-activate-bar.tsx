"use client";

import { useTransition } from "react";
import { triageQuestionsBulkActivate } from "../../../../lib/admin/triage";

export function BulkActivateBar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const [pending, startTransition] = useTransition();

  if (selectedIds.length === 0) return null;

  function handleActivate() {
    const message =
      `${selectedIds.length}건을 즉시 공개합니다.\n` +
      `되돌리려면 /admin/audit에서 추적 후 1건씩 revert 해야 합니다.\n\n` +
      `계속하시겠습니까?`;
    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await triageQuestionsBulkActivate(selectedIds, null);
      if (!result.ok) {
        window.alert(`일괄 활성화 실패: ${result.error}`);
        return;
      }
      window.alert(`${result.count ?? selectedIds.length}건 활성화 완료`);
      onClear();
    });
  }

  return (
    <div
      className="flex items-center gap-3 rounded-lg p-3 mb-3"
      style={{
        background: "rgba(34, 197, 94, 0.08)",
        border:     "1px solid rgba(34, 197, 94, 0.4)",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        ✓ {selectedIds.length}건 선택됨
      </span>
      <button
        type="button"
        onClick={handleActivate}
        disabled={pending}
        style={{
          marginLeft:   "auto",
          padding:      "6px 14px",
          fontSize:     12,
          borderRadius: 4,
          background:   "rgb(22, 163, 74)",
          color:        "white",
          border:       "none",
          cursor:       pending ? "wait" : "pointer",
        }}
      >
        {pending ? "처리 중…" : "선택 항목 즉시 활성화"}
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={pending}
        style={{
          padding:      "6px 10px",
          fontSize:     12,
          borderRadius: 4,
          background:   "var(--surface)",
          color:        "var(--text-muted)",
          border:       "1px solid var(--rule)",
          cursor:       pending ? "wait" : "pointer",
        }}
      >
        선택 해제
      </button>
    </div>
  );
}
