import {
  LayoutDashboard,
  FileText,
  Image as ImageIcon,
  Users,
  GraduationCap,
  Flag,
  GitPullRequest,
  History,
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
  { label: "이미지 큐", href: "/admin/image-questions", icon: ImageIcon },
  { label: "회원",      href: "/admin/users",           icon: Users },
  { label: "시험",      href: "/admin/exams",           icon: GraduationCap, disabled: true },
  { label: "신고",      href: "/admin/reports",         icon: Flag },
  { label: "정정",      href: "/admin/corrections",     icon: GitPullRequest },
  { label: "감사",      href: "/admin/audit",           icon: History },
];

export function isAdminNavActive(activeHref: string, itemHref: string): boolean {
  if (activeHref === itemHref) return true;
  if (itemHref === "/admin") return false;
  return activeHref.startsWith(itemHref);
}
