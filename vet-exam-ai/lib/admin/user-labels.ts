import type { Database } from "../supabase/types";

export type UserRole   = Database["public"]["Enums"]["user_role"];
export type BadgeType  = Database["public"]["Enums"]["badge_type"];

export const USER_ROLE_KO: Record<UserRole, string> = {
  user:     "일반 회원",
  reviewer: "검수자",
  admin:    "운영자",
};

export const BADGE_TYPE_KO: Record<BadgeType, string> = {
  operator:        "운영자",
  reviewer:        "검수자",
  newbie:          "새내기",
  first_contrib:   "첫 기여",
  popular_comment: "인기 댓글",
};

// Manual-grantable badges (others are auto-awarded by triggers).
export const GRANTABLE_BADGES: BadgeType[] = ["operator", "reviewer"];

// Auto-awarded badges that admins cannot revoke.
export const AUTO_BADGES: BadgeType[] = [
  "newbie",
  "first_contrib",
  "popular_comment",
];

export const ALL_USER_ROLES: UserRole[] = ["user", "reviewer", "admin"];
