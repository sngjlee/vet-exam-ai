"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "../../lib/hooks/useAuth";
import NotificationDropdown from "./NotificationDropdown";

const POLL_INTERVAL_MS = 60_000;

export default function NotificationBell() {
  const { user, loading } = useAuth();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement | null>(null);

  const fetchCount = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (!res.ok) return;
      const json = (await res.json()) as { count: number };
      setCount(typeof json.count === "number" ? json.count : 0);
    } catch {
      // silent — keep previous count
    }
  }, []);

  // Polling: only when user logged in. Pauses while tab hidden.
  useEffect(() => {
    if (loading || !user) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      void fetchCount();
      timer = setInterval(() => {
        void fetchCount();
      }, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, loading, fetchCount]);

  // Hide entirely while auth is settling or user is logged out.
  if (loading || !user) return null;

  const badgeText = count >= 100 ? "99+" : count > 0 ? String(count) : "";

  function handleClick() {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        // refresh count when opening so badge stays in sync with list
        void fetchCount();
      }
      return next;
    });
  }

  function handleClose() {
    setOpen(false);
  }

  function handleCountDelta(delta: number) {
    setCount((prev) => Math.max(0, prev + delta));
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={bellRef}
        type="button"
        onClick={handleClick}
        aria-label="알림"
        aria-expanded={open}
        style={{
          background: "none",
          border: "none",
          color: count > 0 ? "var(--text)" : "var(--text-muted)",
          cursor: "pointer",
          padding: "8px 10px",
          borderRadius: 8,
          display: "inline-flex",
          alignItems: "center",
          position: "relative",
          transition: "color 150ms, background 150ms",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <div style={{ position: "relative" }}>
          <Bell size={16} />
          {count > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -4,
                right: -6,
                minWidth: 14,
                height: 14,
                padding: "0 4px",
                borderRadius: 999,
                background: "var(--wrong)",
                color: "#fff",
                fontSize: 9,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                lineHeight: "14px",
                textAlign: "center",
                boxShadow: "0 0 0 2px var(--bg)",
              }}
            >
              {badgeText}
            </span>
          )}
        </div>
      </button>

      <NotificationDropdown
        open={open}
        onClose={handleClose}
        bellRef={bellRef}
        onCountChange={handleCountDelta}
      />
    </div>
  );
}
