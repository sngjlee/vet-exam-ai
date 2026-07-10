import Link from "next/link";
import { ListChecks, MessageSquare } from "lucide-react";

export function StudyModeShortcuts() {
  const items = [
    {
      href: "/questions",
      icon: ListChecks,
      label: "해설 먼저 보기",
      meta: "문항을 풀기 전에 해설과 선택지를 같이 봅니다",
      color: "var(--teal)",
    },
    {
      href: "/comments",
      icon: MessageSquare,
      label: "댓글 암기법 보기",
      meta: "암기법, 정정, 질문을 먼저 훑습니다",
      color: "var(--blue)",
    },
  ];

  return (
    <div
      className="fade-in"
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 10,
        marginBottom: "1.5rem",
      }}
    >
      {items.map(({ href, icon: Icon, label, meta, color }) => (
        <Link
          key={href}
          href={href}
          style={{
            minHeight: 78,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: "var(--radius-sm)",
              display: "grid",
              placeItems: "center",
              background: "var(--surface-raised)",
              color,
              flexShrink: 0,
            }}
          >
            <Icon size={17} />
          </span>
          <span style={{ minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: 14, marginBottom: 3 }}>
              {label}
            </strong>
            <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.35 }}>
              {meta}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
