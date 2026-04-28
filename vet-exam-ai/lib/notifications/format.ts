// Pure formatter for notification rows.
// Returns the display text + click-through href for each notification type.
// Both fields are always strings — caller treats href === '#' as no-op.

import type { Database } from "../supabase/types";

export type NotificationType = Database["public"]["Enums"]["notification_type"];

export type RelatedCommentLite = {
  id: string;
  question_id: string;
  parent_id: string | null;
} | null;

export type FormattedNotification = {
  text: string;
  href: string;
};

const NO_HREF = "#";

function buildCommentHref(rel: NonNullable<RelatedCommentLite>): string {
  return `/questions/${encodeURIComponent(rel.question_id)}?comment=${encodeURIComponent(rel.id)}`;
}

function buildQuestionHref(payload: Record<string, unknown>): string {
  const pub = stringField(payload, "question_public_id");
  if (pub) return `/questions/${encodeURIComponent(pub)}`;
  const qid = stringField(payload, "question_id");
  if (qid) return `/questions/${encodeURIComponent(qid)}`;
  return NO_HREF;
}

export function formatNotification(
  type: NotificationType,
  payload: Record<string, unknown>,
  related: RelatedCommentLite,
): FormattedNotification {
  // correction_resolved is independent of comments — handle first.
  if (type === "correction_resolved") {
    const resolution = stringField(payload, "resolution");
    const text =
      resolution === "accepted"
        ? "정정 제안이 수락되었어요"
        : resolution === "rejected"
          ? "정정 제안이 거절되었어요"
          : "정정 제안의 검토가 완료되었어요";
    return { text, href: buildQuestionHref(payload) };
  }

  // If the underlying comment is gone (cascade-deleted), every comment-bound
  // type degrades to text-only.
  if (related == null) {
    return { text: textOnlyFallback(type, payload), href: NO_HREF };
  }

  const href = buildCommentHref(related);

  switch (type) {
    case "reply": {
      const nickname = stringField(payload, "actor_nickname") ?? "익명";
      return {
        text: `${nickname}님이 회원님의 댓글에 답글을 달았어요`,
        href,
      };
    }
    case "vote_milestone": {
      const milestone = numberField(payload, "milestone");
      const milestoneText = milestone != null ? String(milestone) : "여러";
      return {
        text: `회원님의 댓글이 ${milestoneText} 추천을 받았어요 🎉`,
        href,
      };
    }
    case "report_resolved": {
      const resolution = stringField(payload, "resolution");
      const text =
        resolution === "upheld"
          ? "신고하신 댓글이 운영자 검토 후 제거되었어요"
          : resolution === "dismissed"
            ? "신고하신 댓글이 검토 결과 위반이 아닌 것으로 판단되었어요"
            : "신고하신 댓글의 검토가 완료되었어요";
      return { text, href };
    }
    case "comment_blinded":
      return { text: "회원님의 댓글이 블라인드 처리되었어요", href: NO_HREF };
    case "mention": {
      const nickname = stringField(payload, "actor_nickname") ?? "누군가";
      return { text: `${nickname}님이 회원님을 멘션했어요`, href: NO_HREF };
    }
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return { text: "새 알림", href: NO_HREF };
    }
  }
}

function textOnlyFallback(
  type: Exclude<NotificationType, "correction_resolved">,
  payload: Record<string, unknown>,
): string {
  switch (type) {
    case "reply":
      return `${stringField(payload, "actor_nickname") ?? "익명"}님이 회원님의 댓글에 답글을 달았어요`;
    case "vote_milestone": {
      const milestone = numberField(payload, "milestone");
      return `회원님의 댓글이 ${milestone != null ? String(milestone) : "여러"} 추천을 받았어요 🎉`;
    }
    case "report_resolved": {
      const resolution = stringField(payload, "resolution");
      return resolution === "upheld"
        ? "신고하신 댓글이 운영자 검토 후 제거되었어요"
        : resolution === "dismissed"
          ? "신고하신 댓글이 검토 결과 위반이 아닌 것으로 판단되었어요"
          : "신고하신 댓글의 검토가 완료되었어요";
    }
    case "comment_blinded":
      return "회원님의 댓글이 블라인드 처리되었어요";
    case "mention":
      return `${stringField(payload, "actor_nickname") ?? "누군가"}님이 회원님을 멘션했어요`;
  }
}

function stringField(o: Record<string, unknown>, k: string): string | null {
  const v = o[k];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function numberField(o: Record<string, unknown>, k: string): number | null {
  const v = o[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
