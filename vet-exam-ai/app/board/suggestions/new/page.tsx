import { BoardPostComposer } from "@/components/board/BoardPostComposer";

export default function NewSuggestionPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>건의 작성</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        운영자가 검토 후 채택/반려 여부를 알려드립니다.
      </p>
      <div className="mt-4">
        <BoardPostComposer mode="create" kind="suggestion" />
      </div>
    </div>
  );
}
