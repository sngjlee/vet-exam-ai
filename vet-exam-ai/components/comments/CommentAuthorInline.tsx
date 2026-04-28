"use client";

import Link from "next/link";
import { BADGE_META, type BadgeType } from "../../lib/profile/badgeMeta";

type Props = {
  userId: string | null;
  nickname: string;
  badges: BadgeType[];
  size?: "small" | "normal";
};

export default function CommentAuthorInline({
  userId,
  nickname,
  badges,
  size = "normal",
}: Props) {
  const inlineBadges = badges.filter((bt) => BADGE_META[bt].showInline);
  const fontSize = size === "small" ? 11 : 12;
  const iconSize = size === "small" ? 11 : 13;
  const padX = size === "small" ? 5 : 6;

  const nameNode = (
    <span style={{ color: "var(--text)", fontWeight: 600, fontSize }}>
      @{nickname}
    </span>
  );

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      {userId ? (
        <Link
          href={`/profile/${encodeURIComponent(nickname)}`}
          style={{ textDecoration: "none" }}
        >
          {nameNode}
        </Link>
      ) : (
        nameNode
      )}
      {inlineBadges.map((bt) => {
        const meta = BADGE_META[bt];
        const Icon = meta.icon;
        return (
          <span
            key={bt}
            title={meta.description}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: `1px ${padX}px`,
              borderRadius: 999,
              background: meta.background,
              color: meta.color,
              fontSize: fontSize - 1,
              fontWeight: 700,
            }}
          >
            <Icon size={iconSize} />
            {meta.label}
          </span>
        );
      })}
    </span>
  );
}
