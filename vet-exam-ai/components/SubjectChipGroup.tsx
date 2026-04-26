// vet-exam-ai/components/SubjectChipGroup.tsx
"use client";

type Props = {
  groupLabel: string;
  groupSubjects: string[]; // 이 그룹에서 데이터에 존재하는 카테고리만
  selected: Set<string>;
  onToggle: (subject: string) => void;
  onToggleGroup: () => void; // 그룹 전체 선택/해제
};

export default function SubjectChipGroup({
  groupLabel,
  groupSubjects,
  selected,
  onToggle,
  onToggleGroup,
}: Props) {
  if (groupSubjects.length === 0) return null;

  const allSelected = groupSubjects.every((s) => selected.has(s));

  return (
    <div style={{ marginBottom: "0.875rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.375rem",
        }}
      >
        <span
          className="kvle-label"
          style={{ color: "var(--text-muted)" }}
        >
          {groupLabel} {groupSubjects.length}
        </span>
        <button
          type="button"
          onClick={onToggleGroup}
          style={{
            fontSize: "0.6875rem",
            color: "var(--teal)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0.25rem 0.5rem",
          }}
        >
          {allSelected ? "전체 해제" : "전체 선택"}
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
        {groupSubjects.map((subject) => {
          const active = selected.has(subject);
          return (
            <button
              key={subject}
              type="button"
              onClick={() => onToggle(subject)}
              style={{
                background: active ? "rgba(30,167,187,0.15)" : "var(--surface-raised)",
                border: active ? "1px solid var(--teal)" : "1px solid var(--border)",
                color: active ? "var(--teal)" : "var(--text-muted)",
                padding: "0.3125rem 0.75rem",
                borderRadius: "9999px",
                fontSize: "0.75rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 200ms, border-color 200ms, color 200ms",
              }}
            >
              {subject}
            </button>
          );
        })}
      </div>
    </div>
  );
}
