"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Props = { postId: string; title: string; isPinned: boolean };

const KEY = "kvle.announcement.dismissed";

type Dismissed = { id: string; at: number };

const TWELVE_FOUR_H_MS = 24 * 60 * 60 * 1000;

export function AnnouncementBannerClient({ postId, title, isPinned }: Props) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Dismissed;
        if (parsed.id === postId && Date.now() - parsed.at < TWELVE_FOUR_H_MS) {
          return;
        }
      }
    } catch { /* ignore */ }
    setHidden(false);
  }, [postId]);

  if (hidden) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify({ id: postId, at: Date.now() }));
    } catch { /* ignore */ }
    setHidden(true);
  };

  return (
    <div className="mb-3 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
      <div className="min-w-0">
        <span className="mr-2 font-semibold text-amber-800">
          {isPinned ? "📌 " : "📢 "}공지
        </span>
        <Link href={`/board/announcements/${postId}`} className="hover:underline">
          {title}
        </Link>
      </div>
      <button type="button" onClick={dismiss}
        aria-label="닫기" className="ml-2 text-amber-700 hover:text-amber-900">
        ×
      </button>
    </div>
  );
}
