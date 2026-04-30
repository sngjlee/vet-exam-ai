"use client";

import { useState, type ReactNode } from "react";
import { TriageCard, type TriageCardData } from "./triage-card";
import { BulkActivateBar } from "./bulk-activate-bar";

export type TriageListItem = {
  data: TriageCardData;
  thumbnailSlot: ReactNode;
};

export function TriageList({ items }: { items: TriageListItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clear() {
    setSelected(new Set());
  }

  if (items.length === 0) {
    return (
      <div
        className="rounded-lg p-10 text-center text-sm"
        style={{
          background: "var(--surface-raised)",
          border:     "1px solid var(--rule)",
          color:      "var(--text-muted)",
        }}
      >
        조건에 맞는 문제가 없습니다.
      </div>
    );
  }

  return (
    <div>
      <BulkActivateBar selectedIds={Array.from(selected)} onClear={clear} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((it) => (
          <TriageCard
            key={it.data.id}
            row={it.data}
            selected={selected.has(it.data.id)}
            onToggle={toggle}
            thumbnailSlot={it.thumbnailSlot}
          />
        ))}
      </div>
    </div>
  );
}
