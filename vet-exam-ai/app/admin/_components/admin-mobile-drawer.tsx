"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowLeft } from "lucide-react";
import { ADMIN_NAV_ITEMS, isAdminNavActive } from "./admin-nav-items";

export function AdminMobileDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center"
        style={{
          width: "44px",
          height: "44px",
          color: "var(--text-muted)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
        aria-label="운영 메뉴 열기"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 top-0 bottom-0 w-64 flex flex-col"
            style={{ background: "var(--bg)", borderRight: "1px solid var(--rule)" }}
          >
            <div className="flex items-center justify-between px-4 py-4">
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text)" }}
              >
                운영자 콘솔
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
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
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium"
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
          </div>
        </div>
      )}
    </>
  );
}
