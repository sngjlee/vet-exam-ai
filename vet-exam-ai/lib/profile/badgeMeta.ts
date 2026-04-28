import { Shield, BadgeCheck, Flame, Sparkles, Award } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Database } from "../supabase/types";

export type BadgeType = Database["public"]["Enums"]["badge_type"];

export type BadgeMeta = {
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  background: string;
  showInline: boolean;
  manualGrant: boolean;
};

export const BADGE_META: Record<BadgeType, BadgeMeta> = {
  operator: {
    label: "운영자",
    description: "수의미래연구소 운영진",
    icon: Shield,
    color: "var(--teal)",
    background: "var(--teal-dim)",
    showInline: true,
    manualGrant: true,
  },
  reviewer: {
    label: "검수자",
    description: "공식 콘텐츠 검수자",
    icon: BadgeCheck,
    color: "var(--amber)",
    background: "var(--amber-dim)",
    showInline: true,
    manualGrant: true,
  },
  newbie: {
    label: "새내기",
    description: "가입 시 자동 부여",
    icon: Sparkles,
    color: "var(--text-muted)",
    background: "var(--surface-raised)",
    showInline: false,
    manualGrant: false,
  },
  first_contrib: {
    label: "첫 기여",
    description: "첫 댓글 작성 시 자동 부여",
    icon: Award,
    color: "var(--teal)",
    background: "var(--teal-dim)",
    showInline: false,
    manualGrant: false,
  },
  popular_comment: {
    label: "인기 댓글",
    description: "단일 댓글 추천 10회 이상",
    icon: Flame,
    color: "var(--wrong)",
    background: "var(--wrong-dim)",
    showInline: true,
    manualGrant: false,
  },
};

export const BADGE_DISPLAY_ORDER: BadgeType[] = [
  "operator",
  "reviewer",
  "popular_comment",
  "first_contrib",
  "newbie",
];
