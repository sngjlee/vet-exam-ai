import {
  LayoutDashboard,
  FileText,
  Users,
  GraduationCap,
  Flag,
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
  { label: "대시보드", href: "/admin",            icon: LayoutDashboard },
  { label: "문제",      href: "/admin/questions",  icon: FileText },
  { label: "회원",      href: "/admin/users",      icon: Users,         disabled: true },
  { label: "시험",      href: "/admin/exams",      icon: GraduationCap, disabled: true },
  { label: "신고",      href: "/admin/moderation", icon: Flag,          disabled: true },
  { label: "감사",      href: "/admin/audit",      icon: History,       disabled: true },
];

export function isAdminNavActive(activeHref: string, itemHref: string): boolean {
  if (activeHref === itemHref) return true;
  if (itemHref === "/admin") return false;
  return activeHref.startsWith(itemHref);
}
