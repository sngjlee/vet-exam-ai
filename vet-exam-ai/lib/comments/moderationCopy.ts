export const COMMENT_MODERATION_COPY = {
  authorDeleted: "[작성자가 삭제한 댓글입니다]",
  collapsedByVotes: (score?: number) =>
    `추천/비추천 평가로 접힌 댓글입니다${typeof score === "number" ? ` (${score})` : ""}`,
  collapsedByReports:
    "신고 접수로 임시 비공개 처리된 댓글입니다. 운영자 검토 후 복구 또는 삭제될 수 있습니다.",
  expandCollapsed: "내용 보기",
  ownerReportHidden: "신고 접수로 임시 비공개 중",
  ownerReportHiddenTitle: "운영자 검토 전까지 다른 사용자에게 보이지 않습니다.",
  reportAction: "신고",
  reportSubmitted: "신고 접수됨",
  reportDialogTitle: "댓글 신고",
  reportIntro:
    "신고 사유를 선택해 주세요. 운영자가 확인할 수 있도록 필요한 경우만 추가 설명을 적어 주세요.",
  defamationNote:
    "권리침해 또는 명예훼손 신고는 임시 비공개 요청으로 접수됩니다. 운영자 검토 후 복구 또는 삭제 여부가 결정됩니다.",
  reportDescriptionLabel: "추가 설명 (선택)",
  reportDescriptionPlaceholder: "상황을 판단하는 데 필요한 내용이 있으면 간단히 적어 주세요.",
  reportSubmit: "신고 접수",
  reportSubmitting: "접수 중...",
  reportOwnCommentError: "본인 댓글은 신고할 수 없습니다.",
  reportUnavailableError: "이미 삭제되었거나 처리된 댓글입니다.",
  reportInvalidError: "입력값을 다시 확인해 주세요.",
  reportFailedError: "신고 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  reportNetworkError: "네트워크 오류로 신고 접수에 실패했습니다.",
  reportSuccessToast: "신고가 접수되었습니다. 운영자가 검토할게요.",
  reportDuplicateToast: "이미 신고 접수된 댓글입니다.",
  reportLoginRequiredToast: "로그인하면 신고할 수 있습니다.",
} as const;
