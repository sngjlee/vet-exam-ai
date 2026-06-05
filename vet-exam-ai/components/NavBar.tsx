"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CirclePlay,
  ListChecks,
  LogOut,
  MessageSquare,
  PenTool,
  RotateCcw,
  Search,
  Settings,
  Shield,
  User,
} from "lucide-react";
import { useDueCountCtx } from "../lib/context/DueCountContext";
import { useAuth } from "../lib/hooks/useAuth";
import { useMyNickname } from "../lib/hooks/useMyNickname";
import { useMyRole } from "../lib/hooks/useMyRole";
import NotificationBell from "./notifications/NotificationBell";

const MAIN_LINKS = [
  { href: "/questions", label: "해설보기", icon: ListChecks, section: "/questions" },
  { href: "/search", label: "검색", icon: Search, section: "/search" },
  { href: "/quiz", label: "문제풀기", icon: CirclePlay, section: "/quiz" },
  { href: "/wrong-notes", label: "오답노트", icon: RotateCcw, section: "/wrong-notes" },
  { href: "/review", label: "복습", icon: BookOpen, section: "/review" },
  { href: "/my-stats", label: "통계", icon: BarChart3, section: "/my-stats" },
  { href: "/practice/weakest", label: "약점연습", icon: PenTool, section: "/practice/weakest" },
  { href: "/board", label: "건의", icon: MessageSquare, section: "/board" },
] as const;

export default function NavBar() {
  const { user, loading, signOut } = useAuth();
  const dueCount = useDueCountCtx();
  const myNickname = useMyNickname();
  const myRole = useMyRole();
  const isAdmin = myRole?.role === "admin" && myRole.isActive;
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    await signOut();
    router.refresh();
  }

  function isActive(section: string) {
    return pathname === section || pathname.startsWith(`${section}/`);
  }

  function linkClass(section: string) {
    const active = isActive(section);
    return `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-all duration-200 kvle-touch ${
      active
        ? "text-[var(--teal)] bg-[var(--teal-dim)]"
        : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-raised)]"
    }`;
  }

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        background: "var(--bg)",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/dashboard" className="brand-logo-wrap shrink-0" aria-label="KVLE 홈">
          <Image
            src="/logo.png"
            alt="KVLE"
            width={120}
            height={40}
            priority
            style={{ objectFit: "contain" }}
          />
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm font-medium">
          {!loading && user && (
            <>
              {MAIN_LINKS.map(({ href, label, icon: Icon, section }) => (
                <Link
                  key={href}
                  href={href}
                  className={linkClass(section)}
                  aria-label={label}
                  title={label}
                >
                  <span className="relative inline-flex">
                    <Icon size={16} />
                    {href === "/review" && dueCount > 0 && (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--teal)]" />
                    )}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                  {href === "/review" && dueCount > 0 && (
                    <span
                      className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] kvle-mono"
                      style={{ background: "var(--teal-dim)", color: "var(--teal)" }}
                    >
                      {dueCount}
                    </span>
                  )}
                </Link>
              ))}

              <NotificationBell />
            </>
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {!loading && user && isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold no-underline"
              style={{
                background: "var(--teal-dim)",
                color: "var(--teal)",
                border: "1px solid var(--teal)",
                textDecoration: "none",
              }}
              title="운영 콘솔"
            >
              <Shield size={13} />
              <span>운영</span>
            </Link>
          )}

          {!loading && user && (
            <>
              {myNickname ? (
                <Link
                  href={`/profile/${encodeURIComponent(myNickname)}`}
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs no-underline"
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                    textDecoration: "none",
                  }}
                  title="내 프로필"
                >
                  <User size={13} />
                  <span className="max-w-[120px] truncate">{myNickname}</span>
                </Link>
              ) : (
                <Link
                  href="/profile/me"
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs no-underline"
                  style={{
                    background: "var(--amber-dim)",
                    border: "1px solid var(--amber)",
                    color: "var(--amber)",
                    textDecoration: "none",
                  }}
                  title="프로필 설정"
                >
                  <User size={13} />
                  <span>프로필 설정</span>
                </Link>
              )}

              <Link
                href="/settings"
                className="flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  textDecoration: "none",
                }}
                title="계정 설정"
                aria-label="계정 설정"
              >
                <Settings size={14} />
              </Link>

              <button
                onClick={handleSignOut}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  color: "var(--text-muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
                title="로그아웃"
                aria-label="로그아웃"
                type="button"
              >
                <LogOut size={16} />
              </button>
            </>
          )}

          {!loading && !user && (
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 font-semibold active:scale-[0.98]"
              style={{
                background: "var(--teal)",
                color: "#080D1A",
                borderRadius: "9999px",
                padding: "8px 18px",
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
