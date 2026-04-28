"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ADMIN_NAV_ITEMS, isAdminNavActive } from "./admin-nav-items";

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex md:flex-col md:w-56 md:shrink-0"
      style={{
        borderRight: "1px solid var(--rule)",
        background: "var(--bg)",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      <div className="px-4 py-5">
        <div
          className="text-xs uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          운영자 콘솔
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        {ADMIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isAdminNavActive(pathname, item.href);

          if (item.disabled) {
            return (
              <span
                key={item.href}
                aria-disabled
                title="다음 단계에서 활성화됩니다"
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm cursor-not-allowed opacity-50"
                style={{ color: "var(--text-muted)" }}
              >
                <Icon size={15} />
                {item.label}
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
              style={{
                color: active ? "var(--teal)" : "var(--text-muted)",
                background: active ? "var(--teal-dim)" : "transparent",
                textDecoration: "none",
              }}
            >
              <Icon size={15} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div
        className="mt-auto p-3"
        style={{ borderTop: "1px solid var(--rule)" }}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-xs"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          <ArrowLeft size={13} />
          일반 사이트로
        </Link>
      </div>
    </aside>
  );
}
