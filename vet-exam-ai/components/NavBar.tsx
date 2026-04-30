"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../lib/hooks/useAuth";
import { useDueCountCtx } from "../lib/context/DueCountContext";
import { useMyNickname } from "../lib/hooks/useMyNickname";
import { useMyRole } from "../lib/hooks/useMyRole";
import { LogOut, BookOpen, BarChart3, RotateCcw, PenTool, User, CirclePlay, ListChecks, Shield, Search } from "lucide-react";
import NotificationBell from "./notifications/NotificationBell";

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

  const isActive = (path: string) => pathname === path;

  const linkClass = (path: string) =>
    `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-all duration-200 kvle-touch ${
      isActive(path)
        ? "text-[var(--teal)] bg-[var(--teal-dim)]"
        : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-raised)]"
    }`;

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        background: "var(--bg)",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4">
        {/* Logo */}
        <Link href="/dashboard" className="brand-logo-wrap shrink-0">
          <Image src="/logo.png" alt="KVLE 수의미래연구소" width={120} height={40} style={{ objectFit: "contain" }} priority />
        </Link>

        {/* Nav */}
        <nav className="flex min-w-0 items-center gap-1 text-sm font-medium">
          <Link href="/wrong-notes" className={linkClass("/wrong-notes")} aria-label="오답 노트">
            <RotateCcw size={16} />
            <span className="hidden sm:inline">오답 노트</span>
          </Link>

          {!loading && user && (
            <>
              <Link href="/search" className={linkClass("/search")} aria-label="검색">
                <Search size={16} />
                <span className="hidden sm:inline">검색</span>
              </Link>
              <Link href="/quiz" className={linkClass("/quiz")} aria-label="문제 풀기">
                <CirclePlay size={16} />
                <span className="hidden sm:inline">문제 풀기</span>
              </Link>
              <Link href="/questions" className={linkClass("/questions")} aria-label="해설보기">
                <ListChecks size={16} />
                <span className="hidden sm:inline">해설보기</span>
              </Link>
              <Link href="/my-stats" className={linkClass("/my-stats")} aria-label="나의 통계">
                <BarChart3 size={16} />
                <span className="hidden sm:inline">나의 통계</span>
              </Link>
              <Link href="/practice/weakest" className={linkClass("/practice/weakest")} aria-label="약점 연습">
                <PenTool size={16} />
                <span className="hidden sm:inline">약점 연습</span>
              </Link>
              <Link href="/review" className={linkClass("/review")} aria-label="복습하기">
                <div className="relative">
                  <BookOpen size={16} />
                  {dueCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--teal)] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--teal)]"></span>
                    </span>
                  )}
                </div>
                <span className="hidden sm:inline">복습하기</span>
                {dueCount > 0 && (
                  <span
                    className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] kvle-mono"
                    style={{ background: "var(--teal-dim)", color: "var(--teal)" }}
                  >
                    {dueCount}
                  </span>
                )}
              </Link>
            </>
          )}

          {!loading && user && (
            <NotificationBell />
          )}

          <div className="h-6 w-px mx-2" style={{ background: "var(--border)" }}></div>

          {!loading && (
            user ? (
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold no-underline"
                    style={{
                      background: "var(--teal-dim)",
                      color: "var(--teal)",
                      border: "1px solid var(--teal)",
                      textDecoration: "none",
                    }}
                    title="운영자 콘솔"
                  >
                    <Shield size={13} />
                    <span>운영</span>
                  </Link>
                )}
                {myNickname ? (
                  <Link
                    href={`/profile/${encodeURIComponent(myNickname)}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs no-underline"
                    style={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      textDecoration: "none",
                    }}
                    title="내 프로필"
                  >
                    <User size={13} />
                    <span className="truncate max-w-[120px]">{myNickname}</span>
                  </Link>
                ) : (
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                    style={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                    }}
                  >
                    <User size={13} />
                    <span className="truncate max-w-[120px]">{user.email}</span>
                  </div>
                )}
                <button
                  onClick={handleSignOut}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "44px",
                    height: "44px",
                    borderRadius: "8px",
                    color: "var(--text-muted)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    transition: "color 150ms, background 150ms",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "var(--wrong)";
                    (e.currentTarget as HTMLElement).style.background = "var(--wrong-dim)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  title="로그아웃"
                  aria-label="로그아웃"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 font-semibold active:scale-[0.98]"
                style={{
                  background: "var(--teal)",
                  color: "#080D1A",
                  borderRadius: "9999px",
                  padding: "8px 18px",
                  fontSize: "0.875rem",
                  transition: "opacity 200ms",
                  textDecoration: "none",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = "0.88";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = "1";
                }}
              >
                로그인
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
