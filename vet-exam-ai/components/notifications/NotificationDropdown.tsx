"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NotificationItem, { type NotificationRow } from "./NotificationItem";

type Props = {
  open: boolean;
  onClose: () => void;
  bellRef: React.RefObject<HTMLButtonElement | null>;
  onCountChange: (next: number) => void;
};

type Status = "loading" | "ready" | "error";

export default function NotificationDropdown({
  open,
  onClose,
  bellRef,
  onCountChange,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch on open and when reloadKey bumps (mark-all-read failure recovery).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setStatus("loading");
      try {
        const res = await fetch("/api/notifications?limit=10");
        if (!res.ok) throw new Error("fetch failed");
        const json = (await res.json()) as { items: NotificationRow[] };
        if (cancelled) return;
        setItems(json.items);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        console.warn("[NotificationDropdown] list fetch failed", err);
        setStatus("error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, reloadKey]);

  // Outside click closes.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (bellRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, onClose, bellRef]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleItemClick(n: NotificationRow, href: string) {
    // Optimistic single-row read.
    const wasUnread = n.read_at == null;
    if (wasUnread) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === n.id ? { ...it, read_at: new Date().toISOString() } : it,
        ),
      );
      onCountChange(-1);

      // Fire-and-forget; don't block navigation.
      fetch(`/api/notifications/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      }).catch((err) => {
        console.warn("[NotificationDropdown] mark-read failed", err);
      });
    }

    onClose();
    router.push(href);
  }

  async function handleMarkAllRead() {
    const previous = items;
    const previousUnreadCount = items.filter((it) => it.read_at == null).length;

    // Optimistic.
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((it) => (it.read_at == null ? { ...it, read_at: now } : it)),
    );
    onCountChange(-previousUnreadCount);

    try {
      const res = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
      if (!res.ok) throw new Error("mark-all-read failed");
    } catch (err) {
      console.warn("[NotificationDropdown] mark-all-read failed", err);
      // Refetch to recover (avoids stale-snapshot rollback wiping interim
      // updates — pattern from comment-replies delete-failure handling).
      setItems(previous);
      onCountChange(previousUnreadCount);
      setReloadKey((k) => k + 1);
    }
  }

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="알림 목록"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        width: 380,
        maxWidth: "calc(100vw - 24px)",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        zIndex: 60,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--text)",
        }}
      >
        <span>알림</span>
        {items.some((it) => it.read_at == null) && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              padding: "4px 6px",
            }}
          >
            전부 읽음
          </button>
        )}
      </div>

      {status === "loading" && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 56,
                background: "var(--surface-raised)",
                borderBottom: "1px solid var(--border)",
                opacity: 0.4,
              }}
            />
          ))}
        </div>
      )}

      {status === "error" && (
        <div
          style={{
            padding: "16px 14px",
            fontSize: 13,
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          알림을 불러올 수 없습니다.
        </div>
      )}

      {status === "ready" && items.length === 0 && (
        <div
          style={{
            padding: "20px 14px",
            fontSize: 13,
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          새 알림이 없어요
        </div>
      )}

      {status === "ready" && items.length > 0 && (
        <div
          role="list"
          style={{
            display: "flex",
            flexDirection: "column",
            maxHeight: 480,
            overflowY: "auto",
          }}
        >
          {items.map((n) => (
            <div
              key={n.id}
              role="listitem"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <NotificationItem notification={n} onClick={handleItemClick} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
