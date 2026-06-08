export type CorrectionReviewStatus = "proposed" | "reviewing" | "accepted" | "rejected";

export type CommentCorrectionReview = {
  status: CorrectionReviewStatus;
  resolvedAt: string | null;
};

export type CommentCorrectionReviewResponse = {
  byCommentId: Record<string, CommentCorrectionReview>;
  byUserId: Record<string, CommentCorrectionReview>;
};

export const CORRECTION_REVIEW_PRIORITY: Record<CorrectionReviewStatus, number> = {
  accepted: 4,
  reviewing: 3,
  proposed: 2,
  rejected: 1,
};

export function isCorrectionReviewStatus(value: unknown): value is CorrectionReviewStatus {
  return (
    value === "proposed" ||
    value === "reviewing" ||
    value === "accepted" ||
    value === "rejected"
  );
}

export function getCorrectionReviewMeta(status: CorrectionReviewStatus) {
  switch (status) {
    case "accepted":
      return {
        label: "정정 채택",
        title: "운영자가 수락한 정정 제안입니다.",
        bg: "#ECFDF5",
        border: "#A7F3D0",
        color: "#047857",
      };
    case "reviewing":
      return {
        label: "검토 중",
        title: "운영자가 정정 제안을 검토하고 있습니다.",
        bg: "#EFF6FF",
        border: "#BFDBFE",
        color: "#1D4ED8",
      };
    case "rejected":
      return {
        label: "정정 반려",
        title: "운영자가 반려한 정정 제안입니다.",
        bg: "#FFF1F2",
        border: "#FECDD3",
        color: "#BE123C",
      };
    case "proposed":
    default:
      return {
        label: "검토 대기",
        title: "운영자 검토를 기다리는 정정 제안입니다.",
        bg: "#F8FAFC",
        border: "#CBD5E1",
        color: "#475569",
      };
  }
}
