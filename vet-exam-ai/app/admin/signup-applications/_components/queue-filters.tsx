"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { SignupStatus } from "../_lib/parse-search-params";
import { STATUS_LABEL } from "../_lib/format-application";

const TABS: SignupStatus[] = ["pending_review", "pending_proof", "rejected", "approved"];

export function QueueFilters({ active }: { active: SignupStatus }) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(next: SignupStatus) {
    const u = new URLSearchParams(sp.toString());
    u.set("status", next);
    u.delete("page");
    router.push(`/admin/signup-applications?${u.toString()}`);
  }

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      {TABS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => go(s)}
          className={s === active ? "kvle-btn-primary" : "kvle-btn-secondary"}
          style={{ minHeight: 36, padding: "0 14px", fontSize: 13 }}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
