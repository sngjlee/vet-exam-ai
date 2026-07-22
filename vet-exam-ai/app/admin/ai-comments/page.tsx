import { AiCommentCard } from "./_components/ai-comment-card";
import { AiCommentFilters } from "./_components/ai-comment-filters";
import { AiCommentPager } from "./_components/ai-comment-pager";
import { loadAiCommentCandidates } from "./_lib/query";
import { AI_COMMENT_STATUS_LABELS } from "./_lib/presentation";
import { parseAiCommentCandidateSearch } from "./_lib/schemas";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | readonly string[] | undefined>>;

export default async function AdminAiCommentsPage({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const search = parseAiCommentCandidateSearch(raw);
  const page = await loadAiCommentCandidates(search);
  const current = { ...search, page: page.page };

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-5">
        <p className="kvle-label">COMMUNITY OPERATIONS</p>
        <h1 className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>
          댓글 초안 검수
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
          문제의 정답과 공식 해설을 기준으로 댓글 초안을 확인한 뒤 승인하거나 거절합니다.
          승인한 내용만 기존 시딩 계정의 공개 댓글로 게시됩니다.
        </p>
      </header>

      <section className="mb-5 grid gap-3 sm:grid-cols-3" aria-label="검수 현황">
        <div className="kvle-card-primary p-4">
          <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>검수 대기</p>
          <p className="kvle-mono mt-2 text-2xl font-semibold" style={{ color: "var(--teal)" }}>{page.pendingTotal}</p>
        </div>
        <div className="kvle-card p-4">
          <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>현재 필터</p>
          <p className="mt-2 text-base font-semibold" style={{ color: "var(--text)" }}>
            {AI_COMMENT_STATUS_LABELS[current.status]}
          </p>
        </div>
        <div className="kvle-card p-4">
          <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>검색 결과</p>
          <p className="kvle-mono mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{page.total}</p>
        </div>
      </section>

      <AiCommentFilters current={current} />

      {page.items.length === 0 ? (
        <div
          className="rounded-2xl border p-10 text-center"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <p className="font-semibold" style={{ color: "var(--text)" }}>조건에 맞는 댓글 초안이 없습니다.</p>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            필터를 초기화하거나 생성 작업의 상태를 확인해 주세요.
          </p>
        </div>
      ) : (
        <div className="grid gap-5">
          {page.items.map((item) => <AiCommentCard key={item.id} item={item} />)}
        </div>
      )}

      <AiCommentPager current={current} totalPages={page.totalPages} />
    </div>
  );
}
