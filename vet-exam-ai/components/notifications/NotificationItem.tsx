"use client";

import {
  formatNotification,
  type RelatedCommentLite,
  type NotificationType,
} from "../../lib/notifications/format";

export type NotificationRow = {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  related_comment: RelatedCommentLite;
};

type Props = {
  notification: NotificationRow;
  onClick: (n: NotificationRow, href: string) => void;
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

export default function NotificationItem({ notification, onClick }: Props) {
  const { text, href } = formatNotification(
    notification.type,
    notification.payload,
    notification.related_comment,
  );
  const unread = notification.read_at == null;
  const clickable = href !== "#";

  function handleClick() {
    if (!clickable) return;
    onClick(notification, href);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!clickable}
      style={{
        width: "100%",
        textAlign: "left",
        background: unread ? "var(--teal-dim)" : "transparent",
        border: "none",
        borderLeft: unread ? "4px solid var(--teal)" : "4px solid transparent",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        cursor: clickable ? "pointer" : "default",
        opacity: clickable ? 1 : 0.6,
        transition: "background 150ms",
      }}
      onMouseEnter={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLElement).style.background = unread
            ? "var(--teal-dim)"
            : "var(--surface-raised)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = unread
          ? "var(--teal-dim)"
          : "transparent";
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: unread ? "var(--text)" : "var(--text-muted)",
          fontWeight: unread ? 600 : 500,
          lineHeight: 1.4,
        }}
      >
        {text}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-faint)" }}>
        {formatRelative(notification.created_at)}
      </div>
    </button>
  );
}
