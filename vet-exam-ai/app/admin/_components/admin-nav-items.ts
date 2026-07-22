import {
  LayoutDashboard,
  FileText,
  Image as ImageIcon,
  Users,
  GraduationCap,
  Flag,
  GitPullRequest,
  History,
  ShieldCheck,
  MessageSquareDot,
  Ban,
  Activity,
  ChartNoAxesColumnIncreasing,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: "대시보드",  href: "/admin",                 icon: LayoutDashboard },
  { label: "문제",      href: "/admin/questions",       icon: FileText },
  { label: "품질",      href: "/admin/quality",         icon: ChartNoAxesColumnIncreasing },
  { label: "이미지 큐", href: "/admin/image-questions", icon: ImageIcon },
  { label: "회원",      href: "/admin/users",           icon: Users },
  { label: "가입 신청", href: "/admin/signup-applications", icon: ShieldCheck },
  { label: "IP 차단",   href: "/admin/ip-bans",         icon: Ban },
  { label: "시험",      href: "/admin/exams",           icon: GraduationCap },
  { label: "신고",      href: "/admin/reports",         icon: Flag },
  { label: "정정",      href: "/admin/corrections",     icon: GitPullRequest },
  { label: "댓글 초안", href: "/admin/ai-comments",     icon: MessageSquareText },
  { label: "감사",      href: "/admin/audit",           icon: History },
  { label: "건의 관리", href: "/admin/suggestions",     icon: MessageSquareDot },
  { label: "운영 점검", href: "/admin/ops",             icon: Activity },
];

export function isAdminNavActive(activeHref: string, itemHref: string): boolean {
  if (activeHref === itemHref) return true;
  if (itemHref === "/admin") return false;
  return activeHref.startsWith(itemHref);
}
