"use client";

import Link from "next/link";
import {
  USER_ROLE_KO,
  BADGE_TYPE_KO,
  type UserRole,
  type BadgeType,
} from "../../../../lib/admin/user-labels";
import { formatJoinedRelative, truncateEmail } from "../_lib/format-user";
import { UserRoleForm } from "./user-role-form";
import { UserActiveForm } from "./user-active-form";
import { UserBadgeGrantForm } from "./user-badge-grant-form";
import { UserBadgeRevokeForm } from "./user-badge-revoke-form";

export type UserRow = {
  id:         string;
  role:       UserRole;
  is_active:  boolean;
  created_at: string | null;
};

export function UsersTable({
  rows,
  nicknameMap,
  emailMap,
  badgeMap,
  currentAdminId,
}: {
  rows:           UserRow[];
  nicknameMap:    Record<string, string | null>;
  emailMap:       Record<string, string | null>;
  badgeMap:       Record<string, BadgeType[]>;
  currentAdminId: string;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg p-8 text-center text-sm"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)", color: "var(--text-muted)" }}
      >
        조건에 맞는 회원이 없습니다.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const nickname = nicknameMap[r.id] ?? "(닉네임 없음)";
        const email    = emailMap[r.id] ?? null;
        const badges   = badgeMap[r.id] ?? [];
        const isSelf   = r.id === currentAdminId;

        return (
          <li
            key={r.id}
            className="rounded-lg"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--rule)" }}
          >
            <details>
              <summary
                className="cursor-pointer p-3 flex flex-wrap items-center gap-3 text-sm"
                style={{ color: "var(--text)" }}
              >
                <Link
                  href={`/profile/${encodeURIComponent(nickname)}`}
                  className="font-medium"
                  style={{ color: "var(--teal)", textDecoration: "underline" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {nickname}
                </Link>
                <span className="kvle-mono text-xs" style={{ color: "var(--text-muted)" }}>
                  {truncateEmail(email)}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ background: "var(--surface)", border: "1px solid var(--rule)" }}
                >
                  {USER_ROLE_KO[r.role]}
                </span>
                {badges.map((b) => (
                  <span
                    key={b}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ background: "var(--teal-soft, var(--surface))", color: "var(--teal)", border: "1px solid var(--teal)" }}
                  >
                    {BADGE_TYPE_KO[b]}
                  </span>
                ))}
                <span
                  className="text-xs ml-auto"
                  style={{ color: r.is_active ? "var(--text-muted)" : "var(--danger, #c0392b)" }}
                >
                  {r.is_active ? "정상" : "정지"}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {formatJoinedRelative(r.created_at)}
                </span>
              </summary>

              <div className="grid gap-4 border-t p-3 sm:grid-cols-2" style={{ borderColor: "var(--rule)" }}>
                <section>
                  <h3 className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    역할
                  </h3>
                  <UserRoleForm userId={r.id} currentRole={r.role} isSelf={isSelf} />
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    계정 상태
                  </h3>
                  <UserActiveForm userId={r.id} isActive={r.is_active} isSelf={isSelf} />
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    뱃지 부여
                  </h3>
                  <UserBadgeGrantForm userId={r.id} currentBadgeTypes={badges} />
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    뱃지 회수
                  </h3>
                  <UserBadgeRevokeForm userId={r.id} badges={badges} />
                </section>
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
