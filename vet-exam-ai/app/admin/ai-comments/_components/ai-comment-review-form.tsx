"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  reviewAiCommentCandidateAction,
  type AiCommentReviewResult,
} from "../_actions";
import { AI_COMMENT_REVIEW_ERROR_LABELS } from "../_lib/presentation";

type Resolution = "approve" | "reject";

const REVIEW_BUTTONS = {
  approve: {
    label: "승인하고 게시",
    pendingLabel: "게시 중…",
    confirmMessage: "이 초안을 기존 시딩 계정의 공개 댓글로 게시할까요?",
    className: "kvle-btn-primary flex-1 text-sm",
  },
  reject: {
    label: "거절",
    pendingLabel: "처리 중…",
    confirmMessage: "이 초안을 거절할까요? 공개 댓글은 생성되지 않습니다.",
    className: "kvle-btn-danger flex-1 text-sm",
  },
} as const satisfies Record<Resolution, {
  readonly label: string;
  readonly pendingLabel: string;
  readonly confirmMessage: string;
  readonly className: string;
}>;

const INITIAL_STATE: AiCommentReviewResult | null = null;

async function submitReview(
  _previousState: AiCommentReviewResult | null,
  formData: FormData,
): Promise<AiCommentReviewResult> {
  return reviewAiCommentCandidateAction(formData);
}

function ReviewSubmitButton({ resolution }: { readonly resolution: Resolution }) {
  const { pending } = useFormStatus();
  const copy = REVIEW_BUTTONS[resolution];

  return (
    <button
      type="submit"
      name="resolution"
      value={resolution}
      disabled={pending}
      className={copy.className}
      onClick={(event) => {
        if (!window.confirm(copy.confirmMessage)) event.preventDefault();
      }}
    >
      {pending ? copy.pendingLabel : copy.label}
    </button>
  );
}

export function AiCommentReviewForm({ candidateId }: { readonly candidateId: string }) {
  const [state, formAction] = useActionState(submitReview, INITIAL_STATE);

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="candidate_id" value={candidateId} />
      <label className="grid gap-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        검수 메모 (선택)
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          className="w-full rounded-lg border p-3 text-sm"
          style={{ background: "var(--bg)", borderColor: "var(--rule)", color: "var(--text)" }}
          placeholder="승인 또는 거절 판단의 근거를 남길 수 있습니다."
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row">
        <ReviewSubmitButton resolution="approve" />
        <ReviewSubmitButton resolution="reject" />
      </div>

      {state?.ok === true && (
        <p role="status" className="text-sm" style={{ color: "var(--correct)" }}>
          검수 결과를 저장했습니다.
        </p>
      )}
      {state?.ok === false && (
        <p role="alert" className="text-sm" style={{ color: "var(--wrong)" }}>
          {AI_COMMENT_REVIEW_ERROR_LABELS[state.code]}
        </p>
      )}
    </form>
  );
}
