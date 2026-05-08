"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = { page: number; totalPages: number };

export function QueuePager({ page, totalPages }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(p: number) {
    if (p < 1 || p > totalPages) return;
    const u = new URLSearchParams(sp.toString());
    u.set("page", String(p));
    router.push(`/admin/signup-applications?${u.toString()}`);
  }

  if (totalPages <= 1) return null;

  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16, alignItems: "center" }}>
      <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className="kvle-btn-secondary">
        이전
      </button>
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
        {page} / {totalPages}
      </span>
      <button type="button" onClick={() => go(page + 1)} disabled={page >= totalPages} className="kvle-btn-secondary">
        다음
      </button>
    </div>
  );
}
